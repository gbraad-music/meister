/**
 * Display Message Manager for Meister
 * Central manager for routing display messages to appropriate adapters
 */

class DisplayMessageManager {
    constructor(deviceManager) {
        this.deviceManager = deviceManager;
        this.adapters = new Map();  // deviceId -> { type, adapter }
        this.warnedDevices = new Set();  // Track devices we've already warned about
        console.log('[DisplayMessageManager] Initialized');
    }

    /**
     * Register a display adapter for a device
     * @param {string} deviceId - Device binding ID
     * @param {string} deviceType - Device type (regroove, samplecrate, fire)
     * @param {Object} adapter - Display adapter instance
     */
    registerDisplay(deviceId, deviceType, adapter) {
        this.adapters.set(deviceId, {
            type: deviceType,
            adapter: adapter
        });
        console.log(`[Display] Registered ${deviceType} display for device: ${deviceId}`);
    }

    /**
     * Unregister a display adapter
     * @param {string} deviceId - Device binding ID
     */
    unregisterDisplay(deviceId) {
        if (this.adapters.delete(deviceId)) {
            console.log(`[Display] Unregistered device: ${deviceId}`);
        }
    }

    /**
     * Send a display message to a specific device
     * @param {Object} message - DisplayMessage object
     */
    sendMessage(message) {
        const deviceId = message.deviceId;

        if (!this.adapters.has(deviceId)) {
            // Only warn once per device to avoid console spam
            if (!this.warnedDevices.has(deviceId)) {
                console.warn(`[Display] No adapter registered for device: ${deviceId}`);
                this.warnedDevices.add(deviceId);
            }
            return false;
        }

        const { type, adapter } = this.adapters.get(deviceId);

        try {
            adapter.sendMessage(message);
            return true;
        } catch (err) {
            console.error(`[Display] Error sending to ${deviceId}:`, err);
            return false;
        }
    }

    /**
     * Broadcast a message to all registered displays
     * @param {Object} messageTemplate - DisplayMessage template (deviceId will be set per device)
     */
    broadcast(messageTemplate) {
        let successCount = 0;
        this.adapters.forEach((config, deviceId) => {
            const message = { ...messageTemplate, deviceId };
            if (this.sendMessage(message)) {
                successCount++;
            }
        });
        console.log(`[Display] Broadcast to ${successCount}/${this.adapters.size} devices`);
        return successCount;
    }

    /**
     * Get registered adapter for a device
     * @param {string} deviceId - Device binding ID
     * @returns {Object|null} Adapter info or null
     */
    getAdapter(deviceId) {
        return this.adapters.get(deviceId) || null;
    }

    /**
     * Get all registered device IDs
     * @returns {Array<string>} Array of device IDs
     */
    getRegisteredDevices() {
        return Array.from(this.adapters.keys());
    }

    /**
     * Create a status message for a device
     * @param {string} deviceId - Device binding ID
     * @param {string} deviceType - Device type
     * @param {Object} state - Device state object
     * @returns {Object} DisplayMessage object
     */
    createStatusMessage(deviceId, deviceType, state) {
        if (deviceType === 'regroove') {
            return this.createRegrooveStatusMessage(deviceId, state);
        } else if (deviceType === 'samplecrate') {
            return this.createSamplecrateStatusMessage(deviceId, state);
        } else if (deviceType === 'mixxx') {
            return this.createMixxxStatusMessage(deviceId, state);
        } else if (deviceType === 'fire') {
            return this.createFireStatusMessage(deviceId, state);
        } else {
            // Generic fallback
            return {
                type: 'display_message',
                deviceId,
                deviceType,
                lines: [
                    `${deviceType}`,
                    'Ready'
                ],
                metadata: { category: 'status', priority: 'normal' }
            };
        }
    }

    /**
     * Create Regroove status message
     */
    createRegrooveStatusMessage(deviceId, state) {
        const bpm = String(state.bpm || 0).padStart(3, ' ');
        const order = String(state.order || 0).padStart(2, '0');
        const pattern = String(state.pattern || 0).padStart(2, '0');
        const row = String(state.row || 0).padStart(2, ' ');
        const status = state.playing ? 'Playing' : 'Stopped';
        const muteStr = state.channelMutes || '----';

        return {
            type: 'display_message',
            deviceId,
            deviceType: 'regroove',
            lines: [
                `Regroove      ${bpm}BPM`.padEnd(20),
                `Ord:${order}  Pat:${pattern}    `.padEnd(20),
                `Ch 0-3: ${muteStr}       `.padEnd(20),
                `[${status}] Row:${row}  `.padEnd(20)
            ],
            metadata: { category: 'status', priority: 'normal' }
        };
    }

    /**
     * Create Samplecrate status message
     */
    createSamplecrateStatusMessage(deviceId, state) {
        const bpm = String(state.bpm || 0).padStart(3, ' ');
        const pad = String(state.pad || 0).padStart(2, '0');
        const volume = String(state.volume || 0).padStart(3, ' ');
        const filter = String(state.filter || 0).padStart(3, ' ');
        const resonance = String(state.resonance || 0).padStart(2, ' ');
        const status = state.playing ? 'Playing' : 'Stopped';
        const sequence = String(state.sequence || 1);

        return {
            type: 'display_message',
            deviceId,
            deviceType: 'samplecrate',
            lines: [
                `Samplecrate   ${bpm}BPM`.padEnd(20),
                `Pad:${pad}  Vol:${volume}%   `.padEnd(20),
                `Flt:${filter}%  Res:${resonance} `.padEnd(20),
                `[${status}] Seq ${sequence} `.padEnd(20)
            ],
            metadata: { category: 'status', priority: 'normal' }
        };
    }

    /**
     * Create Mixxx deck status message
     * @param {string} deviceId - Device ID
     * @param {Object} state - Deck state from parseDeckStateResponse
     * @returns {Object} - Display message
     */
    createMixxxStatusMessage(deviceId, state) {
        const deckNum = state.deck || 1;
        const playing = state.playing ? '>' : '||';
        const looping = state.looping ? 'L' : ' ';
        const sync = state.sync ? 'S' : ' ';
        const pfl = state.pfl ? 'PFL' : '   ';

        // FX indicators (show which FX units are enabled)
        const fx = [];
        if (state.fx1) fx.push('1');
        if (state.fx2) fx.push('2');
        if (state.fx3) fx.push('3');
        if (state.fx4) fx.push('4');
        const fxStr = fx.length > 0 ? `FX:${fx.join('')}` : '';

        // Format BPM with 2 decimal places
        const bpm = state.bpm ? state.bpm.toFixed(2) : '0.00';

        // Volume bar (10 chars)
        const volLevel = Math.round((state.volume / 127) * 10);
        const volBar = '█'.repeat(volLevel) + '░'.repeat(10 - volLevel);

        // Position bar (10 chars)
        const posLevel = Math.round((state.position / 100) * 10);
        const posBar = '█'.repeat(posLevel) + '░'.repeat(10 - posLevel);

        // Format time as M:SS
        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        const currentTime = formatTime((state.position / 100) * (state.duration || 0));
        const totalTime = formatTime(state.duration || 0);

        return {
            type: 'display_message',
            deviceId,
            deviceType: 'mixxx',
            lines: [
                `DECK ${deckNum} ${playing} ${looping}${sync} ${pfl}`.padEnd(20),
                `${bpm} BPM ${fxStr}`.padEnd(20),
                `VOL ${volBar}`.padEnd(20),
                `${posBar} ${currentTime}/${totalTime}`.padEnd(20)
            ],
            metadata: {
                category: 'status',
                priority: 'normal',
                pfl: state.pfl,
                fx: fx.length > 0
            }
        };
    }

    /**
     * Create Fire sequencer status message
     */
    createFireStatusMessage(deviceId, state) {
        const bpm = String(state.bpm || 128).padStart(3, ' ');
        const track = String(state.track || 1);
        const step = String(state.step || 1).padStart(2, ' ');
        const steps = String(state.steps || 16);
        const status = state.playing ? 'Playing' : 'Stopped';

        return {
            type: 'display_message',
            deviceId,
            deviceType: 'fire',
            lines: [
                `Fire Sequencer`,
                `Track ${track}: ${status}`,
                `BPM: ${bpm}`,
                `Step: ${step}/${steps}`
            ],
            metadata: { category: 'status', priority: 'normal' }
        };
    }

    /**
     * Create a notification message
     * @param {string} deviceId - Device binding ID
     * @param {string} text - Notification text
     * @param {number} duration - Auto-dismiss duration in ms (null = permanent)
     * @returns {Object} DisplayMessage object
     */
    createNotification(deviceId, text, duration = 2000) {
        // Split text into lines (max 20 chars per line)
        const lines = [];
        const words = text.split(' ');
        let currentLine = '';

        for (let word of words) {
            if ((currentLine + word).length > 20) {
                if (currentLine) lines.push(currentLine.trim().padEnd(20));
                currentLine = word + ' ';
            } else {
                currentLine += word + ' ';
            }
        }
        if (currentLine) lines.push(currentLine.trim().padEnd(20));

        // Limit to 4 lines
        while (lines.length < 2) lines.push(' '.repeat(20));
        const displayLines = lines.slice(0, 4);

        return {
            type: 'display_message',
            deviceId,
            deviceType: 'unknown',
            lines: displayLines,
            metadata: {
                category: 'notification',
                priority: 'high',
                duration: duration
            }
        };
    }
}

// Make available globally
window.DisplayMessageManager = DisplayMessageManager;
