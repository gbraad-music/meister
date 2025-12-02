/**
 * Akai Fire OLED Display Adapter
 * Dual-mode: Virtual (browser UI) OR Physical (actual Fire hardware via USB MIDI)
 * Based on DrivenByMoss FireDisplay.java and SEGGER blog
 */

class FireOLEDAdapter {
    constructor(deviceBinding, mode = 'virtual', renderMode = 'text') {
        this.device = deviceBinding;
        this.mode = mode;  // 'virtual' or 'physical'
        this.renderMode = renderMode;  // 'text' or 'graphic'
        this.width = 128;
        this.height = 64;

        // Create rendering canvas (used for both modes)
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');

        // Fire OLED protocol constants (from DrivenByMoss/SEGGER)
        this.FIRE_HEADER = [0xF0, 0x47, 0x7F, 0x43];  // AKAI Fire SysEx header
        this.WRITE_OLED = 0x0E;                        // Write OLED command
        this.STRIPE_SIZE = 147;                        // Bytes per stripe
        this.NUM_STRIPES = 8;                          // 8 stripes of 8 pixels each

        // Bit mutation table (from FireDisplay.java)
        this.BIT_MUTATE = [
            [13, 19, 25, 31, 37, 43, 49],
            [0,  20, 26, 32, 38, 44, 50],
            [1,  7,  27, 33, 39, 45, 51],
            [2,  8,  14, 34, 40, 46, 52],
            [3,  9,  15, 21, 41, 47, 53],
            [4,  10, 16, 22, 28, 48, 54],
            [5,  11, 17, 23, 29, 35, 55],
            [6,  12, 18, 24, 30, 36, 42]
        ];

        // Display buffer (for tracking changes)
        this.oledBitmap = Array(this.NUM_STRIPES).fill(null).map(() => new Array(this.STRIPE_SIZE).fill(0));
        this.oldOledBitmap = Array(this.NUM_STRIPES).fill(null).map(() => new Array(this.STRIPE_SIZE).fill(0));
        this.lastSend = Date.now();

        console.log(`[FireOLED] Initialized in ${mode} mode, renderMode: ${renderMode}, for device:`, deviceBinding.id || 'fire');
    }

    /**
     * Send DisplayMessage to Fire OLED
     * @param {Object} message - DisplayMessage object
     */
    sendMessage(message) {
        // Step 1: Render DisplayMessage to canvas (text + graphics)
        this.renderToCanvas(message);

        // Step 2: Route based on mode
        if (this.mode === 'virtual') {
            // Virtual mode: Update Fire sequencer scene LCD in UI
            this.updateVirtualDisplay();
        } else if (this.mode === 'physical') {
            // Physical mode: Send Fire OLED SysEx to actual hardware
            this.sendToPhysicalFire();
        }
    }

    /**
     * Set rendering mode
     * @param {string} renderMode - 'text' or 'graphic'
     */
    setRenderMode(renderMode) {
        if (renderMode !== 'text' && renderMode !== 'graphic') {
            console.error(`[FireOLED] Invalid render mode: ${renderMode}. Use 'text' or 'graphic'`);
            return;
        }
        this.renderMode = renderMode;
        console.log(`[FireOLED] Render mode changed to: ${renderMode}`);
    }

    /**
     * Toggle rendering mode between text and graphic
     */
    toggleRenderMode() {
        this.renderMode = this.renderMode === 'text' ? 'graphic' : 'text';
        console.log(`[FireOLED] Render mode toggled to: ${this.renderMode}`);
        return this.renderMode;
    }

    /**
     * Render DisplayMessage to canvas
     */
    renderToCanvas(message) {
        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (this.renderMode === 'text') {
            // Text rendering mode (default)
            this.renderAsText(message);
        } else if (this.renderMode === 'graphic') {
            // Graphic rendering mode (for testing physical Fire behavior)
            this.renderAsGraphic(message);
        }
    }

    /**
     * Render as text (default mode)
     */
    renderAsText(message) {
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '8px monospace';

        // Render text lines
        message.lines.forEach((line, idx) => {
            this.ctx.fillText(line, 2, 10 + (idx * 14));
        });

        // Render graphics primitives
        if (message.graphics) {
            message.graphics.forEach(gfx => {
                this.renderGraphic(gfx);
            });
        }
    }

    /**
     * Render as graphic (bitmap mode for testing)
     * This mode renders text as graphical bitmaps similar to how physical Fire would display it
     */
    renderAsGraphic(message) {
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '8px monospace';
        this.ctx.imageSmoothingEnabled = false;

        // Render text lines (same as text mode for virtual display)
        message.lines.forEach((line, idx) => {
            this.ctx.fillText(line, 2, 10 + (idx * 14));
        });

        // Render graphics primitives
        if (message.graphics) {
            message.graphics.forEach(gfx => {
                this.renderGraphic(gfx);
            });
        }
    }

    /**
     * Update virtual Fire display in browser UI
     */
    updateVirtualDisplay() {
        const fireLCD = document.getElementById('fire-lcd-display');
        if (!fireLCD) {
            console.warn('[FireOLED] fire-lcd-display element not found');
            return;
        }

        // Get or create display canvas in LCD element
        let displayCanvas = fireLCD.querySelector('canvas');
        if (!displayCanvas) {
            displayCanvas = document.createElement('canvas');
            displayCanvas.width = this.width;
            displayCanvas.height = this.height;
            displayCanvas.style.width = '256px';  // 2x scaling
            displayCanvas.style.height = '128px';
            displayCanvas.style.imageRendering = 'pixelated';
            displayCanvas.style.background = '#000';
            fireLCD.innerHTML = '';
            fireLCD.appendChild(displayCanvas);
        }

        // Copy our rendered canvas to display canvas
        const ctx = displayCanvas.getContext('2d');
        ctx.drawImage(this.canvas, 0, 0);
    }

    /**
     * Send to physical Fire hardware via OLED SysEx
     */
    sendToPhysicalFire() {
        // Encode canvas to Fire OLED bitmap format
        const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
        this.encodeToOLEDBitmap(imageData);

        // Convert to Fire SysEx packets and send
        const packets = this.buildFireSysExPackets();
        const output = this.getMidiOutput();

        if (!output) {
            console.warn('[FireOLED] No MIDI output available for physical Fire');
            return;
        }

        for (let packet of packets) {
            output.send(packet);
        }
    }

    /**
     * Encode canvas to Fire OLED bitmap format
     * Based on FireDisplay.java algorithm
     */
    encodeToOLEDBitmap(imageData) {
        // Unwind 128x64 arrangement into 8 stripes of 8 pixels high
        for (let stripe = 0; stripe < this.NUM_STRIPES; stripe++) {
            for (let y = 0; y < this.height / 8; y++) {
                for (let x = 0; x < this.width; x++) {
                    const pixelIndex = ((y * 8 + stripe) * this.width + x) * 4;
                    const blue = imageData.data[pixelIndex];
                    const green = imageData.data[pixelIndex + 1];
                    const red = imageData.data[pixelIndex + 2];

                    const xpos = x + 128 * Math.floor(y / 8);
                    const ypos = y % 8;

                    // Re-map by tiling 7x8 block of translated pixels (BIT_MUTATE table)
                    const remapBit = this.BIT_MUTATE[ypos][xpos % 7];
                    const idx = Math.floor(xpos / 7) * 8 + Math.floor(remapBit / 7);

                    // Monochrome threshold (any color = white pixel)
                    if (blue + green + red > 127 * 3) {
                        this.oledBitmap[stripe][idx] |= (1 << (remapBit % 7));
                    } else {
                        this.oledBitmap[stripe][idx] &= ~(1 << (remapBit % 7));
                    }
                }
            }
        }
    }

    /**
     * Build Fire OLED SysEx packets
     * Format: F0 47 7F 43 0E <len_hi> <len_lo> <stripe_start> <stripe_end> <col_start> <col_end> <bitmap_data> F7
     */
    buildFireSysExPackets() {
        const packets = [];
        const now = Date.now();

        for (let stripe = 0; stripe < this.NUM_STRIPES; stripe++) {
            // Check if stripe changed (or force refresh every 3 seconds to prevent sleep)
            const changed = this.oledBitmap[stripe].some((val, i) =>
                val !== this.oldOledBitmap[stripe][i]
            );

            if (!changed && now - this.lastSend < 3000) {
                continue;  // Skip unchanged stripe
            }

            // Build Fire OLED SysEx packet
            const packet = [
                ...this.FIRE_HEADER,      // F0 47 7F 43 (AKAI Fire)
                this.WRITE_OLED,          // 0E (Write OLED command)
                0x00, 0x93,               // Payload length (147 bytes = 0x93)
                stripe, stripe,           // Start/end stripe (8-pixel band)
                0x00, 0x7F,               // Start/end column (0-127)
                ...this.oledBitmap[stripe], // 147 bytes of bitmap data
                0xF7                       // SysEx end
            ];

            packets.push(new Uint8Array(packet));

            // Update old bitmap for change tracking
            this.oldOledBitmap[stripe] = [...this.oledBitmap[stripe]];
        }

        if (packets.length > 0) {
            this.lastSend = now;
        }

        return packets;
    }

    /**
     * Render graphics primitive
     */
    renderGraphic(gfx) {
        if (gfx.type === 'bar') {
            const x = gfx.col * 6;  // Approx char width
            const y = gfx.line * 14;
            const w = gfx.width * 6;
            const fillWidth = w * gfx.value;

            this.ctx.strokeStyle = '#FFF';
            this.ctx.strokeRect(x, y + 8, w, 4);
            this.ctx.fillStyle = '#FFF';
            this.ctx.fillRect(x + 1, y + 9, fillWidth - 2, 2);
        }
    }

    /**
     * Clear display
     */
    clear() {
        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Reset bitmap
        this.oledBitmap = Array(this.NUM_STRIPES).fill(null).map(() => new Array(this.STRIPE_SIZE).fill(0));

        // Update display
        if (this.mode === 'virtual') {
            this.updateVirtualDisplay();
        } else if (this.mode === 'physical') {
            this.sendToPhysicalFire();
        }
    }

    /**
     * Get MIDI output for this device
     */
    getMidiOutput() {
        // If device has deviceManager reference, use it
        if (window.deviceManager && this.device.id) {
            const output = window.deviceManager.getMidiOutput(this.device.id);
            if (output) return output;
        }

        // Fallback: try device binding directly
        if (this.device.midiOutput) {
            return this.device.midiOutput;
        }

        // Fallback: global controller MIDI output
        if (window.controller && window.controller.midiOutput) {
            return window.controller.midiOutput;
        }

        return null;
    }
}

// Make available globally
window.FireOLEDAdapter = FireOLEDAdapter;
