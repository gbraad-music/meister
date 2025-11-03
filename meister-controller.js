// Regroove Meister Controller - Minimalist WebMIDI Interface
class MeisterController {
    constructor() {
        this.midiOutput = null;
        this.midiAccess = null;
        this.midiChannel = 0; // Default channel 1 (0-indexed)
        this.config = this.getDefaultConfig();
        this.pads = [];
        this.editingPadIndex = null;

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
            this.midiAccess.onstatechange = () => this.populateMIDIOutputs();
        } catch (err) {
            console.error('MIDI Access failed:', err);
        }
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
            } else {
                this.midiOutput = null;
                this.updateConnectionStatus(false);
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
                if (padConfig.label) padElement.setAttribute('label', padConfig.label);
                if (padConfig.sublabel) padElement.setAttribute('sublabel', padConfig.sublabel);
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

    // Configuration management
    saveConfig() {
        try {
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
}

// Initialize controller when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.meisterController = new MeisterController();
    });
} else {
    window.meisterController = new MeisterController();
}
