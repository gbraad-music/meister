/**
 * Scene Manager for Meister
 * Handles switching between different layout views (Pads, Mixer, etc.)
 */

import './fader-components.js';
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
    }

    /**
     * Register default scene configurations
     */
    registerDefaultScenes() {
        // Pads scene (always available - grid layout)
        this.scenes.set('pads', {
            name: 'Pads',
            type: 'grid',
            render: () => this.renderPadsScene()
        });

        // Mixer scene - customizable layout with 2 rows
        this.scenes.set('mixer', {
            name: 'Mixer',
            type: 'slider',
            rows: 2,
            columnsPerRow: 8,
            pollDevices: [0], // Poll these device IDs (will be updated dynamically)
            pollInterval: 100,
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
        if (id === 'pads') {
            console.error('Cannot override the default pads scene');
            return;
        }

        const scene = {
            name: config.name,
            type: config.type || 'grid', // 'grid' or 'slider'
            render: null
        };

        if (config.type === 'grid') {
            scene.layout = config.layout || '4x4';
            scene.render = () => this.renderPadsScene();
        } else if (config.type === 'slider') {
            scene.rows = config.rows || 1;
            scene.columns = config.columns || [];
            scene.render = () => this.renderSliderScene(id);
        }

        this.scenes.set(id, scene);
        console.log(`[Scene] Added scene: ${config.name} (${config.type})`);
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

        console.log(`[Scene] Switching to: ${scene.name}`);
        this.currentScene = sceneName;

        // Stop polling for previous scene
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

        // Render the scene
        scene.render();

        // Start polling if this scene has devices to poll
        if (scene.pollDevices && scene.pollDevices.length > 0 && scene.pollInterval) {
            this.startDevicePolling(scene.pollDevices, scene.pollInterval);
        }

        // Update scene selector if it exists
        this.updateSceneSelector();
    }

    /**
     * Render pads scene (existing grid)
     */
    renderPadsScene() {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Restore grid layout
        const layout = this.controller.config.gridLayout || '4x4';
        const [cols, rows] = layout.split('x').map(Number);

        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        container.style.gap = '10px';
        container.style.padding = '10px 10px 4px 10px';
        container.style.flexDirection = '';
        container.style.justifyContent = '';
        container.style.alignItems = '';

        // Clear and re-render pads
        container.innerHTML = '';
        this.controller.createPads();
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
        container.style.gap = rows > 1 ? '20px' : '0';
        container.style.padding = '10px';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'stretch';
        container.style.height = 'calc(100vh - 60px)';
        container.innerHTML = '';

        // For multi-row layouts, create rows
        if (rows > 1) {
            for (let r = 0; r < rows; r++) {
                const rowContainer = document.createElement('div');
                rowContainer.style.display = 'flex';
                rowContainer.style.flexDirection = 'row';
                rowContainer.style.gap = '0';
                rowContainer.style.justifyContent = 'center';
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
            return;
        }

        // Single row layout - create faders directly
        items.forEach(item => {
            const fader = this.createFader(item);
            if (fader) container.appendChild(fader);
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

        if (column.type === 'EMPTY') {
            // Empty placeholder
            fader = document.createElement('div');
            fader.style.width = '80px';
            fader.style.margin = '0 8px';
            return fader;
        }

        if (column.type === 'DIVIDER') {
            // Visual divider
            fader = document.createElement('div');
            fader.style.width = '2px';
            fader.style.background = 'var(--border-color, #333)';
            fader.style.margin = '10px 15px';
            fader.style.alignSelf = 'stretch';
            if (column.label) {
                fader.title = column.label;
            }
            return fader;
        }

        // Resolve device binding to actual device config
        const deviceConfig = this.resolveDeviceBinding(column.deviceBinding);

        if (column.type === 'MIX') {
                fader = document.createElement('mix-fader');
                fader.setAttribute('label', column.label);
                fader.setAttribute('volume', '100');
                fader.setAttribute('pan', '0');
                fader.setAttribute('fx', 'false');
                fader.setAttribute('muted', 'false');
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';

                // Event listeners for mix fader
                fader.addEventListener('fx-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    console.log(`[Dev${deviceId} Mix] FX Toggle:`, e.detail.enabled);
                    // Get current FX routing from device state
                    const state = this.controller.getDeviceState(deviceId);
                    const currentRoute = state?.fxRouting || 0;
                    this.handleFxRouting(deviceId, e.detail.enabled, currentRoute);
                });

                fader.addEventListener('pan-change', (e) => {
                    console.log('[Mix] Pan:', e.detail.value);
                    // TODO: Send master pan CC
                });

                fader.addEventListener('volume-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    console.log(`[Dev${deviceId} Mix] Volume:`, e.detail.value);
                    this.handleMasterVolume(deviceId, e.detail.value);
                });

                fader.addEventListener('mute-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    console.log(`[Dev${deviceId} Mix] Mute:`, e.detail.muted);
                    this.handleMasterMute(deviceId, e.detail.muted);
                });

            } else if (column.type === 'CHANNEL') {
                fader = document.createElement('channel-fader');
                fader.setAttribute('channel', column.channel);
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
                    console.log(`[Dev${deviceId} CH${e.detail.channel}] Solo:`, e.detail.solo);
                    this.handleChannelSolo(deviceId, e.detail.channel, e.detail.solo);
                });

                fader.addEventListener('pan-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    console.log(`[Dev${deviceId} CH${e.detail.channel}] Pan:`, e.detail.value);
                    // TODO: Send channel pan CC
                });

                fader.addEventListener('volume-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    console.log(`[Dev${deviceId} CH${e.detail.channel}] Volume:`, e.detail.value);
                    this.handleChannelVolume(deviceId, e.detail.channel, e.detail.value);
                });

                fader.addEventListener('mute-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    console.log(`[Dev${deviceId} CH${e.detail.channel}] Mute:`, e.detail.muted);
                    this.handleChannelMute(deviceId, e.detail.channel, e.detail.muted);
                });

            } else if (column.type === 'INPUT') {
                // Input fader (similar to MIX but for input channel)
                fader = document.createElement('mix-fader');
                fader.setAttribute('label', column.label || 'Input');
                fader.setAttribute('volume', '100');
                fader.setAttribute('pan', '0');
                fader.setAttribute('fx', 'false');
                fader.setAttribute('muted', 'false');
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';
                fader.dataset.inputFader = 'true'; // Mark as input fader

                // Event listeners for input fader
                fader.addEventListener('volume-change', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    console.log(`[Dev${deviceId} Input] Volume:`, e.detail.value);
                    this.handleInputVolume(deviceId, e.detail.value);
                });

                fader.addEventListener('mute-toggle', (e) => {
                    const deviceId = parseInt(fader.dataset.deviceId || 0);
                    console.log(`[Dev${deviceId} Input] Mute:`, e.detail.muted);
                    this.handleInputMute(deviceId, e.detail.muted);
                });

            } else if (column.type === 'TEMPO') {
                fader = document.createElement('tempo-fader');
                fader.setAttribute('bpm', this.controller.config.bpm || '120');
                fader.dataset.deviceId = deviceConfig.deviceId;
                fader.dataset.deviceBinding = column.deviceBinding || '';

                // Event listeners for tempo fader
                fader.addEventListener('tempo-change', (e) => {
                    console.log('[Tempo] BPM:', e.detail.bpm);
                    this.handleTempoChange(e.detail.bpm);
                });

                fader.addEventListener('tempo-reset', (e) => {
                    console.log('[Tempo] Reset to 120');
                    this.handleTempoChange(120);
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
        // Send SysEx CHANNEL_SOLO (0x31) command
        // Note: We send the SET command directly (not toggle) since the fader tells us the state
        if (this.controller.sendSysExChannelSolo) {
            this.controller.sendSysExChannelSolo(deviceId, channel, solo ? 1 : 0);
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
     * Handle FX routing toggle
     * FX routing is mutex: 0=none, 1=master, 2=playback, 3=input
     * The button cycles through states or toggles off
     */
    handleFxRouting(deviceId, enabled, currentRoute) {
        // Send SysEx FX_SET_ROUTE (0x37) command
        if (this.controller.sendSysExFxSetRoute) {
            // If toggling off, set to none (0)
            // If toggling on and no current route, default to master (1)
            // The UI should tell us the target route
            const route = enabled ? (currentRoute || 1) : 0;
            this.controller.sendSysExFxSetRoute(deviceId, route);
        } else {
            console.warn(`[Dev${deviceId}] FX routing SysEx command not available`);
        }
    }

    /**
     * Handle tempo change
     */
    handleTempoChange(bpm) {
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

    /**
     * Update scene selector UI
     */
    updateSceneSelector() {
        const selector = document.getElementById('scene-selector');
        if (selector) {
            selector.value = this.currentScene;
        }
    }

    /**
     * Get all available scenes
     */
    getScenes() {
        return Array.from(this.scenes.entries()).map(([id, scene]) => ({
            id,
            name: scene.name,
            type: scene.type
        }));
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

            const isInputFader = mixFader.dataset.inputFader === 'true';

            if (isInputFader) {
                // Update INPUT fader
                if (deviceState.inputVolume !== undefined) {
                    mixFader.setAttribute('volume', deviceState.inputVolume.toString());
                }
                if (deviceState.inputMute !== undefined) {
                    mixFader.setAttribute('muted', deviceState.inputMute ? 'true' : 'false');
                }
            } else {
                // Update MASTER/MIX fader
                if (deviceState.masterVolume !== undefined) {
                    mixFader.setAttribute('volume', deviceState.masterVolume.toString());
                    mixFader.setAttribute('muted', deviceState.masterMute ? 'true' : 'false');

                    // Update FX routing state (mutex: 0=none, 1=master, 2=playback, 3=input)
                    if (deviceState.fxRouting !== undefined) {
                        const fxEnabled = deviceState.fxRouting !== 0;
                        mixFader.setAttribute('fx-enabled', fxEnabled ? 'true' : 'false');
                        // Store the current route for toggle logic
                        mixFader.dataset.fxRoute = deviceState.fxRouting.toString();
                    }
                }
            }
        });

        // Update CHANNEL faders for this device
        const channelFaders = container.querySelectorAll('channel-fader');
        channelFaders.forEach(fader => {
            const faderDeviceId = parseInt(fader.dataset.deviceId || 0);
            if (faderDeviceId !== deviceId) return; // Skip faders for other devices

            const channel = parseInt(fader.getAttribute('channel'));

            // Update mute state
            const isMuted = deviceState.mutedChannels.includes(channel);
            fader.setAttribute('muted', isMuted.toString());

            // Update volume if available
            if (deviceState.channelVolumes && deviceState.channelVolumes[channel] !== undefined) {
                fader.setAttribute('volume', deviceState.channelVolumes[channel].toString());
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
     * Setup swipe gesture controls for scene switching
     */
    setupGestureControls() {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;
        let hasMoved = false;

        container.addEventListener('touchstart', (e) => {
            // Only track gestures on the container itself, not on interactive elements
            if (e.target.tagName === 'REGROOVE-PAD' ||
                e.target.tagName === 'MIX-FADER' ||
                e.target.tagName === 'CHANNEL-FADER' ||
                e.target.tagName === 'TEMPO-FADER' ||
                e.target.tagName === 'SVG-SLIDER') {
                return; // Don't interfere with pad/fader interactions
            }

            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            hasMoved = false;
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            const moveX = Math.abs(e.changedTouches[0].screenX - touchStartX);
            const moveY = Math.abs(e.changedTouches[0].screenY - touchStartY);

            // If moved more than 10px, mark as moved
            if (moveX > 10 || moveY > 10) {
                hasMoved = true;
            }
        }, { passive: true });

        container.addEventListener('touchend', (e) => {
            // Only process gestures if we actually moved
            if (!hasMoved) return;

            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            this.handleGesture(touchStartX, touchStartY, touchEndX, touchEndY);
        }, { passive: true });
    }

    /**
     * Handle swipe gestures
     */
    handleGesture(startX, startY, endX, endY) {
        const diffX = endX - startX;
        const diffY = endY - startY;
        const minSwipeDistance = 50;

        // Determine if it's a horizontal or vertical swipe
        if (Math.abs(diffX) > Math.abs(diffY)) {
            // Horizontal swipe
            if (Math.abs(diffX) > minSwipeDistance) {
                if (diffX > 0) {
                    // Swipe right - previous scene
                    this.switchToPreviousScene();
                } else {
                    // Swipe left - next scene
                    this.switchToNextScene();
                }
            }
        } else {
            // Vertical swipe
            if (Math.abs(diffY) > minSwipeDistance) {
                // Swipe up or down - toggle quick selector
                this.toggleQuickSelector();
            }
        }
    }

    /**
     * Switch to next scene
     */
    switchToNextScene() {
        const sceneIds = Array.from(this.scenes.keys());
        const currentIndex = sceneIds.indexOf(this.currentScene);
        const nextIndex = (currentIndex + 1) % sceneIds.length;
        this.switchScene(sceneIds[nextIndex]);
    }

    /**
     * Switch to previous scene
     */
    switchToPreviousScene() {
        const sceneIds = Array.from(this.scenes.keys());
        const currentIndex = sceneIds.indexOf(this.currentScene);
        const prevIndex = (currentIndex - 1 + sceneIds.length) % sceneIds.length;
        this.switchScene(sceneIds[prevIndex]);
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

        container.innerHTML = scenes.map(scene => `
            <div class="scene-quick-item ${scene.id === currentScene ? 'active' : ''}"
                 data-scene-id="${scene.id}">
                <div class="scene-quick-item-name">${scene.name}</div>
                <div class="scene-quick-item-type">
                    ${scene.type === 'grid' ? 'Grid' : 'Slider'}
                </div>
            </div>
        `).join('');

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

        console.log(`[Scene] Starting polling for devices [${deviceIds.join(', ')}] every ${intervalMs}ms`);

        // Request state immediately for all devices
        deviceIds.forEach(deviceId => this.requestPlayerState(deviceId));

        // Then poll at interval
        this.pollInterval = setInterval(() => {
            deviceIds.forEach(deviceId => this.requestPlayerState(deviceId));
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
}
