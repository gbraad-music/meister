// Regroove Meister Controller - Minimalist WebMIDI Interface
class MeisterController {
    constructor() {
        this.midiOutput = null;
        this.midiAccess = null;
        this.midiChannel = 0; // Default channel 1 (0-indexed)
        this.config = this.getDefaultConfig();
        this.pads = [];
        this.editingPadIndex = null;

        // MIDI Clock Master
        this.clockMaster = false;
        this.clockBPM = 120;
        this.clockInterval = null;
        this.clockStartTime = 0;
        this.clockTickCount = 0;
        this.useWAAClock = false; // Use Web Audio API clock for better precision
        this.waaClock = null;
        this.waaContext = null;
        this.waaClockEvent = null;

        // SPP Position tracking
        this.receiveSPP = true;
        this.currentPosition = 0; // In MIDI beats (1/16th notes)
        this.patternLength = 64; // Default pattern length

        // Player state tracking
        this.playerState = {
            playing: false,
            mode: 0, // 00=song, 01=pattern/loop, 10=performance, 11=record
            order: 0,
            row: 0,
            pattern: 0,
            totalRows: 0,
            numChannels: 0,
            mutedChannels: []
        };
        this.statePollingInterval = null;
        this.regrooveDeviceId = 0; // Target Regroove device ID

        // Connection watchdog
        this.lastStateUpdate = null;
        this.stateTimeoutMs = 3000; // 3 seconds without update = disconnected
        this.connectionWatchdog = null;
        this.isConnectedToRegroove = false;

        this.init();
    }

    getDefaultConfig() {
        return {
            version: "1.0",
            gridLayout: "4x4",
            midiChannel: 0,
            pads: [
                { label: "PLAY\nPAUSE", cc: 41 },
                { label: "STOP", cc: 42 },
                { label: "RETRIG", cc: 45 },
                { label: "LOOP\nTOGGLE", cc: 46 },
                { label: "PREV\nORDER", cc: 43 },
                { label: "NEXT\nORDER", cc: 44 },
                { label: "SYNC\nTEMPO", cc: 70 },
                { label: "RECV\nSTART", cc: 71 },
                { label: "RECV\nSPP", cc: 72 },
                { label: "SEND\nCLOCK", cc: 73 },
                { label: "SEND\nSTART", cc: 74 },
                { label: "SEND\nSPP", cc: 75 },
                { label: "SPP\nMODE", cc: 76 },
                { label: "FILE\nLOAD", cc: 60 },
                { label: "FILE\nNEXT", cc: 62 },
                { label: "FILE\nPREV", cc: 61 }
            ]
        };
    }

    async init() {
        await this.setupMIDI();
        this.setupUI();
        this.loadConfig();
        this.createPads();
    }

    async setupMIDI() {
        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
            console.log('MIDI Access granted (with SysEx)');
            this.populateMIDIOutputs();
            this.setupMIDIInputs();
            this.midiAccess.onstatechange = () => {
                this.populateMIDIOutputs();
                this.setupMIDIInputs();
            };
        } catch (err) {
            console.error('MIDI Access failed:', err);
        }
    }

    setupMIDIInputs() {
        if (!this.midiAccess) {
            console.warn('[Meister] setupMIDIInputs called but midiAccess is null');
            return;
        }

        console.log('[Meister] Setting up MIDI input listeners...');
        let count = 0;
        // Listen to all MIDI inputs for SPP messages
        for (let input of this.midiAccess.inputs.values()) {
            input.onmidimessage = (event) => this.handleMIDIMessage(event);
            console.log(`[Meister] ✓ Listener attached to: ${input.name}`);
            count++;
        }
        console.log(`[Meister] ${count} MIDI input(s) configured`);
    }

    handleMIDIMessage(event) {
        const data = event.data;
        const status = data[0];

        // Check for SysEx messages (0xF0)
        if (status === 0xF0) {
            this.handleSysExMessage(data);
            return;
        }

        const data1 = data[1];
        const data2 = data[2];

        // SPP (Song Position Pointer) - 0xF2
        if (status === 0xF2 && this.receiveSPP) {
            // SPP is in MIDI beats (1/16th notes)
            // data1 = LSB, data2 = MSB
            const rawPosition = (data2 << 7) | data1;

            // Modulo 64 to get position within pattern (Regroove sends 64-row patterns)
            this.currentPosition = rawPosition % 64;

            this.updatePositionBar();
            console.log(`SPP Received: ${rawPosition} -> Position in pattern: ${this.currentPosition} (row ${this.currentPosition})`);
        }

        // MIDI Clock (0xF8) - could be used for position tracking
        if (status === 0xF8 && this.receiveSPP) {
            // Increment position on each clock tick (24 ppqn)
            // This is optional - mainly use SPP for position
        }

        // Start (0xFA) - Reset position
        if (status === 0xFA && this.receiveSPP) {
            this.currentPosition = 0;
            this.updatePositionBar();
            console.log('MIDI Start received - position reset');
        }

        // Stop (0xFC) - Keep position
        if (status === 0xFC && this.receiveSPP) {
            // Position stays where it is
            this.updatePositionBar();
            console.log('MIDI Stop received');
        }
    }

    handleSysExMessage(data) {
        // Check for Regroove SysEx: F0 7D <device_id> <command> [data...] F7
        if (data.length < 5) return;
        if (data[0] !== 0xF0 || data[1] !== 0x7D) return; // Not Regroove SysEx
        if (data[data.length - 1] !== 0xF7) return; // Invalid end

        const deviceId = data[2];
        const command = data[3];
        const payload = data.slice(4, -1); // Extract data between command and F7

        // Only log non-state commands to reduce spam (0x60 = GET_PLAYER_STATE, 0x61 = PLAYER_STATE_RESPONSE)
        if (command !== 0x60 && command !== 0x61) {
            console.log(`[SysEx] Received command ${command.toString(16)} from device ${deviceId}`);
        }

        // PLAYER_STATE_RESPONSE = 0x61
        if (command === 0x61) {
            this.parsePlayerStateResponse(payload);
        }
    }

    parsePlayerStateResponse(data) {
        if (data.length < 6) {
            console.warn('[SysEx] PLAYER_STATE_RESPONSE too short');
            return;
        }

        // Parse header
        const flags = data[0];
        const order = data[1];
        const row = data[2];
        const pattern = data[3];
        const totalRows = data[4];
        const numChannels = data[5];

        // Extract playback state
        const playing = (flags & 0x01) !== 0;
        const mode = (flags >> 1) & 0x03; // bits 1-2

        // Parse bit-packed mute data
        const muteBytes = Math.ceil(numChannels / 8);
        if (data.length < 6 + muteBytes) {
            console.warn('[SysEx] PLAYER_STATE_RESPONSE incomplete mute data');
            return;
        }

        const mutedChannels = [];
        for (let ch = 0; ch < numChannels; ch++) {
            const byteIdx = 6 + Math.floor(ch / 8);
            const bitIdx = ch % 8;
            if (data[byteIdx] & (1 << bitIdx)) {
                mutedChannels.push(ch);
            }
        }

        // Update state
        this.playerState = {
            playing,
            mode,
            order,
            row,
            pattern,
            totalRows,
            numChannels,
            mutedChannels
        };

        // Update connection timestamp
        this.lastStateUpdate = Date.now();
        if (!this.isConnectedToRegroove) {
            this.isConnectedToRegroove = true;
            console.log('[Regroove] Connected - receiving state updates');
        }

        // Start watchdog if not already running
        this.startConnectionWatchdog();

        // State updates happen frequently - only log on significant changes or enable for debugging
        // console.log(`[State] Playing:${playing} Mode:${mode} Order:${order} Row:${row} Pattern:${pattern} Muted:${mutedChannels.length}ch`);

        // Update pad colors
        this.updatePadColors();
    }

    populateMIDIOutputs() {
        const select = document.getElementById('midi-output');
        const currentValue = select.value;
        select.innerHTML = '<option value="">-- Select MIDI Output --</option>';

        if (this.midiAccess) {
            for (let output of this.midiAccess.outputs.values()) {
                const option = document.createElement('option');
                option.value = output.id;
                option.textContent = output.name;
                select.appendChild(option);
            }

            // Restore previous selection if still available
            if (currentValue) {
                select.value = currentValue;
                if (select.value === currentValue) {
                    this.midiOutput = this.midiAccess.outputs.get(currentValue);
                    this.updateConnectionStatus(true);
                }
            }
        }
    }

    setupUI() {
        // Menu button
        document.getElementById('menu-button').addEventListener('click', () => {
            this.openSettings();
        });

        // Close settings
        document.getElementById('close-settings').addEventListener('click', () => {
            this.closeSettings();
        });

        // Click overlay to close
        document.getElementById('settings-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'settings-overlay') {
                this.closeSettings();
            }
        });

        // MIDI output selection
        document.getElementById('midi-output').addEventListener('change', (e) => {
            const outputId = e.target.value;
            if (outputId && this.midiAccess) {
                this.midiOutput = this.midiAccess.outputs.get(outputId);
                this.updateConnectionStatus(true);
                this.saveConfig();

                // Auto-start clock if it was enabled
                if (this.clockMaster) {
                    this.startClock();
                }

                // Start state polling
                this.startStatePolling();
            } else {
                this.midiOutput = null;
                this.updateConnectionStatus(false);

                // Stop clock if output disconnected
                if (this.clockMaster) {
                    this.stopClock();
                }

                // Stop state polling
                this.stopStatePolling();
            }
        });

        // Grid layout
        document.getElementById('grid-layout').addEventListener('change', (e) => {
            this.config.gridLayout = e.target.value;
            this.applyGridLayout();
            this.saveConfig();
        });

        // MIDI channel
        document.getElementById('midi-channel').addEventListener('change', (e) => {
            this.midiChannel = parseInt(e.target.value);
            this.config.midiChannel = this.midiChannel;
            this.saveConfig();
        });

        // SysEx Device ID
        document.getElementById('sysex-device-id').addEventListener('change', (e) => {
            this.regrooveDeviceId = parseInt(e.target.value);
            this.config.sysexDeviceId = this.regrooveDeviceId;
            this.saveConfig();
            console.log(`[Config] SysEx Device ID set to ${this.regrooveDeviceId}`);
        });

        // Load config
        document.getElementById('load-config').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadConfigFromFile(file);
            }
        });

        // Save config
        document.getElementById('save-config').addEventListener('click', () => {
            this.downloadConfig();
        });

        // Edit pad button
        document.getElementById('edit-pad-btn').addEventListener('click', () => {
            this.openPadEditor();
        });

        // Close pad editor
        document.getElementById('close-pad-editor').addEventListener('click', () => {
            this.closePadEditor();
        });

        // Save pad config
        document.getElementById('save-pad').addEventListener('click', () => {
            this.savePadConfig();
        });

        // Clear pad
        document.getElementById('clear-pad').addEventListener('click', () => {
            this.clearPad();
        });

        // Message type selector
        document.getElementById('pad-message-type').addEventListener('change', (e) => {
            this.updatePadEditorFields(e.target.value);
        });

        // MIDI Clock Master
        document.getElementById('clock-master').addEventListener('change', (e) => {
            this.clockMaster = e.target.checked;
            if (this.clockMaster) {
                this.startClock();
            } else {
                this.stopClock();
            }
            this.saveConfig();
        });

        document.getElementById('clock-bpm').addEventListener('change', (e) => {
            this.clockBPM = parseInt(e.target.value) || 120;
            if (this.clockMaster) {
                this.stopClock();
                this.startClock();
            }
            this.saveConfig();
        });

        // WAAClock option
        document.getElementById('use-waaclock').addEventListener('change', (e) => {
            this.useWAAClock = e.target.checked;
            if (this.clockMaster) {
                this.stopClock();
                this.startClock();
            }
            this.saveConfig();
        });

        // Receive SPP
        document.getElementById('receive-spp').addEventListener('change', (e) => {
            this.receiveSPP = e.target.checked;
            const sequencer = document.getElementById('position-sequencer');
            sequencer.style.display = this.receiveSPP ? 'flex' : 'none';

            if (this.receiveSPP) {
                this.createSequencerButtons();
            }

            this.saveConfig();
        });

        // Show status bar on mouse movement
        let statusTimeout;
        document.addEventListener('mousemove', () => {
            const statusBar = document.getElementById('status-bar');
            statusBar.classList.add('visible');
            clearTimeout(statusTimeout);
            statusTimeout = setTimeout(() => {
                statusBar.classList.remove('visible');
            }, 2000);
        });
    }

    openSettings() {
        document.getElementById('settings-overlay').classList.add('active');
    }

    closeSettings() {
        document.getElementById('settings-overlay').classList.remove('active');
    }

    openPadEditor(padIndex = null) {
        this.editingPadIndex = padIndex;
        const editor = document.getElementById('pad-editor-overlay');

        // Hide error message when opening editor
        document.getElementById('pad-label-error').style.display = 'none';

        if (padIndex !== null && this.config.pads[padIndex]) {
            const pad = this.config.pads[padIndex];
            document.getElementById('pad-label').value = pad.label || '';
            document.getElementById('pad-sublabel').value = pad.sublabel || '';

            // Determine message type
            if (pad.mmc !== undefined) {
                document.getElementById('pad-message-type').value = 'mmc';
                document.getElementById('pad-mmc-command').value = pad.mmc || 'stop';
            } else if (pad.cc !== undefined && pad.cc !== null) {
                // Check if this is a known Regroove action CC
                if (this.isRegrooveActionCC(pad.cc)) {
                    document.getElementById('pad-message-type').value = 'regroove';
                    document.getElementById('pad-regroove-action').value = pad.cc.toString();
                } else {
                    document.getElementById('pad-message-type').value = 'cc';
                    document.getElementById('pad-cc').value = pad.cc || '';
                }
            } else if (pad.note !== undefined && pad.note !== null) {
                document.getElementById('pad-message-type').value = 'note';
                document.getElementById('pad-note').value = pad.note || '';
            } else {
                document.getElementById('pad-message-type').value = 'regroove';
            }

            this.updatePadEditorFields(document.getElementById('pad-message-type').value);
            document.getElementById('pad-editor-title').textContent = `EDIT PAD ${padIndex + 1}`;
        } else {
            // New pad
            document.getElementById('pad-label').value = '';
            document.getElementById('pad-sublabel').value = '';
            document.getElementById('pad-message-type').value = 'regroove';
            document.getElementById('pad-regroove-action').value = '41';
            this.updatePadEditorFields('regroove');
            document.getElementById('pad-editor-title').textContent = 'EDIT PAD';
        }

        editor.classList.add('active');
    }

    isRegrooveActionCC(cc) {
        // List of all Regroove action CCs
        const regrooveCCs = [
            32, 33, 34, 35, 36, 37, 38, 39, // Channel Solo
            41, 42, 43, 44, 45, 46,          // Transport
            48, 49, 50, 51, 52, 53, 54, 55, // Channel Mute
            60, 61, 62,                      // File Browser
            70, 71, 72, 73, 74, 75, 76, 77, // MIDI Sync
            80, 81                           // Performance
        ];
        return regrooveCCs.includes(cc);
    }

    closePadEditor() {
        document.getElementById('pad-editor-overlay').classList.remove('active');
        this.editingPadIndex = null;
    }

    updatePadEditorFields(messageType) {
        const regrooveField = document.getElementById('pad-regroove-field');
        const ccField = document.getElementById('pad-cc-field');
        const noteField = document.getElementById('pad-note-field');
        const mmcField = document.getElementById('pad-mmc-field');

        regrooveField.style.display = messageType === 'regroove' ? 'block' : 'none';
        ccField.style.display = messageType === 'cc' ? 'block' : 'none';
        noteField.style.display = messageType === 'note' ? 'block' : 'none';
        mmcField.style.display = messageType === 'mmc' ? 'block' : 'none';
    }

    savePadConfig() {
        if (this.editingPadIndex === null) return;

        const label = document.getElementById('pad-label').value.trim();
        const sublabel = document.getElementById('pad-sublabel').value.trim();
        const messageType = document.getElementById('pad-message-type').value;
        const errorElement = document.getElementById('pad-label-error');

        const padConfig = {};

        // Check for message type first
        let hasMessage = false;

        if (messageType === 'regroove') {
            // Regroove action - store as CC
            const cc = parseInt(document.getElementById('pad-regroove-action').value);
            if (!isNaN(cc) && cc >= 0 && cc <= 127) {
                padConfig.cc = cc;
                hasMessage = true;
            }
        } else if (messageType === 'cc') {
            const cc = parseInt(document.getElementById('pad-cc').value);
            if (!isNaN(cc) && cc >= 0 && cc <= 127) {
                padConfig.cc = cc;
                hasMessage = true;
            }
        } else if (messageType === 'note') {
            const note = parseInt(document.getElementById('pad-note').value);
            if (!isNaN(note) && note >= 0 && note <= 127) {
                padConfig.note = note;
                hasMessage = true;
            }
        } else if (messageType === 'mmc') {
            padConfig.mmc = document.getElementById('pad-mmc-command').value;
            hasMessage = true;
        }

        // If we have a message but no label, show error
        if (hasMessage && !label) {
            errorElement.style.display = 'block';
            // Focus the label input
            document.getElementById('pad-label').focus();
            return;
        }

        // Hide error if it was showing
        errorElement.style.display = 'none';

        // Only add label if not empty
        if (label) {
            padConfig.label = label;
        }
        if (sublabel) {
            padConfig.sublabel = sublabel;
        }

        // Check if we have at least a message type (cc, note, or mmc)
        // If not, treat as empty pad
        if (!hasMessage) {
            if (!this.config.pads) this.config.pads = [];
            this.config.pads[this.editingPadIndex] = null;
        } else {
            // Valid pad config
            if (!this.config.pads) this.config.pads = [];
            this.config.pads[this.editingPadIndex] = padConfig;
        }

        this.saveConfig();
        this.createPads();
        this.closePadEditor();
    }

    clearPad() {
        if (this.editingPadIndex === null) return;

        if (!this.config.pads) this.config.pads = [];
        this.config.pads[this.editingPadIndex] = null;

        this.saveConfig();
        this.createPads();
        this.closePadEditor();
    }

    updateConnectionStatus(connected) {
        const indicator = document.getElementById('midi-indicator');
        if (connected) {
            indicator.classList.add('connected');
        } else {
            indicator.classList.remove('connected');
        }
    }

    applyGridLayout() {
        const grid = document.getElementById('pads-grid');
        const [cols, rows] = this.config.gridLayout.split('x').map(n => parseInt(n));
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

        // Recreate pads with new layout
        this.createPads();
    }

    createPads() {
        const container = document.getElementById('pads-grid');
        container.innerHTML = '';
        this.pads = [];

        const [cols, rows] = this.config.gridLayout.split('x').map(n => parseInt(n));
        const totalPads = cols * rows;

        for (let i = 0; i < totalPads; i++) {
            const padConfig = this.config.pads[i];
            const padElement = document.createElement('regroove-pad');

            if (padConfig) {
                // Store original label for later replacement
                padElement._originalLabel = padConfig.label;
                padElement._originalSublabel = padConfig.sublabel;

                if (padConfig.label) padElement.setAttribute('label', this.replacePlaceholders(padConfig.label));
                if (padConfig.sublabel) padElement.setAttribute('sublabel', this.replacePlaceholders(padConfig.sublabel));
                if (padConfig.cc !== undefined) padElement.setAttribute('cc', padConfig.cc);
                if (padConfig.note !== undefined) padElement.setAttribute('note', padConfig.note);
                if (padConfig.mmc !== undefined) padElement.setAttribute('mmc', padConfig.mmc);

                padElement.addEventListener('pad-press', (e) => {
                    this.handlePadPress(e.detail);
                });
            }

            // Right-click or long-press to edit
            padElement.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.openPadEditor(i);
            });

            let longPressTimer;
            padElement.addEventListener('touchstart', (e) => {
                longPressTimer = setTimeout(() => {
                    e.preventDefault();
                    this.openPadEditor(i);
                }, 500);
            });
            padElement.addEventListener('touchend', () => {
                clearTimeout(longPressTimer);
            });
            padElement.addEventListener('touchmove', () => {
                clearTimeout(longPressTimer);
            });

            container.appendChild(padElement);
            this.pads.push(padElement);
        }
    }

    handlePadPress(detail) {
        if (detail.mmc) {
            this.sendMMC(detail.mmc);
        } else if (detail.cc !== undefined && detail.cc !== null) {
            this.sendCC(parseInt(detail.cc), 127);
        } else if (detail.note !== undefined && detail.note !== null) {
            this.sendNote(parseInt(detail.note), 127);
        }
    }

    sendCC(cc, value) {
        if (this.midiOutput) {
            const status = 0xB0 | this.midiChannel; // CC message with channel
            this.midiOutput.send([status, cc, value]);
            console.log(`Sent CC ${cc}, value ${value} on channel ${this.midiChannel + 1}`);
        } else {
            console.warn('No MIDI output selected');
        }
    }

    sendNote(note, velocity = 127) {
        if (this.midiOutput) {
            const noteOn = 0x90 | this.midiChannel;
            const noteOff = 0x80 | this.midiChannel;

            // Note On
            this.midiOutput.send([noteOn, note, velocity]);
            // Note Off after 100ms
            setTimeout(() => {
                this.midiOutput.send([noteOff, note, 0]);
            }, 100);
            console.log(`Sent Note ${note}, velocity ${velocity} on channel ${this.midiChannel + 1}`);
        } else {
            console.warn('No MIDI output selected');
        }
    }

    requestPlayerState() {
        if (!this.midiOutput) return;

        // Build GET_PLAYER_STATE message: F0 7D <device> 0x60 F7
        const message = [
            0xF0,                      // SysEx start
            0x7D,                      // Regroove manufacturer ID
            this.regrooveDeviceId,     // Target device
            0x60,                      // GET_PLAYER_STATE command
            0xF7                       // SysEx end
        ];

        this.midiOutput.send(message);
    }

    startStatePolling() {
        if (this.statePollingInterval) return; // Already polling

        // Poll every 500ms (2 times per second) - good balance between responsiveness and bandwidth
        this.statePollingInterval = setInterval(() => {
            this.requestPlayerState();
        }, 500);

        console.log('[State] Started polling player state every 500ms');
    }

    stopStatePolling() {
        if (this.statePollingInterval) {
            clearInterval(this.statePollingInterval);
            this.statePollingInterval = null;
            console.log('[State] Stopped polling player state');
        }
    }

    replacePlaceholders(text) {
        if (!text) return text;

        return text
            .replace(/\{order\}/gi, this.playerState.order)
            .replace(/\{pattern\}/gi, this.playerState.pattern)
            .replace(/\{row\}/gi, this.playerState.row);
    }

    updatePadColors() {
        // Update all pads based on player state
        this.pads.forEach((pad, index) => {
            const padConfig = this.config.pads[index];
            if (!padConfig) return;

            // Update placeholders in labels
            if (pad._originalLabel) {
                pad.setAttribute('label', this.replacePlaceholders(pad._originalLabel));
            }
            if (pad._originalSublabel) {
                pad.setAttribute('sublabel', this.replacePlaceholders(pad._originalSublabel));
            }

            const label = padConfig.label || '';
            let color = null;

            // Check for PLAY pad
            if (label.includes('PLAY')) {
                color = this.playerState.playing ? 'green' : null;
            }
            // Check for STOP pad
            else if (label.includes('STOP')) {
                color = !this.playerState.playing ? 'red' : null;
            }
            // Check for LOOP pad
            else if (label.includes('LOOP')) {
                // Mode 01 = pattern/loop
                const loopEnabled = (this.playerState.mode === 0x01);
                color = loopEnabled ? 'yellow' : null;
            }
            // Check for SOLO CH pads (e.g., "SOLO\nCH1", "SOLO\nCH 2", etc.)
            else if (label.includes('SOLO') && label.match(/CH\s*(\d+)/i)) {
                const match = label.match(/CH\s*(\d+)/i);
                if (match) {
                    const channel = parseInt(match[1]) - 1; // Convert to 0-indexed
                    const isSolo = this.isChannelSolo(channel);
                    color = isSolo ? 'red' : null;
                }
            }
            // Check for MUTE CH pads (e.g., "MUTE\nCH1", "MUTE\nCH 2", etc.)
            else if (label.includes('MUTE') && label.match(/CH\s*(\d+)/i)) {
                const match = label.match(/CH\s*(\d+)/i);
                if (match) {
                    const channel = parseInt(match[1]) - 1; // Convert to 0-indexed
                    const isMuted = this.playerState.mutedChannels.includes(channel);
                    color = isMuted ? 'red' : null;
                }
            }

            // Apply color to pad
            if (color) {
                pad.setAttribute('color', color);
            } else {
                pad.removeAttribute('color');
            }
        });
    }

    isChannelSolo(channel) {
        // A channel is solo'd if it's NOT muted and all other channels ARE muted
        const { numChannels, mutedChannels } = this.playerState;

        // Check if this channel is unmuted
        if (mutedChannels.includes(channel)) {
            return false; // Can't be solo if it's muted
        }

        // Check if all other channels are muted
        for (let ch = 0; ch < numChannels; ch++) {
            if (ch !== channel && !mutedChannels.includes(ch)) {
                return false; // Another channel is also unmuted
            }
        }

        // Only this channel is unmuted (and there are other channels muted)
        return mutedChannels.length > 0;
    }

    sendMMC(command) {
        if (!this.midiOutput) {
            console.warn('No MIDI output selected');
            return;
        }

        // MMC command mapping
        const mmcCommands = {
            'stop': 0x01,
            'play': 0x02,
            'deferred_play': 0x03,
            'fast_forward': 0x04,
            'rewind': 0x05,
            'record_strobe': 0x06,
            'record_exit': 0x07,
            'record_pause': 0x08,
            'pause': 0x09,
            'eject': 0x0A,
            'chase': 0x0B,
            'reset': 0x0D,
            'locate': 0x44,
            'shuttle': 0x47
        };

        const cmdByte = mmcCommands[command];
        if (cmdByte === undefined) {
            console.error(`Unknown MMC command: ${command}`);
            return;
        }

        // MMC SysEx message format:
        // F0 7F <device-id> 06 <command> F7
        const deviceId = 0x7F; // All devices
        const message = [
            0xF0,       // SysEx start
            0x7F,       // Real-time Universal SysEx
            deviceId,   // Device ID (0x7F = all)
            0x06,       // MMC sub-ID
            cmdByte,    // Command
            0xF7        // SysEx end
        ];

        this.midiOutput.send(message);
        console.log(`Sent MMC: ${command} (0x${cmdByte.toString(16).toUpperCase()})`);
    }

    // MIDI Clock Master functions
    startClock() {
        if (!this.midiOutput) {
            console.warn('No MIDI output selected - cannot start clock');
            return;
        }

        // Note: We do NOT send MIDI Start (0xFA) here
        // Only send clock pulses, let the slave control its own transport

        if (this.useWAAClock) {
            this.startWAAClock();
        } else {
            this.startJSClock();
        }
    }

    startJSClock() {
        // Calculate interval (24 ppqn)
        const PULSES_PER_QUARTER_NOTE = 24;
        const msPerBeat = 60000 / this.clockBPM;
        const interval = msPerBeat / PULSES_PER_QUARTER_NOTE;

        // Use simple setInterval for consistent timing
        this.clockInterval = setInterval(() => {
            if (this.midiOutput) {
                this.midiOutput.send([0xF8]);
            }
        }, interval);
    }

    startWAAClock() {
        try {
            // Create Web Audio context if needed
            if (!this.waaContext) {
                this.waaContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Check if WAAClock is available
            if (typeof WAAClock === 'undefined') {
                console.error('WAAClock not loaded! Falling back to JavaScript clock.');
                alert('WAAClock library not found. Using standard clock instead.\n\nTo use WAAClock, include the library:\n<script src="https://cdn.jsdelivr.net/npm/waaclock@latest/dist/WAAClock.min.js"></script>');
                this.useWAAClock = false;
                this.startJSClock();
                return;
            }

            // Create WAAClock instance
            if (!this.waaClock) {
                this.waaClock = new WAAClock(this.waaContext);
                this.waaClock.start();
            }

            // Calculate interval (24 ppqn)
            const PULSES_PER_QUARTER_NOTE = 24;
            const interval = 60 / this.clockBPM / PULSES_PER_QUARTER_NOTE;

            // Schedule repeating MIDI clock - start slightly in the future
            const startTime = this.waaContext.currentTime + 0.005; // Start 5ms in the future

            this.waaClockEvent = this.waaClock.callbackAtTime((event) => {
                if (this.midiOutput) {
                    this.midiOutput.send([0xF8]);
                }
            }, startTime).repeat(interval).tolerance({ late: 0.01, early: 0.01 });
        } catch (err) {
            console.error('Failed to start WAAClock:', err);
            this.useWAAClock = false;
            this.startJSClock();
        }
    }

    stopClock() {
        // Stop JavaScript clock
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }

        // Stop WAAClock
        if (this.waaClockEvent) {
            this.waaClockEvent.clear();
            this.waaClockEvent = null;
        }

        // Note: We do NOT send MIDI Stop (0xFC) here
        // Only stop sending clock pulses
        // This allows the slave to continue running if desired
    }

    createSequencerButtons() {
        const container = document.getElementById('sequencer-buttons');
        container.innerHTML = '';

        // Create 16 buttons (representing 16 rows/beats)
        for (let i = 0; i < 16; i++) {
            const button = document.createElement('div');
            button.className = 'seq-button';

            // Mark every 4th button (quarter notes)
            if ((i + 1) % 4 === 0) {
                button.classList.add('quarter');
            }

            // Click to send SPP to this position
            button.addEventListener('click', () => {
                this.sendSPP(i * 4); // Each button = 4 16th notes (1 beat)
            });

            container.appendChild(button);
        }
    }

    updatePositionBar() {
        if (!this.receiveSPP) return;

        // currentPosition is in rows (16th notes), 0-63
        // Each button represents 4 rows (1 beat)
        // So button index = floor(position / 4)
        const buttons = document.querySelectorAll('.seq-button');
        const currentBeat = Math.floor(this.currentPosition / 4);

        console.log(`Updating position bar: position ${this.currentPosition}, beat ${currentBeat}`);

        buttons.forEach((button, index) => {
            if (index === currentBeat) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    sendSPP(position) {
        if (!this.midiOutput) {
            console.warn('No MIDI output selected');
            return;
        }

        // SPP position is in MIDI beats (6 per quarter note)
        // But we're working in 16th notes, so convert
        const sppPosition = position; // position is already in 16th notes

        // Split into LSB and MSB (14-bit value)
        const lsb = sppPosition & 0x7F;
        const msb = (sppPosition >> 7) & 0x7F;

        // Send SPP message: 0xF2 + LSB + MSB
        this.midiOutput.send([0xF2, lsb, msb]);

        console.log(`Sent SPP: position ${position} (beat ${Math.floor(position / 4)})`);

        // Update local position for visual feedback
        this.currentPosition = position;
        this.updatePositionBar();
    }

    // Configuration management
    saveConfig() {
        try {
            // Add clock and SPP settings to config
            this.config.clockMaster = this.clockMaster;
            this.config.clockBPM = this.clockBPM;
            this.config.receiveSPP = this.receiveSPP;
            this.config.useWAAClock = this.useWAAClock;

            localStorage.setItem('meisterConfig', JSON.stringify(this.config));
        } catch (e) {
            console.error('Failed to save config to localStorage:', e);
        }
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem('meisterConfig');
            if (saved) {
                this.config = JSON.parse(saved);

                // Apply saved settings to UI
                document.getElementById('grid-layout').value = this.config.gridLayout || '4x4';
                document.getElementById('midi-channel').value = this.config.midiChannel || 0;
                this.midiChannel = this.config.midiChannel || 0;

                // Load SysEx device ID
                document.getElementById('sysex-device-id').value = this.config.sysexDeviceId || 0;
                this.regrooveDeviceId = this.config.sysexDeviceId || 0;

                // Load clock and SPP settings
                this.clockMaster = this.config.clockMaster || false;
                this.clockBPM = this.config.clockBPM || 120;
                this.receiveSPP = this.config.receiveSPP || false;
                this.useWAAClock = this.config.useWAAClock || false;

                document.getElementById('clock-master').checked = this.clockMaster;
                document.getElementById('clock-bpm').value = this.clockBPM;
                document.getElementById('receive-spp').checked = this.receiveSPP;
                document.getElementById('use-waaclock').checked = this.useWAAClock;

                const sequencer = document.getElementById('position-sequencer');
                sequencer.style.display = this.receiveSPP ? 'flex' : 'none';

                if (this.receiveSPP) {
                    this.createSequencerButtons();
                }

                // Auto-start clock if it was enabled
                if (this.clockMaster && this.midiOutput) {
                    this.startClock();
                }

                this.applyGridLayout();
            }
        } catch (e) {
            console.error('Failed to load config from localStorage:', e);
            this.config = this.getDefaultConfig();
        }
    }

    loadConfigFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                this.config = config;

                // Apply to UI
                if (config.gridLayout) {
                    document.getElementById('grid-layout').value = config.gridLayout;
                }
                if (config.midiChannel !== undefined) {
                    document.getElementById('midi-channel').value = config.midiChannel;
                    this.midiChannel = config.midiChannel;
                }
                if (config.sysexDeviceId !== undefined) {
                    document.getElementById('sysex-device-id').value = config.sysexDeviceId;
                    this.regrooveDeviceId = config.sysexDeviceId;
                }

                this.applyGridLayout();
                this.saveConfig();

                console.log('Configuration loaded from file');
                alert('Configuration loaded successfully!');
            } catch (err) {
                console.error('Failed to parse config file:', err);
                alert('Error loading configuration file');
            }
        };
        reader.readAsText(file);
    }

    downloadConfig() {
        const configJson = JSON.stringify(this.config, null, 2);
        const blob = new Blob([configJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'meister-config.rcx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Configuration downloaded');
    }

    startConnectionWatchdog() {
        if (this.connectionWatchdog) return; // Already running

        this.connectionWatchdog = setInterval(() => {
            const now = Date.now();
            const timeSinceLastUpdate = this.lastStateUpdate ? (now - this.lastStateUpdate) : Infinity;

            if (timeSinceLastUpdate > this.stateTimeoutMs && this.isConnectedToRegroove) {
                // Connection lost
                console.log('[Regroove] Disconnected - no state updates for ' + Math.round(timeSinceLastUpdate / 1000) + 's');
                this.handleRegrooveDisconnect();
            }
        }, 1000); // Check every second
    }

    stopConnectionWatchdog() {
        if (this.connectionWatchdog) {
            clearInterval(this.connectionWatchdog);
            this.connectionWatchdog = null;
        }
    }

    handleRegrooveDisconnect() {
        this.isConnectedToRegroove = false;

        // Reset player state to defaults
        this.playerState = {
            playing: false,
            mode: 0,
            order: 0,
            row: 0,
            pattern: 0,
            totalRows: 0,
            numChannels: 0,
            mutedChannels: []
        };

        // Clear all pad colors (reset to default state)
        this.pads.forEach((pad) => {
            pad.removeAttribute('color');
        });

        // Update labels to show default placeholders (will show 0s)
        this.updatePadColors();
    }
}

// Initialize controller when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.meisterController = new MeisterController();
    });
} else {
    window.meisterController = new MeisterController();
}
