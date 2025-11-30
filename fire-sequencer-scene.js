// Akai Fire-Style Step Sequencer Scene
// Dual mode: Fire Compatible (standalone) or Linked (to internal sequencer)

class FireSequencerScene {
    constructor(sceneManager, sceneId) {
        this.sceneManager = sceneManager;
        this.sceneId = sceneId;
        this.scene = sceneManager.scenes.get(sceneId);

        // State
        this.shiftPressed = false;
        this.altPressed = false;
        this.userMode = false;

        // Grid state (4 tracks × 16 steps)
        this.stepStates = Array(4).fill(null).map(() => Array(16).fill(false));
        this.currentStep = -1;  // Playback position

        // Track state
        this.trackMutes = [false, false, false, false];
        this.trackSolos = [false, false, false, false];

        // Knob values
        this.topKnobs = [64, 64, 64, 64, 64];  // Volume, Pan, Filter, Resonance, Select
        this.trackKnobs = [64, 64, 64, 64];
    }

    /**
     * Check if scene is in linked mode (bound to sequencer) or compatible mode
     */
    isLinkedMode() {
        return this.scene.linkedSequencer !== null && this.scene.linkedSequencer !== undefined;
    }

    /**
     * Get the linked sequencer scene if in linked mode
     */
    getLinkedSequencer() {
        if (!this.isLinkedMode()) return null;
        return this.sceneManager.scenes.get(this.scene.linkedSequencer);
    }

    /**
     * Render the Fire Sequencer scene
     */
    render() {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Clear container
        container.removeAttribute('style');
        container.style.display = 'grid';
        // Simple 1-column grid, each section manages its own layout
        container.style.gridTemplateColumns = '1fr';
        container.style.gridTemplateRows = 'auto auto 1fr auto'; // top, track rows, bottom
        container.style.gap = '8px';
        container.style.padding = '12px';
        container.style.height = 'calc(100vh - 60px)';
        container.innerHTML = '';

        // Build layout
        this.renderTopSection(container);
        this.renderTrackRows(container);
        this.renderBottomSection(container);

        // Set up MIDI listeners if in compatible mode
        if (!this.isLinkedMode()) {
            this.setupCompatibleModeMIDI();
        } else {
            this.setupLinkedMode();
        }

        console.log(`[FireSequencer] Rendered in ${this.isLinkedMode() ? 'Linked' : 'Compatible'} mode`);
    }

    /**
     * Render top section: 5 knobs + 4 nav buttons + LCD display
     */
    renderTopSection(container) {
        const topSection = document.createElement('div');
        topSection.style.cssText = `
            display: grid;
            grid-template-columns: repeat(4, 80px) 1fr 80px 60px repeat(4, 60px);
            grid-template-rows: 1fr;
            gap: 12px;
            padding: 16px;
            background: #1a1a1a;
            border-radius: 4px;
            align-items: center;
        `;

        const knobLabels = this.userMode
            ? ['VOL', 'PAN', 'LOW', 'HIGH']
            : ['VOL', 'PAN', 'FILT', 'RES'];

        // First 4 knobs (VOL, PAN, FILT, RES or VOL, PAN, LOW, HIGH)
        for (let i = 0; i < 4; i++) {
            const knobCell = this.createKnob(knobLabels[i], this.topKnobs[i], (value) => {
                this.topKnobs[i] = value;
                this.handleTopKnobChange(i, value);
            });
            topSection.appendChild(knobCell);
        }

        // LCD Display area (128x64 pixels, or 256x128 at 2x)
        const lcdDisplay = document.createElement('div');
        lcdDisplay.id = 'fire-lcd-display';
        lcdDisplay.style.cssText = `
            background: #0a0a0a;
            border: 2px solid #333;
            border-radius: 4px;
            width: 256px;
            height: 64px;
            font-family: 'Courier New', monospace;
            font-size: 0.65em;
            color: #4a9eff;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            margin: 0 auto;
            padding: 4px;
        `;
        lcdDisplay.textContent = this.isLinkedMode()
            ? `FIRE → LINKED SEQUENCER`
            : `FIRE CONTROLLER`;
        topSection.appendChild(lcdDisplay);

        // 5th knob (SELECT) - rotary encoder
        const selectKnob = this.createKnob('SEL', this.topKnobs[4], (value) => {
            this.topKnobs[4] = value;
            this.handleTopKnobChange(4, value);
        });
        topSection.appendChild(selectKnob);

        // ENTER button (SELECT knob press equivalent - Note 0x19)
        const enterContainer = document.createElement('div');
        enterContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 2px;
        `;

        const enterLabel = document.createElement('div');
        enterLabel.textContent = 'ENTER';
        enterLabel.style.cssText = `
            text-align: center;
            font-size: 0.7em;
            color: #888;
            font-weight: bold;
        `;

        const enterBtn = this.createButton('↵', '#4a9eff', () => {
            // Toggle USER mode (same as MODE button behavior)
            this.userMode = !this.userMode;
            console.log(`[FireSequencer] ENTER (USER mode): ${this.userMode}`);
            this.render();
        }, 0x19, false);  // Note 0x19 - ENCODER_PRESS
        enterBtn.style.height = '40px';

        enterContainer.appendChild(enterLabel);
        enterContainer.appendChild(enterBtn);
        topSection.appendChild(enterContainer);

        // Navigation buttons with labels (4 buttons on the right: L, R, U, D)
        const navButtons = [
            { label: '◀', text: 'L', note: 0x22 },  // Grid Left
            { label: '▶', text: 'R', note: 0x23 },  // Grid Right
            { label: '▲', text: 'U', note: 0x1F },  // Pattern Up
            { label: '▼', text: 'D', note: 0x20 }   // Pattern Down
        ];

        navButtons.forEach(btn => {
            const navContainer = document.createElement('div');
            navContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 2px;
            `;

            const labelDiv = document.createElement('div');
            labelDiv.textContent = btn.text;
            labelDiv.style.cssText = `
                text-align: center;
                font-size: 0.7em;
                color: #888;
                font-weight: bold;
            `;

            const navBtn = this.createButton(btn.label, '#4a9eff', () => {
                this.handleNavButton(btn.label);
            }, btn.note, false);
            navBtn.style.height = '40px';

            navContainer.appendChild(labelDiv);
            navContainer.appendChild(navBtn);
            topSection.appendChild(navContainer);
        });

        container.appendChild(topSection);
    }

    /**
     * Render 4 track rows (each with knob, stacked solo/mute, and 16 steps grouped in 4s)
     * New layout: Knob | SOLO/MUTE stack | Step groups: 1-4 | 5-8 | 9-12 | 13-16
     */
    renderTrackRows(container) {
        const tracksSection = document.createElement('div');
        tracksSection.style.cssText = `
            display: grid;
            grid-template-columns: 80px 60px 12px repeat(4, 1fr) 12px repeat(4, 1fr) 12px repeat(4, 1fr) 12px repeat(4, 1fr);
            grid-template-rows: repeat(4, 1fr);
            gap: 4px;
            row-gap: 12px;
            padding: 8px;
            background: #1a1a1a;
            border-radius: 4px;
            flex: 1;
        `;

        for (let track = 0; track < 4; track++) {
            const row = track + 1;

            // Track knob
            const trackKnob = this.createKnob(`T${track + 1}`, this.trackKnobs[track], (value) => {
                this.trackKnobs[track] = value;
                this.handleTrackKnobChange(track, value);
            });
            trackKnob.style.gridRow = `${row}`;
            trackKnob.style.gridColumn = '1';
            tracksSection.appendChild(trackKnob);

            // SOLO/MUTE stacked container
            const controlStack = document.createElement('div');
            controlStack.style.cssText = `
                display: grid;
                grid-template-rows: 1fr 1fr;
                gap: 4px;
                height: 100%;
            `;
            controlStack.style.gridRow = `${row}`;
            controlStack.style.gridColumn = '2';

            // SOLO button (top)
            const soloBtn = this.createButton('S', '#ffaa00', () => {
                this.trackSolos[track] = !this.trackSolos[track];
                this.updateMuteButtonVisual(track);
                console.log(`[FireSequencer] Track ${track} solo: ${this.trackSolos[track]}`);
            }, 0x24 + track);
            soloBtn.classList.add(`track-${track}-solo`);
            controlStack.appendChild(soloBtn);

            // MUTE button (bottom)
            const muteBtn = this.createButton('M', '#CF1A37', () => {
                this.handleMuteButton(track);
            }, 0x24 + track);
            muteBtn.classList.add(`track-${track}-mute`);
            controlStack.appendChild(muteBtn);

            tracksSection.appendChild(controlStack);

            // Gap column (column 3)
            // Auto-handled by grid

            // 16 step buttons in groups of 4
            // Columns: 4-7 (gap at 8), 9-12 (gap at 13), 14-17 (gap at 18), 19-22
            const columnMap = [
                4, 5, 6, 7,      // Steps 1-4
                9, 10, 11, 12,   // Steps 5-8
                14, 15, 16, 17,  // Steps 9-12
                19, 20, 21, 22   // Steps 13-16
            ];

            for (let step = 0; step < 16; step++) {
                const stepBtn = this.createStepButton(track, step);
                stepBtn.style.gridRow = `${row}`;
                stepBtn.style.gridColumn = `${columnMap[step]}`;
                tracksSection.appendChild(stepBtn);
            }
        }

        container.appendChild(tracksSection);
    }

    /**
     * Render bottom section: transport and mode buttons (smaller height)
     */
    renderBottomSection(container) {
        const bottomSection = document.createElement('div');
        bottomSection.style.cssText = `
            display: grid;
            grid-template-columns: repeat(6, 80px) 1fr repeat(6, 80px);
            grid-template-rows: 1fr;
            gap: 12px;
            padding: 16px;
            background: #1a1a1a;
            border-radius: 4px;
            align-items: center;
        `;

        const leftButtons = [
            { label: 'STEP', note: 0x2C },
            { label: 'NOTE', note: 0x2D },
            { label: 'DRUM', note: 0x2E },
            { label: 'PERF', note: 0x2F },
            { label: 'SHIFT', note: 0x30, isModifier: true },
            { label: 'ALT', note: 0x31, isModifier: true }
        ];

        const rightButtons = [
            { label: 'MODE', note: 0x1A },  // KNOB_MODE - cycles CHANNEL/MIXER/USER1/USER2
            { label: 'BRWSR', note: 0x21 },
            { label: 'PTRN', note: 0x32 },
            { label: 'PLAY', note: 0x33, color: '#4aff9a' },
            { label: 'STOP', note: 0x34, color: '#CF1A37' },
            { label: 'REC', note: 0x35, color: '#CF1A37' }
        ];

        // Add left buttons with labels
        leftButtons.forEach(btn => {
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 2px;
            `;

            const labelDiv = document.createElement('div');
            labelDiv.innerHTML = `${btn.label}<br><span style="font-size: 0.65em; color: #555;">0x${btn.note.toString(16).toUpperCase()}</span>`;
            labelDiv.style.cssText = `
                text-align: center;
                font-size: 0.7em;
                color: #888;
                font-weight: bold;
            `;

            const button = this.createButton(
                '',
                btn.color || '#888',
                () => this.handleBottomButton(btn),
                btn.note,
                false
            );
            button.style.height = '50px';
            if (btn.isModifier) button.classList.add('modifier-btn');

            btnContainer.appendChild(labelDiv);
            btnContainer.appendChild(button);
            bottomSection.appendChild(btnContainer);
        });

        // Add spacer
        const spacer = document.createElement('div');
        bottomSection.appendChild(spacer);

        // Add right buttons with labels
        rightButtons.forEach(btn => {
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 2px;
            `;

            const labelDiv = document.createElement('div');
            labelDiv.innerHTML = `${btn.label}<br><span style="font-size: 0.65em; color: #555;">0x${btn.note.toString(16).toUpperCase()}</span>`;
            labelDiv.style.cssText = `
                text-align: center;
                font-size: 0.7em;
                color: #888;
                font-weight: bold;
            `;

            const button = this.createButton(
                '',
                btn.color || '#888',
                () => this.handleBottomButton(btn),
                btn.note,
                false
            );
            button.style.height = '50px';
            if (btn.isModifier) button.classList.add('modifier-btn');

            btnContainer.appendChild(labelDiv);
            btnContainer.appendChild(button);
            bottomSection.appendChild(btnContainer);
        });

        container.appendChild(bottomSection);
    }

    /**
     * Create a knob control
     */
    createKnob(label, value, onChange) {
        const cell = document.createElement('div');
        cell.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center;';

        const knob = document.createElement('pad-knob');
        knob.setAttribute('label', label);
        knob.setAttribute('value', value);
        knob.setAttribute('min', '0');
        knob.setAttribute('max', '127');
        knob.style.cssText = 'width: 100%; height: 100%;';

        knob.addEventListener('knob-change', (e) => {
            onChange(e.detail.value);
        });

        cell.appendChild(knob);
        return cell;
    }

    /**
     * Create a button
     */
    createButton(label, color, onClick, midiNote = null, showMidiNote = false) {
        const btn = document.createElement('regroove-pad');

        // Add MIDI note to label if requested (for debugging/clarity)
        const displayLabel = showMidiNote && midiNote !== null
            ? `${label}\n0x${midiNote.toString(16).toUpperCase()}`
            : label;

        btn.setAttribute('label', displayLabel);
        btn.setAttribute('color', color);
        if (midiNote !== null) {
            btn.dataset.midiNote = midiNote;
        }

        btn.addEventListener('pad-press', () => {
            onClick();
        });

        return btn;
    }

    /**
     * Create a step button
     * Pad grid: Notes 0x36-0x75 (54-117), 4 rows × 16 columns
     */
    createStepButton(track, step) {
        const stepNote = 0x36 + (track * 16) + step;  // Starts at note 54
        const isActive = this.stepStates[track][step];

        const btn = document.createElement('regroove-pad');
        btn.setAttribute('label', '');
        btn.setAttribute('color', isActive ? '#4a9eff' : '#2a2a2a');
        btn.dataset.track = track;
        btn.dataset.step = step;
        btn.dataset.midiNote = stepNote;
        btn.classList.add(`step-${track}-${step}`);

        btn.addEventListener('pad-press', () => {
            this.handleStepButton(track, step);
        });

        return btn;
    }

    /**
     * Handle top knob changes
     * CC: Volume=0x10, Pan=0x11, Filter=0x12, Resonance=0x13, Select=0x76
     */
    handleTopKnobChange(knobIndex, value) {
        if (this.isLinkedMode()) {
            // Linked mode: control sequencer parameters
            const sequencer = this.getLinkedSequencer();
            if (sequencer) {
                // TODO: Map to sequencer parameters
                console.log(`[FireSequencer] Top knob ${knobIndex} = ${value} (linked mode)`);
            }
        } else {
            // Compatible mode: send MIDI CC per Akai Fire spec
            const ccMap = [0x10, 0x11, 0x12, 0x13, 0x76];  // Volume, Pan, Filter, Resonance, Select
            const cc = ccMap[knobIndex];
            this.sendMIDICC(cc, value);
        }
    }

    /**
     * Handle track knob changes
     */
    handleTrackKnobChange(track, value) {
        if (this.isLinkedMode()) {
            // Linked mode: control track parameter
            console.log(`[FireSequencer] Track ${track} knob = ${value} (linked mode)`);
        } else {
            // Compatible mode: send MIDI CC
            const cc = 21 + track;
            this.sendMIDICC(cc, value);
        }
    }

    /**
     * Handle mute button
     */
    handleMuteButton(track) {
        if (this.shiftPressed) {
            // SHIFT + MUTE = SOLO
            this.trackSolos[track] = !this.trackSolos[track];
            console.log(`[FireSequencer] Track ${track} solo: ${this.trackSolos[track]}`);
        } else {
            // Normal MUTE
            this.trackMutes[track] = !this.trackMutes[track];

            if (this.isLinkedMode()) {
                // Update linked sequencer
                const sequencer = this.getLinkedSequencer();
                if (sequencer && sequencer.engine) {
                    sequencer.engine.trackMutes[track] = this.trackMutes[track];
                }
            }

            console.log(`[FireSequencer] Track ${track} mute: ${this.trackMutes[track]}`);
        }

        // Update button visual
        this.updateMuteButtonVisual(track);

        // Send MIDI in compatible mode (Solo buttons: 0x24-0x27)
        if (!this.isLinkedMode()) {
            this.sendMIDINote(0x24 + track, this.trackMutes[track] ? 127 : 0);
        }
    }

    /**
     * Handle step button
     */
    handleStepButton(track, step) {
        this.stepStates[track][step] = !this.stepStates[track][step];

        if (this.isLinkedMode()) {
            // Update linked sequencer pattern
            const sequencer = this.getLinkedSequencer();
            if (sequencer && sequencer.engine) {
                // TODO: Update sequencer pattern
                console.log(`[FireSequencer] Step ${track},${step} = ${this.stepStates[track][step]} (linked mode)`);
            }
        } else {
            // Compatible mode: send MIDI note (pad grid: 0x36-0x75)
            const note = 0x36 + (track * 16) + step;
            this.sendMIDINote(note, this.stepStates[track][step] ? 127 : 0);
        }

        // Update visual
        this.updateStepButtonVisual(track, step);
    }

    /**
     * Handle navigation buttons
     * Grid Left=0x22, Grid Right=0x23, Pattern Up=0x1F, Pattern Down=0x20
     */
    handleNavButton(direction) {
        console.log(`[FireSequencer] Nav: ${direction}`);

        if (!this.isLinkedMode()) {
            const noteMap = { '◀': 0x22, '▶': 0x23, '▲': 0x1F, '▼': 0x20 };
            this.sendMIDINote(noteMap[direction], 127);
            setTimeout(() => this.sendMIDINote(noteMap[direction], 0), 100);
        }
    }

    /**
     * Handle bottom section buttons
     */
    handleBottomButton(btn) {
        // Handle modifiers
        if (btn.label === 'SHIFT') {
            this.shiftPressed = !this.shiftPressed;
            console.log(`[FireSequencer] SHIFT: ${this.shiftPressed}`);
            return;
        }

        if (btn.label === 'ALT') {
            this.altPressed = !this.altPressed;
            console.log(`[FireSequencer] ALT: ${this.altPressed}`);
            return;
        }

        if (btn.label === 'MODE') {
            // KNOB_MODE button - cycles through CHANNEL/MIXER/USER1/USER2 modes
            // For now, just toggle userMode (can expand to 4 modes later)
            this.userMode = !this.userMode;
            console.log(`[FireSequencer] MODE (USER mode): ${this.userMode}`);
            this.render();  // Re-render to update knob labels
            return;
        }

        // Transport controls (PLAY=0x33, STOP=0x34, RECORD=0x35)
        if (btn.label === 'PLAY') {
            // PLAY
            if (this.isLinkedMode()) {
                const sequencer = this.getLinkedSequencer();
                if (sequencer && sequencer.start) {
                    sequencer.start();
                }
            } else {
                this.sendMIDINote(0x33, 127);
                setTimeout(() => this.sendMIDINote(0x33, 0), 100);
            }
        } else if (btn.label === 'STOP') {
            // STOP
            if (this.isLinkedMode()) {
                const sequencer = this.getLinkedSequencer();
                if (sequencer && sequencer.stop) {
                    sequencer.stop();
                }
            } else {
                this.sendMIDINote(0x34, 127);
                setTimeout(() => this.sendMIDINote(0x34, 0), 100);
            }
        } else if (btn.label === 'REC') {
            // RECORD
            console.log(`[FireSequencer] Record`);
            if (!this.isLinkedMode()) {
                this.sendMIDINote(0x35, 127);
                setTimeout(() => this.sendMIDINote(0x35, 0), 100);
            }
        } else {
            // Other buttons
            console.log(`[FireSequencer] Button: ${btn.label}`);
            if (!this.isLinkedMode() && btn.note) {
                this.sendMIDINote(btn.note, 127);
                setTimeout(() => this.sendMIDINote(btn.note, 0), 100);
            }
        }
    }

    /**
     * Update mute and solo button visuals
     */
    updateMuteButtonVisual(track) {
        const muteBtn = document.querySelector(`.track-${track}-mute`);
        const soloBtn = document.querySelector(`.track-${track}-solo`);

        const isMuted = this.trackMutes[track];
        const isSoloed = this.trackSolos[track];

        // Update mute button
        if (muteBtn) {
            if (isMuted) {
                muteBtn.setAttribute('color', '#CF1A37');  // Red when muted
            } else {
                muteBtn.setAttribute('color', '#888');  // Gray when not muted
            }
        }

        // Update solo button
        if (soloBtn) {
            if (isSoloed) {
                soloBtn.setAttribute('color', '#ffaa00');  // Yellow when soloed
            } else {
                soloBtn.setAttribute('color', '#888');  // Gray when not soloed
            }
        }
    }

    /**
     * Update step button visual
     */
    updateStepButtonVisual(track, step) {
        const btn = document.querySelector(`.step-${track}-${step}`);
        if (btn) {
            const isActive = this.stepStates[track][step];
            btn.setAttribute('color', isActive ? '#4a9eff' : '#2a2a2a');
        }
    }

    /**
     * Setup linked mode - connect to sequencer
     */
    setupLinkedMode() {
        const sequencer = this.getLinkedSequencer();
        if (!sequencer) {
            console.warn('[FireSequencer] Linked sequencer not found');
            return;
        }

        console.log(`[FireSequencer] Linked to sequencer: ${this.scene.linkedSequencer}`);

        // Subscribe to sequencer events
        // - Pattern changes
        // - Playback position
        // - Track mute/solo changes

        // If a MIDI input device is specified, listen to it
        if (this.scene.midiInputDevice) {
            this.setupMIDIInputListener();
        }
    }

    /**
     * Setup compatible mode MIDI listeners
     */
    setupCompatibleModeMIDI() {
        console.log('[FireSequencer] Compatible mode - listening for MIDI input');

        // Listen for incoming MIDI notes to update step grid
        // This would connect to the MIDI input system
    }

    /**
     * Setup MIDI input listener for physical Fire controller
     */
    setupMIDIInputListener() {
        if (!this.sceneManager.controller.midiAccess) {
            console.warn('[FireSequencer] No MIDI access available');
            return;
        }

        // Find the input device
        const midiInputDevice = this.scene.midiInputDevice;
        let foundInput = null;

        for (let input of this.sceneManager.controller.midiAccess.inputs.values()) {
            if (input.name === midiInputDevice) {
                foundInput = input;
                break;
            }
        }

        if (!foundInput) {
            console.warn(`[FireSequencer] MIDI input device "${midiInputDevice}" not found`);
            return;
        }

        // Create bound listener
        this.midiInputListener = (event) => this.handleFireMIDIInput(event);

        // Attach listener
        foundInput.addEventListener('midimessage', this.midiInputListener);
        console.log(`[FireSequencer] ✓ Listening to MIDI input: ${midiInputDevice}`);
    }

    /**
     * Handle MIDI input from physical Fire controller
     */
    handleFireMIDIInput(event) {
        const data = event.data;
        const status = data[0];
        const messageType = status & 0xF0;
        const channel = status & 0x0F;

        // Note On/Off
        if (messageType === 0x90 || messageType === 0x80) {
            const note = data[1];
            const velocity = data[2];
            const isNoteOn = messageType === 0x90 && velocity > 0;

            // Pad grid: 0x36-0x75
            if (note >= 0x36 && note <= 0x75) {
                const padIndex = note - 0x36;
                const track = Math.floor(padIndex / 16);
                const step = padIndex % 16;

                if (isNoteOn) {
                    this.handleStepButton(track, step);
                }
                return;
            }

            // Solo/Mute buttons: 0x24-0x27
            if (note >= 0x24 && note <= 0x27 && isNoteOn) {
                const track = note - 0x24;
                this.handleMuteButton(track);
                return;
            }

            // Navigation buttons
            if (isNoteOn) {
                if (note === 0x22) this.handleNavButton('◀');
                else if (note === 0x23) this.handleNavButton('▶');
                else if (note === 0x1F) this.handleNavButton('▲');
                else if (note === 0x20) this.handleNavButton('▼');
            }

            // Bottom buttons
            if (isNoteOn) {
                if (note === 0x30) this.shiftPressed = !this.shiftPressed;
                else if (note === 0x31) this.altPressed = !this.altPressed;
                else if (note === 0x1A) this.handleBottomButton({ label: 'MODE' });  // KNOB_MODE
                else if (note === 0x19) {  // ENCODER_PRESS (ENTER)
                    this.userMode = !this.userMode;
                    console.log(`[FireSequencer] ENTER pressed (USER mode): ${this.userMode}`);
                    this.render();
                }
                else if (note === 0x33) this.handleBottomButton({ label: 'PLAY' });
                else if (note === 0x34) this.handleBottomButton({ label: 'STOP' });
                else if (note === 0x35) this.handleBottomButton({ label: 'REC' });
            }
        }

        // CC messages (knobs)
        else if (messageType === 0xB0) {
            const cc = data[1];
            const value = data[2];

            // Top knobs: 0x10-0x13, 0x76
            const topKnobMap = [0x10, 0x11, 0x12, 0x13, 0x76];
            const knobIndex = topKnobMap.indexOf(cc);
            if (knobIndex !== -1) {
                this.topKnobs[knobIndex] = value;
                this.handleTopKnobChange(knobIndex, value);
                return;
            }

            // Track knobs: assuming CC 21-24
            if (cc >= 21 && cc <= 24) {
                const track = cc - 21;
                this.trackKnobs[track] = value;
                this.handleTrackKnobChange(track, value);
            }
        }
    }

    /**
     * Get MIDI output for this scene
     * In compatible mode, uses deviceBinding or global output
     * In linked mode, MIDI is handled by the linked sequencer
     */
    getMIDIOutput() {
        // Linked mode doesn't send MIDI directly
        if (this.isLinkedMode()) {
            return null;
        }

        // Compatible mode: use specific output or global
        const controller = this.sceneManager.controller;

        // If deviceBinding is specified, find that specific output
        if (this.scene.deviceBinding && controller.midiAccess) {
            for (let output of controller.midiAccess.outputs.values()) {
                if (output.name === this.scene.deviceBinding) {
                    return output;
                }
            }
        }

        // Fall back to global output
        return controller.midiOutput;
    }

    /**
     * Send MIDI note
     */
    sendMIDINote(note, velocity) {
        const midiOutput = this.getMIDIOutput();
        if (midiOutput) {
            const channel = this.scene.midiChannel || 0;
            const statusByte = velocity > 0 ? (0x90 + channel) : (0x80 + channel);
            midiOutput.send([statusByte, note, velocity]);
            console.log(`[FireSequencer] MIDI Note: ${note}, vel: ${velocity}`);
        } else {
            console.warn('[FireSequencer] No MIDI output available');
        }
    }

    /**
     * Send MIDI CC
     */
    sendMIDICC(cc, value) {
        const midiOutput = this.getMIDIOutput();
        if (midiOutput) {
            const channel = this.scene.midiChannel || 0;
            const statusByte = 0xB0 + channel;
            midiOutput.send([statusByte, cc, value]);
            console.log(`[FireSequencer] MIDI CC: ${cc}, value: ${value}`);
        } else {
            console.warn('[FireSequencer] No MIDI output available');
        }
    }

    /**
     * Clean up
     */
    cleanup() {
        console.log('[FireSequencer] Cleanup');

        // Remove MIDI input listener if attached
        if (this.midiInputListener && this.scene.midiInputDevice) {
            const midiAccess = this.sceneManager.controller.midiAccess;
            if (midiAccess) {
                for (let input of midiAccess.inputs.values()) {
                    if (input.name === this.scene.midiInputDevice) {
                        input.removeEventListener('midimessage', this.midiInputListener);
                        console.log(`[FireSequencer] ✓ Removed MIDI listener from: ${this.scene.midiInputDevice}`);
                        break;
                    }
                }
            }
            this.midiInputListener = null;
        }

        // Unsubscribe from sequencer events
        // TODO: Add sequencer event unsubscribe logic
    }
}

// Export for ES6 module
export { FireSequencerScene };
