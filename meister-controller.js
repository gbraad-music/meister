// Regroove Meister Controller - Minimalist WebMIDI Interface
class MeisterController {
    constructor() {
        this.midiOutput = null;
        this.midiAccess = null;
        this.midiChannel = 0; // Default channel 1 (0-indexed)
        this.config = this.getDefaultConfig();
        this.pads = [];

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
                { label: "NEXT\nORDER", cc: 44 },
                { label: "PREV\nORDER", cc: 43 },
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
            this.midiAccess = await navigator.requestMIDIAccess();
            console.log('MIDI Access granted');
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

                padElement.addEventListener('pad-press', (e) => {
                    this.handlePadPress(e.detail);
                });
            }

            container.appendChild(padElement);
            this.pads.push(padElement);
        }
    }

    handlePadPress(detail) {
        if (detail.cc !== undefined && detail.cc !== null) {
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
