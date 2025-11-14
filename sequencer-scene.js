/**
 * Sequencer Scene for Meister
 * Tracker-style pattern editor with 4 tracks and 64 rows
 */

import { SequencerEngine, SequencerEntry } from './sequencer-engine.js';

export class SequencerScene {
    constructor(controller, sceneId, config = {}) {
        this.controller = controller;
        this.sceneId = sceneId;
        this.type = 'sequencer';
        this.name = config.name || 'Sequencer';
        this.enabled = config.enabled !== false;

        // Create sequencer engine
        this.engine = config.engine
            ? SequencerEngine.fromJSON(controller, config.engine)
            : new SequencerEngine(controller);

        // UI state
        this.cursorRow = 0;
        this.cursorTrack = 0;
        this.cursorField = 0; // 0=note+octave, 1=volume, 2=effect
        this.scrollOffset = 0;
        this.visibleRows = 24; // Number of rows visible at once

        // Track whether we're editing
        this.editing = false;

        this.render();
        this.setupEventListeners();
    }

    render() {
        const container = document.getElementById('pads-grid');
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.padding = '10px';
        container.style.gap = '10px';
        container.style.overflow = 'hidden';

        // Sync BPM with global clock on render
        if (this.controller.clockBPM && this.engine.bpm !== this.controller.clockBPM) {
            console.log(`[Sequencer] Syncing BPM on render: ${this.controller.clockBPM} (was ${this.engine.bpm})`);
            this.engine.bpm = this.controller.clockBPM;
            this.engine.msPerRow = this.engine.calculateMsPerRow();
        }

        // Transport controls
        const transportBar = this.createTransportBar();
        container.appendChild(transportBar);

        // Track headers
        const trackHeaders = this.createTrackHeaders();
        container.appendChild(trackHeaders);

        // Tracker grid
        const trackerGrid = this.createTrackerGrid();
        container.appendChild(trackerGrid);

        // Track controls (mute/solo/volume)
        const trackControls = this.createTrackControls();
        container.appendChild(trackControls);

        // Recalculate visible rows after DOM layout
        requestAnimationFrame(() => {
            this.updateTrackerGrid();
        });
    }

    createTransportBar() {
        const bar = document.createElement('div');
        bar.style.cssText = `
            display: flex;
            gap: 10px;
            align-items: center;
            padding: 10px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 4px;
        `;

        // Common button style
        const buttonStyle = `
            padding: 8px 16px;
            border: 1px solid;
            border-radius: 3px;
            cursor: pointer;
            font-weight: bold;
            font-size: 0.9em;
            padding-bottom: 10px;
            min-width: 90px;
            height: 36px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        `;

        // Play button
        const playBtn = document.createElement('button');
        playBtn.textContent = '▶ PLAY';
        playBtn.id = 'seq-play-btn';
        playBtn.style.cssText = buttonStyle + `
            background: #2a4a2a;
            color: #4a9e4a;
            border-color: #3a5a3a;
        `;
        playBtn.addEventListener('click', () => this.handlePlayStop());
        bar.appendChild(playBtn);

        // Stop button
        const stopBtn = document.createElement('button');
        stopBtn.textContent = '■ STOP';
        stopBtn.style.cssText = buttonStyle + `
            background: #4a2a2a;
            color: #cc4444;
            border-color: #5a3a3a;
        `;
        stopBtn.addEventListener('click', () => this.engine.stopPlayback());
        bar.appendChild(stopBtn);

        // Fill Track button
        const fillBtn = document.createElement('button');
        fillBtn.textContent = '⚡ FILL';
        fillBtn.style.cssText = buttonStyle + `
            background: #2a2a4a;
            color: #6a6aaa;
            border-color: #3a3a5a;
        `;
        fillBtn.addEventListener('click', () => this.openFillDialog());
        bar.appendChild(fillBtn);

        // Export MIDI button
        const exportBtn = document.createElement('button');
        exportBtn.textContent = '💾 EXPORT';
        exportBtn.style.cssText = buttonStyle + `
            background: #2a4a4a;
            color: #6a9a9a;
            border-color: #3a5a5a;
        `;
        exportBtn.addEventListener('click', () => this.exportMIDI());
        bar.appendChild(exportBtn);

        // Import MIDI button
        const importBtn = document.createElement('button');
        importBtn.textContent = '📁 IMPORT';
        importBtn.style.cssText = buttonStyle + `
            background: #2a4a2a;
            color: #6a9a6a;
            border-color: #3a5a3a;
        `;
        importBtn.addEventListener('click', () => this.importMIDI());
        bar.appendChild(importBtn);

        // BPM control
        const bpmLabel = document.createElement('span');
        bpmLabel.textContent = 'BPM:';
        bpmLabel.style.color = '#888';
        bpmLabel.style.marginLeft = '20px';
        bar.appendChild(bpmLabel);

        const bpmInput = document.createElement('input');
        bpmInput.type = 'number';
        bpmInput.value = this.engine.bpm;
        bpmInput.min = 20;
        bpmInput.max = 300;
        bpmInput.id = 'seq-bpm-input';
        bpmInput.style.cssText = `
            width: 60px;
            padding: 5px;
            background: #0a0a0a;
            color: #888;
            border: 1px solid #333;
        `;
        bpmInput.addEventListener('change', (e) => {
            this.engine.setBPM(parseInt(e.target.value) || 120);
        });
        bar.appendChild(bpmInput);

        // Sync options
        //const syncLabel = document.createElement('span');
        //syncLabel.textContent = '';
        //syncLabel.style.color = '#888';
        //syncLabel.style.marginLeft = '20px';
        //bar.appendChild(syncLabel);

        const syncRecv = document.createElement('label');
        syncRecv.style.cssText = 'display: flex; align-items: center; gap: 5px; color: #888; margin-left: 10px;';
        syncRecv.innerHTML = `
            <input type="checkbox" id="seq-recv-start" ${this.engine.receiveStartStop ? 'checked' : ''}>
            <span>Recv Start/Stop</span>
        `;
        syncRecv.querySelector('input').addEventListener('change', (e) => {
            this.engine.receiveStartStop = e.target.checked;
        });
        bar.appendChild(syncRecv);

        const syncSend = document.createElement('label');
        syncSend.style.cssText = 'display: flex; align-items: center; gap: 5px; color: #888; margin-left: 10px;';
        syncSend.innerHTML = `
            <input type="checkbox" id="seq-send-start" ${this.engine.sendStartStop ? 'checked' : ''}>
            <span>Send Start/Stop</span>
        `;
        syncSend.querySelector('input').addEventListener('change', (e) => {
            this.engine.sendStartStop = e.target.checked;
        });
        bar.appendChild(syncSend);

        // Sync to MIDI Clock checkbox
        const syncClock = document.createElement('label');
        syncClock.style.cssText = 'display: flex; align-items: center; gap: 5px; color: #888; margin-left: 10px;';
        syncClock.innerHTML = `
            <input type="checkbox" id="seq-sync-clock" ${this.engine.syncToMIDIClock ? 'checked' : ''}>
            <span>⏱ Sync MIDI Clock</span>
        `;
        syncClock.querySelector('input').addEventListener('change', (e) => {
            this.engine.syncToMIDIClock = e.target.checked;
            console.log(`[Sequencer] MIDI Clock sync ${e.target.checked ? 'enabled' : 'disabled'}`);

            // If playing, restart to switch timer modes (MIDI clock vs internal)
            if (this.engine.playing) {
                this.engine.stopPlayback();
                this.engine.startPlayback();
            }
        });
        bar.appendChild(syncClock);

        // Send SPP checkbox
        const sendSPP = document.createElement('label');
        sendSPP.style.cssText = 'display: flex; align-items: center; gap: 5px; color: #888; margin-left: 10px;';
        sendSPP.innerHTML = `
            <input type="checkbox" id="seq-send-spp" ${this.engine.sendSPP ? 'checked' : ''}>
            <span>Send SPP</span>
        `;
        sendSPP.querySelector('input').addEventListener('change', (e) => {
            this.engine.sendSPP = e.target.checked;
        });
        bar.appendChild(sendSPP);

        // SPP interval dropdown
        const sppIntervalLabel = document.createElement('span');
        sppIntervalLabel.textContent = '@';
        sppIntervalLabel.style.cssText = 'color: #666; margin-left: 5px;';
        bar.appendChild(sppIntervalLabel);

        const sppInterval = document.createElement('select');
        sppInterval.id = 'seq-spp-interval';
        sppInterval.style.cssText = `
            padding: 5px;
            background: #0a0a0a;
            color: #888;
            border: 1px solid #333;
        `;
        sppInterval.innerHTML = `
            <option value="4" ${this.engine.sppInterval === 4 ? 'selected' : ''}>4</option>
            <option value="8" ${this.engine.sppInterval === 8 ? 'selected' : ''}>8</option>
            <option value="16" ${this.engine.sppInterval === 16 ? 'selected' : ''}>16</option>
            <option value="32" ${this.engine.sppInterval === 32 ? 'selected' : ''}>32</option>
            <option value="64" ${this.engine.sppInterval === 64 ? 'selected' : ''}>64 (pattern boundary)</option>
        `;
        sppInterval.addEventListener('change', (e) => {
            this.engine.sppInterval = parseInt(e.target.value);
        });
        bar.appendChild(sppInterval);

        // Sync to SPP checkbox
        const syncSPP = document.createElement('label');
        syncSPP.style.cssText = 'display: flex; align-items: center; gap: 5px; color: #888; margin-left: 10px;';
        syncSPP.innerHTML = `
            <input type="checkbox" id="seq-sync-spp" ${this.engine.syncToSPP ? 'checked' : ''}>
            <span>Sync SPP</span>
        `;
        syncSPP.querySelector('input').addEventListener('change', (e) => {
            this.engine.syncToSPP = e.target.checked;
        });
        bar.appendChild(syncSPP);

        // Position indicator
        const posLabel = document.createElement('span');
        posLabel.id = 'seq-position';
        posLabel.textContent = `Row: 00`;
        posLabel.style.cssText = `
            margin-left: auto;
            color: #4a9eff;
            font-family: monospace;
            font-weight: bold;
        `;
        bar.appendChild(posLabel);

        return bar;
    }

    createTrackHeaders() {
        const headers = document.createElement('div');
        headers.style.cssText = `
            display: grid;
            grid-template-columns: 40px repeat(4, 1fr);
            gap: 2px;
            padding: 5px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.85em;
        `;

        // Row number header
        const rowHeader = document.createElement('div');
        rowHeader.textContent = 'Row';
        rowHeader.style.cssText = 'color: #666; text-align: center; padding: 5px;';
        headers.appendChild(rowHeader);

        // Track headers
        for (let track = 0; track < 4; track++) {
            const trackHeader = document.createElement('div');
            trackHeader.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 3px;
                padding: 5px;
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 2px;
            `;

            // Track title
            const trackTitle = document.createElement('div');
            trackTitle.textContent = `Track ${track + 1}`;
            trackTitle.style.cssText = `
                color: #ddd;
                text-align: center;
                font-weight: bold;
                font-size: 0.9em;
            padding-bottom: 10px;
            `;
            trackHeader.appendChild(trackTitle);

            // Device selector
            const deviceSelect = document.createElement('select');
            deviceSelect.style.cssText = `
                padding: 2px;
                background: #0a0a0a;
                color: #888;
                border: 1px solid #333;
                border-radius: 2px;
                font-size: 0.75em;
            `;

            // Populate device options
            deviceSelect.innerHTML = '<option value="">Default</option>';
            if (this.controller.deviceManager) {
                const devices = this.controller.deviceManager.getAllDevices();
                devices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.id;
                    option.textContent = device.name;
                    deviceSelect.appendChild(option);
                });
            }

            // Set current device binding
            const currentBinding = this.engine.trackDeviceBindings[track];
            if (currentBinding) {
                deviceSelect.value = currentBinding;
            }

            // Device change handler
            deviceSelect.addEventListener('change', (e) => {
                this.engine.trackDeviceBindings[track] = e.target.value || null;
                console.log(`[Sequencer] Track ${track + 1} device binding set to: ${e.target.value || 'default'}`);
            });

            trackHeader.appendChild(deviceSelect);

            // Program selector with -/+ buttons
            const programControl = document.createElement('div');
            programControl.style.cssText = `
                display: flex;
                gap: 2px;
                align-items: center;
            `;

            // Decrement button
            const programDec = document.createElement('button');
            programDec.textContent = '−';
            programDec.style.cssText = `
                padding: 2px 6px;
                background: #333;
                color: #888;
                border: 1px solid #444;
                border-radius: 2px;
                cursor: pointer;
                font-size: 1em;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 28px;
            `;
            programDec.addEventListener('click', () => {
                this.engine.trackPrograms[track] = Math.max(0, (this.engine.trackPrograms[track] || 0) - 1);
                this.updateTrackHeaders();
                console.log(`[Sequencer] Track ${track + 1} program: ${this.engine.trackPrograms[track]}`);
            });
            programControl.appendChild(programDec);

            // Program display
            const programDisplay = document.createElement('div');
            const currentProg = this.engine.trackPrograms[track] || 0;
            programDisplay.textContent = currentProg === 0 ? 'NO PROG' : `PROG ${currentProg}`;
            programDisplay.style.cssText = `
                padding: 0;
                background: #0a0a0a;
                color: #ccc;
                border: 1px solid #333;
                border-radius: 2px;
                min-width: 70px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 0.75em;
                margin-top: 5px;
            `;
            programControl.appendChild(programDisplay);

            // Increment button
            const programInc = document.createElement('button');
            programInc.textContent = '+';
            programInc.style.cssText = `
                padding: 2px 6px;
                background: #333;
                color: #888;
                border: 1px solid #444;
                border-radius: 2px;
                cursor: pointer;
                font-size: 1em;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 28px;
            `;
            programInc.addEventListener('click', () => {
                this.engine.trackPrograms[track] = Math.min(32, (this.engine.trackPrograms[track] || 0) + 1);
                this.updateTrackHeaders();
                console.log(`[Sequencer] Track ${track + 1} program: ${this.engine.trackPrograms[track]}`);
            });
            programControl.appendChild(programInc);

            trackHeader.appendChild(programControl);
            headers.appendChild(trackHeader);
        }

        return headers;
    }

    createTrackerGrid() {
        const gridContainer = document.createElement('div');
        gridContainer.id = 'seq-tracker-grid';
        gridContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            background: #000;
            border: 2px solid #333;
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.9em;
            padding: 0;
            scrollbar-width: thin;
            scrollbar-color: #444 #000;
        `;

        // Add webkit scrollbar styling
        const style = document.createElement('style');
        style.textContent = `
            #seq-tracker-grid::-webkit-scrollbar {
                width: 8px;
            }
            #seq-tracker-grid::-webkit-scrollbar-track {
                background: #000;
            }
            #seq-tracker-grid::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 4px;
            }
            #seq-tracker-grid::-webkit-scrollbar-thumb:hover {
                background: #555;
            }
        `;
        if (!document.getElementById('seq-tracker-scrollbar-style')) {
            style.id = 'seq-tracker-scrollbar-style';
            document.head.appendChild(style);
        }

        this.updateTrackerGrid(gridContainer);

        return gridContainer;
    }

    updateTrackerGrid(gridContainer = null) {
        if (!gridContainer) {
            gridContainer = document.getElementById('seq-tracker-grid');
        }
        if (!gridContainer) return;

        gridContainer.innerHTML = '';

        // Render ALL rows, let scrolling handle visibility
        for (let row = 0; row < this.engine.pattern.rows; row++) {
            const rowDiv = document.createElement('div');
            rowDiv.style.cssText = `
                display: grid;
                grid-template-columns: 40px repeat(4, 1fr);
                gap: 2px;
                padding: 2px;
                background: ${row % 4 === 0 ? '#0a0a0a' : '#000'};
                border-bottom: 1px solid ${row % 4 === 0 ? '#222' : '#111'};
            `;

            // Row is current playback position
            if (row === this.engine.currentRow && this.engine.playing) {
                rowDiv.style.background = '#1a2a1a';
            }

            // Row number
            const rowNum = document.createElement('div');
            rowNum.textContent = row.toString().padStart(2, '0');
            rowNum.style.cssText = `
                color: ${row === this.cursorRow ? '#4a9eff' : '#666'};
                text-align: center;
                padding: 4px;
                font-weight: ${row === this.cursorRow ? 'bold' : 'normal'};
            `;
            rowDiv.appendChild(rowNum);

            // Track entries
            for (let track = 0; track < 4; track++) {
                const entry = this.engine.pattern.getEntry(row, track);
                const trackDiv = this.createTrackEntryDiv(row, track, entry);
                rowDiv.appendChild(trackDiv);
            }

            gridContainer.appendChild(rowDiv);
        }
    }

    createTrackEntryDiv(row, track, entry) {
        const div = document.createElement('div');
        const isCursor = (row === this.cursorRow && track === this.cursorTrack);

        div.style.cssText = `
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            gap: 4px;
            padding: 4px;
            background: ${isCursor ? '#2a2a4a' : '#0a0a0a'};
            border: 1px solid ${isCursor ? '#4a4a9a' : '#1a1a1a'};
            border-radius: 2px;
            cursor: pointer;
        `;

        // Note-Octave (combined, tracker format: C-3 for naturals, C#3 for sharps)
        const noteDiv = document.createElement('span');
        if (entry.note) {
            const separator = entry.note.includes('#') ? '' : '-';
            noteDiv.textContent = `${entry.note}${separator}${entry.octave}`;
        } else {
            noteDiv.textContent = '---';
        }
        noteDiv.style.cssText = `
            color: ${entry.note ? '#4a9eff' : '#333'};
            text-align: center;
            font-weight: bold;
            ${isCursor && this.cursorField === 0 ? 'background: #4a6a9a; color: #fff;' : ''}
        `;
        div.appendChild(noteDiv);

        // Volume
        const volumeDiv = document.createElement('span');
        volumeDiv.textContent = entry.note ? entry.volume.toString(16).toUpperCase().padStart(2, '0') : '--';
        volumeDiv.style.cssText = `
            color: ${entry.note ? '#9a9a4a' : '#333'};
            text-align: center;
            ${isCursor && this.cursorField === 1 ? 'background: #4a6a9a; color: #fff;' : ''}
        `;
        div.appendChild(volumeDiv);

        // Effect
        const effectDiv = document.createElement('span');
        effectDiv.textContent = entry.effect || '---';
        effectDiv.style.cssText = `
            color: ${entry.effect ? '#9a4a9a' : '#333'};
            text-align: center;
            ${isCursor && this.cursorField === 2 ? 'background: #4a6a9a; color: #fff;' : ''}
        `;
        div.appendChild(effectDiv);

        // Click to move cursor
        div.addEventListener('click', () => {
            this.cursorRow = row;
            this.cursorTrack = track;
            this.updateTrackerGrid();
        });

        return div;
    }

    createTrackControls() {
        const controls = document.createElement('div');
        controls.style.cssText = `
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            padding: 10px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 4px;
        `;

        for (let track = 0; track < 4; track++) {
            const trackControl = document.createElement('div');
            trackControl.style.cssText = `
                display: flex;
                flex-direction: row;
                gap: 0;
                padding: 0;
                background: transparent;
                border: none;
                justify-content: center;
                align-items: center;
            `;

            // Mute button - shows red when trackMutes[track] is true
            const muteBtn = document.createElement('button');
            muteBtn.textContent = 'M';
            muteBtn.style.cssText = `
                padding: 6px 12px;
                background: ${this.engine.trackMutes[track] ? '#cc4444' : '#2a2a2a'};
                color: ${this.engine.trackMutes[track] ? '#fff' : '#888'};
                border: 1px solid #333;
                border-radius: 2px;
                cursor: pointer;
                font-weight: bold;
                font-size: 0.9em;
                min-width: 42px;
                height: 32px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            `;
            muteBtn.addEventListener('click', () => {
                this.engine.toggleMute(track);
                this.updateTrackControls();
            });
            trackControl.appendChild(muteBtn);

            // Solo button - shows red when this track is soloed
            const soloBtn = document.createElement('button');
            soloBtn.textContent = 'S';
            const isSoloed = this.engine.isTrackSoloed(track);
            soloBtn.style.cssText = `
                padding: 6px 12px;
                background: ${isSoloed ? '#cc4444' : '#2a2a2a'};
                color: ${isSoloed ? '#fff' : '#888'};
                border: 1px solid #333;
                border-radius: 2px;
                cursor: pointer;
                font-weight: bold;
                font-size: 0.9em;
                min-width: 42px;
                height: 32px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            `;
            soloBtn.addEventListener('click', () => {
                this.engine.toggleSolo(track);
                this.updateTrackControls();
            });
            trackControl.appendChild(soloBtn);

            controls.appendChild(trackControl);
        }

        return controls;
    }

    updateTrackControls() {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Remove old controls
        const oldControls = container.querySelector(':scope > div:last-child');
        if (oldControls) {
            oldControls.remove();
        }

        // Add new controls
        const trackControls = this.createTrackControls();
        container.appendChild(trackControls);
    }

    updateTrackHeaders() {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Find and replace track headers
        const oldHeaders = container.querySelector(':scope > div:nth-child(2)');
        if (oldHeaders) {
            const newHeaders = this.createTrackHeaders();
            oldHeaders.replaceWith(newHeaders);
        }
    }

    setupEventListeners() {
        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Sync global BPM changes to sequencer
        const globalBpmInput = document.getElementById('clock-bpm');
        if (globalBpmInput) {
            this.globalBpmListener = () => {
                const newBpm = parseInt(globalBpmInput.value) || 120;
                if (newBpm !== this.engine.bpm) {
                    this.engine.bpm = newBpm;
                    this.engine.msPerRow = this.engine.calculateMsPerRow();

                    // Update sequencer BPM display
                    const seqBpmInput = document.getElementById('seq-bpm-input');
                    if (seqBpmInput) {
                        seqBpmInput.value = newBpm;
                    }

                    console.log(`[Sequencer] BPM synced from global: ${newBpm}`);
                }
            };
            globalBpmInput.addEventListener('change', this.globalBpmListener);
        }

        // MIDI input for note entry
        if (this.controller.midiAccess) {
            this.midiInputListener = (event) => {
                // Only handle MIDI input when this scene is active and cursor is on note field
                if (this.controller.sceneManager?.currentScene !== this.sceneId) return;
                if (this.cursorField !== 0) return; // Only when on note field

                const [status, data1, data2] = event.data;
                const messageType = status & 0xF0;

                // Note On message
                if (messageType === 0x90 && data2 > 0) {
                    const midiNote = data1;
                    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                    const octave = Math.floor(midiNote / 12);
                    const noteName = noteNames[midiNote % 12];

                    // Set the note at cursor position
                    const entry = this.engine.pattern.getEntry(this.cursorRow, this.cursorTrack) || new SequencerEntry();
                    entry.note = noteName;
                    entry.octave = octave;
                    entry.volume = data2; // Use velocity as volume
                    this.engine.pattern.setEntry(this.cursorRow, this.cursorTrack, entry);
                    this.updateTrackerGrid();

                    // Don't preview MIDI input notes - user already hears them from controller
                    // and previewing creates infinite loops if MIDI output routes back to input
                }
            };

            // Attach listener to all MIDI inputs
            for (let input of this.controller.midiAccess.inputs.values()) {
                input.addEventListener('midimessage', this.midiInputListener);
            }
        }

        // Track last highlighted row for efficient updates
        this.lastHighlightedRow = -1;

        // Update position indicator during playback (OPTIMIZED - no grid rebuild!)
        this.positionUpdateInterval = setInterval(() => {
            if (this.engine.playing) {
                const posLabel = document.getElementById('seq-position');
                if (posLabel) {
                    posLabel.textContent = `Row: ${this.engine.currentRow.toString().padStart(2, '0')}`;
                }

                // Update play button state
                const playBtn = document.getElementById('seq-play-btn');
                if (playBtn) {
                    playBtn.textContent = '⏸ PAUSE';
                    playBtn.style.background = '#4a4a2a';
                    playBtn.style.color = '#9a9a4a';
                }

                // Update row highlighting efficiently (only 2 DOM updates per tick!)
                if (this.engine.currentRow !== this.lastHighlightedRow) {
                    const grid = document.getElementById('seq-tracker-grid');
                    if (grid) {
                        // Remove highlight from previous row
                        if (this.lastHighlightedRow >= 0) {
                            const prevRow = grid.children[this.lastHighlightedRow];
                            if (prevRow) {
                                prevRow.style.background = this.lastHighlightedRow % 4 === 0 ? '#0a0a0a' : '#000';
                            }
                        }

                        // Add highlight to current row
                        const currentRowDiv = grid.children[this.engine.currentRow];
                        if (currentRowDiv) {
                            currentRowDiv.style.background = '#1a2a1a';
                        }

                        this.lastHighlightedRow = this.engine.currentRow;
                    }
                }
            } else {
                const playBtn = document.getElementById('seq-play-btn');
                if (playBtn) {
                    playBtn.textContent = '▶ PLAY';
                    playBtn.style.background = '#2a4a2a';
                    playBtn.style.color = '#4a9e4a';
                }
            }
        }, 100);
    }

    handlePlayStop() {
        if (this.engine.playing) {
            this.engine.stopPlayback();
        } else {
            this.engine.startPlayback();
        }
    }

    handleKeyDown(e) {
        // Only handle if this scene is active
        if (this.controller.sceneManager?.currentScene !== this.sceneId) return;

        // Arrow keys for navigation and editing
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                // Shift + Up = increment note (C → C# → D, etc.)
                if (e.shiftKey && this.cursorField === 0) {
                    this.incrementNote(1);
                }
                // Ctrl + Up = increment octave
                else if (e.ctrlKey && this.cursorField === 0) {
                    this.incrementOctave(1);
                }
                // Normal Up = move cursor up
                else {
                    this.cursorRow = Math.max(0, this.cursorRow - 1);
                    this.ensureCursorVisible();
                    this.updateTrackerGrid();

                    // Preview note on this row
                    const entry = this.engine.pattern.getEntry(this.cursorRow, this.cursorTrack);
                    if (entry && entry.note) {
                        this.previewNote(entry);
                    }
                }
                break;

            case 'ArrowDown':
                e.preventDefault();
                // Shift + Down = decrement note
                if (e.shiftKey && this.cursorField === 0) {
                    this.incrementNote(-1);
                }
                // Ctrl + Down = decrement octave
                else if (e.ctrlKey && this.cursorField === 0) {
                    this.incrementOctave(-1);
                }
                // Normal Down = move cursor down
                else {
                    this.cursorRow = Math.min(this.engine.pattern.rows - 1, this.cursorRow + 1);
                    this.ensureCursorVisible();
                    this.updateTrackerGrid();

                    // Preview note on this row
                    const entry = this.engine.pattern.getEntry(this.cursorRow, this.cursorTrack);
                    if (entry && entry.note) {
                        this.previewNote(entry);
                    }
                }
                break;

            case 'ArrowLeft':
                e.preventDefault();
                this.cursorField--;
                if (this.cursorField < 0) {
                    this.cursorTrack = Math.max(0, this.cursorTrack - 1);
                    this.cursorField = 2;
                }
                this.updateTrackerGrid();
                break;

            case 'ArrowRight':
                e.preventDefault();
                this.cursorField++;
                if (this.cursorField > 2) {
                    this.cursorTrack = Math.min(3, this.cursorTrack + 1);
                    this.cursorField = 0;
                }
                this.updateTrackerGrid();
                break;

            case ' ':
                e.preventDefault();
                this.handlePlayStop();
                break;

            case 'PageDown':
                e.preventDefault();
                this.cursorRow = Math.min(this.engine.pattern.rows - 1, this.cursorRow + 16);
                this.ensureCursorVisible();
                this.updateTrackerGrid();
                break;

            case 'PageUp':
                e.preventDefault();
                this.cursorRow = Math.max(0, this.cursorRow - 16);
                this.ensureCursorVisible();
                this.updateTrackerGrid();
                break;

            case 'Delete':
                e.preventDefault();
                this.clearCurrentEntry();
                break;

            default:
                // Handle note input (C, D, E, F, G, A, B)
                if (this.cursorField === 0 && /^[A-G]$/i.test(e.key)) {
                    e.preventDefault();
                    this.setNote(e.key.toUpperCase());
                }
                break;
        }
    }

    incrementNote(direction) {
        const entry = this.engine.pattern.getEntry(this.cursorRow, this.cursorTrack) || new SequencerEntry();
        if (!entry.note) {
            // If no note, start with C-3
            entry.note = 'C';
            entry.octave = 3;
        } else {
            // Note sequence: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
            const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            let index = notes.indexOf(entry.note);
            if (index !== -1) {
                index += direction;
                // Wrap around
                if (index < 0) {
                    index = notes.length - 1;
                    entry.octave = Math.max(0, entry.octave - 1);
                } else if (index >= notes.length) {
                    index = 0;
                    entry.octave = Math.min(8, entry.octave + 1);
                }
                entry.note = notes[index];
            }
        }
        this.engine.pattern.setEntry(this.cursorRow, this.cursorTrack, entry);
        this.updateTrackerGrid();

        // Preview the note
        this.previewNote(entry);
    }

    incrementOctave(direction) {
        const entry = this.engine.pattern.getEntry(this.cursorRow, this.cursorTrack) || new SequencerEntry();
        if (!entry.note) {
            // If no note, start with C-3
            entry.note = 'C';
            entry.octave = 3;
        } else {
            entry.octave = Math.max(0, Math.min(8, entry.octave + direction));
        }
        this.engine.pattern.setEntry(this.cursorRow, this.cursorTrack, entry);
        this.updateTrackerGrid();

        // Preview the note
        this.previewNote(entry);
    }

    ensureCursorVisible() {
        const gridContainer = document.getElementById('seq-tracker-grid');
        if (!gridContainer) return;

        // Find the row element
        const rowElements = gridContainer.children;
        if (this.cursorRow < rowElements.length) {
            const rowElement = rowElements[this.cursorRow];
            if (rowElement) {
                rowElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    previewNote(entry) {
        if (!entry || !entry.note) return;

        const midiNote = entry.getMidiNote();
        if (midiNote === null || midiNote < 0 || midiNote > 127) return;

        const velocity = Math.min(127, Math.max(0, entry.volume || 100));
        const program = entry.program || this.engine.trackPrograms[this.cursorTrack] || 0;

        // Play the note on the current track
        this.engine.playNote(this.cursorTrack, midiNote, velocity, program);
    }

    setNote(note) {
        const entry = this.engine.pattern.getEntry(this.cursorRow, this.cursorTrack) || new SequencerEntry();

        // If this was an empty entry, set default octave to 3
        if (!entry.note) {
            entry.octave = 3;
        }

        entry.note = note;
        this.engine.pattern.setEntry(this.cursorRow, this.cursorTrack, entry);
        this.updateTrackerGrid();

        // Preview the note
        this.previewNote(entry);

        // Don't auto-advance cursor - let user press Enter or Down to move
    }

    clearCurrentEntry() {
        const entry = new SequencerEntry();
        this.engine.pattern.setEntry(this.cursorRow, this.cursorTrack, entry);
        this.updateTrackerGrid();
    }

    openFillDialog() {
        const track = this.cursorTrack + 1;
        const note = prompt(`Fill Track ${track} with note (e.g., C-3, D#4) or leave empty to fill with cursor note:`);

        if (note === null) return; // User cancelled

        let fillNote = null;
        let fillOctave = 3;

        if (note.trim() === '') {
            // Use current cursor entry
            const cursorEntry = this.engine.pattern.getEntry(this.cursorRow, this.cursorTrack);
            if (!cursorEntry || !cursorEntry.note) {
                alert('No note at cursor position. Please specify a note (e.g., C-3 or C#4)');
                return;
            }
            fillNote = cursorEntry.note;
            fillOctave = cursorEntry.octave;
        } else {
            // Parse note format: "C-3" (naturals with dash) or "C#4" (sharps without dash)
            const match = note.trim().match(/^([A-G]#?)-?(\d)$/i);
            if (!match) {
                alert('Invalid note format. Use format like C-3 or C#4.');
                return;
            }
            fillNote = match[1].toUpperCase();
            fillOctave = parseInt(match[2]);
        }

        const interval = parseInt(prompt(`Fill every N rows (1=all, 4=every 4th, 8=every 8th, 16=every 16th):`, '4'));
        if (!interval || interval < 1 || interval > 64) return;

        const velocity = parseInt(prompt(`Velocity (0-127):`, '100'));
        if (isNaN(velocity) || velocity < 0 || velocity > 127) return;

        // Fill the track
        for (let row = 0; row < this.engine.pattern.rows; row += interval) {
            const entry = new SequencerEntry();
            entry.note = fillNote;
            entry.octave = fillOctave;
            entry.volume = velocity;
            entry.program = this.engine.trackPrograms[this.cursorTrack] || 0;
            this.engine.pattern.setEntry(row, this.cursorTrack, entry);
        }

        this.updateTrackerGrid();
        const separator = fillNote.includes('#') ? '' : '-';
        console.log(`[Sequencer] Filled track ${track} with ${fillNote}${separator}${fillOctave} every ${interval} rows`);
    }

    exportMIDI() {
        // Create Standard MIDI File (Format 1)
        const tracks = [];

        // Calculate ticks per quarter note (standard is 480)
        const ticksPerQuarterNote = 480;
        const ticksPerRow = ticksPerQuarterNote / 4; // 16th note resolution

        // Track 0: Tempo track
        const tempoTrack = [];
        tempoTrack.push(0x00); // Delta time
        tempoTrack.push(0xFF, 0x51, 0x03); // Set Tempo meta event
        const microsecondsPerQuarter = Math.floor(60000000 / this.engine.bpm);
        tempoTrack.push((microsecondsPerQuarter >> 16) & 0xFF);
        tempoTrack.push((microsecondsPerQuarter >> 8) & 0xFF);
        tempoTrack.push(microsecondsPerQuarter & 0xFF);
        tempoTrack.push(0x00); // Delta time
        tempoTrack.push(0xFF, 0x2F, 0x00); // End of track
        tracks.push(tempoTrack);

        // Convert each sequencer track to MIDI track
        for (let track = 0; track < this.engine.pattern.tracks; track++) {
            const midiTrack = [];
            const events = [];

            // Get device and channel for this track
            const trackDeviceBinding = this.engine.trackDeviceBindings[track];
            let midiChannel = 0;

            if (trackDeviceBinding && this.controller.deviceManager) {
                const device = this.controller.deviceManager.getDevice(trackDeviceBinding);
                if (device) {
                    midiChannel = device.midiChannel;
                }
            }

            // Track name
            const trackName = `Track ${track + 1}`;
            midiTrack.push(0x00); // Delta time
            midiTrack.push(0xFF, 0x03); // Track name meta event
            midiTrack.push(trackName.length);
            for (let i = 0; i < trackName.length; i++) {
                midiTrack.push(trackName.charCodeAt(i));
            }

            // Convert pattern to note events
            const activeNotes = new Map(); // row -> midiNote

            for (let row = 0; row < this.engine.pattern.rows; row++) {
                const entry = this.engine.pattern.getEntry(row, track);

                if (entry && !entry.isEmpty()) {
                    const time = row * ticksPerRow;

                    // Note off for previous note
                    if (activeNotes.has(track)) {
                        const prevNote = activeNotes.get(track);
                        events.push({ time, type: 'noteOff', note: prevNote, velocity: 0, channel: midiChannel });
                        activeNotes.delete(track);
                    }

                    if (entry.isNoteOff()) {
                        // Explicit note off
                        continue;
                    }

                    const midiNote = entry.getMidiNote();
                    if (midiNote !== null && midiNote >= 0 && midiNote <= 127) {
                        const velocity = Math.min(127, Math.max(0, entry.volume));
                        events.push({ time, type: 'noteOn', note: midiNote, velocity, channel: midiChannel });
                        activeNotes.set(track, midiNote);
                    }
                }
            }

            // Note off for any remaining active notes
            if (activeNotes.has(track)) {
                const prevNote = activeNotes.get(track);
                const time = this.engine.pattern.rows * ticksPerRow;
                events.push({ time, type: 'noteOff', note: prevNote, velocity: 0, channel: midiChannel });
            }

            // Sort events by time
            events.sort((a, b) => a.time - b.time);

            // Convert events to MIDI bytes with delta times
            let lastTime = 0;
            events.forEach(event => {
                const deltaTime = event.time - lastTime;
                lastTime = event.time;

                // Write variable-length delta time
                this.writeVarLen(midiTrack, deltaTime);

                // Write event
                if (event.type === 'noteOn') {
                    midiTrack.push(0x90 | event.channel, event.note, event.velocity);
                } else if (event.type === 'noteOff') {
                    midiTrack.push(0x80 | event.channel, event.note, event.velocity);
                }
            });

            // End of track
            midiTrack.push(0x00); // Delta time
            midiTrack.push(0xFF, 0x2F, 0x00);

            tracks.push(midiTrack);
        }

        // Build MIDI file
        const midiFile = [];

        // Header chunk
        midiFile.push(0x4D, 0x54, 0x68, 0x64); // "MThd"
        midiFile.push(0x00, 0x00, 0x00, 0x06); // Header length (6 bytes)
        midiFile.push(0x00, 0x01); // Format 1 (multiple tracks)
        midiFile.push((tracks.length >> 8) & 0xFF, tracks.length & 0xFF); // Number of tracks
        midiFile.push((ticksPerQuarterNote >> 8) & 0xFF, ticksPerQuarterNote & 0xFF); // Ticks per quarter note

        // Track chunks
        tracks.forEach(track => {
            midiFile.push(0x4D, 0x54, 0x72, 0x6B); // "MTrk"
            const trackLength = track.length;
            midiFile.push((trackLength >> 24) & 0xFF, (trackLength >> 16) & 0xFF, (trackLength >> 8) & 0xFF, trackLength & 0xFF);
            midiFile.push(...track);
        });

        // Download file
        const blob = new Blob([new Uint8Array(midiFile)], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.mid`;
        a.click();
        URL.revokeObjectURL(url);

        console.log(`[Sequencer] Exported MIDI file: ${a.download}`);
    }

    importMIDI() {
        // Create file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mid,.midi';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result);
                    this.parseMIDIFile(data);
                } catch (err) {
                    console.error('[Sequencer] MIDI import error:', err);
                    alert('Error importing MIDI file: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        });
        input.click();
    }

    parseMIDIFile(data) {
        let pos = 0;

        // Read header
        const header = String.fromCharCode(...data.slice(pos, pos + 4));
        pos += 4;

        if (header !== 'MThd') {
            throw new Error('Not a valid MIDI file (missing MThd header)');
        }

        const headerLength = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
        pos += 4;

        const format = (data[pos] << 8) | data[pos + 1];
        pos += 2;

        const numTracks = (data[pos] << 8) | data[pos + 1];
        pos += 2;

        const ticksPerQuarterNote = (data[pos] << 8) | data[pos + 1];
        pos += 2;

        console.log(`[Sequencer] MIDI Import: Format ${format}, ${numTracks} tracks, ${ticksPerQuarterNote} ticks/quarter`);

        // Ask which track to import
        const targetTrack = parseInt(prompt(`Import to which sequencer track (1-4)?`, '1')) - 1;
        if (targetTrack < 0 || targetTrack > 3) {
            alert('Invalid track number');
            return;
        }

        // Parse tracks
        let midiTrack = 0;
        while (pos < data.length && midiTrack < numTracks) {
            const trackHeader = String.fromCharCode(...data.slice(pos, pos + 4));
            pos += 4;

            if (trackHeader !== 'MTrk') {
                console.warn('[Sequencer] Skipping unknown chunk:', trackHeader);
                continue;
            }

            const trackLength = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
            pos += 4;

            const trackData = data.slice(pos, pos + trackLength);
            pos += trackLength;

            // Skip track 0 (tempo track)
            if (midiTrack === 0) {
                midiTrack++;
                continue;
            }

            // Ask if we want to import this track
            if (confirm(`Import MIDI track ${midiTrack} (sequencer track ${midiTrack})?`)) {
                this.importMIDITrack(trackData, targetTrack, ticksPerQuarterNote);
                break; // Import only one track
            }

            midiTrack++;
        }

        this.updateTrackerGrid();
        console.log(`[Sequencer] MIDI import complete`);
    }

    importMIDITrack(trackData, targetTrack, ticksPerQuarterNote) {
        let pos = 0;
        let time = 0;
        let runningStatus = 0;

        const ticksPerRow = ticksPerQuarterNote / 4; // 16th note resolution
        const noteEvents = [];

        console.log(`[Sequencer] Parsing track data: ${trackData.length} bytes`);

        while (pos < trackData.length) {
            // Read variable-length delta time
            const [deltaTime, newPos] = this.readVarLen(trackData, pos);
            pos = newPos;
            time += deltaTime;

            // Check if we have enough data
            if (pos >= trackData.length) break;

            // Read event
            let status = trackData[pos];

            // Handle running status
            if (status < 0x80) {
                status = runningStatus;
            } else {
                pos++;
                runningStatus = status;
            }

            const messageType = status & 0xF0;

            if (messageType === 0x90 || messageType === 0x80) {
                // Note On/Off
                if (pos + 1 >= trackData.length) break;
                const note = trackData[pos++];
                const velocity = trackData[pos++];

                const row = Math.floor(time / ticksPerRow);

                if (messageType === 0x90 && velocity > 0) {
                    // Note On
                    console.log(`[Sequencer] Note On: ${note} at row ${row}, velocity ${velocity}`);
                    noteEvents.push({ row, note, velocity });
                }
            } else if (messageType >= 0xC0 && messageType <= 0xE0) {
                // Program Change, Channel Pressure (2 bytes total including status)
                if (pos >= trackData.length) break;
                pos++;
            } else if (messageType >= 0x80 && messageType <= 0xB0) {
                // Note Off, Control Change, etc. (3 bytes total including status)
                if (pos + 1 >= trackData.length) break;
                pos += 2;
            } else if (status === 0xFF) {
                // Meta event
                if (pos >= trackData.length) break;
                const metaType = trackData[pos++];
                if (pos >= trackData.length) break;
                const [length, newPos2] = this.readVarLen(trackData, pos);
                pos = newPos2 + length;
            } else if (status === 0xF0 || status === 0xF7) {
                // SysEx
                const [length, newPos2] = this.readVarLen(trackData, pos);
                pos = newPos2 + length;
            }
        }

        // Write notes to sequencer pattern
        noteEvents.forEach(event => {
            if (event.row >= 0 && event.row < this.engine.pattern.rows) {
                const entry = new SequencerEntry();
                const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                entry.note = noteNames[event.note % 12];
                entry.octave = Math.floor(event.note / 12);
                entry.volume = event.velocity;
                entry.program = this.engine.trackPrograms[targetTrack] || 0;
                this.engine.pattern.setEntry(event.row, targetTrack, entry);
            }
        });

        console.log(`[Sequencer] Imported ${noteEvents.length} notes to track ${targetTrack + 1}`);
    }

    readVarLen(data, pos) {
        // Read variable-length quantity (MIDI standard)
        let value = 0;
        let byte;

        do {
            byte = data[pos++];
            value = (value << 7) | (byte & 0x7F);
        } while (byte & 0x80);

        return [value, pos];
    }

    writeVarLen(array, value) {
        // Write variable-length quantity (MIDI standard)
        const buffer = [];
        buffer.push(value & 0x7F);
        value >>= 7;

        while (value > 0) {
            buffer.push((value & 0x7F) | 0x80);
            value >>= 7;
        }

        // Write in reverse order
        for (let i = buffer.length - 1; i >= 0; i--) {
            array.push(buffer[i]);
        }
    }

    destroy() {
        this.engine.stopPlayback();
        if (this.positionUpdateInterval) {
            clearInterval(this.positionUpdateInterval);
        }
        document.removeEventListener('keydown', this.handleKeyDown);

        // Remove global BPM listener
        const globalBpmInput = document.getElementById('clock-bpm');
        if (globalBpmInput && this.globalBpmListener) {
            globalBpmInput.removeEventListener('change', this.globalBpmListener);
        }
    }

    toJSON() {
        return {
            id: this.sceneId,
            type: this.type,
            name: this.name,
            enabled: this.enabled,
            engine: this.engine.toJSON()
        };
    }
}
