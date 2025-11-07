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
    }

    /**
     * Register default scene configurations
     */
    registerDefaultScenes() {
        // Pads scene (existing grid layout)
        this.scenes.set('pads', {
            name: 'Pads',
            type: 'pads',
            render: () => this.renderPadsScene()
        });

        // Mixer scene (8 channels + mix + tempo)
        this.scenes.set('mixer', {
            name: 'Mixer',
            type: 'mixer',
            columns: [
                { type: 'MIX', label: 'Master' },
                { type: 'CHANNEL', channel: 0 },
                { type: 'CHANNEL', channel: 1 },
                { type: 'CHANNEL', channel: 2 },
                { type: 'CHANNEL', channel: 3 },
                { type: 'CHANNEL', channel: 4 },
                { type: 'CHANNEL', channel: 5 },
                { type: 'CHANNEL', channel: 6 },
                { type: 'CHANNEL', channel: 7 },
                { type: 'TEMPO' }
            ],
            render: () => this.renderMixerScene()
        });
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

        // Render the scene
        scene.render();

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
     * Render mixer scene
     */
    renderMixerScene() {
        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Clear grid and switch to fader layout
        container.style.display = 'flex';
        container.style.flexDirection = 'row';
        container.style.gap = '0';
        container.style.padding = '10px';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'stretch';
        container.innerHTML = '';

        const scene = this.scenes.get('mixer');
        const { columns } = scene;

        // Create faders
        columns.forEach(column => {
            let fader;

            if (column.type === 'MIX') {
                fader = document.createElement('mix-fader');
                fader.setAttribute('label', column.label);
                fader.setAttribute('volume', '100');
                fader.setAttribute('pan', '0');
                fader.setAttribute('fx', 'false');
                fader.setAttribute('muted', 'false');

                // Event listeners for mix fader
                fader.addEventListener('fx-toggle', (e) => {
                    console.log('[Mix] FX Toggle:', e.detail.enabled);
                    // TODO: Trigger FX toggle action
                });

                fader.addEventListener('pan-change', (e) => {
                    console.log('[Mix] Pan:', e.detail.value);
                    // TODO: Send master pan CC
                });

                fader.addEventListener('volume-change', (e) => {
                    console.log('[Mix] Volume:', e.detail.value);
                    // TODO: Send master volume action
                });

                fader.addEventListener('mute-toggle', (e) => {
                    console.log('[Mix] Mute:', e.detail.muted);
                    // TODO: Trigger mute all action
                });

            } else if (column.type === 'CHANNEL') {
                fader = document.createElement('channel-fader');
                fader.setAttribute('channel', column.channel);
                fader.setAttribute('volume', '100');
                fader.setAttribute('pan', '0');
                fader.setAttribute('solo', 'false');
                fader.setAttribute('muted', 'false');

                // Sync with Regroove player state
                if (this.controller.playerState) {
                    const isMuted = this.controller.playerState.mutedChannels.includes(column.channel);
                    fader.setAttribute('muted', isMuted.toString());
                }

                // Event listeners for channel fader
                fader.addEventListener('solo-toggle', (e) => {
                    console.log(`[CH${e.detail.channel}] Solo:`, e.detail.solo);
                    this.handleChannelSolo(e.detail.channel, e.detail.solo);
                });

                fader.addEventListener('pan-change', (e) => {
                    console.log(`[CH${e.detail.channel}] Pan:`, e.detail.value);
                    // TODO: Send channel pan CC
                });

                fader.addEventListener('volume-change', (e) => {
                    console.log(`[CH${e.detail.channel}] Volume:`, e.detail.value);
                    this.handleChannelVolume(e.detail.channel, e.detail.value);
                });

                fader.addEventListener('mute-toggle', (e) => {
                    console.log(`[CH${e.detail.channel}] Mute:`, e.detail.muted);
                    this.handleChannelMute(e.detail.channel, e.detail.muted);
                });

            } else if (column.type === 'TEMPO') {
                fader = document.createElement('tempo-fader');
                fader.setAttribute('bpm', this.controller.config.bpm || '120');

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

            if (fader) {
                container.appendChild(fader);
            }
        });
    }

    /**
     * Handle channel mute
     */
    handleChannelMute(channel, muted) {
        if (this.controller.actionDispatcher) {
            const event = new InputEvent(
                InputAction.ACTION_REGROOVE_CHANNEL_MUTE,
                channel,
                muted ? 127 : 0
            );
            this.controller.actionDispatcher.handleEvent(event);
        } else {
            // Fallback to direct CC
            this.controller.sendCC(48 + channel, 127);
        }
    }

    /**
     * Handle channel solo
     */
    handleChannelSolo(channel, solo) {
        if (this.controller.actionDispatcher) {
            const event = new InputEvent(
                InputAction.ACTION_REGROOVE_CHANNEL_SOLO,
                channel,
                solo ? 127 : 0
            );
            this.controller.actionDispatcher.handleEvent(event);
        } else {
            // Fallback to direct CC
            this.controller.sendCC(32 + channel, 127);
        }
    }

    /**
     * Handle channel volume
     */
    handleChannelVolume(channel, volume) {
        // TODO: Implement channel volume control
        // Currently Regroove doesn't have per-channel volume CC
        console.warn('Channel volume not yet implemented in Regroove');
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
     * Update mixer faders from player state
     */
    updateMixerFromState() {
        if (this.currentScene !== 'mixer') return;

        const container = document.getElementById('pads-grid');
        if (!container) return;

        // Update channel faders with mute state
        const channelFaders = container.querySelectorAll('channel-fader');
        channelFaders.forEach(fader => {
            const channel = parseInt(fader.getAttribute('channel'));
            const isMuted = this.controller.playerState.mutedChannels.includes(channel);
            fader.setAttribute('muted', isMuted.toString());
        });
    }
}
