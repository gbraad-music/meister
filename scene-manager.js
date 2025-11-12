/**
 * Scene Manager for Meister
 * Handles switching between different layout views (Pads, Mixer, etc.)
 */

import './fader-components.js';
import './effects-fader.js';
import { InputAction, InputEvent } from './input-actions.js';

export class SceneManager {
    constructor(controller) {
        this.controller = controller;
        this.currentScene = 'pads';
        this.scenes = new Map();

        // Register default scenes
        this.registerDefaultScenes();

        // Setup gesture controls and quick selector
        this.setupGestureControls();
        this.setupQuickSelector();

        // Setup orientation change listener for responsive split scenes
        this.setupOrientationListener();
    }

    setupOrientationListener() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            // Debounce resize events
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const scene = this.scenes.get(this.currentScene);
                // Only re-render if current scene is a split scene
                if (scene && scene.type === 'split' && scene.render) {
                    console.log('[SceneManager] Orientation changed, re-rendering split scene');
                    scene.render();
                }
            }, 100);
        });
    }

    /**
     * Register default scene configurations
     * loadSaved: if true, skip registering mixer if it's saved in localStorage
     */
    registerDefaultScenes(loadSaved = false) {
        // Only register default pads scene if not loading a saved one
        if (!loadSaved || !this.scenes.has('pads')) {
            // Preserve custom name if scene was already loaded from storage
            const existingPads = this.scenes.get('pads');
            const customName = existingPads?.name;

            // Pads scene (always available - grid layout)
            // Use controller's gridLayout to match what createPads() uses
            this.scenes.set('pads', {
                name: customName || 'Pads',
                type: 'grid',
                layout: this.controller.config.gridLayout || '4x4',
                enabled: true, // Can be disabled by user
                pollDevices: [], // Empty = uses global polling by default
                pollInterval: null, // null = uses global polling by default
                render: () => this.renderPadsScene()
            });
        }

        // Only register default mixer if we're not loading a saved one
        if (!loadSaved || !this.scenes.has('mixer')) {
            // Preserve custom name if scene was already loaded from storage
            const existingMixer = this.scenes.get('mixer');
            const customName = existingMixer?.name;

            // Mixer scene - customizable layout with 2 rows
            this.scenes.set('mixer', {
                name: customName || 'Mixer',
                type: 'slider',
                enabled: true, // Can be disabled by user
                rows: 2,
                columnsPerRow: 8,
                pollDevices: [0], // Poll these device IDs (will be updated dynamically)
                pollInterval: 250, // Default polling interval
                slots: [
                    // Row 1 - Channels
                    { type: 'CHANNEL', channel: 0, label: 'CH1', deviceBinding: null },
                    { type: 'CHANNEL', channel: 1, label: 'CH2', deviceBinding: null },
                    { type: 'CHANNEL', channel: 2, label: 'CH3', deviceBinding: null },
                    { type: 'CHANNEL', channel: 3, label: 'CH4', deviceBinding: null },
                    { type: 'EMPTY' },
                    { type: 'DIVIDER', label: '' },
                    { type: 'EMPTY' },
                    { type: 'TEMPO', label: 'BPM', deviceBinding: null },

                    // Row 2 - Master controls
                    { type: 'MIX', label: 'Master', deviceBinding: null },
                    { type: 'INPUT', label: 'Input', deviceBinding: null },
                    { type: 'EMPTY' },
                    { type: 'EMPTY' },
                    { type: 'EMPTY' },
                    { type: 'EMPTY' },
                    { type: 'EMPTY' },
                    { type: 'EMPTY' }
                ],
                // Backward compatibility: keep columns property
                columns: [],
                render: () => this.renderSliderScene('mixer')
            });
        }

        // Preserve custom name if scene was already loaded from storage
        const existingEffects = this.scenes.get('effects');
        const effectsName = existingEffects?.name;

        // Effects scene (default - always available)
        this.scenes.set('effects', {
            name: effectsName || 'Effects',
            type: 'effects',
            enabled: true, // Can be disabled by user
            pollDevices: [0], // Poll device 0 for effects state (default)
            pollInterval: 250, // Poll effects state every 250ms
            deviceBinding: null, // Device binding (null = use first available)
            programId: 0, // Program ID (0 for Regroove, 0-31 for Samplecrate pads)
            render: () => this.renderEffectsScene('effects')
        });

        // Preserve custom name if scene was already loaded from storage
        const existingPiano = this.scenes.get('piano');
        const pianoName = existingPiano?.name;

        // Piano scene (default - always available)
        this.scenes.set('piano', {
            name: pianoName || 'Piano',
            type: 'piano',
            enabled: true, // Can be disabled by user
            octave: 3, // Start at octave 3 (C3 = MIDI note 48)
            midiChannel: 0, // MIDI channel (0-15)
            program: -1, // Program change (-1 = no program change, 0-127 = program)
            deviceBinding: null, // Device binding (null = use default output)
            render: () => this.renderPianoScene('piano')
        });

    }

    /**
     * Add a custom scene configuration
     *
     * Example - Two devices in one scene:
     * sceneManager.addScene('dual-mixer', {
     *   name: 'Dual Mixer',
     *   type: 'slider',
     *   rows: 2,
     *   columns: [
     *     // Row 1: Device A (e.g., Regroove)
     *     { type: 'MIX', label: 'Device A', deviceBinding: 'device-a' },
     *     { type: 'CHANNEL', channel: 0, deviceBinding: 'device-a' },
     *     { type: 'CHANNEL', channel: 1, deviceBinding: 'device-a' },
     *     // ... more channels
     *     // Row 2: Device B (e.g., another synth)
     *     { type: 'MIX', label: 'Device B', deviceBinding: 'device-b' },
     *     { type: 'CHANNEL', channel: 0, deviceBinding: 'device-b' },
     *     { type: 'CHANNEL', channel: 1, deviceBinding: 'device-b' },
     *     // ... more channels
     *     { type: 'TEMPO' }
     *   ]
     * });
     */
    addScene(id, config) {
        // Allow editing all scenes, including built-in ones

        const scene = {
            name: config.name,
            type: config.type || 'grid', // 'grid', 'slider', 'effects', 'piano', or 'split'
            enabled: config.enabled !== undefined ? config.enabled : true, // Enabled by default
            render: null
        };

        if (config.type === 'grid') {
            scene.layout = config.layout || '4x4';
            scene.pollDevices = config.pollDevices || []; // Optional - uses global polling if empty
            scene.pollInterval = config.pollInterval || null; // Optional - uses global polling if null
            scene.render = () => this.renderPadsScene(id);
        } else if (config.type === 'slider') {
            scene.rows = config.rows || 1;
            scene.columnsPerRow = config.columnsPerRow;
            scene.slots = config.slots || [];
            scene.columns = config.columns || []; // Backward compatibility
            scene.pollDevices = config.pollDevices || [];
            scene.pollInterval = config.pollInterval || 250;
            scene.render = () => this.renderSliderScene(id);
        } else if (config.type === 'split') {
            scene.padLayout = config.padLayout || '2x4'; // Grid size for pads (e.g., 2x4, 3x3)
            scene.padSide = config.padSide || 'left'; // 'left' or 'right'
            scene.pads = config.pads || []; // Pad configurations
            scene.slots = config.slots || []; // Fader configurations (4-5 faders)
            scene.pollDevices = config.pollDevices || [];
            scene.pollInterval = config.pollInterval || 250;
            scene.render = () => this.renderSplitScene(id);
        } else if (config.type === 'effects') {
            scene.deviceBinding = config.deviceBinding || null;
            scene.programId = config.programId !== undefined ? config.programId : 0;
            scene.pollDevices = config.pollDevices || [];
            scene.pollInterval = config.pollInterval || 250;
            scene.render = () => this.renderEffectsScene(id);
        } else if (config.type === 'piano') {
            scene.octave = config.octave !== undefined ? config.octave : 3;
            scene.midiChannel = config.midiChannel !== undefined ? config.midiChannel : 0;
            scene.program = config.program !== undefined ? config.program : -1;
            scene.deviceBinding = config.deviceBinding || null;
            scene.render = () => this.renderPianoScene(id);
        }

        this.scenes.set(id, scene);
        // console.log(`[Scene] Added scene: ${config.name} (${config.type}), polling: ${scene.pollDevices?.length || 0} devices @ ${scene.pollInterval || 'global'}ms`);
    }

    /**
     * Switch to a different scene
     */
    switchScene(sceneName) {
        const scene = this.scenes.get(sceneName);
        if (!scene) {
            console.error(`Scene "${sceneName}" not found`);
            return;
        }

        // console.log(`[Scene] Switching to: ${scene.name}`);
        this.currentScene = sceneName;

        // Close any open editor overlays
        document.getElementById('scene-editor-overlay')?.classList.remove('active');
        document.getElementById('effects-scene-editor-overlay')?.classList.remove('active');
        document.getElementById('pad-scene-editor-overlay')?.classList.remove('active');

        // Stop polling for previous scene
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

        // Render the scene
        scene.render();

        // Resolve device IDs from bindings at runtime (so they update when device IDs change)
        const resolvedDeviceIds = this.resolveSceneDeviceIds(scene);

        // Start polling if this scene has devices to poll
        if (resolvedDeviceIds.length > 0 && scene.pollInterval) {
            // Stop global polling to avoid duplicate requests
            // console.log(`[Scene] Using scene-specific polling (${scene.pollInterval}ms), stopping global polling`);
            if (this.controller.regrooveState) {
                this.controller.regrooveState.stopPolling();
            }
            this.startDevicePolling(resolvedDeviceIds, scene.pollInterval);
        } else {
            // No scene-specific polling - restart global polling
            // console.log(`[Scene] No scene-specific polling, using global polling (${this.controller.regrooveState?.pollingIntervalMs || 500}ms)`);
            if (this.controller.regrooveState && this.controller.midiOutput) {
                this.controller.startStatePolling();
            }
        }

        // Update scene selector if it exists
        this.updateSceneSelector();
    }

    /**
     * Resolve device IDs from scene configuration at runtime
     * This ensures device IDs update when reassigned in device manager
     */
    resolveSceneDeviceIds(scene) {
        const deviceIds = [];

        if (!this.controller.deviceManager) {
            return deviceIds;
        }

        // For effects/piano scenes with deviceBinding
        if (scene.deviceBinding) {
            const device = this.controller.deviceManager.getDevice(scene.deviceBinding);
            if (device) {
                deviceIds.push(device.deviceId);
            }
        }

        // For slider scenes with slots containing device bindings
        if (scene.slots) {
            const uniqueDeviceIds = new Set();
            scene.slots.forEach(slot => {
                if (slot && slot.deviceBinding) {
                    const device = this.controller.deviceManager.getDevice(slot.deviceBinding);
                    if (device) {
                        uniqueDeviceIds.add(device.deviceId);
                    }
                }
            });
            deviceIds.push(...Array.from(uniqueDeviceIds));
        }

        // Fallback to pollDevices if no bindings resolved (backward compat)
        if (deviceIds.length === 0 && scene.pollDevices) {
            return scene.pollDevices;
        }

        return deviceIds;
    }

    /**
     * Render pads scene (existing grid)
     */
    renderPadsScene(sceneId = 'pads') {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Get scene config
        const scene = this.scenes.get(sceneId);
        const isBuiltIn = sceneId === 'pads';

        // Get layout from scene, fallback to config
        const layout = scene?.layout || this.controller.config.gridLayout || '4x4';
        const [cols, rows] = layout.split('x').map(Number);

        // Clear container first
        container.innerHTML = '';

        // Reset ALL container styles (split/slider scenes set flex properties)
        container.removeAttribute('style');
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        container.style.gap = '10px';
        container.style.padding = '10px 10px 4px 10px';
        container.style.height = 'calc(100vh - 60px)';

        // For built-in 'pads' scene, use global config pads
        // For custom scenes, use scene's own pads array (or empty if not set)
        if (isBuiltIn) {
            // Sync the scene's layout to controller config so createPads uses correct layout
            if (scene && scene.layout) {
                this.controller.config.gridLayout = scene.layout;
            }
            this.controller.createPads();
        } else {
            // Custom pad scene - create empty pads or use scene's pads
            const totalPads = cols * rows;
            const scenePads = scene?.pads || [];

            // Store current scene ID so pad editor knows which scene to save to
            this.controller.currentPadSceneId = sceneId;

            for (let i = 0; i < totalPads; i++) {
                const padConfig = scenePads[i] || { label: '', cc: null, note: null, mmc: null, sysex: null };
                const pad = this.controller.createSinglePad(i, padConfig);
                container.appendChild(pad);
            }

            // Store reference to scene pads
            this.controller.pads = scenePads;
        }
    }

    /**
     * Render slider scene (mixer, custom fader layouts)
     */
    renderSliderScene(sceneId) {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        const scene = this.scenes.get(sceneId);
        if (!scene) return;

        // Use slots if available, fallback to columns for backward compatibility
        const items = scene.slots || scene.columns || [];
        const rows = scene.rows || 1;
        const columnsPerRow = scene.columnsPerRow || Math.ceil(items.length / rows);

        // Clear grid and switch to fader layout
        container.style.display = 'flex';
        container.style.flexDirection = rows > 1 ? 'column' : 'row';
        container.style.gap = rows > 1 ? '20px' : '20px';
        container.style.padding = '10px';
        container.style.justifyContent = 'space-evenly';
        container.style.alignItems = 'stretch';
        container.style.height = 'calc(100vh - 60px)';
        container.innerHTML = '';

        // For multi-row layouts, create rows
        if (rows > 1) {
            for (let r = 0; r < rows; r++) {
                const rowContainer = document.createElement('div');
                rowContainer.style.display = 'flex';
                rowContainer.style.flexDirection = 'row';
                rowContainer.style.gap = '20px';
                rowContainer.style.justifyContent = 'space-evenly';
                rowContainer.style.alignItems = 'stretch';
                rowContainer.style.flex = '1';
                rowContainer.style.minHeight = '0'; // Important for flex children

                const startIdx = r * columnsPerRow;
                const endIdx = Math.min(startIdx + columnsPerRow, items.length);
                const rowItems = items.slice(startIdx, endIdx);

                rowItems.forEach(item => {
                    const fader = this.createFader(item);
                    if (fader) rowContainer.appendChild(fader);
                });

                container.appendChild(rowContainer);
            }

            // Apply current device state to faders after rendering
            this.applyCurrentDeviceStates();
            return;
        }

        // Single row layout - create faders directly
        items.forEach(item => {
            const fader = this.createFader(item);
            if (fader) container.appendChild(fader);
        });

        // Apply current device state to faders after rendering
        this.applyCurrentDeviceStates();
    }

    /**
     * Render split scene (pads on one side, sliders on the other)
     * Responsive: side-by-side in landscape, stacked in portrait
     */
    renderSplitScene(sceneId) {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        const scene = this.scenes.get(sceneId);
        if (!scene) return;

        // Detect orientation: portrait (taller) vs landscape (wider)
        const isPortrait = window.innerHeight > window.innerWidth;

        // Clear and setup container for split layout
        container.style.display = 'flex';
        container.style.flexDirection = isPortrait ? 'column' : 'row';
        container.style.gap = '10px';
        container.style.padding = '10px';
        container.style.height = 'calc(100vh - 60px)';
        container.innerHTML = '';

        // Get pad layout dimensions
        const [cols, rows] = (scene.padLayout || '4x4').split('x').map(Number);
        const totalPads = cols * rows;

        // Create pads container
        const padsContainer = document.createElement('div');
        padsContainer.style.display = 'grid';
        padsContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        padsContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        padsContainer.style.gap = '10px';

        // In portrait mode: pads take up proportional space based on grid size
        // In landscape mode: 50/50 split
        if (isPortrait) {
            padsContainer.style.flex = '1'; // Let pads take natural space
        } else {
            padsContainer.style.flex = '0 0 50%'; // 50/50 split with faders
        }
        padsContainer.style.minWidth = '0';
        padsContainer.style.minHeight = '0';

        // Store current scene ID so pad editor knows which scene to save to
        this.controller.currentPadSceneId = sceneId;

        // Create pads
        const scenePads = scene.pads || [];
        for (let i = 0; i < totalPads; i++) {
            const padConfig = scenePads[i] || null; // Use null for truly empty pads
            const pad = this.controller.createSinglePad(i, padConfig);
            padsContainer.appendChild(pad);
        }

        // Store reference to scene pads array (expand to full size with nulls)
        while (scenePads.length < totalPads) {
            scenePads.push(null);
        }
        this.controller.pads = scenePads;

        // Create faders container
        const fadersContainer = document.createElement('div');
        fadersContainer.style.display = 'flex';
        fadersContainer.style.flexDirection = 'row';
        fadersContainer.style.gap = '20px';
        fadersContainer.style.justifyContent = 'space-evenly';
        fadersContainer.style.alignItems = 'stretch';
        fadersContainer.style.flex = '1';
        fadersContainer.style.minWidth = '0';
        fadersContainer.style.minHeight = '0';

        // Create faders (4-5 typically)
        const slots = scene.slots || [];
        slots.forEach(slot => {
            const fader = this.createFader(slot);
            if (fader) fadersContainer.appendChild(fader);
        });

        // In portrait mode: always pads at top, faders at bottom
        // In landscape mode: use padSide setting (left/right)
        if (isPortrait) {
            container.appendChild(padsContainer);
            container.appendChild(fadersContainer);
        } else {
            // Landscape: respect padSide setting
            if (scene.padSide === 'right') {
                container.appendChild(fadersContainer);
                container.appendChild(padsContainer);
            } else {
                container.appendChild(padsContainer);
                container.appendChild(fadersContainer);
            }
        }

        // Apply current device state to faders after rendering
        this.applyCurrentDeviceStates();
    }

    /**
     * Render effects scene (effects control panel)
     */
    renderEffectsScene(sceneId = 'effects') {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Clear grid and switch to effects layout
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.padding = '10px';
        container.style.justifyContent = 'flex-start';
        container.style.alignItems = 'stretch';
        container.style.height = 'calc(100vh - 60px)';
        container.style.overflow = 'hidden';
        container.innerHTML = '';

        // Get scene and resolve device binding
        const scene = this.scenes.get(sceneId);
        if (!scene) {
            console.error(`[Effects] Scene "${sceneId}" not found`);
            return;
        }
        const currentBinding = scene.deviceBinding;

        // Resolve device from binding
        let device = null;
        if (currentBinding && this.controller.deviceManager) {
            device = this.controller.deviceManager.getDevice(currentBinding);
        }

        // If no device found and we have a device manager, get first available device
        if (!device && this.controller.deviceManager) {
            const devices = this.controller.deviceManager.getAllDevices();
            if (devices.length > 0) {
                device = devices[0]; // Use first available device
                scene.deviceBinding = device.id; // Update binding
                scene.pollDevices = [device.deviceId];
            }
        }

        // Create device info header (display only)
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.gap = '10px';
        header.style.alignItems = 'center';
        header.style.padding = '8px 12px';
        header.style.background = '#1a1a1a';
        header.style.borderRadius = '4px';
        header.style.flexShrink = '0';

        // Device name display
        const deviceLabel = document.createElement('div');
        deviceLabel.style.color = '#aaa';
        deviceLabel.style.fontSize = '1em';
        deviceLabel.style.fontWeight = 'bold';
        deviceLabel.style.textTransform = 'uppercase';
        deviceLabel.style.letterSpacing = '0.5px';
        deviceLabel.style.flex = '1';

        if (device) {
            deviceLabel.textContent = `${device.name} (CH ${device.midiChannel + 1} / ID ${device.deviceId})`;
        } else {
            deviceLabel.textContent = 'NO DEVICE ASSIGNED';
            deviceLabel.style.color = '#666';
        }

        // Program ID display
        const programLabel = document.createElement('div');
        programLabel.style.color = '#666';
        programLabel.style.fontSize = '0.9em';
        programLabel.style.fontWeight = 'bold';
        programLabel.style.textTransform = 'uppercase';
        programLabel.style.letterSpacing = '0.5px';
        programLabel.style.padding = '8px 16px';
        programLabel.style.background = '#0a0a0a';
        programLabel.style.borderRadius = '4px';
        // Display: 0 = "Regroove", 1-30 (wire) = "Program 2-31" (user-facing)
        const programId = scene.programId || 0;
        programLabel.textContent = programId === 0 ? 'REGROOVE' : `PROGRAM ${programId + 1}`;

        header.appendChild(deviceLabel);
        header.appendChild(programLabel);
        container.appendChild(header);

        // Create effects container
        const effectsContainer = document.createElement('div');
        effectsContainer.style.display = 'flex';
        effectsContainer.style.flexDirection = 'row';
        effectsContainer.style.gap = '10px';
        effectsContainer.style.justifyContent = 'center';
        effectsContainer.style.alignItems = 'stretch';
        effectsContainer.style.flex = '1';
        effectsContainer.style.minHeight = '0';
        effectsContainer.style.overflow = 'hidden';

        // Effect definitions with default values from REGROOVE_EFFECTS.md
        const effects = [
            {
                id: 0x00,
                name: 'DISTORTION',
                params: [
                    { name: 'Drive', default: 64 },
                    { name: 'Mix', default: 64 }
                ]
            },
            {
                id: 0x01,
                name: 'FILTER',
                params: [
                    { name: 'Cutoff', default: 127 },
                    { name: 'Resonance', default: 0 }
                ]
            },
            {
                id: 0x02,
                name: 'EQ',
                params: [
                    { name: 'Low', default: 64 },
                    { name: 'Mid', default: 64 },
                    { name: 'High', default: 64 }
                ]
            },
            {
                id: 0x03,
                name: 'COMPRESSOR',
                params: [
                    { name: 'Threshold', default: 64 },
                    { name: 'Ratio', default: 32 },
                    { name: 'Attack', default: 64 },
                    { name: 'Release', default: 64 },
                    { name: 'Makeup', default: 64 }
                ]
            },
            {
                id: 0x04,
                name: 'DELAY',
                params: [
                    { name: 'Time', default: 32 },
                    { name: 'Feedback', default: 32 },
                    { name: 'Mix', default: 32 }
                ]
            }
        ];

        // Create effect groups
        effects.forEach(effect => {
            const group = this.createEffectGroup(effect);
            effectsContainer.appendChild(group);
        });

        container.appendChild(effectsContainer);

        // Request current effects state if we have a device
        if (device) {
            const programId = scene.programId || 0;
            this.controller.sendSysExFxGetAllState(device.deviceId, programId);
        }
    }

    /**
     * Create an effect group (enable button + sliders)
     */
    createEffectGroup(effect) {
        const group = document.createElement('div');
        group.className = 'effect-group';
        group.dataset.effectId = effect.id;
        group.style.display = 'flex';
        group.style.flexDirection = 'column';
        group.style.gap = '8px';
        group.style.padding = '8px';
        group.style.background = 'transparent';
        group.style.borderRadius = '4px';
        group.style.minWidth = 'min-content';
        group.style.flex = '0 0 auto'; // Only take space needed, not equal distribution
        group.style.maxWidth = '100%'; // Don't exceed container width

        // Effect name header
        const header = document.createElement('div');
        header.textContent = effect.name;
        header.style.color = '#aaa';
        header.style.fontSize = '0.75em';
        header.style.fontWeight = 'bold';
        header.style.textAlign = 'center';
        header.style.letterSpacing = '1px';
        header.style.marginBottom = '10px';
        header.style.padding = '6px';
        header.style.background = '#1a1a1a';
        header.style.borderRadius = '4px';
        group.appendChild(header);

        // Enable button - match mixer fader button style
        const enableRow = document.createElement('div');
        enableRow.style.display = 'flex';
        enableRow.style.gap = '10px';
        enableRow.style.justifyContent = 'center';
        enableRow.style.marginBottom = '12px';

        const enableBtn = document.createElement('button');
        enableBtn.textContent = 'FX';
        enableBtn.className = 'fx-enable-btn';
        enableBtn.dataset.effectId = effect.id;
        enableBtn.style.width = '60px';
        enableBtn.style.minHeight = '44px';
        enableBtn.style.padding = '12px';
        enableBtn.style.margin = '0 auto';
        enableBtn.style.background = '#2a2a2a';
        enableBtn.style.color = '#aaa';
        enableBtn.style.border = 'none';
        enableBtn.style.borderRadius = '4px';
        enableBtn.style.cursor = 'pointer';
        enableBtn.style.fontSize = '1em';
        enableBtn.style.fontWeight = 'bold';
        enableBtn.style.textTransform = 'uppercase';
        enableBtn.style.transition = 'all 0.15s';

        enableBtn.addEventListener('click', () => {
            const isEnabled = enableBtn.classList.contains('active');
            this.handleEffectEnable(effect.id, !isEnabled);
        });

        enableRow.appendChild(enableBtn);
        group.appendChild(enableRow);

        // Sliders row
        const slidersRow = document.createElement('div');
        slidersRow.style.display = 'flex';
        slidersRow.style.gap = '10px';
        slidersRow.style.flex = '1';
        slidersRow.style.alignItems = 'stretch';
        slidersRow.style.minHeight = '0';

        effect.params.forEach((param, index) => {
            const fader = document.createElement('effects-fader');
            fader.setAttribute('label', param.name);
            fader.setAttribute('value', param.default);
            fader.setAttribute('default', param.default);
            fader.dataset.effectId = effect.id;
            fader.dataset.paramIndex = index;

            fader.addEventListener('change', (e) => {
                this.handleEffectParameterChange(effect.id, index, e.detail.value);
            });

            fader.addEventListener('reset', (e) => {
                this.handleEffectParameterChange(effect.id, index, e.detail.value);
            });

            slidersRow.appendChild(fader);
        });

        group.appendChild(slidersRow);

        return group;
    }

    /**
     * Handle effect enable/disable
     */
    handleEffectEnable(effectId, enabled) {
        // Get device from current effects scene
        const scene = this.scenes.get(this.currentScene);
        if (!scene || scene.type !== 'effects') {
            console.warn('[Effects] Current scene is not an effects scene');
            return;
        }

        if (!scene.deviceBinding || !this.controller.deviceManager) {
            console.warn('[Effects] No device bound to effects scene');
            return;
        }

        const device = this.controller.deviceManager.getDevice(scene.deviceBinding);
        if (!device) {
            console.warn('[Effects] Device binding not found:', scene.deviceBinding);
            return;
        }

        const deviceId = device.deviceId;
        const programId = scene.programId || 0;

        // Get current parameter values from UI
        const params = this.getEffectParams(effectId);

        console.log(`[Dev${deviceId} Prog${programId} Effects] ${enabled ? 'Enabling' : 'Disabling'} effect ${effectId} with params:`, params);
        console.log(`[Dev${deviceId}] Sending SysEx 0x71: F0 7D ${deviceId.toString(16).padStart(2, '0')} 71 ${programId.toString(16).padStart(2, '0')} ${effectId.toString(16).padStart(2, '0')} ${enabled ? '01' : '00'} ${params.map(p => p.toString(16).padStart(2, '0')).join(' ')} F7`);

        // Send SysEx command
        this.controller.sendSysExFxEffectSet(deviceId, programId, effectId, enabled, ...params);

        // Update UI - match mixer FX button style
        const enableBtn = document.querySelector(`.fx-enable-btn[data-effect-id="${effectId}"]`);
        if (enableBtn) {
            if (enabled) {
                enableBtn.classList.add('active');
                enableBtn.style.background = '#ccaa44';
                enableBtn.style.color = '#fff';
            } else {
                enableBtn.classList.remove('active');
                enableBtn.style.background = '#2a2a2a';
                enableBtn.style.color = '#aaa';
            }
        }
    }

    /**
     * Handle effect parameter change
     */
    handleEffectParameterChange(effectId, paramIndex, value) {
        // Get device from current effects scene
        const scene = this.scenes.get(this.currentScene);
        if (!scene || scene.type !== 'effects') {
            console.warn('[Effects] Current scene is not an effects scene');
            return;
        }

        if (!scene.deviceBinding || !this.controller.deviceManager) {
            console.warn('[Effects] No device bound to effects scene');
            return;
        }

        const device = this.controller.deviceManager.getDevice(scene.deviceBinding);
        if (!device) {
            console.warn('[Effects] Device binding not found:', scene.deviceBinding);
            return;
        }

        const deviceId = device.deviceId;
        const programId = scene.programId || 0;

        // Get all current parameter values from UI
        const params = this.getEffectParams(effectId);
        params[paramIndex] = value;

        // Get current enable state from button
        const enableBtn = document.querySelector(`.fx-enable-btn[data-effect-id="${effectId}"]`);
        const enabled = enableBtn ? enableBtn.classList.contains('active') : false;

        console.log(`[Dev${deviceId} Effects] Setting effect ${effectId} param ${paramIndex} = ${value}, enabled=${enabled}, params:`, params);

        // Send SysEx command
        this.controller.sendSysExFxEffectSet(deviceId, programId, effectId, enabled, ...params);
    }

    /**
     * Get current effect parameter values from UI
     */
    getEffectParams(effectId) {
        const faders = document.querySelectorAll(`effects-fader[data-effect-id="${effectId}"]`);
        const params = [];
        faders.forEach(fader => {
            params.push(parseInt(fader.getAttribute('value') || 64));
        });
        return params;
    }

    /**
     * Apply current device states to all faders
     */
    applyCurrentDeviceStates() {
        if (!this.controller.regrooveState) return;

        // Get all device IDs that have state
        const deviceIds = this.controller.regrooveState.getAllDeviceIds();

        // Update faders for each device
        deviceIds.forEach(deviceId => {
            const state = this.controller.regrooveState.getDeviceState(deviceId);
            if (state) {
                this.updateMixerFromDeviceState(deviceId, state);
            }
        });
    }

    /**
     * Resolve device binding to device config
     */
    resolveDeviceBinding(deviceBinding) {
        const deviceManager = this.controller.deviceManager;
        if (!deviceManager) {
            return { deviceId: 0, midiChannel: 0 };
        }

        // If no binding specified, use default device
        const device = deviceBinding
            ? deviceManager.getDevice(deviceBinding)
            : deviceManager.getDefaultDevice();

        if (device) {
            return {
                deviceId: device.deviceId,
                midiChannel: device.midiChannel
            };
        }

        // Fallback
        return { deviceId: 0, midiChannel: 0 };
    }

    /**
     * Create a fader element based on column configuration
     */
    createFader(column) {
        let fader;

        // Handle null/undefined columns (empty slots)
        if (!column || column.type === 'EMPTY') {
            // Empty placeholder
            fader = document.createElement('div');
            fader.style.width = '80px';
            fader.style.margin = '0';
            return fader;
        }

        if (column.type === 'DIVIDER') {
            // Visual divider
            fader = document.createElement('div');
            fader.style.width = '2px';
            fader.style.background = 'var(--border-color, #333)';
            fader.style.margin = '10px 0';
            fader.style.alignSelf = 'stretch';
            if (column.label) {
                fader.title = column.label;
            }
            return fader;
        }

        // Resolve device binding to actual device config
        const deviceConfig = this.resolveDeviceBinding(column.deviceBinding);

        // Get device name for label
        let deviceName = '';
        if (column.deviceBinding && this.controller.deviceManager) {
            const device = this.controller.deviceManager.getDevice(column.deviceBinding);
            if (device) {
                deviceName = device.name;
            }
        }

        if (column.type === 'MIX') {
                fader = document.createElement('mix-fader');
                // Include device name in label
                const label = deviceName ? `${column.label}\n${deviceName}` : column.label;
                fader.setAttribute('label', label);
                fader.setAttribute('volume', '100');
                fader.setAttribute('pan', '0');
                fader.setAttribute('fx', 'false');
                fader.setAttribute('muted', 'false');
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';

                // Event listeners for mix fader
                fader.addEventListener('fx-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Mix] FX Toggle:`, e.detail.enabled);
                    // MASTER fader: toggle between 1 (master) and 0 (off)
                    const route = e.detail.enabled ? 1 : 0;
                    this.handleFxRouting(deviceId, route);
                });

                fader.addEventListener('pan-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // Convert from -100..100 to 0..127 (64 = center)
                    const panValue = Math.round(((e.detail.value + 100) / 200) * 127);
                    // console.log(`[Dev${deviceId} Mix] Pan: ${e.detail.value} -> ${panValue}`);
                    this.handleMasterPan(deviceId, panValue);
                });

                fader.addEventListener('volume-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Mix] Volume:`, e.detail.value);
                    this.handleMasterVolume(deviceId, e.detail.value);
                });

                fader.addEventListener('mute-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Mix] Mute:`, e.detail.muted);
                    this.handleMasterMute(deviceId, e.detail.muted);
                });

            } else if (column.type === 'CHANNEL') {
                fader = document.createElement('channel-fader');
                fader.setAttribute('channel', column.channel);
                // Store device name for display
                if (deviceName) {
                    fader.dataset.deviceName = deviceName;
                }
                fader.setAttribute('volume', '100');
                fader.setAttribute('pan', '0');
                fader.setAttribute('solo', 'false');
                fader.setAttribute('muted', 'false');
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';

                // Sync with Regroove player state
                if (this.controller.playerState) {
                    const isMuted = this.controller.playerState.mutedChannels.includes(column.channel);
                    fader.setAttribute('muted', isMuted.toString());
                }

                // Event listeners for channel fader
                fader.addEventListener('solo-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} CH${e.detail.channel}] Solo:`, e.detail.solo);
                    this.handleChannelSolo(deviceId, e.detail.channel, e.detail.solo);
                });

                fader.addEventListener('pan-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // Convert from -100..100 to 0..127 (64 = center)
                    const panValue = Math.round(((e.detail.value + 100) / 200) * 127);
                    // console.log(`[Dev${deviceId} CH${e.detail.channel}] Pan: ${e.detail.value} -> ${panValue}`);
                    this.handleChannelPan(deviceId, e.detail.channel, panValue);
                });

                fader.addEventListener('volume-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} CH${e.detail.channel}] Volume:`, e.detail.value);
                    this.handleChannelVolume(deviceId, e.detail.channel, e.detail.value);
                });

                fader.addEventListener('mute-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} CH${e.detail.channel}] Mute:`, e.detail.muted);
                    this.handleChannelMute(deviceId, e.detail.channel, e.detail.muted);
                });

            } else if (column.type === 'INPUT') {
                // Input fader (similar to MIX but for input channel)
                fader = document.createElement('mix-fader');
                // Include device name in label
                const inputLabel = deviceName ? `${column.label || 'Input'}\n${deviceName}` : (column.label || 'Input');
                fader.setAttribute('label', inputLabel);
                fader.setAttribute('volume', '100');
                fader.setAttribute('pan', '0');
                fader.setAttribute('fx', 'false');
                fader.setAttribute('muted', 'false');
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';
                fader.dataset.inputFader = 'true'; // Mark as input fader

                // Event listeners for input fader
                fader.addEventListener('fx-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Input] FX Toggle:`, e.detail.enabled);
                    // INPUT fader: toggle between 3 (input) and 0 (off)
                    const route = e.detail.enabled ? 3 : 0;
                    this.handleFxRouting(deviceId, route);
                });

                fader.addEventListener('pan-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // Convert from -100..100 to 0..127 (64 = center)
                    const panValue = Math.round(((e.detail.value + 100) / 200) * 127);
                    // console.log(`[Dev${deviceId} Input] Pan: ${e.detail.value} -> ${panValue}`);
                    this.handleInputPan(deviceId, panValue);
                });

                fader.addEventListener('volume-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Input] Volume:`, e.detail.value);
                    this.handleInputVolume(deviceId, e.detail.value);
                });

                fader.addEventListener('mute-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Input] Mute:`, e.detail.muted);
                    this.handleInputMute(deviceId, e.detail.muted);
                });

            } else if (column.type === 'TEMPO') {
                fader = document.createElement('tempo-fader');
                fader.setAttribute('bpm', this.controller.config.bpm || '120');
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';

                // Event listeners for tempo fader
                fader.addEventListener('tempo-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Tempo] BPM:`, e.detail.bpm);
                    this.handleTempoChange(deviceId, e.detail.bpm);
                });

                fader.addEventListener('tempo-reset', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Tempo] Reset to 125`);
                    this.handleTempoChange(deviceId, 125);
                });

            } else if (column.type === 'STEREO') {
                fader = document.createElement('stereo-fader');
                fader.setAttribute('separation', '64'); // Default to 64 (≈100 = normal)
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';

                // Event listeners for stereo fader
                fader.addEventListener('separation-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    const percent = Math.round((e.detail.separation / 127) * 200);
                    // console.log(`[Dev${deviceId} Stereo] Separation: ${e.detail.separation} (${percent}%)`);
                    this.handleStereoChange(deviceId, e.detail.separation);
                });

                fader.addEventListener('separation-reset', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} Stereo] Reset to 64 (100%)`);
                    this.handleStereoChange(deviceId, 64);
                });

            } else if (column.type === 'PROGRAM') {
                // Samplecrate program fader
                fader = document.createElement('program-fader');
                fader.setAttribute('program', column.program || '0');
                fader.setAttribute('label', column.label || `PROG ${column.program || 0}`);
                fader.setAttribute('volume', '100');
                fader.setAttribute('pan', '0');
                fader.setAttribute('fx', 'false');
                fader.setAttribute('muted', 'false');
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';

                // Event listeners for program fader
                fader.addEventListener('fx-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} PROG${e.detail.program}] FX Toggle:`, e.detail.enabled);
                    this.handleProgramFxEnable(deviceId, e.detail.program, e.detail.enabled);
                });

                fader.addEventListener('pan-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // Convert from -100..100 to 0..127 (64 = center)
                    const panValue = Math.round(((e.detail.value + 100) / 200) * 127);
                    // console.log(`[Dev${deviceId} PROG${e.detail.program}] Pan: ${e.detail.value} -> ${panValue}`);
                    this.handleProgramPan(deviceId, e.detail.program, panValue);
                });

                fader.addEventListener('volume-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} PROG${e.detail.program}] Volume:`, e.detail.value);
                    this.handleProgramVolume(deviceId, e.detail.program, e.detail.value);
                });

                fader.addEventListener('mute-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    // console.log(`[Dev${deviceId} PROG${e.detail.program}] Mute:`, e.detail.muted);
                    this.handleProgramMute(deviceId, e.detail.program, e.detail.muted);
                });
        }

        return fader;
    }

    /**
     * Handle channel mute
     */
    handleChannelMute(deviceId, channel, muted) {
        // Send SysEx CHANNEL_MUTE (0x30) command
        // Note: We send the SET command directly (not toggle) since the fader tells us the state
        if (this.controller.sendSysExChannelMute) {
            this.controller.sendSysExChannelMute(deviceId, channel, muted ? 1 : 0);
        } else {
            // Fallback to CC for compatibility
            if (this.controller.sendRegrooveCC) {
                this.controller.sendRegrooveCC(48 + channel, 127, deviceId);
            } else {
                this.controller.sendCC(48 + channel, 127);
            }
        }
    }

    /**
     * Handle channel solo
     */
    handleChannelSolo(deviceId, channel, solo) {
        // Use the SAME method as pads - it works!
        const newSoloState = this.controller.toggleChannelSoloState(deviceId, channel);

        // Send SysEx CHANNEL_SOLO (0x31) command with the new state
        if (this.controller.sendSysExChannelSolo) {
            this.controller.sendSysExChannelSolo(deviceId, channel, newSoloState ? 1 : 0);
        } else {
            // Fallback to CC for compatibility
            if (this.controller.sendRegrooveCC) {
                this.controller.sendRegrooveCC(32 + channel, 127, deviceId);
            } else {
                this.controller.sendCC(32 + channel, 127);
            }
        }
    }

    /**
     * Handle channel volume
     */
    handleChannelVolume(deviceId, channel, volume) {
        // Send SysEx CHANNEL_VOLUME (0x32) command
        // volume: 0-127 value from the fader
        // console.log(`[Dev${deviceId}] Sending CH${channel} volume=${volume} via SysEx 0x32`);
        if (this.controller.sendSysExChannelVolume) {
            this.controller.sendSysExChannelVolume(deviceId, channel, volume);
        } else {
            console.warn(`[Dev${deviceId}] Channel volume SysEx command not available`);
        }
    }

    /**
     * Handle master volume
     */
    handleMasterVolume(deviceId, volume) {
        // Send SysEx MASTER_VOLUME (0x33) command
        // console.log(`[Dev${deviceId}] Sending Master volume=${volume} via SysEx 0x33`);
        if (this.controller.sendSysExMasterVolume) {
            this.controller.sendSysExMasterVolume(deviceId, volume);
        } else {
            console.warn(`[Dev${deviceId}] Master volume SysEx command not available`);
        }
    }

    /**
     * Handle master mute
     */
    handleMasterMute(deviceId, muted) {
        // Send SysEx MASTER_MUTE (0x34) command
        if (this.controller.sendSysExMasterMute) {
            this.controller.sendSysExMasterMute(deviceId, muted ? 1 : 0);
        } else {
            console.warn(`[Dev${deviceId}] Master mute SysEx command not available`);
        }
    }

    /**
     * Handle input volume
     */
    handleInputVolume(deviceId, volume) {
        // Send SysEx INPUT_VOLUME (0x35) command
        // console.log(`[Dev${deviceId}] Sending Input volume=${volume} via SysEx 0x35`);
        if (this.controller.sendSysExInputVolume) {
            this.controller.sendSysExInputVolume(deviceId, volume);
        } else {
            console.warn(`[Dev${deviceId}] Input volume SysEx command not available`);
        }
    }

    /**
     * Handle input mute
     */
    handleInputMute(deviceId, muted) {
        // Send SysEx INPUT_MUTE (0x36) command
        if (this.controller.sendSysExInputMute) {
            this.controller.sendSysExInputMute(deviceId, muted ? 1 : 0);
        } else {
            console.warn(`[Dev${deviceId}] Input mute SysEx command not available`);
        }
    }

    /**
     * Handle channel panning
     */
    handleChannelPan(deviceId, channel, pan) {
        // Send SysEx CHANNEL_PANNING (0x58) command
        // pan: 0-127 value (0=left, 64=center, 127=right)
        // console.log(`[Dev${deviceId}] Sending CH${channel} pan=${pan} via SysEx 0x58`);
        if (this.controller.sendSysExChannelPanning) {
            this.controller.sendSysExChannelPanning(deviceId, channel, pan);
        } else {
            console.warn(`[Dev${deviceId}] Channel panning SysEx command not available`);
        }
    }

    /**
     * Handle master panning
     */
    handleMasterPan(deviceId, pan) {
        // Send SysEx MASTER_PANNING (0x59) command
        // console.log(`[Dev${deviceId}] Sending Master pan=${pan} via SysEx 0x59`);
        if (this.controller.sendSysExMasterPanning) {
            this.controller.sendSysExMasterPanning(deviceId, pan);
        } else {
            console.warn(`[Dev${deviceId}] Master panning SysEx command not available`);
        }
    }

    /**
     * Handle input panning
     */
    handleInputPan(deviceId, pan) {
        // Send SysEx INPUT_PANNING (0x5A) command
        // console.log(`[Dev${deviceId}] Sending Input pan=${pan} via SysEx 0x5A`);
        if (this.controller.sendSysExInputPanning) {
            this.controller.sendSysExInputPanning(deviceId, pan);
        } else {
            console.warn(`[Dev${deviceId}] Input panning SysEx command not available`);
        }
    }

    /**
     * Handle FX routing
     * FX routing is mutex: 0=none, 1=master, 2=playback, 3=input
     * Each fader sets its own route or turns off
     */
    handleFxRouting(deviceId, route) {
        // Send SysEx FX_SET_ROUTE (0x37) command
        if (this.controller.sendSysExFxSetRoute) {
            this.controller.sendSysExFxSetRoute(deviceId, route);
        } else {
            console.warn(`[Dev${deviceId}] FX routing SysEx command not available`);
        }
    }

    /**
     * Handle tempo change
     */
    handleTempoChange(deviceId, bpm) {
        // Send SysEx SET_TEMPO (0x42) command
        // console.log(`[Dev${deviceId}] Sending Tempo BPM=${bpm} via SysEx 0x42`);
        if (this.controller.sendSysExSetTempo) {
            this.controller.sendSysExSetTempo(deviceId, bpm);
        } else {
            console.warn(`[Dev${deviceId}] Tempo SysEx command not available`);
            // Fallback to old clock-based method
            if (this.controller.setBPM) {
                this.controller.setBPM(bpm);
            } else {
                this.controller.clockBPM = bpm;
                this.controller.config.bpm = bpm;

                // Restart clock if running
                if (this.controller.clockMaster) {
                    this.controller.stopClock();
                    this.controller.startClock();
                }
            }
        }
    }

    /**
     * Handle stereo separation change
     */
    handleStereoChange(deviceId, separation) {
        // Send SysEx STEREO_SEPARATION (0x57) command
        const percent = Math.round((separation / 127) * 200);
        // console.log(`[Dev${deviceId}] Sending Stereo Separation=${separation} (${percent}%) via SysEx 0x57`);
        if (this.controller.sendSysExStereoSeparation) {
            this.controller.sendSysExStereoSeparation(deviceId, separation);
        } else {
            console.warn(`[Dev${deviceId}] Stereo separation SysEx command not available`);
        }
    }

    /**
     * Handle program volume (Samplecrate)
     */
    handleProgramVolume(deviceId, program, volume) {
        // Send SysEx CHANNEL_VOLUME (0x32) command
        // For Samplecrate: program = program_id (0-31), volume = 0-127
        // console.log(`[Dev${deviceId}] Sending PROG${program} volume=${volume} via SysEx 0x32`);
        if (this.controller.sendSysExChannelVolume) {
            this.controller.sendSysExChannelVolume(deviceId, program, volume);
        } else {
            console.warn(`[Dev${deviceId}] Program volume SysEx command not available`);
        }
    }

    /**
     * Handle program panning (Samplecrate)
     */
    handleProgramPan(deviceId, program, pan) {
        // Send SysEx CHANNEL_PANNING (0x58) command
        // For Samplecrate: program = program_id (0-31), pan = 0-127
        // console.log(`[Dev${deviceId}] Sending PROG${program} pan=${pan} via SysEx 0x58`);
        if (this.controller.sendSysExChannelPanning) {
            this.controller.sendSysExChannelPanning(deviceId, program, pan);
        } else {
            console.warn(`[Dev${deviceId}] Program panning SysEx command not available`);
        }
    }

    /**
     * Handle program mute (Samplecrate)
     */
    handleProgramMute(deviceId, program, muted) {
        // Send SysEx CHANNEL_MUTE (0x30) command
        // For Samplecrate: program = program_id (0-31), muted = 0/1
        if (this.controller.sendSysExChannelMute) {
            this.controller.sendSysExChannelMute(deviceId, program, muted ? 1 : 0);
        } else {
            console.warn(`[Dev${deviceId}] Program mute SysEx command not available`);
        }
    }

    /**
     * Handle program FX enable (Samplecrate)
     */
    handleProgramFxEnable(deviceId, program, enabled) {
        // Send SysEx CHANNEL_FX_ENABLE (0x38) command
        // For Samplecrate: program = program_id (0-31), enabled = 0/1
        // console.log(`[Dev${deviceId}] Sending PROG${program} FX=${enabled ? 'ON' : 'OFF'} via SysEx 0x38`);
        if (this.controller.sendSysExChannelFxEnable) {
            this.controller.sendSysExChannelFxEnable(deviceId, program, enabled ? 1 : 0);
        } else {
            console.warn(`[Dev${deviceId}] Program FX enable SysEx command not available`);
        }
    }

    /**
     * Update scene selector UI
     */
    updateSceneSelector() {
        const selector = document.getElementById('scene-selector');
        if (!selector) return;

        // Get current scene
        const scene = this.scenes.get(this.currentScene);
        if (scene) {
            // Set button text to current scene name
            selector.textContent = scene.name;
        }
    }

    /**
     * Get all available scenes
     */
    getScenes(includeDisabled = false) {
        return Array.from(this.scenes.entries())
            .filter(([id, scene]) => includeDisabled || scene.enabled !== false)
            .map(([id, scene]) => ({
                id,
                name: scene.name,
                type: scene.type,
                enabled: scene.enabled !== false
            }));
    }

    /**
     * Get the first enabled scene ID
     */
    getFirstEnabledScene() {
        const enabledScenes = this.getScenes(false); // Only enabled scenes
        return enabledScenes.length > 0 ? enabledScenes[0].id : null;
    }

    /**
     * Switch to first enabled scene if current scene is disabled
     */
    switchToFirstEnabledIfNeeded() {
        const currentScene = this.scenes.get(this.currentScene);

        // If current scene is disabled or doesn't exist, switch to first enabled
        if (!currentScene || currentScene.enabled === false) {
            const firstEnabled = this.getFirstEnabledScene();
            if (firstEnabled) {
                console.log(`[SceneManager] Current scene disabled, switching to ${firstEnabled}`);
                this.switchScene(firstEnabled);
            } else {
                console.warn('[SceneManager] No enabled scenes found!');
            }
        }
    }

    /**
     * Update mixer faders from device state
     */
    updateMixerFromDeviceState(deviceId, deviceState) {
        const scene = this.scenes.get(this.currentScene);
        if (!scene || scene.type !== 'slider') return;

        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Update MIX and INPUT faders for this device
        const mixFaders = container.querySelectorAll('mix-fader');
        mixFaders.forEach(mixFader => {
            const faderDeviceId = parseInt(mixFader.dataset.deviceId || 0);
            if (faderDeviceId !== deviceId) return;

            // Check if user is currently changing the volume
            if (mixFader.dataset.volumeChanging === 'true') {
                return; // Skip update while user is adjusting volume
            }

            const isInputFader = mixFader.dataset.inputFader === 'true';

            if (isInputFader) {
                // Update INPUT fader
                if (deviceState.inputVolume !== undefined) {
                    mixFader.setAttribute('volume', deviceState.inputVolume.toString());
                }
                if (deviceState.inputMute !== undefined) {
                    mixFader.setAttribute('muted', deviceState.inputMute ? 'true' : 'false');
                }
                if (deviceState.inputPan !== undefined) {
                    // Convert from 0..127 to -100..100 (64 = center = 0)
                    const panValue = Math.round(((deviceState.inputPan / 127) * 200) - 100);
                    mixFader.setAttribute('pan', panValue.toString());
                }
                // Update FX routing state - INPUT fader: yellow if route=3, red if route=1/2, off if route=0
                if (deviceState.fxRouting !== undefined) {
                    let fxState = 'false';
                    if (deviceState.fxRouting === 3) {
                        fxState = 'active'; // Yellow - enabled for input
                    } else if (deviceState.fxRouting !== 0) {
                        fxState = 'warning'; // Red - enabled elsewhere
                    }
                    mixFader.setAttribute('fx', fxState);
                    mixFader.dataset.fxRoute = deviceState.fxRouting.toString();
                }
            } else {
                // Update MASTER/MIX fader
                if (deviceState.masterVolume !== undefined) {
                    mixFader.setAttribute('volume', deviceState.masterVolume.toString());
                    mixFader.setAttribute('muted', deviceState.masterMute ? 'true' : 'false');
                }
                if (deviceState.masterPan !== undefined) {
                    // Convert from 0..127 to -100..100 (64 = center = 0)
                    const panValue = Math.round(((deviceState.masterPan / 127) * 200) - 100);
                    mixFader.setAttribute('pan', panValue.toString());
                }
                // Update FX routing state - MASTER fader: yellow if route=1, red if route=2/3, off if route=0
                if (deviceState.fxRouting !== undefined) {
                    let fxState = 'false';
                    if (deviceState.fxRouting === 1) {
                        fxState = 'active'; // Yellow - enabled for master
                    } else if (deviceState.fxRouting !== 0) {
                        fxState = 'warning'; // Red - enabled elsewhere
                    }
                    mixFader.setAttribute('fx', fxState);
                    // Store the current route for toggle logic
                    mixFader.dataset.fxRoute = deviceState.fxRouting.toString();
                }
            }
        });

        // Update CHANNEL faders for this device
        const channelFaders = container.querySelectorAll('channel-fader');
        channelFaders.forEach(fader => {
            const faderDeviceId = parseInt(fader.dataset.deviceId || 0);
            if (faderDeviceId !== deviceId) return; // Skip faders for other devices

            // Check if user is currently changing the volume
            if (fader.dataset.volumeChanging === 'true') {
                return; // Skip update while user is adjusting volume
            }

            const channel = parseInt(fader.getAttribute('channel'));

            // Update mute state
            const isMuted = deviceState.mutedChannels.includes(channel);
            fader.setAttribute('muted', isMuted.toString());

            // Update solo state - INFER from mute state like pads do
            const isSoloed = this.controller.isChannelSolo(channel, deviceState);
            fader.setAttribute('solo', isSoloed.toString());

            // Update volume if available
            if (deviceState.channelVolumes && deviceState.channelVolumes[channel] !== undefined) {
                fader.setAttribute('volume', deviceState.channelVolumes[channel].toString());
            }

            // Update pan if available
            if (deviceState.channelPans && deviceState.channelPans[channel] !== undefined) {
                // Convert from 0..127 to -100..100 (64 = center = 0)
                const panValue = Math.round(((deviceState.channelPans[channel] / 127) * 200) - 100);
                fader.setAttribute('pan', panValue.toString());
            }
        });

        // Update TEMPO faders for this device
        const tempoFaders = container.querySelectorAll('tempo-fader');
        tempoFaders.forEach(fader => {
            const faderDeviceId = parseInt(fader.dataset.deviceId || 0);
            if (faderDeviceId !== deviceId) return; // Skip faders for other devices

            // Check if user is currently changing the tempo
            if (fader.dataset.tempoChanging === 'true') {
                return; // Skip update while user is adjusting tempo
            }

            // Update BPM from device state
            if (deviceState.bpm !== undefined) {
                fader.setAttribute('bpm', deviceState.bpm.toString());
            }
        });

        // Update STEREO faders for this device
        const stereoFaders = container.querySelectorAll('stereo-fader');
        stereoFaders.forEach(fader => {
            const faderDeviceId = parseInt(fader.dataset.deviceId || 0);
            if (faderDeviceId !== deviceId) return; // Skip faders for other devices

            // Check if user is currently changing the separation
            if (fader.dataset.separationChanging === 'true') {
                return; // Skip update while user is adjusting separation
            }

            // Update stereo separation from device state
            if (deviceState.stereoSeparation !== undefined) {
                fader.setAttribute('separation', deviceState.stereoSeparation.toString());
            }
        });

        // Update PROGRAM faders for this device (Samplecrate)
        const programFaders = container.querySelectorAll('program-fader');
        programFaders.forEach(fader => {
            const faderDeviceId = parseInt(fader.dataset.deviceId || 0);
            if (faderDeviceId !== deviceId) return; // Skip faders for other devices

            // Check if user is currently changing the volume
            if (fader.dataset.volumeChanging === 'true') {
                return; // Skip update while user is adjusting volume
            }

            const program = parseInt(fader.getAttribute('program'));

            // Update mute state (Samplecrate stores program mutes similar to channel mutes)
            if (deviceState.mutedChannels) {
                const isMuted = deviceState.mutedChannels.includes(program);
                fader.setAttribute('muted', isMuted.toString());
            }

            // Update FX enable state (Samplecrate per-program FX)
            if (deviceState.programFxEnabled && deviceState.programFxEnabled[program] !== undefined) {
                fader.setAttribute('fx', deviceState.programFxEnabled[program] ? 'true' : 'false');
            }

            // Update volume if available
            if (deviceState.channelVolumes && deviceState.channelVolumes[program] !== undefined) {
                fader.setAttribute('volume', deviceState.channelVolumes[program].toString());
            }

            // Update pan if available
            if (deviceState.channelPans && deviceState.channelPans[program] !== undefined) {
                // Convert from 0..127 to -100..100 (64 = center = 0)
                const panValue = Math.round(((deviceState.channelPans[program] / 127) * 200) - 100);
                fader.setAttribute('pan', panValue.toString());
            }
        });
    }

    /**
     * Update mixer faders from player state (backward compat)
     */
    updateMixerFromState() {
        if (this.currentScene !== 'mixer') return;
        if (!this.controller.playerState) return;

        const deviceId = this.controller.playerState.deviceId || 0;
        this.updateMixerFromDeviceState(deviceId, this.controller.playerState);
    }

    /**
     * Update effects UI from device state
     */
    updateEffectsFromDeviceState(deviceId, deviceState) {
        const scene = this.scenes.get(this.currentScene);
        if (!scene || scene.type !== 'effects') return;

        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Get FX state for the current scene's program ID
        const programId = scene.programId || 0;
        const fxState = deviceState.fxStates?.[programId];

        // Check if we have effects state for this program
        if (!fxState || !fxState.effects) return;

        // console.log(`[Effects] Updating UI from device ${deviceId} program ${programId} state:`, fxState);

        // Map effect IDs to effect names
        const effectMap = {
            0x00: 'distortion',
            0x01: 'filter',
            0x02: 'eq',
            0x03: 'compressor',
            0x04: 'delay'
        };

        // Update each effect group
        for (const [effectId, effectName] of Object.entries(effectMap)) {
            const effect = fxState.effects[effectName];
            if (!effect) continue;

            const effectIdNum = parseInt(effectId);

            // Update enable button - match mixer FX button style
            const enableBtn = container.querySelector(`.fx-enable-btn[data-effect-id="${effectIdNum}"]`);
            if (enableBtn) {
                if (effect.enabled) {
                    enableBtn.classList.add('active');
                    enableBtn.style.background = '#ccaa44';
                    enableBtn.style.color = '#fff';
                } else {
                    enableBtn.classList.remove('active');
                    enableBtn.style.background = '#2a2a2a';
                    enableBtn.style.color = '#aaa';
                }
            }

            // Update parameter sliders
            const faders = container.querySelectorAll(`effects-fader[data-effect-id="${effectIdNum}"]`);
            faders.forEach((fader, paramIndex) => {
                // Check if user is currently changing this parameter
                if (fader.dataset.paramChanging === 'true') {
                    return; // Skip update while user is adjusting parameter
                }

                const params = Object.keys(effect).filter(k => k !== 'enabled');
                const paramName = params[paramIndex];
                if (paramName && effect[paramName] !== undefined) {
                    fader.setAttribute('value', effect[paramName].toString());
                }
            });
        }
    }

    /**
     * Setup swipe gesture controls for scene switching
     * DISABLED - Gestures removed to prevent interference with interactive elements
     */
    setupGestureControls() {
        // Gesture detection disabled - use quick selector button in status bar instead
    }

    /**
     * Setup quick scene selector
     */
    setupQuickSelector() {
        this.refreshQuickSelector();
    }

    /**
     * Toggle quick selector visibility
     */
    toggleQuickSelector() {
        const selector = document.getElementById('scene-quick-selector');
        if (selector) {
            selector.classList.toggle('active');
            if (selector.classList.contains('active')) {
                this.refreshQuickSelector();
            }
        }
    }

    /**
     * Refresh quick selector content
     */
    refreshQuickSelector() {
        const container = document.getElementById('scene-quick-list');
        if (!container) return;

        const scenes = this.getScenes();
        const currentScene = this.currentScene;

        container.innerHTML = scenes.map(scene => {
            let typeLabel = 'Slider';
            if (scene.type === 'grid') typeLabel = 'Grid';
            else if (scene.type === 'effects') typeLabel = 'Effects';

            return `
                <div class="scene-quick-item ${scene.id === currentScene ? 'active' : ''}"
                     data-scene-id="${scene.id}">
                    <div class="scene-quick-item-name">${scene.name}</div>
                    <div class="scene-quick-item-type">${typeLabel}</div>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.scene-quick-item').forEach(item => {
            item.addEventListener('click', () => {
                const sceneId = item.getAttribute('data-scene-id');
                this.switchScene(sceneId);
                this.toggleQuickSelector();
            });
        });
    }

    /**
     * Start polling devices for player state
     */
    startDevicePolling(deviceIds, intervalMs) {
        if (!Array.isArray(deviceIds) || deviceIds.length === 0) return;

        const scene = this.scenes.get(this.currentScene);
        // console.log(`[Scene] Starting polling for devices [${deviceIds.join(', ')}] every ${intervalMs}ms`);

        // Request state immediately for all devices
        deviceIds.forEach(deviceId => {
            this.requestPlayerState(deviceId);
            // Also request FX state for effects scenes
            if (scene && scene.type === 'effects') {
                this.requestFxState(deviceId, scene.programId || 0);
            }
        });

        // Then poll at interval
        this.pollInterval = setInterval(() => {
            deviceIds.forEach(deviceId => {
                this.requestPlayerState(deviceId);
                // Also request FX state for effects scenes
                if (scene && scene.type === 'effects') {
                    this.requestFxState(deviceId, scene.programId || 0);
                }
            });
        }, intervalMs);
    }

    /**
     * Request player state from device via SysEx
     */
    requestPlayerState(deviceId) {
        if (!this.controller.midiOutput) return;

        // SysEx: F0 7D <device_id> 60 F7
        // 0x60 = SYSEX_CMD_GET_PLAYER_STATE
        const sysex = [0xF0, 0x7D, deviceId, 0x60, 0xF7];
        this.controller.midiOutput.send(sysex);
    }

    /**
     * Request FX state from device via SysEx
     */
    requestFxState(deviceId, programId) {
        if (!this.controller.midiOutput) return;

        // Commented out to reduce console spam - uncomment for debugging
        // console.log(`[Scene] Requesting FX state for device ${deviceId} program ${programId}`);

        // Use controller's sendSysExFxGetAllState method
        this.controller.sendSysExFxGetAllState(deviceId, programId);
    }

    /**
     * Render piano keyboard scene
     */
    renderPianoScene(sceneId = 'piano') {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Clear and setup container
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.padding = '10px';
        container.style.justifyContent = 'flex-start';
        container.style.alignItems = 'center';
        container.style.height = 'calc(100vh - 60px)';
        container.style.overflow = 'hidden';
        container.innerHTML = '';

        // Get scene
        const scene = this.scenes.get(sceneId);
        if (!scene) {
            console.error(`[Piano] Scene "${sceneId}" not found`);
            return;
        }

        // Create header with octave controls
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.gap = '10px';
        header.style.alignItems = 'center';
        header.style.padding = '8px 12px';
        header.style.background = '#1a1a1a';
        header.style.borderRadius = '4px';
        header.style.flexShrink = '0';
        header.style.width = '100%';

        // Octave down button
        const octaveDownBtn = document.createElement('button');
        octaveDownBtn.textContent = 'OCT -';
        octaveDownBtn.style.padding = '8px 16px';
        octaveDownBtn.style.background = '#2a2a2a';
        octaveDownBtn.style.color = '#aaa';
        octaveDownBtn.style.border = '1px solid #333';
        octaveDownBtn.style.borderRadius = '4px';
        octaveDownBtn.style.cursor = 'pointer';
        octaveDownBtn.style.fontSize = '0.9em';
        octaveDownBtn.style.fontWeight = 'bold';
        octaveDownBtn.addEventListener('click', () => {
            if (scene.octave > 0) {
                scene.octave--;
                this.renderPianoScene(sceneId);
            }
        });

        // Octave label
        const octaveLabel = document.createElement('div');
        octaveLabel.style.color = '#666';
        octaveLabel.style.fontSize = '0.9em';
        octaveLabel.style.fontWeight = 'bold';
        octaveLabel.style.padding = '8px 16px';
        octaveLabel.style.background = '#0a0a0a';
        octaveLabel.style.borderRadius = '4px';
        octaveLabel.style.minWidth = '100px';
        octaveLabel.style.textAlign = 'center';
        octaveLabel.textContent = `OCT ${scene.octave}`;

        // Octave up button
        const octaveUpBtn = document.createElement('button');
        octaveUpBtn.textContent = 'OCT +';
        octaveUpBtn.style.padding = '8px 16px';
        octaveUpBtn.style.background = '#2a2a2a';
        octaveUpBtn.style.color = '#aaa';
        octaveUpBtn.style.border = '1px solid #333';
        octaveUpBtn.style.borderRadius = '4px';
        octaveUpBtn.style.cursor = 'pointer';
        octaveUpBtn.style.fontSize = '0.9em';
        octaveUpBtn.style.fontWeight = 'bold';
        octaveUpBtn.addEventListener('click', () => {
            if (scene.octave < 8) {
                scene.octave++;
                this.renderPianoScene(sceneId);
            }
        });

        // Device and channel info
        const deviceLabel = document.createElement('div');
        deviceLabel.style.color = '#666';
        deviceLabel.style.fontSize = '0.9em';
        deviceLabel.style.fontWeight = 'bold';
        deviceLabel.style.padding = '8px 16px';
        deviceLabel.style.background = '#0a0a0a';
        deviceLabel.style.borderRadius = '4px';

        // Resolve device from binding
        let device = null;
        if (scene.deviceBinding && this.controller.deviceManager) {
            device = this.controller.deviceManager.getDevice(scene.deviceBinding);
        }

        if (device) {
            deviceLabel.textContent = `${device.name} (CH ${scene.midiChannel + 1} / ID ${device.deviceId})`;
        } else {
            deviceLabel.textContent = `DEFAULT (CH ${scene.midiChannel + 1})`;
        }

        // Program down button
        const programDownBtn = document.createElement('button');
        programDownBtn.textContent = 'PROG -';
        programDownBtn.style.padding = '8px 16px';
        programDownBtn.style.background = '#2a2a2a';
        programDownBtn.style.color = '#aaa';
        programDownBtn.style.border = '1px solid #333';
        programDownBtn.style.borderRadius = '4px';
        programDownBtn.style.cursor = 'pointer';
        programDownBtn.style.fontSize = '0.9em';
        programDownBtn.style.fontWeight = 'bold';
        programDownBtn.addEventListener('click', () => {
            if (scene.program > -1) {
                scene.program--;
                if (scene.program >= 0) {
                    this.sendProgramChange(scene.midiChannel, scene.program);
                }
                this.renderPianoScene(sceneId);
            }
        });

        // Program label
        const programLabel = document.createElement('div');
        programLabel.style.color = '#666';
        programLabel.style.fontSize = '0.9em';
        programLabel.style.fontWeight = 'bold';
        programLabel.style.padding = '8px 16px';
        programLabel.style.background = '#0a0a0a';
        programLabel.style.borderRadius = '4px';
        programLabel.style.minWidth = '100px';
        programLabel.style.textAlign = 'center';
        programLabel.textContent = scene.program >= 0 ? `PROG ${scene.program + 1}` : 'NO PROG'; // Display as 1-128 (user-facing)

        // Program up button
        const programUpBtn = document.createElement('button');
        programUpBtn.textContent = 'PROG +';
        programUpBtn.style.padding = '8px 16px';
        programUpBtn.style.background = '#2a2a2a';
        programUpBtn.style.color = '#aaa';
        programUpBtn.style.border = '1px solid #333';
        programUpBtn.style.borderRadius = '4px';
        programUpBtn.style.cursor = 'pointer';
        programUpBtn.style.fontSize = '0.9em';
        programUpBtn.style.fontWeight = 'bold';
        programUpBtn.addEventListener('click', () => {
            if (scene.program < 127) {
                scene.program++;
                this.sendProgramChange(scene.midiChannel, scene.program);
                this.renderPianoScene(sceneId);
            }
        });

        header.appendChild(octaveDownBtn);
        header.appendChild(octaveLabel);
        header.appendChild(octaveUpBtn);
        header.appendChild(deviceLabel);
        header.appendChild(programDownBtn);
        header.appendChild(programLabel);
        header.appendChild(programUpBtn);
        container.appendChild(header);

        // Send program change if scene has a program set
        if (scene.program >= 0) {
            this.sendProgramChange(scene.midiChannel, scene.program);
        }

        // Create piano keyboard container
        const keyboardContainer = document.createElement('div');
        keyboardContainer.style.position = 'relative';
        keyboardContainer.style.width = '100%';
        keyboardContainer.style.flex = '1';
        keyboardContainer.style.display = 'flex';
        keyboardContainer.style.alignItems = 'stretch';
        keyboardContainer.style.justifyContent = 'center';
        keyboardContainer.style.padding = '0 10px';
        keyboardContainer.style.minHeight = '0';

        // Detect screen width to determine number of octaves
        const screenWidth = window.innerWidth;
        const numOctaves = screenWidth >= 768 ? 2 : 1; // 2 octaves on tablets/desktops, 1 on phones

        // Create SVG piano keyboard
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const svgWidth = 700 * numOctaves;
        const svgHeight = 600; // Taller viewBox for better vertical fill
        svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.style.width = '100%';
        svg.style.height = '100%';

        // Piano layout: 7 white keys (C, D, E, F, G, A, B) and 5 black keys (C#, D#, F#, G#, A#) per octave
        const whiteKeyWidth = 100;
        const whiteKeyHeight = 580; // Proportionally taller
        const blackKeyWidth = 60;
        const blackKeyHeight = 380; // Proportionally taller
        const keyRadius = 8; // Rounded corner radius

        const whiteKeys = [
            { note: 'C', offset: 0 },
            { note: 'D', offset: 1 },
            { note: 'E', offset: 2 },
            { note: 'F', offset: 3 },
            { note: 'G', offset: 4 },
            { note: 'A', offset: 5 },
            { note: 'B', offset: 6 }
        ];

        const blackKeys = [
            { note: 'C#', offset: 0, position: 70 },  // Between C and D
            { note: 'D#', offset: 1, position: 170 }, // Between D and E
            { note: 'F#', offset: 3, position: 370 }, // Between F and G
            { note: 'G#', offset: 4, position: 470 }, // Between G and A
            { note: 'A#', offset: 5, position: 570 }  // Between A and B
        ];

        // Base MIDI note for this octave (C at octave)
        const baseNote = 12 * scene.octave;

        // Polyphonic note tracking
        const activeNotes = new Set(); // All currently playing notes (for visual feedback)
        const activeTouches = new Map(); // touchId -> noteNumber (for multi-touch)
        let mouseNote = null; // Current note for mouse input

        // Helper function to send note on/off
        const sendNote = (noteNumber, velocity) => {
            if (!this.controller.midiOutput) return;

            const channel = scene.midiChannel || 0;
            const statusByte = velocity > 0 ? (0x90 + channel) : (0x80 + channel);
            this.controller.midiOutput.send([statusByte, noteNumber, velocity]);
        };

        // Helper to calculate velocity from Y position in key
        // Can accept either an Event (with touches) or a Touch object directly
        const calculateVelocity = (eventOrTouch, keyY, keyHeight) => {
            const svgRect = svg.getBoundingClientRect();
            let clientY;

            // Check if it's a Touch object (has clientY directly) or an Event
            if (eventOrTouch.clientY !== undefined) {
                clientY = eventOrTouch.clientY;
            } else if (eventOrTouch.touches && eventOrTouch.touches.length > 0) {
                clientY = eventOrTouch.touches[0].clientY;
            } else {
                clientY = 0; // Fallback
            }

            // Calculate Y position relative to SVG
            const svgY = clientY - svgRect.top;
            const svgHeightPixels = svgRect.height;

            // Convert to viewBox coordinates
            const viewBoxY = (svgY / svgHeightPixels) * svgHeight;

            // Calculate position within the key (0 at top, 1 at bottom)
            const relativeY = (viewBoxY - keyY) / keyHeight;
            const clampedY = Math.max(0, Math.min(1, relativeY));

            // Convert to velocity (0-127), with minimum velocity of 10 to ensure sound
            const velocity = Math.round(10 + (clampedY * 117));
            return Math.max(10, Math.min(127, velocity));
        };

        // Helper to get note number at pointer position
        // Can accept either an Event (with touches) or a Touch object directly
        const getNoteAtPosition = (eventOrTouch) => {
            const svgRect = svg.getBoundingClientRect();
            let clientX, clientY;

            // Check if it's a Touch object (has clientX/Y directly) or an Event
            if (eventOrTouch.clientX !== undefined && eventOrTouch.clientY !== undefined) {
                clientX = eventOrTouch.clientX;
                clientY = eventOrTouch.clientY;
            } else if (eventOrTouch.touches && eventOrTouch.touches.length > 0) {
                clientX = eventOrTouch.touches[0].clientX;
                clientY = eventOrTouch.touches[0].clientY;
            } else {
                return null; // Can't determine position
            }

            // Use elementFromPoint to find which key we're over
            const element = document.elementFromPoint(clientX, clientY);
            if (element && element.dataset && element.dataset.noteNumber) {
                return {
                    noteNumber: parseInt(element.dataset.noteNumber),
                    keyY: parseFloat(element.dataset.keyY),
                    keyHeight: parseFloat(element.dataset.keyHeight),
                    path: element
                };
            }
            return null;
        };

        // Create white keys for each octave
        for (let octaveIndex = 0; octaveIndex < numOctaves; octaveIndex++) {
            const octaveOffset = octaveIndex * 700; // One octave width
            const octaveNoteBase = baseNote + (octaveIndex * 12);

            whiteKeys.forEach(({ note, offset }) => {
                const noteNumber = octaveNoteBase + offset * 2 + (offset >= 3 ? -1 : 0); // Adjust for E-F and B-C half steps
                const x = octaveOffset + (offset * whiteKeyWidth);
                const keyY = 0;

                const keyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                keyGroup.style.cursor = 'pointer';

                // Create path with rounded bottom instead of rect
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const pathData = `M ${x},0 L ${x+whiteKeyWidth},0 L ${x+whiteKeyWidth},${whiteKeyHeight-keyRadius} Q ${x+whiteKeyWidth},${whiteKeyHeight} ${x+whiteKeyWidth-keyRadius},${whiteKeyHeight} L ${x+keyRadius},${whiteKeyHeight} Q ${x},${whiteKeyHeight} ${x},${whiteKeyHeight-keyRadius} Z`;
                path.setAttribute('d', pathData);
                path.setAttribute('fill', '#f0f0f0');
                path.setAttribute('stroke', '#000');
                path.setAttribute('stroke-width', '2');

                // Store data for velocity calculation and sliding
                path.dataset.noteNumber = noteNumber;
                path.dataset.keyY = keyY;
                path.dataset.keyHeight = whiteKeyHeight;
                path.dataset.isWhiteKey = 'true';

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', x + whiteKeyWidth / 2);
                text.setAttribute('y', whiteKeyHeight - 20);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', '#666');
                text.setAttribute('font-size', '14');
                text.setAttribute('font-family', 'Arial, sans-serif');
                text.setAttribute('pointer-events', 'none'); // Don't interfere with path events
                text.textContent = note;

                keyGroup.appendChild(path);
                keyGroup.appendChild(text);

                // Mouse event handlers
                keyGroup.addEventListener('mousedown', (e) => {
                    const velocity = calculateVelocity(e, keyY, whiteKeyHeight);

                    // Release previous mouse note if sliding
                    if (mouseNote !== null && mouseNote !== noteNumber) {
                        const prevPath = svg.querySelector(`[data-note-number="${mouseNote}"]`);
                        // Check if any touch is holding the previous mouse note
                        if (prevPath && !Array.from(activeTouches.values()).includes(mouseNote)) {
                            const isWhite = prevPath.dataset.isWhiteKey === 'true';
                            prevPath.setAttribute('fill', isWhite ? '#f0f0f0' : '#1a1a1a');
                        }
                        activeNotes.delete(mouseNote);
                        sendNote(mouseNote, 0);
                    }

                    mouseNote = noteNumber;
                    activeNotes.add(noteNumber);
                    path.setAttribute('fill', '#cc4444');
                    sendNote(noteNumber, velocity);
                });

                keyGroup.addEventListener('mouseup', () => {
                    if (mouseNote === noteNumber) {
                        activeNotes.delete(noteNumber);
                        // Only clear visual if no touches are holding this note
                        if (!Array.from(activeTouches.values()).includes(noteNumber)) {
                            path.setAttribute('fill', '#f0f0f0');
                        }
                        sendNote(noteNumber, 0);
                        mouseNote = null;
                    }
                });

                // Touch event handlers (polyphonic)
                keyGroup.addEventListener('touchstart', (e) => {
                    e.preventDefault();

                    // Handle each new touch
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const touch = e.changedTouches[i];
                        const touchId = touch.identifier;
                        const velocity = calculateVelocity(touch, keyY, whiteKeyHeight);

                        // Release previous note for this touch if sliding
                        const prevNote = activeTouches.get(touchId);
                        if (prevNote !== undefined && prevNote !== noteNumber) {
                            const prevPath = svg.querySelector(`[data-note-number="${prevNote}"]`);
                            // Check if any OTHER touch (not this one) is holding the previous note
                            const otherTouchHoldingPrev = Array.from(activeTouches.entries()).some(
                                ([id, note]) => id !== touchId && note === prevNote
                            );
                            if (prevPath && !otherTouchHoldingPrev && mouseNote !== prevNote) {
                                const isWhite = prevPath.dataset.isWhiteKey === 'true';
                                prevPath.setAttribute('fill', isWhite ? '#f0f0f0' : '#1a1a1a');
                            }
                            activeNotes.delete(prevNote);
                            sendNote(prevNote, 0);
                        }

                        activeTouches.set(touchId, noteNumber);
                        activeNotes.add(noteNumber);
                        path.setAttribute('fill', '#cc4444');
                        sendNote(noteNumber, velocity);
                    }
                });

                keyGroup.addEventListener('touchend', (e) => {
                    e.preventDefault();

                    // Handle each ended touch
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const touch = e.changedTouches[i];
                        const touchId = touch.identifier;
                        const touchNote = activeTouches.get(touchId);

                        if (touchNote === noteNumber) {
                            activeTouches.delete(touchId);
                            activeNotes.delete(noteNumber);

                            // Only clear visual if no other touches or mouse are holding this note
                            if (!Array.from(activeTouches.values()).includes(noteNumber) && mouseNote !== noteNumber) {
                                path.setAttribute('fill', '#f0f0f0');
                            }
                            sendNote(noteNumber, 0);
                        }
                    }
                });

                svg.appendChild(keyGroup);
            });
        }

        // Create black keys for each octave (render on top)
        for (let octaveIndex = 0; octaveIndex < numOctaves; octaveIndex++) {
            const octaveOffset = octaveIndex * 700; // One octave width
            const octaveNoteBase = baseNote + (octaveIndex * 12);

            blackKeys.forEach(({ note, offset, position }) => {
                const noteNumber = octaveNoteBase + offset * 2 + 1 + (offset >= 3 ? -1 : 0); // Black keys are +1 from their base white key, with E-F adjustment
                const x = octaveOffset + position - blackKeyWidth / 2;
                const keyY = 0;

                const keyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                keyGroup.style.cursor = 'pointer';

                // Create path with rounded bottom instead of rect
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const pathData = `M ${x},0 L ${x+blackKeyWidth},0 L ${x+blackKeyWidth},${blackKeyHeight-keyRadius} Q ${x+blackKeyWidth},${blackKeyHeight} ${x+blackKeyWidth-keyRadius},${blackKeyHeight} L ${x+keyRadius},${blackKeyHeight} Q ${x},${blackKeyHeight} ${x},${blackKeyHeight-keyRadius} Z`;
                path.setAttribute('d', pathData);
                path.setAttribute('fill', '#1a1a1a');
                path.setAttribute('stroke', '#000');
                path.setAttribute('stroke-width', '2');

                // Store data for velocity calculation and sliding
                path.dataset.noteNumber = noteNumber;
                path.dataset.keyY = keyY;
                path.dataset.keyHeight = blackKeyHeight;
                path.dataset.isWhiteKey = 'false';

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', x + blackKeyWidth / 2);
                text.setAttribute('y', blackKeyHeight - 10);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', '#aaa');
                text.setAttribute('font-size', '10');
                text.setAttribute('font-family', 'Arial, sans-serif');
                text.setAttribute('pointer-events', 'none'); // Don't interfere with path events
                text.textContent = note;

                keyGroup.appendChild(path);
                keyGroup.appendChild(text);

                // Mouse event handlers
                keyGroup.addEventListener('mousedown', (e) => {
                    const velocity = calculateVelocity(e, keyY, blackKeyHeight);

                    // Release previous mouse note if sliding
                    if (mouseNote !== null && mouseNote !== noteNumber) {
                        const prevPath = svg.querySelector(`[data-note-number="${mouseNote}"]`);
                        // Check if any touch is holding the previous mouse note
                        if (prevPath && !Array.from(activeTouches.values()).includes(mouseNote)) {
                            const isWhite = prevPath.dataset.isWhiteKey === 'true';
                            prevPath.setAttribute('fill', isWhite ? '#f0f0f0' : '#1a1a1a');
                        }
                        activeNotes.delete(mouseNote);
                        sendNote(mouseNote, 0);
                    }

                    mouseNote = noteNumber;
                    activeNotes.add(noteNumber);
                    path.setAttribute('fill', '#cc4444');
                    sendNote(noteNumber, velocity);
                });

                keyGroup.addEventListener('mouseup', () => {
                    if (mouseNote === noteNumber) {
                        activeNotes.delete(noteNumber);
                        // Only clear visual if no touches are holding this note
                        if (!Array.from(activeTouches.values()).includes(noteNumber)) {
                            path.setAttribute('fill', '#1a1a1a');
                        }
                        sendNote(noteNumber, 0);
                        mouseNote = null;
                    }
                });

                // Touch event handlers (polyphonic)
                keyGroup.addEventListener('touchstart', (e) => {
                    e.preventDefault();

                    // Handle each new touch
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const touch = e.changedTouches[i];
                        const touchId = touch.identifier;
                        const velocity = calculateVelocity(touch, keyY, blackKeyHeight);

                        // Release previous note for this touch if sliding
                        const prevNote = activeTouches.get(touchId);
                        if (prevNote !== undefined && prevNote !== noteNumber) {
                            const prevPath = svg.querySelector(`[data-note-number="${prevNote}"]`);
                            // Check if any OTHER touch (not this one) is holding the previous note
                            const otherTouchHoldingPrev = Array.from(activeTouches.entries()).some(
                                ([id, note]) => id !== touchId && note === prevNote
                            );
                            if (prevPath && !otherTouchHoldingPrev && mouseNote !== prevNote) {
                                const isWhite = prevPath.dataset.isWhiteKey === 'true';
                                prevPath.setAttribute('fill', isWhite ? '#f0f0f0' : '#1a1a1a');
                            }
                            activeNotes.delete(prevNote);
                            sendNote(prevNote, 0);
                        }

                        activeTouches.set(touchId, noteNumber);
                        activeNotes.add(noteNumber);
                        path.setAttribute('fill', '#cc4444');
                        sendNote(noteNumber, velocity);
                    }
                });

                keyGroup.addEventListener('touchend', (e) => {
                    e.preventDefault();

                    // Handle each ended touch
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const touch = e.changedTouches[i];
                        const touchId = touch.identifier;
                        const touchNote = activeTouches.get(touchId);

                        if (touchNote === noteNumber) {
                            activeTouches.delete(touchId);
                            activeNotes.delete(noteNumber);

                            // Only clear visual if no other touches or mouse are holding this note
                            if (!Array.from(activeTouches.values()).includes(noteNumber) && mouseNote !== noteNumber) {
                                path.setAttribute('fill', '#1a1a1a');
                            }
                            sendNote(noteNumber, 0);
                        }
                    }
                });

                svg.appendChild(keyGroup);
            });
        }

        // Global mouse move handler for sliding between keys
        svg.addEventListener('mousemove', (e) => {
            if (mouseNote === null) return;

            const keyInfo = getNoteAtPosition(e);
            if (keyInfo && keyInfo.noteNumber !== mouseNote) {
                // Moved to a different key - slide
                const velocity = calculateVelocity(e, keyInfo.keyY, keyInfo.keyHeight);

                // Release previous mouse note
                const prevPath = svg.querySelector(`[data-note-number="${mouseNote}"]`);
                if (prevPath && !Array.from(activeTouches.values()).includes(mouseNote)) {
                    const isWhite = prevPath.dataset.isWhiteKey === 'true';
                    prevPath.setAttribute('fill', isWhite ? '#f0f0f0' : '#1a1a1a');
                }
                activeNotes.delete(mouseNote);
                sendNote(mouseNote, 0);

                // Play new note
                mouseNote = keyInfo.noteNumber;
                activeNotes.add(keyInfo.noteNumber);
                keyInfo.path.setAttribute('fill', '#cc4444');
                sendNote(keyInfo.noteNumber, velocity);
            }
        });

        // Global touch move handler for sliding between keys (polyphonic)
        svg.addEventListener('touchmove', (e) => {
            e.preventDefault();

            // Handle each active touch
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                const touchId = touch.identifier;
                const prevNote = activeTouches.get(touchId);

                if (prevNote === undefined) continue; // This touch didn't start on a key

                const keyInfo = getNoteAtPosition(touch);
                if (keyInfo && keyInfo.noteNumber !== prevNote) {
                    // This touch moved to a different key - slide
                    const velocity = calculateVelocity(touch, keyInfo.keyY, keyInfo.keyHeight);

                    // Release previous note for this touch
                    const prevPath = svg.querySelector(`[data-note-number="${prevNote}"]`);
                    // Check if any OTHER touch (not this one) is holding the previous note
                    const otherTouchHoldingPrev = Array.from(activeTouches.entries()).some(
                        ([id, note]) => id !== touchId && note === prevNote
                    );
                    if (prevPath && !otherTouchHoldingPrev && mouseNote !== prevNote) {
                        const isWhite = prevPath.dataset.isWhiteKey === 'true';
                        prevPath.setAttribute('fill', isWhite ? '#f0f0f0' : '#1a1a1a');
                    }
                    activeNotes.delete(prevNote);
                    sendNote(prevNote, 0);

                    // Play new note for this touch
                    activeTouches.set(touchId, keyInfo.noteNumber);
                    activeNotes.add(keyInfo.noteNumber);
                    keyInfo.path.setAttribute('fill', '#cc4444');
                    sendNote(keyInfo.noteNumber, velocity);
                }
            }
        }, { passive: false });

        // Global mouse up handler to catch releases outside keys
        document.addEventListener('mouseup', () => {
            if (mouseNote !== null) {
                const prevPath = svg.querySelector(`[data-note-number="${mouseNote}"]`);
                if (prevPath && !Array.from(activeTouches.values()).includes(mouseNote)) {
                    const isWhite = prevPath.dataset.isWhiteKey === 'true';
                    prevPath.setAttribute('fill', isWhite ? '#f0f0f0' : '#1a1a1a');
                }
                activeNotes.delete(mouseNote);
                sendNote(mouseNote, 0);
                mouseNote = null;
            }
        });

        // Global touch end handler to catch releases outside keys
        document.addEventListener('touchend', (e) => {
            // Handle each ended touch
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                const touchNote = activeTouches.get(touchId);

                if (touchNote !== undefined) {
                    activeTouches.delete(touchId);
                    activeNotes.delete(touchNote);

                    const prevPath = svg.querySelector(`[data-note-number="${touchNote}"]`);
                    if (prevPath && !Array.from(activeTouches.values()).includes(touchNote) && mouseNote !== touchNote) {
                        const isWhite = prevPath.dataset.isWhiteKey === 'true';
                        prevPath.setAttribute('fill', isWhite ? '#f0f0f0' : '#1a1a1a');
                    }
                    sendNote(touchNote, 0);
                }
            }
        });

        keyboardContainer.appendChild(svg);
        container.appendChild(keyboardContainer);
    }

    /**
     * Send MIDI program change message
     */
    sendProgramChange(channel, program) {
        if (!this.controller.midiOutput) return;

        // MIDI Program Change: 0xC0-0xCF (channel) + program number (0-127 on wire, 1-128 user-facing)
        const statusByte = 0xC0 + channel;
        this.controller.midiOutput.send([statusByte, program]);
        console.log(`[Piano] Sent Program Change: CH ${channel + 1} -> Program ${program + 1} (wire: ${program})`);
    }
}
