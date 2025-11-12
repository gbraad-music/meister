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

        // Regroove State Manager
        this.regrooveState = new RegrooveStateManager();
        this.regrooveState.onStateUpdate = (deviceId, state) => {
            // Update pad colors when state changes
            this.updatePadColors();
            // Notify scene manager to update faders and effects
            if (this.sceneManager) {
                this.sceneManager.updateMixerFromDeviceState(deviceId, state);
                this.sceneManager.updateEffectsFromDeviceState(deviceId, state);
            }
        };
        this.regrooveState.onConnectionChange = (connected) => {
            this.isConnectedToRegroove = connected;
        };
        this.regrooveDeviceId = 0; // Target Regroove device ID

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
        this.loadConfig(); // Load config FIRST so midiOutputId is available
        await this.setupMIDI();
        this.setupUI();
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
            // console.log(`SPP Received: ${rawPosition} -> Position in pattern: ${this.currentPosition} (row ${this.currentPosition})`);
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

        // Commented out to reduce console clutter
        // if (command === 0x61) {
        //     console.log(`[SysEx] Received PLAYER_STATE_RESPONSE from device ${deviceId}, length: ${payload.length} bytes`);
        // }

        // Only log non-state commands to reduce spam (0x60 = GET_PLAYER_STATE, 0x61 = PLAYER_STATE_RESPONSE, 0x71 = FX_EFFECT_SET, 0x7E = FX_GET_ALL_STATE, 0x7F = FX_STATE_RESPONSE)
        if (command !== 0x60 && command !== 0x61 && command !== 0x71 && command !== 0x7E && command !== 0x7F) {
            console.log(`[SysEx] Received command ${command.toString(16)} from device ${deviceId}`);
        }

        // PLAYER_STATE_RESPONSE = 0x61
        if (command === 0x61) {
            this.regrooveState.handlePlayerStateResponse(deviceId, payload);
        }

        // FX_STATE_RESPONSE = 0x7F
        if (command === 0x7F) {
            this.regrooveState.handleFxStateResponse(deviceId, payload);
        }
    }

    // Device State Management Helper Methods (delegate to regrooveState)
    getDeviceState(deviceId) {
        return this.regrooveState.getDeviceState(deviceId);
    }

    isLoopEnabled(deviceId) {
        return this.regrooveState.isLoopEnabled(deviceId);
    }

    isChannelMuted(deviceId, channel) {
        return this.regrooveState.isChannelMuted(deviceId, channel);
    }

    isChannelSoloed(deviceId, channel) {
        return this.regrooveState.isChannelSoloed(deviceId, channel);
    }

    toggleChannelMuteState(deviceId, channel) {
        return this.regrooveState.toggleChannelMuteState(deviceId, channel);
    }

    toggleChannelSoloState(deviceId, channel) {
        return this.regrooveState.toggleChannelSoloState(deviceId, channel);
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

            // Try to restore saved MIDI output from config, or fall back to current dropdown value
            const savedOutputId = this.config.midiOutputId || currentValue;

            if (savedOutputId) {
                select.value = savedOutputId;
                if (select.value === savedOutputId) {
                    this.midiOutput = this.midiAccess.outputs.get(savedOutputId);
                    this.updateConnectionStatus(true);

                    // Start state polling for restored connection
                    this.startStatePolling();
                    console.log(`[MIDI] Restored output: ${this.midiOutput.name}`);
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
            if (!this.sceneEditor) {
                console.warn('[Config] SceneEditor not yet initialized');
                alert('Please wait for the app to fully load before saving configuration.');
                return;
            }
            this.downloadConfig();
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

        // Secondary message type selector
        document.getElementById('pad-secondary-message-type').addEventListener('change', (e) => {
            this.updateSecondaryPadEditorFields(e.target.value);
        });

        // MMC command selector - show/hide locate params
        document.getElementById('pad-mmc-command').addEventListener('change', (e) => {
            const locateParams = document.getElementById('pad-mmc-locate-params');
            locateParams.style.display = e.target.value === 'locate' ? 'block' : 'none';
        });

        // SysEx action selector - show/hide parameter fields
        document.getElementById('pad-sysex-action').addEventListener('change', (e) => {
            const jumpParams = document.getElementById('pad-sysex-jump-params');
            const fileParams = document.getElementById('pad-sysex-file-params');
            const channelParams = document.getElementById('pad-sysex-channel-params');

            jumpParams.style.display = e.target.value === 'jump_to_order_row' ? 'block' : 'none';
            fileParams.style.display = e.target.value === 'file_load' ? 'block' : 'none';
            channelParams.style.display = (e.target.value === 'channel_mute' || e.target.value === 'channel_solo') ? 'block' : 'none';
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

        // Polling interval control
        document.getElementById('polling-interval')?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('polling-interval-value').textContent = value + 'ms';

            // Update polling interval
            this.regrooveState.pollingIntervalMs = value;

            // Restart polling if currently active
            if (this.regrooveState.statePollingInterval) {
                this.regrooveState.stopPolling();
                this.regrooveState.startPolling(this.regrooveState.targetDeviceIds);
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

        // Populate device binding dropdown
        this.populatePadDeviceBindings();

        if (padIndex !== null && this.config.pads[padIndex]) {
            const pad = this.config.pads[padIndex];
            document.getElementById('pad-label').value = pad.label || '';
            document.getElementById('pad-sublabel').value = pad.sublabel || '';
            document.getElementById('pad-device-binding').value = pad.deviceBinding || '';

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
            } else if (pad.sysex !== undefined) {
                document.getElementById('pad-message-type').value = 'sysex';
                document.getElementById('pad-sysex-action').value = pad.sysex || 'play';

                // Load SysEx parameters if present
                if (pad.sysexParams) {
                    if (pad.sysex === 'jump_to_order_row' && pad.sysexParams.order !== undefined) {
                        document.getElementById('pad-sysex-jump-order').value = pad.sysexParams.order;
                        document.getElementById('pad-sysex-jump-row').value = pad.sysexParams.row || 0;
                        document.getElementById('pad-sysex-jump-params').style.display = 'block';
                    } else if (pad.sysex === 'file_load' && pad.sysexParams.filename) {
                        document.getElementById('pad-sysex-filename').value = pad.sysexParams.filename;
                        document.getElementById('pad-sysex-file-params').style.display = 'block';
                    } else if ((pad.sysex === 'channel_mute' || pad.sysex === 'channel_solo') && pad.sysexParams.channel !== undefined) {
                        document.getElementById('pad-sysex-channel').value = pad.sysexParams.channel;
                        document.getElementById('pad-sysex-channel-params').style.display = 'block';
                    }
                }
            } else {
                document.getElementById('pad-message-type').value = 'regroove';
            }

            // Load MMC parameters if present
            if (pad.mmc === 'locate' && pad.mmcParams) {
                document.getElementById('pad-mmc-locate-order').value = pad.mmcParams.order || 0;
                document.getElementById('pad-mmc-locate-row').value = pad.mmcParams.row || 0;
                document.getElementById('pad-mmc-locate-params').style.display = 'block';
            }

            this.updatePadEditorFields(document.getElementById('pad-message-type').value);

            // Load secondary action if present
            if (pad.secondaryCC !== undefined || pad.secondaryNote !== undefined || pad.secondaryMMC !== undefined) {
                if (pad.secondaryMMC !== undefined) {
                    document.getElementById('pad-secondary-message-type').value = 'mmc';
                    document.getElementById('pad-secondary-mmc-command').value = pad.secondaryMMC || 'stop';
                } else if (pad.secondaryCC !== undefined) {
                    if (this.isRegrooveActionCC(pad.secondaryCC)) {
                        document.getElementById('pad-secondary-message-type').value = 'regroove';
                        document.getElementById('pad-secondary-regroove-action').value = pad.secondaryCC.toString();
                    } else {
                        document.getElementById('pad-secondary-message-type').value = 'cc';
                        document.getElementById('pad-secondary-cc').value = pad.secondaryCC || '';
                    }
                } else if (pad.secondaryNote !== undefined) {
                    document.getElementById('pad-secondary-message-type').value = 'note';
                    document.getElementById('pad-secondary-note').value = pad.secondaryNote || '';
                }
                this.updateSecondaryPadEditorFields(document.getElementById('pad-secondary-message-type').value);
            } else {
                document.getElementById('pad-secondary-message-type').value = 'none';
                this.updateSecondaryPadEditorFields('none');
            }

            document.getElementById('pad-editor-title').textContent = `EDIT PAD ${padIndex + 1}`;
        } else {
            // New pad
            document.getElementById('pad-label').value = '';
            document.getElementById('pad-sublabel').value = '';
            document.getElementById('pad-device-binding').value = '';
            document.getElementById('pad-message-type').value = 'regroove';
            document.getElementById('pad-regroove-action').value = '41';
            this.updatePadEditorFields('regroove');
            document.getElementById('pad-secondary-message-type').value = 'none';
            this.updateSecondaryPadEditorFields('none');
            document.getElementById('pad-editor-title').textContent = 'EDIT PAD';
        }

        editor.classList.add('active');
    }

    populatePadDeviceBindings() {
        const select = document.getElementById('pad-device-binding');
        if (!select) return;

        // Get device manager
        const deviceManager = this.deviceManager;
        if (!deviceManager) {
            select.innerHTML = '<option value="">Default Device</option>';
            return;
        }

        const devices = deviceManager.getAllDevices();
        select.innerHTML = '<option value="">Default Device</option>' +
            devices.map(device =>
                `<option value="${device.id}">${device.name} (Ch ${device.midiChannel + 1}, ID ${device.deviceId})</option>`
            ).join('');
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
        const sysexField = document.getElementById('pad-sysex-field');
        const ccField = document.getElementById('pad-cc-field');
        const noteField = document.getElementById('pad-note-field');
        const mmcField = document.getElementById('pad-mmc-field');
        const deviceField = document.getElementById('pad-device-field');

        regrooveField.style.display = messageType === 'regroove' ? 'block' : 'none';
        sysexField.style.display = messageType === 'sysex' ? 'block' : 'none';
        ccField.style.display = messageType === 'cc' ? 'block' : 'none';
        noteField.style.display = messageType === 'note' ? 'block' : 'none';
        mmcField.style.display = messageType === 'mmc' ? 'block' : 'none';

        // Show device binding for all message types
        deviceField.style.display = 'block';
    }

    updateSecondaryPadEditorFields(messageType) {
        const regrooveField = document.getElementById('pad-secondary-regroove-field');
        const ccField = document.getElementById('pad-secondary-cc-field');
        const noteField = document.getElementById('pad-secondary-note-field');
        const mmcField = document.getElementById('pad-secondary-mmc-field');

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
        const deviceBinding = document.getElementById('pad-device-binding').value;
        const errorElement = document.getElementById('pad-label-error');

        // Check for secondary action fields
        const secondaryMessageType = document.getElementById('pad-secondary-message-type')?.value;

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
            const mmcCommand = document.getElementById('pad-mmc-command').value;
            padConfig.mmc = mmcCommand;
            hasMessage = true;

            // Save MMC LOCATE parameters if present
            if (mmcCommand === 'locate') {
                const order = parseInt(document.getElementById('pad-mmc-locate-order').value);
                const row = parseInt(document.getElementById('pad-mmc-locate-row').value);
                if (!isNaN(order) && !isNaN(row)) {
                    padConfig.mmcParams = { order, row };
                }
            }
        } else if (messageType === 'sysex') {
            const sysexAction = document.getElementById('pad-sysex-action').value;
            padConfig.sysex = sysexAction;
            hasMessage = true;

            // Save SysEx parameters based on action type
            if (sysexAction === 'jump_to_order_row') {
                const order = parseInt(document.getElementById('pad-sysex-jump-order').value);
                const row = parseInt(document.getElementById('pad-sysex-jump-row').value);
                if (!isNaN(order) && !isNaN(row)) {
                    padConfig.sysexParams = { order, row };
                }
            } else if (sysexAction === 'file_load') {
                const filename = document.getElementById('pad-sysex-filename').value.trim();
                if (filename) {
                    padConfig.sysexParams = { filename };
                }
            } else if (sysexAction === 'channel_mute' || sysexAction === 'channel_solo') {
                const channel = parseInt(document.getElementById('pad-sysex-channel').value);
                if (!isNaN(channel) && channel >= 0 && channel <= 63) {
                    padConfig.sysexParams = { channel };
                }
            }
        }

        // Check for secondary action
        if (secondaryMessageType && secondaryMessageType !== 'none') {
            if (secondaryMessageType === 'regroove') {
                const cc = parseInt(document.getElementById('pad-secondary-regroove-action').value);
                if (!isNaN(cc) && cc >= 0 && cc <= 127) {
                    padConfig.secondaryCC = cc;
                }
            } else if (secondaryMessageType === 'cc') {
                const cc = parseInt(document.getElementById('pad-secondary-cc').value);
                if (!isNaN(cc) && cc >= 0 && cc <= 127) {
                    padConfig.secondaryCC = cc;
                }
            } else if (secondaryMessageType === 'note') {
                const note = parseInt(document.getElementById('pad-secondary-note').value);
                if (!isNaN(note) && note >= 0 && note <= 127) {
                    padConfig.secondaryNote = note;
                }
            } else if (secondaryMessageType === 'mmc') {
                padConfig.secondaryMMC = document.getElementById('pad-secondary-mmc-command').value;
            }
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
        // Add device binding
        if (deviceBinding) {
            padConfig.deviceBinding = deviceBinding;
        }

        // Check if we're editing a custom scene's pads or the default pads
        const isCustomScene = this.currentPadSceneId && this.currentPadSceneId !== 'pads';

        if (isCustomScene) {
            // Save to scene's pads array
            const scene = this.sceneManager.scenes.get(this.currentPadSceneId);
            if (scene) {
                if (!scene.pads) scene.pads = [];

                // Check if we have at least a message type (cc, note, or mmc)
                // If not, treat as empty pad
                if (!hasMessage) {
                    scene.pads[this.editingPadIndex] = null;
                } else {
                    scene.pads[this.editingPadIndex] = padConfig;
                }

                // Save scene config to localStorage
                this.sceneEditor.saveScenesToStorage();

                // Re-render the scene
                if (scene.render) scene.render();
            }
        } else {
            // Save to global config (built-in pads scene)
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
        }

        this.closePadEditor();
    }

    clearPad() {
        if (this.editingPadIndex === null) return;

        // Check if we're editing a custom scene's pads or the default pads
        const isCustomScene = this.currentPadSceneId && this.currentPadSceneId !== 'pads';

        if (isCustomScene) {
            // Clear from scene's pads array
            const scene = this.sceneManager.scenes.get(this.currentPadSceneId);
            if (scene) {
                if (!scene.pads) scene.pads = [];
                scene.pads[this.editingPadIndex] = null;

                // Save scene config to localStorage
                this.sceneEditor.saveScenesToStorage();

                // Re-render the scene
                if (scene.render) scene.render();
            }
        } else {
            // Clear from global config (built-in pads scene)
            if (!this.config.pads) this.config.pads = [];
            this.config.pads[this.editingPadIndex] = null;

            this.saveConfig();
            this.createPads();
        }

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

    /**
     * Create a single pad element with the given configuration
     * @param {number} index - The pad index
     * @param {Object} padConfig - The pad configuration
     * @returns {HTMLElement} The created pad element
     */
    createSinglePad(index, padConfig) {
        const padElement = document.createElement('regroove-pad');

        if (padConfig) {
            // Store original label for later replacement
            padElement._originalLabel = padConfig.label;
            padElement._originalSublabel = padConfig.sublabel;

            if (padConfig.label) padElement.setAttribute('label', this.replacePlaceholders(padConfig.label));

            // Build sublabel with device indicator if non-default device is bound
            let sublabel = padConfig.sublabel ? this.replacePlaceholders(padConfig.sublabel) : '';
            if (padConfig.deviceBinding) {
                if (this.deviceManager) {
                    const device = this.deviceManager.getDevice(padConfig.deviceBinding);
                    if (device) {
                        // Add device name as a note
                        const deviceNote = `[${device.name}]`;
                        sublabel = sublabel ? `${sublabel}\n${deviceNote}` : deviceNote;
                        console.log(`[Pad ${index}] Added device label: ${device.name}`);
                    } else {
                        console.warn(`[Pad ${index}] Device binding "${padConfig.deviceBinding}" not found`);
                    }
                } else {
                    console.warn(`[Pad ${index}] DeviceManager not initialized yet`);
                }
            }
            if (sublabel) padElement.setAttribute('sublabel', sublabel);

            if (padConfig.cc !== undefined) padElement.setAttribute('cc', padConfig.cc);
            if (padConfig.note !== undefined) padElement.setAttribute('note', padConfig.note);
            if (padConfig.mmc !== undefined) {
                padElement.setAttribute('mmc', padConfig.mmc);
                // Store MMC parameters in dataset
                if (padConfig.mmcParams) {
                    padElement.dataset.mmcParams = JSON.stringify(padConfig.mmcParams);
                }
            }
            if (padConfig.sysex !== undefined) {
                padElement.setAttribute('sysex', padConfig.sysex);
                // Store SysEx parameters in dataset
                if (padConfig.sysexParams) {
                    padElement.dataset.sysexParams = JSON.stringify(padConfig.sysexParams);
                }
            }

            // Set secondary actions
            if (padConfig.secondaryCC !== undefined) padElement.setAttribute('secondary-cc', padConfig.secondaryCC);
            if (padConfig.secondaryNote !== undefined) padElement.setAttribute('secondary-note', padConfig.secondaryNote);
            if (padConfig.secondaryMMC !== undefined) padElement.setAttribute('secondary-mmc', padConfig.secondaryMMC);

            // Store device binding on the element
            if (padConfig.deviceBinding) {
                padElement.dataset.deviceBinding = padConfig.deviceBinding;
            }

            padElement.addEventListener('pad-press', (e) => {
                this.handlePadPress(e.detail, padElement, index);
            });
        }

        // Store pad index
        padElement.dataset.padIndex = index;

        // Right-click to edit
        padElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.openPadEditor(index);
        });

        // Drag and drop with Ctrl + left mouse button
        padElement.setAttribute('draggable', 'false');

        padElement.addEventListener('mousedown', (e) => {
            // Ctrl + Left click = drag mode
            if (e.button === 0 && e.ctrlKey) {
                e.preventDefault();
                padElement.setAttribute('draggable', 'true');
                padElement.style.cursor = 'move';
            }
        });

        padElement.addEventListener('dragstart', (e) => {
            if (padElement.getAttribute('draggable') === 'true') {
                this.draggingPadIndex = index;
                padElement.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index);
            }
        });

        padElement.addEventListener('dragend', (e) => {
            padElement.style.opacity = '';
            padElement.setAttribute('draggable', 'false');
            padElement.style.cursor = '';
            this.draggingPadIndex = null;
        });

        // Make pad a drop target
        padElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggingPadIndex !== null && this.draggingPadIndex !== index) {
                padElement.style.opacity = '0.5';
            }
        });

        padElement.addEventListener('dragleave', (e) => {
            padElement.style.opacity = '';
        });

        padElement.addEventListener('drop', (e) => {
            e.preventDefault();
            padElement.style.opacity = '';
            if (this.draggingPadIndex !== null && this.draggingPadIndex !== index) {
                this.swapPads(this.draggingPadIndex, index);
            }
        });

        let longPressTimer;
        padElement.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => {
                e.preventDefault();
                this.openPadEditor(index);
            }, 500);
        });
        padElement.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        });
        padElement.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        });

        return padElement;
    }

    createPads() {
        const container = document.getElementById('pads-grid');
        container.innerHTML = '';
        this.pads = [];

        const [cols, rows] = this.config.gridLayout.split('x').map(n => parseInt(n));
        const totalPads = cols * rows;

        for (let i = 0; i < totalPads; i++) {
            const padConfig = this.config.pads[i];
            const padElement = this.createSinglePad(i, padConfig);
            container.appendChild(padElement);
            this.pads.push(padElement);
        }
    }

    swapPads(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;

        console.log(`Swapping pad ${fromIndex} with pad ${toIndex}`);

        // Check if we're in a custom scene (like split scene)
        const isCustomScene = this.currentPadSceneId && this.currentPadSceneId !== 'pads';

        if (isCustomScene) {
            // Swap in the scene's pads array
            const scene = this.sceneManager.scenes.get(this.currentPadSceneId);
            if (scene && scene.pads) {
                const temp = scene.pads[fromIndex];
                scene.pads[fromIndex] = scene.pads[toIndex];
                scene.pads[toIndex] = temp;

                // Save scene config
                this.sceneEditor.saveScenesToStorage();

                // Re-render the scene
                if (scene.render) {
                    scene.render();
                }
            }
        } else {
            // Swap in global config (built-in pads scene)
            if (!this.config.pads) this.config.pads = [];
            const temp = this.config.pads[fromIndex];
            this.config.pads[fromIndex] = this.config.pads[toIndex];
            this.config.pads[toIndex] = temp;

            // Save and re-render
            this.saveConfig();
            this.createPads();
        }
    }

    handlePadPress(detail, padElement, padIndex) {
        // Resolve device binding to device ID
        let deviceId = null;
        if (padElement && padElement.dataset.deviceBinding) {
            const deviceManager = this.deviceManager;
            if (deviceManager) {
                const device = deviceManager.getDevice(padElement.dataset.deviceBinding);
                if (device) {
                    deviceId = device.deviceId;
                }
            }
        }

        // If no device binding, use default device
        if (deviceId === null && this.deviceManager) {
            const defaultDevice = this.deviceManager.getDefaultDevice();
            if (defaultDevice) {
                deviceId = defaultDevice.deviceId;
            }
        }

        // Fallback to device ID 0
        if (deviceId === null) {
            deviceId = 0;
        }

        // Get pad config for parameters
        const padConfig = this.config.pads[padIndex];

        // Send the message
        if (detail.sysex) {
            // Handle SysEx actions
            const sysexAction = detail.sysex;
            let params = null;
            if (padElement.dataset.sysexParams) {
                try {
                    params = JSON.parse(padElement.dataset.sysexParams);
                } catch(e) {
                    console.error('Failed to parse sysex params:', e);
                }
            }

            switch(sysexAction) {
                case 'play':
                    this.sendSysExPlay(deviceId);
                    break;
                case 'stop':
                    this.sendSysExStop(deviceId);
                    break;
                case 'pause':
                    this.sendSysExPause(deviceId);
                    break;
                case 'retrigger':
                    this.sendSysExRetrigger(deviceId);
                    break;
                case 'next_order':
                    this.sendSysExNextOrder(deviceId);
                    break;
                case 'prev_order':
                    this.sendSysExPrevOrder(deviceId);
                    break;
                case 'jump_to_order_row':
                    if (params && params.order !== undefined && params.row !== undefined) {
                        this.sendSysExJumpToOrderRow(deviceId, params.order, params.row);
                    }
                    break;
                case 'file_load':
                    if (params && params.filename) {
                        this.sendSysExFileLoad(deviceId, params.filename);
                    }
                    break;
                case 'set_loop_current':
                    // Toggle based on current state
                    const currentLoopState = this.isLoopEnabled(deviceId);
                    this.sendSysExSetLoopCurrent(deviceId, currentLoopState ? 0 : 1);
                    break;
                case 'channel_mute':
                    if (params && params.channel !== undefined) {
                        const channel = parseInt(params.channel);
                        const newMuteState = this.toggleChannelMuteState(deviceId, channel);
                        this.sendSysExChannelMute(deviceId, channel, newMuteState ? 1 : 0);
                    }
                    break;
                case 'channel_solo':
                    if (params && params.channel !== undefined) {
                        const channel = parseInt(params.channel);
                        const newSoloState = this.toggleChannelSoloState(deviceId, channel);
                        this.sendSysExChannelSolo(deviceId, channel, newSoloState ? 1 : 0);
                    }
                    break;
            }
        } else if (detail.mmc) {
            // Handle MMC with parameters and device ID
            let mmcParams = {};
            if (padElement.dataset.mmcParams) {
                try {
                    mmcParams = JSON.parse(padElement.dataset.mmcParams);
                } catch(e) {
                    console.error('Failed to parse MMC params:', e);
                }
            }
            this.sendMMC(detail.mmc, mmcParams, deviceId);
        } else if (detail.cc !== undefined && detail.cc !== null) {
            // Use device-aware sending for CC (Regroove actions)
            if (this.sendRegrooveCC && deviceId !== null) {
                this.sendRegrooveCC(parseInt(detail.cc), 127, deviceId);
            } else {
                this.sendCC(parseInt(detail.cc), 127);
            }
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

    startStatePolling() {
        console.log('[Meister] Starting state polling...');

        // Initialize regrooveState with MIDI send callback
        this.regrooveState.init((deviceId, command, data) => {
            this.sendSysEx(deviceId, command, data);
        });

        // Collect all device IDs to poll
        const deviceIds = new Set();

        // Add all device manager devices
        if (this.deviceManager) {
            const devices = this.deviceManager.getAllDevices();
            console.log(`[Meister] Device manager has ${devices.length} devices:`, devices.map(d => `${d.name} (ID ${d.deviceId})`));
            devices.forEach(device => {
                deviceIds.add(device.deviceId);
            });
        } else {
            console.warn('[Meister] Device manager not initialized yet');
        }

        // If no devices in device manager, fall back to regrooveDeviceId or 0
        if (deviceIds.size === 0) {
            console.log('[Meister] No devices found, using default device 0');
            deviceIds.add(this.regrooveDeviceId || 0);
        }

        // Start polling all devices
        const deviceIdArray = Array.from(deviceIds);
        console.log(`[Meister] Starting polling for devices: [${deviceIdArray.join(', ')}]`);
        this.regrooveState.startPolling(deviceIdArray);
    }

    stopStatePolling() {
        this.regrooveState.stopPolling();
    }

    replacePlaceholders(text) {
        if (!text) return text;

        const state = this.regrooveState.playerState;
        return text
            .replace(/\{order\}/gi, state.order)
            .replace(/\{pattern\}/gi, state.pattern)
            .replace(/\{row\}/gi, state.row);
    }

    updatePadColors() {
        // Update all pads based on player state
        this.pads.forEach((pad, index) => {
            const padConfig = this.config.pads[index];
            if (!padConfig) return;

            // Resolve device state for this pad
            let deviceState = this.regrooveState.playerState; // Default to device 0
            if (padConfig.deviceBinding && this.deviceManager) {
                const device = this.deviceManager.getDevice(padConfig.deviceBinding);
                if (device) {
                    deviceState = this.regrooveState.getDeviceState(device.deviceId);
                }
            }

            // Update placeholders in labels using device state
            if (pad._originalLabel) {
                const labelText = pad._originalLabel
                    .replace(/\{order\}/gi, deviceState.order)
                    .replace(/\{pattern\}/gi, deviceState.pattern)
                    .replace(/\{row\}/gi, deviceState.row);
                pad.setAttribute('label', labelText);
            }
            if (pad._originalSublabel) {
                const sublabelText = pad._originalSublabel
                    .replace(/\{order\}/gi, deviceState.order)
                    .replace(/\{pattern\}/gi, deviceState.pattern)
                    .replace(/\{row\}/gi, deviceState.row);
                pad.setAttribute('sublabel', sublabelText);
            }

            const label = padConfig.label || '';
            let color = null;

            // Check for PLAY pad
            if (label.includes('PLAY')) {
                color = deviceState.playing ? 'green' : null;
            }
            // Check for STOP pad
            else if (label.includes('STOP')) {
                color = !deviceState.playing ? 'red' : null;
            }
            // Check for LOOP pad
            else if (label.includes('LOOP')) {
                // Mode 01 = pattern/loop
                const loopEnabled = (deviceState.mode === 0x01);
                color = loopEnabled ? 'yellow' : null;
            }
            // Check for SOLO CH pads (e.g., "SOLO\nCH1", "SOLO\nCH 2", etc.)
            else if (label.includes('SOLO') && label.match(/CH\s*(\d+)/i)) {
                const match = label.match(/CH\s*(\d+)/i);
                if (match) {
                    const channel = parseInt(match[1]) - 1; // Convert to 0-indexed
                    const isSolo = this.isChannelSolo(channel, deviceState);
                    color = isSolo ? 'red' : null;
                }
            }
            // Check for MUTE CH pads (e.g., "MUTE\nCH1", "MUTE\nCH 2", etc.)
            else if (label.includes('MUTE') && label.match(/CH\s*(\d+)/i)) {
                const match = label.match(/CH\s*(\d+)/i);
                if (match) {
                    const channel = parseInt(match[1]) - 1; // Convert to 0-indexed
                    const isMuted = deviceState.mutedChannels.includes(channel);
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

    isChannelSolo(channel, deviceState = null) {
        // Use provided deviceState or fall back to default playerState
        const state = deviceState || this.regrooveState.playerState;
        const { numChannels, mutedChannels } = state;

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

    sendMMC(command, params = {}, deviceId = 0x7F) {
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

        let message = [
            0xF0,       // SysEx start
            0x7F,       // Real-time Universal SysEx
            deviceId & 0x7F,   // Device ID (0x7F = all, or specific device)
            0x06,       // MMC sub-ID
            cmdByte     // Command
        ];

        // Add parameters for LOCATE command
        if (command === 'locate' && params.order !== undefined && params.row !== undefined) {
            // MMC LOCATE format:
            // F0 7F <dev> 06 44 06 01 <order> <row> 00 00 00 F7
            // 06 = information field length (6 bytes: type + 5 time bytes)
            // 01 = target position type (0x04 = loop start, 0x05 = loop end)
            const order = params.order & 0x7F;
            const row = params.row & 0x7F;
            message.push(
                0x06,  // Information field length (6 bytes)
                0x01,  // Locate type: target position
                order, // Hours (order)
                row,   // Minutes (row)
                0x00,  // Seconds (unused)
                0x00,  // Frames (unused)
                0x00   // Subframes (unused)
            );
        }

        message.push(0xF7); // SysEx end

        this.midiOutput.send(message);
        console.log(`Sent MMC to device ${deviceId}: ${command} (0x${cmdByte.toString(16).toUpperCase()})`, params);
    }

    // SysEx Helper Functions for Regroove
    sendSysEx(deviceId, command, data = []) {
        if (!this.midiOutput) {
            console.warn('[Meister] Cannot send SysEx - No MIDI output selected');
            return;
        }

        const message = [
            0xF0,  // SysEx start
            0x7D,  // Regroove manufacturer ID
            deviceId,
            command,
            ...data,
            0xF7   // SysEx end
        ];

        // Only log non-polling commands to reduce console spam
        // 0x60 = GET_PLAYER_STATE, 0x71 = FX_EFFECT_SET, 0x7E = FX_GET_ALL_STATE
        if (command !== 0x60 && command !== 0x71 && command !== 0x7E) {
            console.log(`[Meister] sendSysEx: Sending to device ${deviceId}, command 0x${command.toString(16).toUpperCase()}, message: [${message.join(', ')}]`);
        }
        this.midiOutput.send(message);
    }

    // SysEx: NEXT_ORDER (0x24) - Queue next order (beat-synced)
    sendSysExNextOrder(deviceId) {
        this.sendSysEx(deviceId, 0x24, []);
    }

    // SysEx: PREV_ORDER (0x25) - Queue previous order (beat-synced)
    sendSysExPrevOrder(deviceId) {
        this.sendSysEx(deviceId, 0x25, []);
    }

    // SysEx: JUMP_TO_ORDER_ROW (0x40) - Immediate jump to order+row
    sendSysExJumpToOrderRow(deviceId, order, row) {
        this.sendSysEx(deviceId, 0x40, [order & 0x7F, row & 0x7F]);
    }

    // SysEx: FILE_LOAD (0x10) - Load file by filename
    sendSysExFileLoad(deviceId, filename) {
        // Format: <length_byte> <filename_bytes...>
        const filenameBytes = [];
        for (let i = 0; i < filename.length; i++) {
            filenameBytes.push(filename.charCodeAt(i) & 0x7F);
        }
        // Prepend length byte
        const data = [filenameBytes.length, ...filenameBytes];
        this.sendSysEx(deviceId, 0x10, data);
    }

    // SysEx: PLAY (0x20)
    sendSysExPlay(deviceId) {
        this.sendSysEx(deviceId, 0x20, []);
    }

    // SysEx: STOP (0x21)
    sendSysExStop(deviceId) {
        this.sendSysEx(deviceId, 0x21, []);
    }

    // SysEx: PAUSE (0x22)
    sendSysExPause(deviceId) {
        this.sendSysEx(deviceId, 0x22, []);
    }

    // SysEx: RETRIGGER (0x23)
    sendSysExRetrigger(deviceId) {
        this.sendSysEx(deviceId, 0x23, []);
    }

    // SysEx: CHANNEL_MUTE (0x30)
    sendSysExChannelMute(deviceId, channel, mute) {
        this.sendSysEx(deviceId, 0x30, [channel & 0x7F, mute ? 1 : 0]);
    }

    // SysEx: CHANNEL_SOLO (0x31)
    sendSysExChannelSolo(deviceId, channel, solo) {
        this.sendSysEx(deviceId, 0x31, [channel & 0x7F, solo ? 1 : 0]);
    }

    // SysEx: CHANNEL_FX_ENABLE (0x38) - Samplecrate per-program FX enable
    sendSysExChannelFxEnable(deviceId, program, enable) {
        this.sendSysEx(deviceId, 0x38, [program & 0x7F, enable ? 1 : 0]);
    }

    // SysEx: SET_LOOP_CURRENT (0x43)
    sendSysExSetLoopCurrent(deviceId, enable) {
        this.sendSysEx(deviceId, 0x43, [enable ? 1 : 0]);
    }

    // SysEx: PING (0x01) - Device discovery/heartbeat
    sendSysExPing(deviceId) {
        this.sendSysEx(deviceId, 0x01, []);
    }

    // SysEx: CHANNEL_VOLUME (0x32)
    sendSysExChannelVolume(deviceId, channel, volume) {
        this.sendSysEx(deviceId, 0x32, [channel & 0x7F, volume & 0x7F]);
    }

    // SysEx: MASTER_VOLUME (0x33) - Set master volume
    sendSysExMasterVolume(deviceId, volume) {
        this.sendSysEx(deviceId, 0x33, [volume & 0x7F]);
    }

    // SysEx: MASTER_MUTE (0x34) - Set master mute
    sendSysExMasterMute(deviceId, mute) {
        this.sendSysEx(deviceId, 0x34, [mute ? 1 : 0]);
    }

    // SysEx: INPUT_VOLUME (0x35) - Set input volume
    sendSysExInputVolume(deviceId, volume) {
        this.sendSysEx(deviceId, 0x35, [volume & 0x7F]);
    }

    // SysEx: INPUT_MUTE (0x36) - Set input mute
    sendSysExInputMute(deviceId, mute) {
        this.sendSysEx(deviceId, 0x36, [mute ? 1 : 0]);
    }

    // SysEx: FX_SET_ROUTE (0x37) - Set FX routing
    // route: 0=none, 1=master, 2=playback, 3=input
    sendSysExFxSetRoute(deviceId, route) {
        this.sendSysEx(deviceId, 0x37, [route & 0x7F]);
    }

    // SysEx: STEREO_SEPARATION (0x57) - Set stereo separation width
    // separation: 0-127 (maps to 0-200, where 0=mono, 64≈100=normal, 127=200=extra wide)
    sendSysExStereoSeparation(deviceId, separation) {
        this.sendSysEx(deviceId, 0x57, [separation & 0x7F]);
    }

    // SysEx: CHANNEL_PANNING (0x58) - Set channel panning
    // channel: 0-63, panning: 0-127 (0=left, 64=center, 127=right)
    sendSysExChannelPanning(deviceId, channel, panning) {
        this.sendSysEx(deviceId, 0x58, [channel & 0x7F, panning & 0x7F]);
    }

    // SysEx: MASTER_PANNING (0x59) - Set master output panning
    // panning: 0-127 (0=left, 64=center, 127=right)
    sendSysExMasterPanning(deviceId, panning) {
        this.sendSysEx(deviceId, 0x59, [panning & 0x7F]);
    }

    // SysEx: INPUT_PANNING (0x5A) - Set audio input panning
    // panning: 0-127 (0=left, 64=center, 127=right)
    sendSysExInputPanning(deviceId, panning) {
        this.sendSysEx(deviceId, 0x5A, [panning & 0x7F]);
    }

    // SysEx: JUMP_TO_PATTERN_ROW (0x46) - Immediate jump to pattern+row
    sendSysExJumpToPatternRow(deviceId, pattern, row) {
        this.sendSysEx(deviceId, 0x46, [pattern & 0x7F, row & 0x7F]);
    }

    // SysEx: SET_LOOP_RANGE (0x41) - Set loop: start_order, start_row, end_order, end_row
    sendSysExSetLoopRange(deviceId, startOrder, startRow, endOrder, endRow) {
        this.sendSysEx(deviceId, 0x41, [startOrder & 0x7F, startRow & 0x7F, endOrder & 0x7F, endRow & 0x7F]);
    }

    // SysEx: SET_LOOP_ORDER (0x44) - Loop specific order number
    sendSysExSetLoopOrder(deviceId, orderNumber) {
        this.sendSysEx(deviceId, 0x44, [orderNumber & 0x7F]);
    }

    // SysEx: SET_LOOP_PATTERN (0x45) - Loop specific pattern number
    sendSysExSetLoopPattern(deviceId, patternNumber) {
        this.sendSysEx(deviceId, 0x45, [patternNumber & 0x7F]);
    }

    // SysEx: SET_TEMPO (0x42) - Set playback tempo (BPM as 16-bit value, sent as two 7-bit bytes)
    sendSysExSetTempo(deviceId, bpm) {
        this.sendSysEx(deviceId, 0x42, [bpm & 0x7F, (bpm >> 7) & 0x7F]);
    }

    // SysEx: TRIGGER_PHRASE (0x50) - Trigger phrase by index
    sendSysExTriggerPhrase(deviceId, phraseIndex) {
        this.sendSysEx(deviceId, 0x50, [phraseIndex & 0x7F]);
    }

    // SysEx: TRIGGER_LOOP (0x51) - Trigger saved loop range by index
    sendSysExTriggerLoop(deviceId, loopIndex) {
        this.sendSysEx(deviceId, 0x51, [loopIndex & 0x7F]);
    }

    // SysEx: TRIGGER_PAD (0x52) - Trigger application/song pad by index
    sendSysExTriggerPad(deviceId, padIndex) {
        this.sendSysEx(deviceId, 0x52, [padIndex & 0x7F]);
    }

    // SysEx: FX_EFFECT_SET (0x71) - Set effect parameters
    sendSysExFxEffectSet(deviceId, programId, effectId, enabled, ...params) {
        this.sendSysEx(deviceId, 0x71, [programId & 0x7F, effectId & 0x7F, enabled ? 1 : 0, ...params.map(p => p & 0x7F)]);
    }

    // SysEx: FX_GET_ALL_STATE (0x7E) - Request complete effects state
    sendSysExFxGetAllState(deviceId, programId = 0) {
        this.sendSysEx(deviceId, 0x7E, [programId & 0x7F]);
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

        // console.log(`Updating position bar: position ${this.currentPosition}, beat ${currentBeat}`);

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
            this.config.pollingIntervalMs = this.regrooveState.pollingIntervalMs;

            // Save MIDI output selection
            if (this.midiOutput) {
                this.config.midiOutputId = this.midiOutput.id;
            }

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
                // Note: Grid layout is now managed in the Scenes tab via scene editor
                // Note: MIDI channel and Device ID are now managed in the Devices tab
                // Keep legacy values in config for backward compatibility
                this.midiChannel = this.config.midiChannel || 0;
                this.regrooveDeviceId = this.config.sysexDeviceId || 0;

                // Load clock and SPP settings
                this.clockMaster = this.config.clockMaster || false;
                this.clockBPM = this.config.clockBPM || 120;
                this.receiveSPP = this.config.receiveSPP || false;
                this.useWAAClock = this.config.useWAAClock || false;

                // Load polling interval
                if (this.config.pollingIntervalMs !== undefined) {
                    this.regrooveState.pollingIntervalMs = this.config.pollingIntervalMs;
                }

                document.getElementById('clock-master').checked = this.clockMaster;
                document.getElementById('clock-bpm').value = this.clockBPM;
                document.getElementById('receive-spp').checked = this.receiveSPP;
                document.getElementById('use-waaclock').checked = this.useWAAClock;

                // Update polling interval UI
                const pollingSlider = document.getElementById('polling-interval');
                if (pollingSlider) {
                    pollingSlider.value = this.regrooveState.pollingIntervalMs;
                    document.getElementById('polling-interval-value').textContent = this.regrooveState.pollingIntervalMs + 'ms';
                }

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
                const fullConfig = JSON.parse(e.target.result);

                // Extract main config (everything except devices and customScenes)
                const { devices, customScenes, ...config } = fullConfig;

                // Merge with existing config instead of replacing entirely
                // This preserves any runtime properties
                Object.assign(this.config, config);

                // Restore device manager data
                if (devices && this.deviceManager) {
                    console.log('[Config] Restoring device manager data...');

                    // Clear existing devices
                    this.deviceManager.devices.clear();

                    // Restore devices
                    if (devices.devices && Array.isArray(devices.devices)) {
                        devices.devices.forEach(device => {
                            this.deviceManager.devices.set(device.id, {
                                id: device.id,
                                name: device.name,
                                midiChannel: device.midiChannel,
                                deviceId: device.deviceId,
                                color: device.color || '#cc4444'
                            });
                        });
                    }

                    // Restore default device
                    this.deviceManager.defaultDeviceId = devices.defaultDeviceId || null;

                    // Save to localStorage and refresh UI
                    this.deviceManager.saveDevices();
                    this.deviceManager.refreshDeviceList();

                    console.log(`[Config] Restored ${devices.devices?.length || 0} device(s)`);
                }

                // Restore custom scenes
                if (customScenes && this.sceneEditor) {
                    try {
                        console.log('[Config] Restoring custom scenes...');
                        this.sceneEditor.loadCustomScenes(customScenes);
                    } catch (sceneError) {
                        console.error('[Config] Error restoring custom scenes:', sceneError);
                        alert('Warning: Could not restore custom mixer scenes. Pads and devices were loaded successfully.');
                    }
                }

                // Apply to UI
                // Note: Grid layout is now managed in Scenes tab via scene editor
                // Note: MIDI channel and Device ID are now managed in Devices tab
                if (config.midiChannel !== undefined) {
                    this.midiChannel = config.midiChannel;
                }
                if (config.sysexDeviceId !== undefined) {
                    this.regrooveDeviceId = config.sysexDeviceId;
                }

                this.applyGridLayout();
                this.saveConfig();

                console.log('[Config] Configuration loaded from file');
                alert('Configuration loaded successfully!');
            } catch (err) {
                console.error('Failed to parse config file:', err);
                alert('Error loading configuration file');
            }
        };
        reader.readAsText(file);
    }

    downloadConfig() {
        // Create a complete config bundle with all settings
        const fullConfig = {
            ...this.config,
            // Include device manager data
            devices: this.deviceManager ? {
                devices: Array.from(this.deviceManager.devices.entries()).map(([id, device]) => ({
                    id,
                    ...device
                })),
                defaultDeviceId: this.deviceManager.defaultDeviceId
            } : null,
            // Include custom scenes from scene editor
            customScenes: (this.sceneEditor && typeof this.sceneEditor.getCustomScenes === 'function')
                ? this.sceneEditor.getCustomScenes()
                : null
        };

        const configJson = JSON.stringify(fullConfig, null, 2);
        const blob = new Blob([configJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'meister-config.rcx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Configuration downloaded with devices and scenes');
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

        // Clear all state in regrooveState
        this.regrooveState.clearAllState();

        // Clear all pad colors (reset to default state)
        this.pads.forEach((pad) => {
            pad.removeAttribute('color');
        });

        // Update labels to show default placeholders (will show 0s)
        this.updatePadColors();
    }
}

// Initialize controller when DOM is ready
// Action system integration will be done from index.html module script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.meisterController = new MeisterController();
    });
} else {
    window.meisterController = new MeisterController();
}
