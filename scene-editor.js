/**
 * Scene Editor UI for Meister
 * Allows visual configuration of mixer scenes with fader slots
 */

export class SceneEditor {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.currentSceneId = null;
        this.editingSlotIndex = null;
        this.sceneConfig = {
            name: '',
            layout: '1x5',
            faders: []
        };

        this.setupUI();
    }

    setupUI() {
        // Edit built-in mixer scene
        document.getElementById('edit-mixer-btn')?.addEventListener('click', () => {
            this.openSceneEditor('mixer');
        });

        // New scene button
        document.getElementById('new-scene-btn')?.addEventListener('click', () => {
            this.openSceneEditor();
        });

        // Close scene editor
        document.getElementById('close-scene-editor')?.addEventListener('click', () => {
            this.closeSceneEditor();
        });

        // Close fader editor
        document.getElementById('close-fader-editor')?.addEventListener('click', () => {
            this.closeFaderEditor();
        });

        // Layout change
        document.getElementById('scene-layout')?.addEventListener('change', (e) => {
            this.sceneConfig.layout = e.target.value;
            this.renderFaderGrid();
        });

        // Fader type change
        document.getElementById('fader-type')?.addEventListener('change', (e) => {
            this.updateFaderEditorFields(e.target.value);
        });

        // Save scene
        document.getElementById('save-scene')?.addEventListener('click', () => {
            this.saveScene();
        });

        // Delete scene
        document.getElementById('delete-scene')?.addEventListener('click', () => {
            this.deleteScene();
        });

        // Save fader
        document.getElementById('save-fader')?.addEventListener('click', () => {
            this.saveFader();
        });

        // Clear fader
        document.getElementById('clear-fader')?.addEventListener('click', () => {
            this.clearFader();
        });
    }

    openSceneEditor(sceneId = null) {
        this.currentSceneId = sceneId;

        if (sceneId && sceneId !== 'pads') {
            // Edit existing scene
            const scene = this.sceneManager.scenes.get(sceneId);
            if (scene) {
                this.sceneConfig.name = scene.name;
                this.sceneConfig.layout = `${scene.rows || 1}x${scene.columns?.length / (scene.rows || 1)}`;
                this.sceneConfig.faders = scene.columns || [];
                document.getElementById('scene-name').value = scene.name;
                document.getElementById('scene-layout').value = this.sceneConfig.layout;
            }
        } else {
            // New scene
            this.currentSceneId = 'custom-' + Date.now();
            this.sceneConfig = {
                name: 'Custom Mixer',
                layout: '1x5',
                faders: []
            };
            document.getElementById('scene-name').value = this.sceneConfig.name;
            document.getElementById('scene-layout').value = this.sceneConfig.layout;
        }

        this.renderFaderGrid();
        document.getElementById('scene-editor-overlay').classList.add('active');
    }

    closeSceneEditor() {
        document.getElementById('scene-editor-overlay').classList.remove('active');
    }

    renderFaderGrid() {
        const [rows, cols] = this.sceneConfig.layout.split('x').map(Number);
        const totalSlots = rows * cols;
        const grid = document.getElementById('scene-fader-grid');

        // Set grid layout
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

        // Ensure faders array is right size
        if (this.sceneConfig.faders.length < totalSlots) {
            this.sceneConfig.faders = [
                ...this.sceneConfig.faders,
                ...Array(totalSlots - this.sceneConfig.faders.length).fill(null)
            ];
        }

        // Render slots
        grid.innerHTML = this.sceneConfig.faders.slice(0, totalSlots).map((fader, index) => {
            const label = this.getFaderLabel(fader);
            return `
                <div class="fader-slot" data-slot="${index}" style="
                    background: ${fader ? '#2a2a2a' : '#1a1a1a'};
                    border: 2px solid ${fader ? '#cc4444' : '#333'};
                    padding: 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    text-align: center;
                    font-size: 0.75em;
                    color: ${fader ? '#ccc' : '#555'};
                    min-height: 60px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    ${label}
                </div>
            `;
        }).join('');

        // Add click handlers
        grid.querySelectorAll('.fader-slot').forEach(slot => {
            slot.addEventListener('click', () => {
                const slotIndex = parseInt(slot.getAttribute('data-slot'));
                this.openFaderEditor(slotIndex);
            });
        });
    }

    getFaderLabel(fader) {
        if (!fader) return 'EMPTY';

        switch(fader.type) {
            case 'MIX':
                return `MIX<br>${fader.label || 'Master'}<br>Dev ${fader.deviceId ?? 0}`;
            case 'CHANNEL':
                return `CH ${fader.channel + 1}<br>Dev ${fader.deviceId ?? 0}`;
            case 'TEMPO':
                return `TEMPO<br>Dev ${fader.deviceId ?? 0}`;
            case 'EMPTY':
                return 'EMPTY';
            default:
                return 'EMPTY';
        }
    }

    openFaderEditor(slotIndex) {
        this.editingSlotIndex = slotIndex;
        const fader = this.sceneConfig.faders[slotIndex];

        // Set title
        document.getElementById('fader-editor-title').textContent = `EDIT SLOT ${slotIndex + 1}`;

        // Load fader config
        if (fader) {
            document.getElementById('fader-type').value = fader.type;
            document.getElementById('fader-label').value = fader.label || '';
            document.getElementById('fader-channel').value = fader.channel ?? 0;
            document.getElementById('fader-device').value = fader.deviceId ?? 0;
        } else {
            document.getElementById('fader-type').value = 'EMPTY';
            document.getElementById('fader-label').value = '';
            document.getElementById('fader-channel').value = 0;
            document.getElementById('fader-device').value = 0;
        }

        this.updateFaderEditorFields(document.getElementById('fader-type').value);
        document.getElementById('fader-editor-overlay').classList.add('active');
    }

    closeFaderEditor() {
        document.getElementById('fader-editor-overlay').classList.remove('active');
        this.editingSlotIndex = null;
    }

    updateFaderEditorFields(type) {
        const labelField = document.getElementById('fader-label-field');
        const channelField = document.getElementById('fader-channel-field');
        const deviceField = document.getElementById('fader-device-field');

        labelField.style.display = type === 'MIX' ? 'block' : 'none';
        channelField.style.display = type === 'CHANNEL' ? 'block' : 'none';
        deviceField.style.display = (type !== 'EMPTY') ? 'block' : 'none';
    }

    saveFader() {
        if (this.editingSlotIndex === null) return;

        const type = document.getElementById('fader-type').value;

        if (type === 'EMPTY') {
            this.sceneConfig.faders[this.editingSlotIndex] = null;
        } else {
            const fader = {
                type: type,
                deviceId: parseInt(document.getElementById('fader-device').value) || 0
            };

            if (type === 'MIX') {
                fader.label = document.getElementById('fader-label').value || 'Master';
            } else if (type === 'CHANNEL') {
                fader.channel = parseInt(document.getElementById('fader-channel').value) || 0;
            }

            this.sceneConfig.faders[this.editingSlotIndex] = fader;
        }

        this.renderFaderGrid();
        this.closeFaderEditor();
    }

    clearFader() {
        if (this.editingSlotIndex === null) return;
        this.sceneConfig.faders[this.editingSlotIndex] = null;
        this.renderFaderGrid();
        this.closeFaderEditor();
    }

    saveScene() {
        const name = document.getElementById('scene-name').value.trim();
        if (!name) {
            alert('Please enter a scene name');
            return;
        }

        this.sceneConfig.name = name;
        const [rows, cols] = this.sceneConfig.layout.split('x').map(Number);

        // Create scene config
        const sceneConfig = {
            name: this.sceneConfig.name,
            type: 'slider',
            rows: rows,
            columns: this.sceneConfig.faders.slice(0, rows * cols).filter(f => f !== null),
            pollDevices: [...new Set(this.sceneConfig.faders.filter(f => f && f.deviceId !== undefined).map(f => f.deviceId))],
            pollInterval: 100
        };

        // Add scene to scene manager
        this.sceneManager.addScene(this.currentSceneId, sceneConfig);

        // Save to localStorage
        this.saveScenesToStorage();

        // Refresh scenes list
        this.refreshScenesList();

        alert(`Scene "${name}" saved!`);
        this.closeSceneEditor();
    }

    deleteScene() {
        if (!this.currentSceneId || this.currentSceneId === 'pads' || this.currentSceneId === 'mixer') {
            alert('Cannot delete built-in scenes');
            return;
        }

        if (confirm(`Delete scene "${this.sceneConfig.name}"?`)) {
            this.sceneManager.scenes.delete(this.currentSceneId);
            this.saveScenesToStorage();
            this.refreshScenesList();
            this.closeSceneEditor();
        }
    }

    saveScenesToStorage() {
        const scenes = {};
        this.sceneManager.scenes.forEach((scene, id) => {
            if (id !== 'pads' && id !== 'mixer') {
                scenes[id] = {
                    name: scene.name,
                    type: scene.type,
                    rows: scene.rows,
                    columns: scene.columns,
                    pollDevices: scene.pollDevices,
                    pollInterval: scene.pollInterval
                };
            }
        });

        localStorage.setItem('meisterScenes', JSON.stringify(scenes));
    }

    loadScenesFromStorage() {
        try {
            const saved = localStorage.getItem('meisterScenes');
            if (saved) {
                const scenes = JSON.parse(saved);
                Object.entries(scenes).forEach(([id, config]) => {
                    this.sceneManager.addScene(id, config);
                });
            }
        } catch (e) {
            console.error('Failed to load scenes from storage:', e);
        }

        // Refresh the scenes list UI
        this.refreshScenesList();
    }

    refreshScenesList() {
        const container = document.getElementById('scenes-list');
        if (!container) return;

        const scenes = this.sceneManager.getScenes();

        container.innerHTML = scenes.map(scene => {
            const isBuiltIn = (scene.id === 'pads' || scene.id === 'mixer');
            return `
                <div class="scene-list-item" data-scene-id="${scene.id}" style="
                    background: #2a2a2a;
                    border: 2px solid #444;
                    border-radius: 4px;
                    padding: 12px;
                    cursor: ${isBuiltIn ? 'default' : 'pointer'};
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div>
                        <div style="font-weight: bold; color: #ccc;">${scene.name}</div>
                        <div style="font-size: 0.8em; color: #666; margin-top: 4px;">
                            ${scene.type === 'grid' ? 'Pad Grid' : 'Mixer Layout'}
                            ${isBuiltIn ? '(Built-in)' : ''}
                        </div>
                    </div>
                    ${!isBuiltIn ? '<div style="color: #cc4444;">✏️</div>' : ''}
                </div>
            `;
        }).join('');

        // Add click handlers for custom scenes
        container.querySelectorAll('.scene-list-item').forEach(item => {
            const sceneId = item.getAttribute('data-scene-id');
            const isBuiltIn = (sceneId === 'pads' || sceneId === 'mixer');

            if (!isBuiltIn) {
                item.addEventListener('click', () => {
                    this.openSceneEditor(sceneId);
                });
            }
        });
    }
}
