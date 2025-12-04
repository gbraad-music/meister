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
        this.knobMode = 'CHANNEL';  // CHANNEL, MIXER, USER1, USER2

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

        // LED state cache (note -> velocity) to avoid flooding MIDI output
        this.ledStates = new Map();
        this.lastDisplayUpdate = 0;  // Timestamp for display throttling

        // Fire pad note translation matrix (physical layout is inverted)
        // Row 0 (top) = notes 102-117, Row 3 (bottom) = notes 54-69
        this.FIRE_PAD_MATRIX = [
            102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117,  // Row 0
             86,  87,  88,  89,  90,  91,  92,  93,  94,  95,  96,  97,  98,  99, 100, 101,  // Row 1
             70,  71,  72,  73,  74,  75,  76,  77,  78,  79,  80,  81,  82,  83,  84,  85,  // Row 2
             54,  55,  56,  57,  58,  59,  60,  61,  62,  63,  64,  65,  66,  67,  68,  69   // Row 3
        ];
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
            // console.log(`[FireSequencer] Creating sequencer instance in background for: ${scene.name}`);
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
        container.style.gridTemplateRows = 'auto 1fr auto'; // top, track rows (flex), bottom
        container.style.gap = '8px';
        container.style.padding = '8px';
        container.style.minHeight = '0';  // Allow flex shrinking
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

        // Initialize Fire display adapter if not already created
        if (!this.fireDisplayAdapter && window.FireOLEDAdapter) {
            const renderMode = this.scene.renderMode || 'text';
            // Use 'physical' mode if MIDI input device is configured (physical Fire connected)
            const displayMode = this.scene.midiInputDevice ? 'physical' : 'virtual';

            // Create device binding for adapter (pass scene's device ID for Device Manager lookup)
            const deviceBinding = {
                id: 'fire-virtual',
                deviceId: 0,
                controller: this.sceneManager.controller,
                midiInputDevice: this.scene.midiInputDevice  // Device ID from Device Manager
            };

            this.fireDisplayAdapter = new window.FireOLEDAdapter(
                deviceBinding,
                displayMode,
                renderMode
            );
            console.log(`[FireSequencer] Initialized Fire OLED display (mode: ${displayMode}, render: ${renderMode})`);
        }

        // console.log(`[FireSequencer] Rendered in ${this.isLinkedMode() ? 'Linked' : 'Compatible'} mode`);
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
            padding: 8px;
            background: #0a0a0a;
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
            // ENTER button - encoder press (TODO: implement selection/confirm behavior)
            // For now, does nothing (MODE button changes knob modes)
            console.log('[FireSequencer] ENTER pressed (not implemented)');
        }, 0x19, false);  // Note 0x19 - ENCODER_PRESS
        enterBtn.style.height = '40px';

        enterContainer.appendChild(enterLabel);
        enterContainer.appendChild(enterBtn);
        topSection.appendChild(enterContainer);

        // Navigation buttons with labels (4 buttons on the right: L, R, U, D)
        const navButtons = [
            { symbol: '◀', note: 0x22, class: 'nav-grid-left' },  // Grid Left
            { symbol: '▶', note: 0x23, class: 'nav-grid-right' },  // Grid Right
            { symbol: '▲', note: 0x1F, class: 'nav-pattern-up' },  // Pattern Up
            { symbol: '▼', note: 0x20, class: 'nav-pattern-down' }   // Pattern Down
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

            // Initial color based on current state
            let initialColor = '#888';  // OFF by default
            if (btn.symbol === '◀') {
                initialColor = this.gridOffset > 0 ? '#CF1A37' : '#888';  // RED if can go left, OFF otherwise
            } else if (btn.symbol === '▶') {
                initialColor = this.gridOffset < 48 ? '#CF1A37' : '#888';  // RED if can go right, OFF otherwise
            }

            const navBtn = this.createButton('', initialColor, () => {
                this.handleNavButton(btn.symbol);
            }, btn.note, false);
            navBtn.style.height = '40px';
            navBtn.classList.add(btn.class);

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
            grid-template-rows: repeat(4, minmax(0, 1fr));
            gap: 4px;
            row-gap: 4px;
            padding: 8px;
            background: #0a0a0a;
            border-radius: 4px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
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

            // SOLO button (top) - starts gray, updateMuteButtonVisual will set to green when soloed
            const soloBtn = this.createButton('S', '#888', () => {
                this.handleSoloButton(track);
            }, 0x28 + track);  // SOLO indicator LED note (not button press note)
            soloBtn.classList.add(`track-${track}-solo`);
            controlStack.appendChild(soloBtn);

            // MUTE button (bottom) - starts gray, updateMuteButtonVisual will set to red when muted
            const muteBtn = this.createButton('M', '#888', () => {
                this.handleMuteButton(track);
            }, 0x24 + track);  // MUTE button press note
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
            padding: 8px;
            background: #0a0a0a;
            border-radius: 4px;
            align-items: center;
        `;

        const leftButtons = [
            { label: 'STEP', note: 0x2C, color: '#CF1A37' },  // RED - active by default in sequencer mode
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
            { label: 'PLAY', note: 0x33, color: isPlaying ? '#26A626' : '#888' },  // GREEN when playing
            { label: 'STOP', note: 0x34, color: !isPlaying ? '#FF8000' : '#888' },  // ORANGE when stopped
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

        // pad-knob emits 'cc-change' event, not 'knob-change'
        knob.addEventListener('cc-change', (e) => {
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
            // console.log(`[FireSequencer] pad-press event: ${label}, note: ${midiNote}`);
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
     * Update top knob labels based on knobMode (without full re-render)
     */
    updateTopKnobLabels() {
        let knobLabels;
        switch (this.knobMode) {
            case 'CHANNEL':
                knobLabels = ['VOL', 'PAN', 'FILT', 'RES'];
                break;
            case 'MIXER':
                knobLabels = ['VOL', 'PAN', 'LOW', 'HIGH'];
                break;
            case 'USER1':
                // TODO: Make these configurable in scene editor
                // Could map to: Master Volume, Master Pan, Device Parameter 1, Device Parameter 2
                knobLabels = ['U1-1', 'U1-2', 'U1-3', 'U1-4'];
                break;
            case 'USER2':
                // TODO: Make these configurable in scene editor
                // Could map to: Fader info, Device controls, etc.
                knobLabels = ['U2-1', 'U2-2', 'U2-3', 'U2-4'];
                break;
            default:
                knobLabels = ['VOL', 'PAN', 'FILT', 'RES'];
        }

        // Find and update the first 4 knobs
        const knobs = document.querySelectorAll('pad-knob');
        for (let i = 0; i < Math.min(4, knobs.length); i++) {
            knobs[i].setAttribute('label', knobLabels[i]);
        }

        // Update LCD display to show current mode
        this.updateFireDisplay();
    }

    /**
     * Update button labels based on SHIFT state (without full re-render)
     */
    updateButtonLabels() {
        // Left buttons labels (SHIFT changes them)
        const leftLabels = this.shiftPressed
            ? ['ACCENT', 'SNAP', 'TAP', 'OVERVIEW', 'SHIFT', 'ALT']
            : ['STEP', 'NOTE', 'DRUM', 'PERF', 'SHIFT', 'ALT'];

        // Right buttons labels (SHIFT changes some)
        const rightLabels = this.shiftPressed
            ? ['MODE', 'BRWSR', 'METRO', 'WAIT', 'CNTDN', 'LOOP']
            : ['MODE', 'BRWSR', 'PTRN', 'PLAY', 'STOP', 'REC'];

        // Update left button labels (find by note)
        const leftNotes = [0x2C, 0x2D, 0x2E, 0x2F, 0x30, 0x31];
        leftNotes.forEach((note, index) => {
            const btn = document.querySelector(`regroove-pad[note="${note}"]`);
            if (btn) {
                const parent = btn.parentElement;
                if (parent) {
                    const labelDiv = parent.querySelector('div');
                    if (labelDiv) {
                        labelDiv.innerHTML = `${leftLabels[index]}<br><span style="font-size: 0.65em; color: #555;">0x${note.toString(16).toUpperCase()}</span>`;
                    }
                }
            }
        });

        // Update right button labels
        const rightNotes = [0x1A, 0x21, 0x32, 0x33, 0x34, 0x35];
        rightNotes.forEach((note, index) => {
            const btn = document.querySelector(`regroove-pad[note="${note}"]`);
            if (btn) {
                const parent = btn.parentElement;
                if (parent) {
                    const labelDiv = parent.querySelector('div');
                    if (labelDiv) {
                        labelDiv.innerHTML = `${rightLabels[index]}<br><span style="font-size: 0.65em; color: #555;">0x${note.toString(16).toUpperCase()}</span>`;
                    }
                }
            }
        });
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
                // console.log(`[FireSequencer] Top knob ${knobIndex} = ${value} (linked mode)`);
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
        // console.log(`[FireSequencer] handleTrackKnobChange CALLED: track=${track}, value=${value}, isLinked=${this.isLinkedMode()}`);
        if (this.isLinkedMode()) {
            // Linked mode: control track volume in sequencer (internal mapping)
            const sequencer = this.getLinkedSequencer();
            // console.log(`[FireSequencer] handleTrackKnobChange track=${track}, value=${value}, sequencer=`, sequencer);
            if (sequencer) {
                // Set track volume in sequencer engine (0-127)
                // This multiplies note velocities during playback
                // console.log(`[FireSequencer] Before: trackVolumes=`, sequencer.engine.trackVolumes);
                sequencer.engine.setTrackVolume(track, value);
                // console.log(`[FireSequencer] After: trackVolumes=`, sequencer.engine.trackVolumes);
            }
        } else {
            // Compatible mode: send MIDI CC
            const cc = 21 + track;
            this.sendMIDICC(cc, value);
        }
    }

    /**
     * Handle solo button
     * In Web UI: dedicated SOLO button
     * On Physical Fire: SHIFT + MUTE button
     */
    handleSoloButton(track) {
        // SHIFT + SOLO on already-solo'd track = UNMUTE ALL
        if (this.shiftPressed && this.trackSolos[track]) {
            if (this.isLinkedMode()) {
                const sequencer = this.getLinkedSequencer();
                if (sequencer) {
                    // Unmute all tracks
                    for (let t = 0; t < 4; t++) {
                        sequencer.engine.trackMutes[t] = false;
                        this.trackMutes[t] = false;
                    }
                    this.trackSolos = [false, false, false, false];
                }
            } else {
                // Compatible mode: clear all
                this.trackMutes = [false, false, false, false];
                this.trackSolos = [false, false, false, false];
            }

            // Update all button visuals
            for (let t = 0; t < 4; t++) {
                this.updateMuteButtonVisual(t);
            }
            return;
        }

        // Normal SOLO behavior (toggle solo)
        if (this.isLinkedMode()) {
            const sequencer = this.getLinkedSequencer();
            if (sequencer) {
                // Check if this track is currently soloed
                const wasSoloed = this.trackSolos[track];

                if (wasSoloed) {
                    // Un-solo: unmute all tracks
                    for (let t = 0; t < 4; t++) {
                        sequencer.engine.trackMutes[t] = false;
                        this.trackMutes[t] = false;
                    }
                    this.trackSolos = [false, false, false, false];
                } else {
                    // Solo this track: use sequencer's toggleSolo
                    sequencer.engine.toggleSolo(track);

                    // Read back mute states
                    for (let t = 0; t < 4; t++) {
                        this.trackMutes[t] = sequencer.engine.trackMutes[t];
                    }

                    // Mark as soloed
                    this.trackSolos = [false, false, false, false];
                    this.trackSolos[track] = true;
                }
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
    }

    /**
     * Handle mute button
     * In Web UI: dedicated MUTE button
     * On Physical Fire: The single button (handled in MIDI input with smart logic)
     */
    handleMuteButton(track) {
        // MUTE button: just toggle mute
        this.trackMutes[track] = !this.trackMutes[track];

        if (this.isLinkedMode()) {
            // Update linked sequencer
            const sequencer = this.getLinkedSequencer();
            if (sequencer) {
                sequencer.engine.trackMutes[track] = this.trackMutes[track];
            }
        }

        // Auto-detect solo: if only one track is unmuted, mark it as soloed
        const unmutedTracks = this.trackMutes.map((muted, idx) => !muted ? idx : -1).filter(idx => idx !== -1);
        if (unmutedTracks.length === 1) {
            this.trackSolos = [false, false, false, false];
            this.trackSolos[unmutedTracks[0]] = true;
        } else {
            this.trackSolos = [false, false, false, false];
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
                // console.log(`[FireSequencer] Step ${track},${step} = ${this.stepStates[track][step]} (linked mode)`);
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
        // console.log(`[FireSequencer] Nav: ${direction}`);

        if (this.isLinkedMode()) {
            // In linked mode, L/R navigate through 64-row pattern in banks of 16
            if (direction === '◀') {
                // Left - previous bank of 16 steps
                if (this.gridOffset > 0) {
                    this.gridOffset -= 16;
                    this.loadPatternFromSequencer();
                    this.updateNavigationLEDs();
                    // console.log(`[FireSequencer] Grid offset: ${this.gridOffset}-${this.gridOffset + 15}`);
                }
            } else if (direction === '▶') {
                // Right - next bank of 16 steps
                if (this.gridOffset < 48) {
                    this.gridOffset += 16;
                    this.loadPatternFromSequencer();
                    this.updateNavigationLEDs();
                    // console.log(`[FireSequencer] Grid offset: ${this.gridOffset}-${this.gridOffset + 15}`);
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
     * Update navigation button LEDs based on current offset
     */
    updateNavigationLEDs() {
        // Grid Left/Right (ARROW buttons): RED LEDs - value 3 for full brightness

        const canGoLeft = this.gridOffset > 0;
        const canGoRight = this.gridOffset < 48;

        // Grid Left (0x22) - RED when offset > 0 (can go left), OFF at start
        this.sendFireLED(0x22, canGoLeft ? 3 : 0);

        // Grid Right (0x23) - RED when offset < 48 (can go right), OFF at end
        this.sendFireLED(0x23, canGoRight ? 3 : 0);

        // Update Web UI button colors to match Fire hardware
        const gridLeftBtn = document.querySelector('.nav-grid-left');
        const gridRightBtn = document.querySelector('.nav-grid-right');
        const patternUpBtn = document.querySelector('.nav-pattern-up');
        const patternDownBtn = document.querySelector('.nav-pattern-down');

        if (gridLeftBtn) {
            gridLeftBtn.setAttribute('color', canGoLeft ? '#CF1A37' : '#888');  // RED or OFF
        }
        if (gridRightBtn) {
            gridRightBtn.setAttribute('color', canGoRight ? '#CF1A37' : '#888');  // RED or OFF
        }
        if (patternUpBtn) {
            patternUpBtn.setAttribute('color', '#888');  // OFF for now
        }
        if (patternDownBtn) {
            patternDownBtn.setAttribute('color', '#888');  // OFF for now
        }

        // Pattern Up/Down - off for now
        this.sendFireLED(0x1F, 0);
        this.sendFireLED(0x20, 0);
    }

    /**
     * Handle bottom section buttons
     */
    handleBottomButton(btn) {
        // Handle modifiers (note: these are toggled in Web UI, but hold in physical Fire)
        if (btn.label === 'SHIFT') {
            this.shiftPressed = !this.shiftPressed;
            // console.log(`[FireSequencer] SHIFT: ${this.shiftPressed}`);

            // Highlight SHIFT button when active
            const shiftBtn = document.querySelector('regroove-pad[note="48"]');  // 0x30 = 48
            if (shiftBtn) {
                shiftBtn.setAttribute('color', this.shiftPressed ? '#CF1A37' : '#888');  // RED when active, gray when off
            }

            this.updateButtonLabels();  // Update labels when SHIFT changes
            return;
        }

        if (btn.label === 'ALT') {
            this.altPressed = !this.altPressed;
            // console.log(`[FireSequencer] ALT: ${this.altPressed}`);

            // Highlight ALT button when active
            const altBtn = document.querySelector('regroove-pad[note="49"]');  // 0x31 = 49
            if (altBtn) {
                altBtn.setAttribute('color', this.altPressed ? '#FF8000' : '#888');  // ORANGE when active, gray when off
            }
            return;
        }

        if (btn.label === 'MODE') {
            // KNOB_MODE button - cycles through CHANNEL/MIXER/USER1/USER2 modes
            const modes = ['CHANNEL', 'MIXER', 'USER1', 'USER2'];
            const currentIndex = modes.indexOf(this.knobMode);
            this.knobMode = modes[(currentIndex + 1) % 4];
            // console.log(`[FireSequencer] MODE: ${this.knobMode}`);
            this.updateTopKnobLabels();
            return;
        }

        // Auto-clear SHIFT after processing any other button (Web UI only)
        // Physical Fire handles this naturally with Note Off
        const shouldClearShift = this.shiftPressed && btn.label !== 'SHIFT' && btn.label !== 'ALT';

        // Transport controls (PLAY=0x33, STOP=0x34, RECORD=0x35)
        if (btn.label === 'PLAY') {
            // PLAY
            // console.log('[FireSequencer] PLAY button pressed');
            if (this.isLinkedMode()) {
                const sequencer = this.getLinkedSequencer();
                // console.log('[FireSequencer] Got sequencer:', !!sequencer);
                if (sequencer) {
                    // console.log('[FireSequencer] Calling sequencer.engine.startPlayback()');
                    sequencer.engine.startPlayback();
                    // console.log('[FireSequencer] Started linked sequencer playback');
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
            // console.log('[FireSequencer] STOP button pressed');
            if (this.isLinkedMode()) {
                const sequencer = this.getLinkedSequencer();
                if (sequencer) {
                    // console.log('[FireSequencer] Calling sequencer.engine.stopPlayback()');
                    sequencer.engine.stopPlayback();
                    // console.log('[FireSequencer] Stopped linked sequencer playback');
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
                    // console.log(`[FireSequencer] Sequencer record mode: ${sequencer.recordMode}`);
                }
            } else {
                this.sendMIDINote(0x35, 127);
                setTimeout(() => this.sendMIDINote(0x35, 0), 100);
            }
        } else {
            // Other buttons
            // console.log(`[FireSequencer] Button: ${btn.label}`);
            if (!this.isLinkedMode() && btn.note) {
                this.sendMIDINote(btn.note, 127);
                setTimeout(() => this.sendMIDINote(btn.note, 0), 100);
            }
        }

        // Auto-clear SHIFT after processing button (Web UI only, makes it act like modifier key)
        if (shouldClearShift) {
            this.shiftPressed = false;
            const shiftBtn = document.querySelector('regroove-pad[note="48"]');  // 0x30 = 48
            if (shiftBtn) {
                shiftBtn.setAttribute('color', '#888');  // Back to gray
            }
            this.updateButtonLabels();  // Restore button labels
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

        // Update UI buttons to match Fire hardware (bi-color LEDs: GREEN for solo, RED for mute)
        if (muteBtn) {
            if (isMuted) {
                muteBtn.setAttribute('color', '#CF1A37');  // Red when muted
            } else {
                muteBtn.setAttribute('color', '#888');  // Gray when not muted
            }
        }

        if (soloBtn) {
            if (isSoloed) {
                soloBtn.setAttribute('color', '#26A626');  // Green when soloed (matches Fire)
            } else {
                soloBtn.setAttribute('color', '#888');  // Gray when not soloed
            }
        }

        // Send MIDI to physical Fire controller LEDs (if available)
        // Button indicators use CCs 0x28-0x2B (not 0x24-0x27 which are button press notes)
        const indicatorCC = 0x28 + track;

        // SOLO/MUTE indicators are BI-COLOR LEDs (GREEN/RED)
        // 0=OFF, 3=RED (bright), 4=GREEN (bright)
        let ledValue = 0;
        if (isSoloed) {
            ledValue = 4;  // GREEN (bright) - confirmed working on physical Fire
        } else if (isMuted) {
            ledValue = 3;  // RED (bright) - confirmed working on physical Fire
        }

        this.sendFireLED(indicatorCC, ledValue);
    }

    /**
     * Update step button visual
     */
    updateStepButtonVisual(track, step) {
        const isActive = this.stepStates[track][step];
        const isCurrentStep = (step === this.currentStep);

        // Update DOM button - use vibrant colors to show all states clearly
        const btn = document.querySelector(`.step-${track}-${step}`);
        if (btn) {
            if (isCurrentStep && isActive) {
                btn.setAttribute('color', '#00ffff');  // CYAN (playing + active - VERY VISIBLE!)
            } else if (isCurrentStep) {
                btn.setAttribute('color', '#ff8800');  // BRIGHT ORANGE (playing, no note)
            } else if (isActive) {
                btn.setAttribute('color', '#00ff00');  // BRIGHT GREEN (active step)
            } else {
                btn.setAttribute('color', '#0a0a0a');  // DARK (off)
            }
        }

        // Send MIDI to physical Fire controller LED (if available)
        // Use full RGB SysEx to show all states clearly
        // Fire is inverted: UI T1 (top, track 0) = Fire bottom row (matrix row 3)
        const fireRow = 3 - track;
        const matrixIndex = fireRow * 16 + step;
        const stepNote = this.FIRE_PAD_MATRIX[matrixIndex];

        // LED values: 0=OFF, 2=ORANGE(playing empty), 3=GREEN(active), 5=CYAN(active+playing)
        let ledValue = 0;  // OFF by default
        if (isCurrentStep && isActive) {
            ledValue = 5;  // CYAN (playing + active - VERY VISIBLE, shows BOTH states!)
        } else if (isCurrentStep) {
            ledValue = 2;  // ORANGE (playing on empty step)
        } else if (isActive) {
            ledValue = 3;  // GREEN (active step)
        }

        this.sendFireLED(stepNote, ledValue);
    }

    /**
     * Update transport button visuals based on playback state
     */
    updateTransportButtons() {
        const sequencer = this.getLinkedSequencer();
        const isPlaying = sequencer && sequencer.engine.playing;

        // console.log(`[FireSequencer] Updating transport buttons - isPlaying: ${isPlaying}`);

        // Update UI buttons
        const playBtn = document.querySelector('.transport-play');
        const stopBtn = document.querySelector('.transport-stop');
        const recBtn = document.querySelector('.transport-rec');

        if (playBtn) {
            playBtn.setAttribute('color', isPlaying ? '#26A626' : '#888');
            // console.log(`[FireSequencer] PLAY button color: ${isPlaying ? 'green' : 'gray'}`);
        }
        if (stopBtn) {
            stopBtn.setAttribute('color', !isPlaying ? '#CF1A37' : '#888');
            // console.log(`[FireSequencer] STOP button color: ${!isPlaying ? 'red' : 'gray'}`);
        }
        if (recBtn) {
            recBtn.setAttribute('color', '#888');
        }

        // Send MIDI to physical Fire controller LEDs (if available)
        // PLAY: GREEN LED - value 3 seems to be max before color changes
        // STOP: ORANGE LED - value 3 for brightness

        // PLAY button LED (0x33) - GREEN when playing
        this.sendFireLED(0x33, isPlaying ? 3 : 0);  // GREEN (value 3)

        // STOP button LED (0x34) - ORANGE when stopped (try higher value for brighter)
        this.sendFireLED(0x34, !isPlaying ? 127 : 0);  // ORANGE (try max brightness)

        // REC button LED (0x35) - off for now
        this.sendFireLED(0x35, 0);
    }

    /**
     * Setup linked mode - connect to sequencer
     */
    setupLinkedMode() {
        // console.log(`[FireSequencer] ===== SETUP LINKED MODE =====`);
        // console.log(`[FireSequencer] Linked sequencer ID: ${this.scene.linkedSequencer}`);

        const sequencer = this.getLinkedSequencer();
        if (!sequencer) {
            console.error('[FireSequencer] ❌ FAILED to get linked sequencer');
            return;
        }

        // console.log(`[FireSequencer] ✓ Got sequencer instance:`, sequencer);
        // console.log(`[FireSequencer] ✓ Engine exists:`, !!sequencer.engine);
        // console.log(`[FireSequencer] ✓ Pattern exists:`, !!sequencer.engine?.pattern);

        // Load current pattern data from sequencer (first 16 rows)
        this.loadPatternFromSequencer();

        // If a MIDI input device is specified, listen to it
        if (this.scene.midiInputDevice) {
            this.setupMIDIInputListener();
            // Initialize physical Fire hardware (clears all LEDs)
            this.initializeFireHardware();
        }

        // Sync mute states AFTER initializing hardware (so LEDs aren't cleared)
        this.syncMutesFromSequencer();

        // Sync track volumes from sequencer to Fire knobs
        this.syncTrackVolumesFromSequencer();

        // Start playback position update loop
        this.startPlaybackPositionUpdate();

        // Update transport button states
        this.updateTransportButtons();

        // Update navigation button LEDs
        this.updateNavigationLEDs();

        // Setup pattern length bar and click handlers
        this.setupPatternLengthBar();

        // console.log(`[FireSequencer] ===== LINKED MODE SETUP COMPLETE =====`);
    }

    /**
     * Load pattern data from sequencer into Fire grid
     * Maps 16 rows from current gridOffset of sequencer to 16 steps on Fire
     */
    loadPatternFromSequencer() {
        const sequencer = this.getLinkedSequencer();
        if (!sequencer) return;

        // console.log(`[FireSequencer] Loading pattern from sequencer (offset: ${this.gridOffset})`);

        // Map 16 rows (starting from gridOffset) of sequencer pattern to Fire grid
        for (let track = 0; track < 4; track++) {
            for (let step = 0; step < 16; step++) {
                const sequencerRow = this.gridOffset + step;
                const entry = sequencer.engine.pattern.getEntry(sequencerRow, track);
                // Step is active if entry has a note
                this.stepStates[track][step] = entry && !entry.isEmpty();
                // console.log(`[FireSequencer] Track ${track}, Step ${step} (row ${sequencerRow}): ${this.stepStates[track][step]}`);
            }
        }

        // Update visual display
        this.updateAllStepVisuals();
        // console.log('[FireSequencer] Pattern loaded and visuals updated');
    }

    /**
     * Sync mute states from sequencer
     */
    syncMutesFromSequencer() {
        const sequencer = this.getLinkedSequencer();
        if (!sequencer) return;

        // console.log('[FireSequencer] Syncing mute states from sequencer:', sequencer.engine.trackMutes);

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
            // console.log(`[FireSequencer] Track ${soloTrack} is effectively SOLOED`);
        }

        // Update visuals
        for (let track = 0; track < 4; track++) {
            this.updateMuteButtonVisual(track);
            // console.log(`[FireSequencer] Track ${track} mute: ${this.trackMutes[track]}, solo: ${this.trackSolos[track]}`);
        }
    }

    /**
     * Sync track volumes from sequencer
     */
    syncTrackVolumesFromSequencer() {
        const sequencer = this.getLinkedSequencer();
        if (!sequencer) return;

        // console.log('[FireSequencer] Syncing track volumes from sequencer:', sequencer.engine.trackVolumes);

        // Load track volume states from sequencer engine
        for (let track = 0; track < 4; track++) {
            const volume = sequencer.engine.trackVolumes[track];
            this.trackKnobs[track] = volume;

            // Update knob visual in UI
            const knobElement = document.querySelector(`pad-knob[label="T${track + 1}"]`);
            if (knobElement) {
                knobElement.setAttribute('value', volume);
                // console.log(`[FireSequencer] Track ${track} knob synced to ${volume}`);
            }
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

            // Update Fire display (throttled to every 500ms to avoid flooding)
            const now = Date.now();
            if (!this.lastDisplayUpdate || now - this.lastDisplayUpdate >= 500) {
                this.updateFireDisplay();
                this.lastDisplayUpdate = now;
            }
        }, 50);
    }

    /**
     * Update Fire OLED display
     */
    updateFireDisplay() {
        if (!this.fireDisplayAdapter) return;

        let bpm = 120;
        let sequencerName = 'N/A';
        let playing = false;
        let currentRow = 0;
        let playbackLength = 16;

        if (this.isLinkedMode()) {
            const sequencer = this.getLinkedSequencer();
            if (sequencer) {
                bpm = sequencer.engine?.bpm || 120;
                playing = sequencer.engine?.playing || false;
                currentRow = sequencer.engine?.currentRow || 0;
                playbackLength = sequencer.engine?.playbackLength || 64;
                const linkedScene = this.sceneManager.scenes.get(this.scene.linkedSequencer);
                sequencerName = linkedScene?.name || 'Unknown';
            }
        }

        const message = {
            type: 'display_message',
            deviceId: 'fire-virtual',
            deviceType: 'fire',
            lines: [
                `${this.scene.name}`,
                this.isLinkedMode() ? `> ${sequencerName}` : 'Fire Compatible',
                `BPM: ${bpm}  Step: ${currentRow}/${playbackLength}`,
                `Offset: ${String(this.gridOffset).padStart(2, '0')}  Mode: ${this.knobMode}`
            ],
            metadata: { category: 'status', priority: 'normal' }
        };
        this.fireDisplayAdapter.sendMessage(message);
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
        // console.log(`[FireSequencer] Wrote step ${track},${step} (row ${sequencerRow}) to sequencer: ${active ? 'ON' : 'OFF'}`);
    }

    /**
     * Update playback position visual indicator
     * @param {number} step - Current step (0-15, or -1 to clear)
     */
    updatePlaybackPosition(step) {
        const oldStep = this.currentStep;
        this.currentStep = step;

        // Update visuals for old position (restore normal state)
        if (oldStep !== -1 && oldStep !== step) {
            for (let track = 0; track < 4; track++) {
                this.updateStepButtonVisual(track, oldStep);
            }
        }

        // Update visuals for new position (highlight)
        if (step >= 0 && step < 16) {
            for (let track = 0; track < 4; track++) {
                this.updateStepButtonVisual(track, step);
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

                // console.log(`[FireSequencer] Setting playback length to ${newPlaybackLength} rows (button ${index})`);
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

        // console.log(`[FireSequencer] Playback length bar: ${playbackLength} rows (button ${maxBeatIndex} marked with loop-end)`);
    }

    /**
     * Setup compatible mode MIDI listeners
     */
    setupCompatibleModeMIDI() {
        // console.log('[FireSequencer] Compatible mode - listening for MIDI input');

        // Listen for incoming MIDI notes to update step grid
        // This would connect to the MIDI input system
    }

    /**
     * Initialize physical Fire hardware
     * Sets sequencer mode and clears all LEDs
     */
    initializeFireHardware() {
        const midiOutput = this.getFireControllerOutput();
        if (!midiOutput) {
            // No MIDI output - running in disconnected mode (user will reconnect via settings)
            return;
        }

        console.log('[FireSequencer] Initializing physical Fire hardware');

        // Clear LED state cache to avoid stale data
        this.ledStates.clear();
        console.log('[FireSequencer] Cleared LED state cache');

        // Fire is stateless - no mode switch needed, just send LED states
        // Clear all step pad LEDs by setting all to OFF (RGB 0,0,0)
        for (let i = 0; i < this.FIRE_PAD_MATRIX.length; i++) {
            this.sendFireLED(this.FIRE_PAD_MATRIX[i], 0);  // OFF
        }

        // Clear all button LEDs (navigation, transport, mode buttons)
        // Navigation: Grid L/R (0x22-0x23), Pattern U/D (0x1F-0x20)
        this.sendFireLED(0x1F, 0);  // Pattern Up
        this.sendFireLED(0x20, 0);  // Pattern Down
        this.sendFireLED(0x22, 0);  // Grid Left
        this.sendFireLED(0x23, 0);  // Grid Right

        // SOLO/MUTE button press notes (0x24-0x27) - these don't have LEDs
        // SOLO/MUTE LED indicators (0x28-0x2B) - bi-color LEDs
        for (let note = 0x28; note <= 0x2B; note++) {
            this.sendFireLED(note, 0);  // Clear indicator LEDs
        }

        // Bottom left: STEP, NOTE, DRUM, PERF, SHIFT, ALT (0x2C-0x31)
        for (let note = 0x2C; note <= 0x31; note++) {
            this.sendFireLED(note, 0);
        }

        // Bottom right: MODE, BRWSR, PTRN, PLAY, STOP, REC (0x1A, 0x21, 0x32-0x35)
        this.sendFireLED(0x1A, 0);  // MODE
        this.sendFireLED(0x21, 0);  // BRWSR
        this.sendFireLED(0x32, 0);  // PTRN
        this.sendFireLED(0x33, 0);  // PLAY
        this.sendFireLED(0x34, 0);  // STOP
        this.sendFireLED(0x35, 0);  // REC

        // Set STEP button active (default mode in sequencer)
        this.sendFireLED(0x2C, 3);  // BRIGHT RED (value 3 for brightness)

        // Force full grid refresh to show current step states
        for (let track = 0; track < 4; track++) {
            for (let step = 0; step < 16; step++) {
                this.updateStepButtonVisual(track, step);
            }
        }

        // Force immediate OLED display update
        setTimeout(() => {
            this.updateFireDisplay();
            console.log('[FireSequencer] Sent initial OLED display');
        }, 100);  // Small delay

        console.log('[FireSequencer] Fire hardware initialized (64 pads + buttons)');
    }

    /**
     * Setup MIDI input listener for physical Fire controller
     */
    setupMIDIInputListener() {
        if (!this.sceneManager.controller.midiAccess) {
            console.warn('[FireSequencer] No MIDI access available');
            return;
        }

        // Get device from Device Manager (midiInputDevice is now device ID, not raw MIDI port name)
        const deviceManager = this.sceneManager.controller.deviceManager;
        const midiInputDeviceId = this.scene.midiInputDevice;

        if (!midiInputDeviceId || !deviceManager) {
            // No device associated - running in software-only mode
            return;
        }

        const device = deviceManager.getDevice(midiInputDeviceId);
        if (!device) {
            console.warn(`[FireSequencer] Device "${midiInputDeviceId}" not found in Device Manager`);
            return;
        }

        // Get MIDI input for this device (uses midiInputName or falls back to midiOutputName)
        const midiInput = deviceManager.getMidiInput(device.id);
        if (!midiInput) {
            console.warn(`[FireSequencer] No MIDI input found for device "${device.name}"`);
            return;
        }

        // Create bound listener
        this.midiInputListener = (event) => this.handleFireMIDIInput(event);

        // Attach listener
        midiInput.addEventListener('midimessage', this.midiInputListener);
        // console.log(`[FireSequencer] ✓ Listening to MIDI input: ${midiInput.name} (device: ${device.name})`);
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

            // Pad grid: notes 54-117 (but not sequential - use matrix)
            const matrixIndex = this.FIRE_PAD_MATRIX.indexOf(note);
            if (matrixIndex !== -1) {
                const fireRow = Math.floor(matrixIndex / 16);
                const step = matrixIndex % 16;
                // Fire is inverted: Fire top row (row 0) = UI T4 (track 3)
                const track = 3 - fireRow;

                if (isNoteOn) {
                    this.handleStepButton(track, step);
                }
                return;
            }

            // Solo/Mute buttons: 0x24-0x27 (top to bottom on Fire)
            if (note >= 0x24 && note <= 0x27 && isNoteOn) {
                const track = note - 0x24;

                // Physical Fire has ONE button per track:
                // SHIFT + button → SOLO/UN-SOLO
                // Button alone → ALWAYS mute (un-solo first if needed, then mute)
                if (this.shiftPressed) {
                    // SHIFT + button = SOLO/UN-SOLO
                    this.handleSoloButton(track);
                } else {
                    // Button alone = ALWAYS MUTE
                    // If track is solo'd, clear solo first
                    if (this.trackSolos[track]) {
                        this.trackSolos[track] = false;
                    }
                    // Then mute/unmute
                    this.handleMuteButton(track);
                }
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
            // SHIFT and ALT are hold buttons (not toggle)
            if (note === 0x30) {
                this.shiftPressed = isNoteOn;  // Press = true, Release = false
                this.updateButtonLabels();  // Update labels when SHIFT changes
                return;
            }
            if (note === 0x31) {
                this.altPressed = isNoteOn;  // Press = true, Release = false
                return;
            }

            if (isNoteOn) {
                if (note === 0x1A) this.handleBottomButton({ label: 'MODE' });  // KNOB_MODE
                else if (note === 0x19) {  // ENCODER_PRESS (ENTER)
                    // ENTER button - encoder press (not used for mode switching)
                    console.log('[FireSequencer] ENTER pressed (not implemented)');
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

            // Track knobs: CC 21-24 (Fire hardware sends these for T1-T4 knobs)
            if (cc >= 21 && cc <= 24) {
                const track = cc - 21;
                this.trackKnobs[track] = value;
                this.handleTrackKnobChange(track, value);

                // Update knob visual in UI
                const knobElement = document.querySelector(`pad-knob[label="T${track + 1}"]`);
                if (knobElement) {
                    knobElement.setAttribute('value', value);
                }
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

        if (!controller.midiAccess) {
            console.warn('[FireSequencer] No MIDI access available');
            return null;
        }

        let output = null;
        let device = null;

        // Get associated device from Device Manager
        if (this.scene.midiInputDevice && controller.deviceManager) {
            device = controller.deviceManager.getDevice(this.scene.midiInputDevice);
            if (device) {
                // Get MIDI output for this device
                output = controller.deviceManager.getMidiOutput(device.id);

                // Warn if device type doesn't match (but don't block)
                if (device.type !== 'akai-fire' && device.type !== 'generic') {
                    console.warn(`[FireSequencer] Device type '${device.type}' may not be compatible with Fire Sequencer (expected 'akai-fire' or 'generic')`);
                }
            } else {
                console.warn(`[FireSequencer] Device '${this.scene.midiInputDevice}' not found in Device Manager - edit scene to reconfigure`);
                return null;  // Fail - user needs to reconfigure
            }
        }

        // Fall back to global output if no device associated
        if (!output) {
            output = controller.midiOutput;
        }

        return output;
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
            // console.log(`[FireSequencer] MIDI Note: ${note}, vel: ${velocity}`);
        } else {
            console.warn('[FireSequencer] No MIDI output available');
        }
    }

    /**
     * Send LED update to Fire controller (works in both linked and compatible modes)
     * Only sends if state changed to avoid flooding MIDI output
     * Pads (notes 54-117): RGB SysEx with pad index (note - 54)
     * Buttons (other notes): CC messages
     */
    sendFireLED(note, velocity) {
        // Check if LED state changed
        const currentState = this.ledStates.get(note);
        if (currentState === velocity) {
            return;  // No change, skip MIDI send
        }

        // Update cache
        this.ledStates.set(note, velocity);

        const midiOutput = this.getFireControllerOutput();
        if (!midiOutput) return;

        // Check if this is a pad (notes 54-117) or button (other notes)
        if (note >= 54 && note <= 117) {
            // PAD: Use RGB SysEx with pad index (note - 54)
            // Full RGB color control (0-127 per channel)
            let r = 0, g = 0, b = 0;
            switch(velocity) {
                case 0:  // OFF
                    r = 0; g = 0; b = 0;
                    break;
                case 1:  // GREEN_HALF
                    r = 0; g = 64; b = 0;
                    break;
                case 2:  // BRIGHT ORANGE (playing position, no note) - matches Web UI #ff8800
                    r = 127; g = 68; b = 0;
                    break;
                case 3:  // GREEN (active step)
                    r = 0; g = 127; b = 0;
                    break;
                case 4:  // AMBER_FULL (unused)
                    r = 127; g = 64; b = 0;
                    break;
                case 5:  // CYAN (playing position + active step - VERY VISIBLE!)
                    r = 0; g = 127; b = 127;
                    break;
                default:
                    r = 0; g = 0; b = 0;
            }

            // RGB SysEx: F0 47 7F 43 65 <len_hi> <len_lo> <pad_index> <r> <g> <b> F7
            const padIndex = note - 54;  // Convert note to pad index (0-63)
            const length = 4;  // 1 pad × 4 bytes (pad_index + r + g + b)
            const sysex = new Uint8Array([
                0xF0, 0x47, 0x7F, 0x43, 0x65,
                Math.floor(length / 128), length % 128,
                padIndex, r, g, b,
                0xF7
            ]);
            midiOutput.send(sysex);
        } else {
            // BUTTON/INDICATOR: Use CC message
            // CC values: 0=OFF, 1=GREEN, 2=DIM_RED, 3=BRIGHT_RED (tested on physical Fire)
            const channel = this.scene.midiChannel || 0;
            const statusByte = 0xB0 + channel;
            midiOutput.send([statusByte, note, velocity]);
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
            // console.log(`[FireSequencer] MIDI CC: ${cc}, value: ${value}`);
        } else {
            console.warn('[FireSequencer] No MIDI output available');
        }
    }


    /**
     * Clear all Fire LEDs (pads and buttons)
     */
    clearAllFireLEDs() {
        // Clear all pad grid LEDs (notes 54-117)
        for (let note = 54; note <= 117; note++) {
            this.sendFireLED(note, 0);
        }

        // Clear button LEDs
        const buttonNotes = [
            0x1F, 0x20, 0x21, 0x22, 0x23,  // Pattern Up/Down, Browse, Grid Left/Right
            0x28, 0x29, 0x2A, 0x2B,        // SOLO/MUTE indicators
            0x2C, 0x2D, 0x2E, 0x2F,        // STEP, NOTE, DRUM, PERFORM
            0x30, 0x31,                     // SHIFT, ALT
            0x32, 0x33, 0x34, 0x35         // PATTERN, PLAY, STOP, RECORD
        ];
        buttonNotes.forEach(note => this.sendFireLED(note, 0));

        // Clear LED cache
        this.ledStates.clear();
    }

    /**
     * Deactivate scene (called when switching away from non-persistent scene)
     * Clears all Fire LEDs and stops MIDI input listening
     */
    deactivate() {
        // console.log('[FireSequencer] Deactivating scene - clearing LEDs');

        // Clear all Fire LEDs
        this.clearAllFireLEDs();

        // Stop LED sweep test if running
        if (this.ledSweepInterval) {
            clearInterval(this.ledSweepInterval);
            this.ledSweepInterval = null;
        }

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
                        // console.log(`[FireSequencer] ✓ Removed MIDI listener from: ${this.scene.midiInputDevice}`);
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
