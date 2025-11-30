// Akai Fire-Style Step Sequencer Scene
// Dual mode: Fire Compatible (standalone) or Linked (to internal sequencer)

class FireSequencerScene {
    constructor(sceneManager, sceneId) {
        this.sceneManager = sceneManager;
        this.sceneId = sceneId;
        // Don't cache scene - always get fresh from Map to pick up config changes

        // State
        this.shiftPressed = false;
        this.altPressed = false;
        this.userMode = false;

        // Grid view offset (which bank of 16 steps we're viewing: 0, 16, 32, or 48)
        this.gridOffset = 0;  // 0-15, 16-31, 32-47, 48-63

        // Grid state (4 tracks × 16 steps visible at a time)
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
     * Get current scene config (always fresh from Map to pick up changes)
     */
    get scene() {
        return this.sceneManager.scenes.get(this.sceneId);
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
        const scene = this.sceneManager.scenes.get(this.scene.linkedSequencer);
        if (!scene) {
            console.error(`[FireSequencer] Linked sequencer scene not found: ${this.scene.linkedSequencer}`);
            return null;
        }

        // If sequencer instance doesn't exist yet, create it in background
        if (!scene.sequencerInstance) {
            console.log(`[FireSequencer] Creating sequencer instance in background for: ${scene.name}`);
            if (window.SequencerScene) {
                scene.sequencerInstance = new window.SequencerScene(
                    this.sceneManager.controller,
                    this.scene.linkedSequencer,
                    scene,
                    true  // skipRender = true (create in background)
                );
            } else {
                console.error('[FireSequencer] SequencerScene class not available');
                return null;
            }
        }

        return scene.sequencerInstance;
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
        enterLabel.innerHTML = `<span style="font-size: 1.2em;">↵</span><br><span style="font-size: 0.65em; color: #555;">0x19</span>`;
        enterLabel.style.cssText = `
            text-align: center;
            font-size: 0.7em;
            color: #888;
            font-weight: bold;
        `;

        const enterBtn = this.createButton('', '#4a9eff', () => {
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
            { symbol: '◀', note: 0x22 },  // Grid Left
            { symbol: '▶', note: 0x23 },  // Grid Right
            { symbol: '▲', note: 0x1F },  // Pattern Up
            { symbol: '▼', note: 0x20 }   // Pattern Down
        ];

        navButtons.forEach(btn => {
            const navContainer = document.createElement('div');
            navContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 2px;
            `;

            const labelDiv = document.createElement('div');
            labelDiv.innerHTML = `<span style="font-size: 1.2em;">${btn.symbol}</span><br><span style="font-size: 0.65em; color: #555;">0x${btn.note.toString(16).toUpperCase()}</span>`;
            labelDiv.style.cssText = `
                text-align: center;
                font-size: 0.7em;
                color: #888;
                font-weight: bold;
            `;

            const navBtn = this.createButton('', '#4a9eff', () => {
                this.handleNavButton(btn.symbol);
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
            const soloBtn = this.createButton('S', '#CF1A37', () => {
                if (this.isLinkedMode()) {
                    // Use sequencer's toggleSolo - it handles all the mute logic
                    const sequencer = this.getLinkedSequencer();
                    if (sequencer) {
                        sequencer.engine.toggleSolo(track);

                        // Read back mute states from sequencer
                        for (let t = 0; t < 4; t++) {
                            this.trackMutes[t] = sequencer.engine.trackMutes[t];
                        }

                        // Infer solo state: only one track unmuted = that track is soloed
                        const unmutedTracks = this.trackMutes.map((muted, idx) => !muted ? idx : -1).filter(idx => idx !== -1);
                        this.trackSolos = [false, false, false, false];
                        if (unmutedTracks.length === 1) {
                            this.trackSolos[unmutedTracks[0]] = true;
                        }

                        console.log(`[FireSequencer] After toggleSolo(${track}), mutes:`, this.trackMutes, 'solos:', this.trackSolos);
                    }
                } else {
                    // Compatible mode: manual toggle
                    this.trackSolos[track] = !this.trackSolos[track];
                    if (this.trackSolos[track]) {
                        this.trackMutes[track] = false;
                    }
                }

                // Update all button visuals (all tracks affected by solo)
                for (let t = 0; t < 4; t++) {
                    this.updateMuteButtonVisual(t);
                }
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

        // Get transport state colors
        const isPlaying = this.isLinkedMode() && this.getLinkedSequencer()?.engine.isPlaying;

        const rightButtons = [
            { label: 'MODE', note: 0x1A },  // KNOB_MODE - cycles CHANNEL/MIXER/USER1/USER2
            { label: 'BRWSR', note: 0x21 },
            { label: 'PTRN', note: 0x32 },
            { label: 'PLAY', note: 0x33, color: isPlaying ? '#26A626' : '#888' },
            { label: 'STOP', note: 0x34, color: !isPlaying ? '#CF1A37' : '#888' },
            { label: 'REC', note: 0x35, color: '#888' }
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

            // Add transport button classes for dynamic updates
            if (btn.label === 'PLAY') button.classList.add('transport-play');
            if (btn.label === 'STOP') button.classList.add('transport-stop');
            if (btn.label === 'REC') button.classList.add('transport-rec');

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

        // IMPORTANT: Set note attribute so regroove-pad recognizes this as a valid pad
        if (midiNote !== null) {
            btn.setAttribute('note', midiNote.toString());
            btn.dataset.midiNote = midiNote;
        }

        // Listen for pad-press event
        btn.addEventListener('pad-press', (e) => {
            console.log(`[FireSequencer] pad-press event: ${label}, note: ${midiNote}`);
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
        btn.setAttribute('note', stepNote.toString());  // IMPORTANT: Set note attribute so regroove-pad recognizes this
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
            if (this.isLinkedMode()) {
                // Use sequencer's toggleSolo - it handles all the mute logic
                const sequencer = this.getLinkedSequencer();
                if (sequencer) {
                    sequencer.engine.toggleSolo(track);

                    // Read back mute states from sequencer
                    for (let t = 0; t < 4; t++) {
                        this.trackMutes[t] = sequencer.engine.trackMutes[t];
                    }

                    // Infer solo state: only one track unmuted = that track is soloed
                    const unmutedTracks = this.trackMutes.map((muted, idx) => !muted ? idx : -1).filter(idx => idx !== -1);
                    this.trackSolos = [false, false, false, false];
                    if (unmutedTracks.length === 1) {
                        this.trackSolos[unmutedTracks[0]] = true;
                    }

                    console.log(`[FireSequencer] After toggleSolo(${track}), mutes:`, this.trackMutes, 'solos:', this.trackSolos);
                }
            } else {
                // Compatible mode: manual toggle
                this.trackSolos[track] = !this.trackSolos[track];
                if (this.trackSolos[track]) {
                    this.trackMutes[track] = false;
                }
            }
        } else {
            // Normal MUTE
            this.trackMutes[track] = !this.trackMutes[track];

            if (this.isLinkedMode()) {
                // Update linked sequencer
                const sequencer = this.getLinkedSequencer();
                if (sequencer) {
                    sequencer.engine.trackMutes[track] = this.trackMutes[track];
                }
            }

            console.log(`[FireSequencer] Track ${track} mute: ${this.trackMutes[track]}`);

            // Check if all tracks are now muted - if so, clear all solo states
            const allMuted = this.trackMutes.every(muted => muted);
            if (allMuted) {
                console.log('[FireSequencer] All tracks muted - clearing solo states');
                this.trackSolos = [false, false, false, false];
            }

            // Check if only one track is unmuted - if so, mark it as soloed
            const unmutedTracks = this.trackMutes.map((muted, idx) => !muted ? idx : -1).filter(idx => idx !== -1);
            if (unmutedTracks.length === 1) {
                const soloTrack = unmutedTracks[0];
                console.log(`[FireSequencer] Only track ${soloTrack} is unmuted - marking as soloed`);
                this.trackSolos = [false, false, false, false];
                this.trackSolos[soloTrack] = true;
            } else if (unmutedTracks.length > 1) {
                // Multiple tracks unmuted - clear solo states
                this.trackSolos = [false, false, false, false];
            }
        }

        // Update ALL button visuals (mute states affect solo display)
        for (let t = 0; t < 4; t++) {
            this.updateMuteButtonVisual(t);
        }

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
                this.writeStepToSequencer(track, step, this.stepStates[track][step]);
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

        if (this.isLinkedMode()) {
            // In linked mode, L/R navigate through 64-row pattern in banks of 16
            if (direction === '◀') {
                // Left - previous bank of 16 steps
                if (this.gridOffset > 0) {
                    this.gridOffset -= 16;
                    this.loadPatternFromSequencer();
                    console.log(`[FireSequencer] Grid offset: ${this.gridOffset}-${this.gridOffset + 15}`);
                }
            } else if (direction === '▶') {
                // Right - next bank of 16 steps
                if (this.gridOffset < 48) {
                    this.gridOffset += 16;
                    this.loadPatternFromSequencer();
                    console.log(`[FireSequencer] Grid offset: ${this.gridOffset}-${this.gridOffset + 15}`);
                }
            }
            // U/D could be used for other functions (bank selection, pattern selection, etc.)
        } else {
            // Compatible mode: send MIDI
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
            console.log('[FireSequencer] PLAY button pressed');
            if (this.isLinkedMode()) {
                const sequencer = this.getLinkedSequencer();
                console.log('[FireSequencer] Got sequencer:', !!sequencer);
                if (sequencer) {
                    console.log('[FireSequencer] Calling sequencer.engine.startPlayback()');
                    sequencer.engine.startPlayback();
                    console.log('[FireSequencer] Started linked sequencer playback');
                    this.updateTransportButtons();
                } else {
                    console.error('[FireSequencer] PLAY: No sequencer found!');
                }
            } else {
                this.sendMIDINote(0x33, 127);
                setTimeout(() => this.sendMIDINote(0x33, 0), 100);
            }
        } else if (btn.label === 'STOP') {
            // STOP
            console.log('[FireSequencer] STOP button pressed');
            if (this.isLinkedMode()) {
                const sequencer = this.getLinkedSequencer();
                if (sequencer) {
                    console.log('[FireSequencer] Calling sequencer.engine.stopPlayback()');
                    sequencer.engine.stopPlayback();
                    console.log('[FireSequencer] Stopped linked sequencer playback');
                    this.updateTransportButtons();
                } else {
                    console.error('[FireSequencer] STOP: No sequencer found!');
                }
            } else {
                this.sendMIDINote(0x34, 127);
                setTimeout(() => this.sendMIDINote(0x34, 0), 100);
            }
        } else if (btn.label === 'REC') {
            // RECORD
            if (this.isLinkedMode()) {
                const sequencer = this.getLinkedSequencer();
                if (sequencer) {
                    // Toggle record mode on sequencer
                    sequencer.recordMode = !sequencer.recordMode;
                    console.log(`[FireSequencer] Sequencer record mode: ${sequencer.recordMode}`);
                }
            } else {
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

        // Update UI buttons
        if (muteBtn) {
            if (isMuted) {
                muteBtn.setAttribute('color', '#CF1A37');  // Red when muted
            } else {
                muteBtn.setAttribute('color', '#888');  // Gray when not muted
            }
        }

        if (soloBtn) {
            if (isSoloed) {
                soloBtn.setAttribute('color', '#CF1A37');  // Red when soloed
            } else {
                soloBtn.setAttribute('color', '#888');  // Gray when not soloed
            }
        }

        // Send MIDI to physical Fire controller LEDs (if available)
        // BiColor LED values: 0=OFF, 1=GREEN_HALF, 2=AMBER_HALF, 3=GREEN_FULL, 4=AMBER_FULL
        // MUTE/SOLO buttons share the same note (0x24-0x27)
        // Muted = Red/Amber (4), Soloed = Yellow/Amber (2), Off = 0
        const note = 0x24 + track;

        if (isMuted) {
            // Muted: Red/Amber full brightness
            this.sendFireLED(note, 4);  // AMBER_FULL
        } else if (isSoloed) {
            // Soloed: Yellow/Amber half brightness
            this.sendFireLED(note, 2);  // AMBER_HALF
        } else {
            // Off
            this.sendFireLED(note, 0);  // OFF
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

        // Send MIDI to physical Fire controller LED (if available)
        // BiColor LED values: 0=OFF, 1=GREEN_HALF, 2=AMBER_HALF, 3=GREEN_FULL, 4=AMBER_FULL
        // Step grid: Notes 0x36-0x75 (54-117), 4 rows × 16 columns
        const stepNote = 0x36 + (track * 16) + step;
        const isActive = this.stepStates[track][step];

        // Active steps: Blue (use GREEN for visibility on hardware)
        // Inactive steps: Off
        this.sendFireLED(stepNote, isActive ? 3 : 0);  // GREEN_FULL or OFF
    }

    /**
     * Update transport button visuals based on playback state
     */
    updateTransportButtons() {
        const sequencer = this.getLinkedSequencer();
        const isPlaying = sequencer && sequencer.engine.playing;

        console.log(`[FireSequencer] Updating transport buttons - isPlaying: ${isPlaying}`);

        // Update UI buttons
        const playBtn = document.querySelector('.transport-play');
        const stopBtn = document.querySelector('.transport-stop');
        const recBtn = document.querySelector('.transport-rec');

        if (playBtn) {
            playBtn.setAttribute('color', isPlaying ? '#26A626' : '#888');
            console.log(`[FireSequencer] PLAY button color: ${isPlaying ? 'green' : 'gray'}`);
        }
        if (stopBtn) {
            stopBtn.setAttribute('color', !isPlaying ? '#CF1A37' : '#888');
            console.log(`[FireSequencer] STOP button color: ${!isPlaying ? 'red' : 'gray'}`);
        }
        if (recBtn) {
            recBtn.setAttribute('color', '#888');
        }

        // Send MIDI to physical Fire controller LEDs (if available)
        // BiColor LED values: 0=OFF, 1=GREEN_HALF, 2=AMBER_HALF, 3=GREEN_FULL, 4=AMBER_FULL

        // PLAY button LED (Note 0x33) - Green when playing
        this.sendFireLED(0x33, isPlaying ? 3 : 0);  // GREEN_FULL or OFF

        // STOP button LED (Note 0x34) - Red/Amber when stopped
        this.sendFireLED(0x34, !isPlaying ? 4 : 0);  // AMBER_FULL or OFF

        // REC button LED (Note 0x35) - off for now
        this.sendFireLED(0x35, 0);
    }

    /**
     * Setup linked mode - connect to sequencer
     */
    setupLinkedMode() {
        console.log(`[FireSequencer] ===== SETUP LINKED MODE =====`);
        console.log(`[FireSequencer] Linked sequencer ID: ${this.scene.linkedSequencer}`);

        const sequencer = this.getLinkedSequencer();
        if (!sequencer) {
            console.error('[FireSequencer] ❌ FAILED to get linked sequencer');
            return;
        }

        console.log(`[FireSequencer] ✓ Got sequencer instance:`, sequencer);
        console.log(`[FireSequencer] ✓ Engine exists:`, !!sequencer.engine);
        console.log(`[FireSequencer] ✓ Pattern exists:`, !!sequencer.engine?.pattern);

        // Load current pattern data from sequencer (first 16 rows)
        this.loadPatternFromSequencer();

        // Sync mute states
        this.syncMutesFromSequencer();

        // If a MIDI input device is specified, listen to it
        if (this.scene.midiInputDevice) {
            this.setupMIDIInputListener();
        }

        // Start playback position update loop
        this.startPlaybackPositionUpdate();

        // Update transport button states
        this.updateTransportButtons();

        // Setup pattern length bar and click handlers
        this.setupPatternLengthBar();

        console.log(`[FireSequencer] ===== LINKED MODE SETUP COMPLETE =====`);
    }

    /**
     * Load pattern data from sequencer into Fire grid
     * Maps 16 rows from current gridOffset of sequencer to 16 steps on Fire
     */
    loadPatternFromSequencer() {
        const sequencer = this.getLinkedSequencer();
        if (!sequencer) return;

        console.log(`[FireSequencer] Loading pattern from sequencer (offset: ${this.gridOffset})`);

        // Map 16 rows (starting from gridOffset) of sequencer pattern to Fire grid
        for (let track = 0; track < 4; track++) {
            for (let step = 0; step < 16; step++) {
                const sequencerRow = this.gridOffset + step;
                const entry = sequencer.engine.pattern.getEntry(sequencerRow, track);
                // Step is active if entry has a note
                this.stepStates[track][step] = entry && !entry.isEmpty();
                console.log(`[FireSequencer] Track ${track}, Step ${step} (row ${sequencerRow}): ${this.stepStates[track][step]}`);
            }
        }

        // Update visual display
        this.updateAllStepVisuals();
        console.log('[FireSequencer] Pattern loaded and visuals updated');
    }

    /**
     * Sync mute states from sequencer
     */
    syncMutesFromSequencer() {
        const sequencer = this.getLinkedSequencer();
        if (!sequencer) return;

        console.log('[FireSequencer] Syncing mute states from sequencer:', sequencer.engine.trackMutes);

        // Load mute states
        for (let track = 0; track < 4; track++) {
            this.trackMutes[track] = sequencer.engine.trackMutes[track];
        }

        // Detect solo: if only one track is unmuted, mark it as soloed
        // IMPORTANT: Always reset solo states first
        this.trackSolos = [false, false, false, false];

        const unmutedTracks = this.trackMutes.map((muted, idx) => !muted ? idx : -1).filter(idx => idx !== -1);
        if (unmutedTracks.length === 1) {
            const soloTrack = unmutedTracks[0];
            this.trackSolos[soloTrack] = true;
            console.log(`[FireSequencer] Track ${soloTrack} is effectively SOLOED`);
        }

        // Update visuals
        for (let track = 0; track < 4; track++) {
            this.updateMuteButtonVisual(track);
            console.log(`[FireSequencer] Track ${track} mute: ${this.trackMutes[track]}, solo: ${this.trackSolos[track]}`);
        }
    }

    /**
     * Update all step button visuals
     */
    updateAllStepVisuals() {
        for (let track = 0; track < 4; track++) {
            for (let step = 0; step < 16; step++) {
                this.updateStepButtonVisual(track, step);
            }
        }
    }

    /**
     * Start playback position update loop
     */
    startPlaybackPositionUpdate() {
        if (this.playbackUpdateInterval) {
            clearInterval(this.playbackUpdateInterval);
        }

        // Update playback position every 50ms
        this.playbackUpdateInterval = setInterval(() => {
            const sequencer = this.getLinkedSequencer();
            if (!sequencer) return;

            const currentRow = sequencer.engine.currentRow;

            // Update Fire grid position indicator
            // Show position only if current row is within visible grid range
            if (currentRow >= this.gridOffset && currentRow < this.gridOffset + 16) {
                // Convert sequencer row to Fire grid step (0-15)
                const step = currentRow - this.gridOffset;
                this.updatePlaybackPosition(step);
            } else {
                this.updatePlaybackPosition(-1); // Clear position indicator
            }

            // Update global position bar to show current playback position
            this.updateGlobalPositionBar(currentRow);
        }, 50);
    }

    /**
     * Write step change to sequencer pattern
     * @param {number} track - Track number (0-3)
     * @param {number} step - Step number (0-15 on Fire grid)
     * @param {boolean} active - Whether step is active
     */
    writeStepToSequencer(track, step, active) {
        const sequencer = this.getLinkedSequencer();
        if (!sequencer) return;

        // Map Fire step to sequencer row using gridOffset
        const sequencerRow = this.gridOffset + step;
        const entry = sequencer.engine.pattern.getEntry(sequencerRow, track);
        if (!entry) return;

        if (active) {
            // Activate step - set a default note if empty
            if (entry.isEmpty()) {
                entry.note = 'C';
                entry.octave = 3;
                entry.volume = 100;
                entry.program = sequencer.engine.trackPrograms[track] || 0;
            }
        } else {
            // Deactivate step - clear the note
            entry.note = null;
            entry.volume = 100;
            entry.effect = null;
        }

        // Update the pattern
        sequencer.engine.pattern.setEntry(sequencerRow, track, entry);
        console.log(`[FireSequencer] Wrote step ${track},${step} (row ${sequencerRow}) to sequencer: ${active ? 'ON' : 'OFF'}`);
    }

    /**
     * Update playback position visual indicator
     * @param {number} step - Current step (0-15, or -1 to clear)
     */
    updatePlaybackPosition(step) {
        // Clear previous position indicator
        if (this.currentStep !== -1 && this.currentStep !== step) {
            for (let track = 0; track < 4; track++) {
                const btn = document.querySelector(`.step-${track}-${this.currentStep}`);
                if (btn) {
                    const isActive = this.stepStates[track][this.currentStep];
                    btn.setAttribute('color', isActive ? '#4a9eff' : '#2a2a2a');
                }
            }
        }

        // Update current step
        this.currentStep = step;

        // Highlight current position
        if (step >= 0 && step < 16) {
            for (let track = 0; track < 4; track++) {
                const btn = document.querySelector(`.step-${track}-${step}`);
                if (btn) {
                    const isActive = this.stepStates[track][step];
                    // Brighter color for current playback position
                    btn.setAttribute('color', isActive ? '#6affff' : '#4a4a4a');
                }
            }
        }
    }

    /**
     * Setup pattern length bar - add click handlers and update display
     */
    setupPatternLengthBar() {
        const buttons = document.querySelectorAll('.seq-button');

        buttons.forEach((button, index) => {
            // Add additional click handler for playback length (don't remove existing SPP handler)
            button.addEventListener('click', () => {
                const sequencer = this.getLinkedSequencer();
                if (!sequencer) return;

                // Button index 0 = 4 rows, button 15 = 64 rows
                const newPlaybackLength = (index + 1) * 4;

                console.log(`[FireSequencer] Setting playback length to ${newPlaybackLength} rows (button ${index})`);
                sequencer.engine.playbackLength = newPlaybackLength;

                // If current row is beyond new playback length, wrap it
                if (sequencer.engine.currentRow >= newPlaybackLength) {
                    sequencer.engine.currentRow = sequencer.engine.currentRow % newPlaybackLength;
                }

                // Update visual
                this.updatePatternLengthBar();
            });
        });

        // Initial update
        this.updatePatternLengthBar();
    }

    /**
     * Update global position bar to show current playback position
     * Uses 'active' class just like SPP does
     */
    updateGlobalPositionBar(currentRow) {
        // Position bar has 16 buttons, each representing 4 rows (1 beat)
        // currentRow is 0-63, so button index = floor(currentRow / 4)
        const buttons = document.querySelectorAll('.seq-button');
        const currentBeat = Math.floor(currentRow / 4);

        buttons.forEach((button, index) => {
            if (index === currentBeat) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    /**
     * Update global position bar to show playback length
     * Uses 'loop-end' class to mark the last beat of the loop
     * IMPORTANT: Don't touch 'quarter' class - it's for every 4th button spacing
     */
    updatePatternLengthBar() {
        const sequencer = this.getLinkedSequencer();
        if (!sequencer) return;

        // Get playback length from sequencer (in rows)
        const playbackLength = sequencer.engine.playbackLength || 64;

        // Position bar has 16 buttons, each representing 4 rows (1 beat)
        // Button index for playback length = (playbackLength / 4) - 1
        // e.g., 4 rows = button 0, 16 rows = button 3, 64 rows = button 15
        const buttons = document.querySelectorAll('.seq-button');
        const maxBeatIndex = Math.floor(playbackLength / 4) - 1;

        // Use 'loop-end' class to mark the loop end (red border)
        // Don't remove 'quarter' class - it's permanent on every 4th button
        buttons.forEach((button, index) => {
            if (index === maxBeatIndex) {
                button.classList.add('loop-end');
            } else {
                button.classList.remove('loop-end');
            }
        });

        console.log(`[FireSequencer] Playback length bar: ${playbackLength} rows (button ${maxBeatIndex} marked with loop-end)`);
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
     * Get MIDI output for Fire controller LEDs
     * Even in linked mode, we need to send LED updates to the Fire controller
     */
    getFireControllerOutput() {
        const controller = this.sceneManager.controller;

        // If deviceBinding is specified, use that
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
     * Send LED update to Fire controller (works in both linked and compatible modes)
     */
    sendFireLED(note, velocity) {
        const midiOutput = this.getFireControllerOutput();
        if (midiOutput) {
            const channel = this.scene.midiChannel || 0;
            const statusByte = velocity > 0 ? (0x90 + channel) : (0x80 + channel);
            midiOutput.send([statusByte, note, velocity]);
            console.log(`[FireSequencer] Fire LED: Note ${note}, vel: ${velocity}`);
        } else {
            console.log('[FireSequencer] No Fire controller output (LED update skipped)');
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

        // Stop playback position update
        if (this.playbackUpdateInterval) {
            clearInterval(this.playbackUpdateInterval);
            this.playbackUpdateInterval = null;
        }

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
    }
}

// Export for ES6 module
export { FireSequencerScene };
