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
        this.padSceneConfig = {
            name: '',
            layout: '4x4',
            pollDevices: [],
            pollInterval: 250
        };

        this.setupUI();
    }

    setupUI() {
        // Edit built-in pad scene
        document.getElementById('edit-pad-scene-btn')?.addEventListener('click', () => {
            this.openPadSceneEditor('pads');
        });

        // Edit built-in mixer scene
        document.getElementById('edit-mixer-btn')?.addEventListener('click', () => {
            this.openSceneEditor('mixer');
        });

        // Edit built-in effects scene
        document.getElementById('edit-effects-btn')?.addEventListener('click', () => {
            this.openEffectsSceneEditor('effects');
        });

        // Edit built-in piano scene
        document.getElementById('edit-piano-btn')?.addEventListener('click', () => {
            this.openPianoSceneEditor('piano');
        });

        // New mixer scene button
        document.getElementById('new-scene-btn')?.addEventListener('click', () => {
            this.openSceneEditor();
        });

        // Template buttons
        document.getElementById('template-1x10-btn')?.addEventListener('click', () => {
            this.applyTemplate('1x10');
        });

        document.getElementById('template-1x12-btn')?.addEventListener('click', () => {
            this.applyTemplate('1x12');
        });

        // New effects scene button
        document.getElementById('new-effects-btn')?.addEventListener('click', () => {
            this.openEffectsSceneEditor();
        });

        // New pad scene button
        document.getElementById('new-pad-scene-btn')?.addEventListener('click', () => {
            this.openPadSceneEditor();
        });

        // New piano scene button
        document.getElementById('new-piano-scene-btn')?.addEventListener('click', () => {
            this.openPianoSceneEditor();
        });

        // Close scene editor
        document.getElementById('close-scene-editor')?.addEventListener('click', () => {
            this.closeSceneEditor();
        });

        // Close pad scene editor
        document.getElementById('close-pad-scene-editor')?.addEventListener('click', () => {
            this.closePadSceneEditor();
        });

        // Close effects scene editor
        document.getElementById('close-effects-scene-editor')?.addEventListener('click', () => {
            this.closeEffectsSceneEditor();
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

        // Polling interval slider
        document.getElementById('scene-polling-interval')?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('scene-polling-interval-value').textContent = value + 'ms';
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

        // Save pad scene
        document.getElementById('save-pad-scene')?.addEventListener('click', () => {
            this.savePadScene();
        });

        // Delete pad scene
        document.getElementById('delete-pad-scene')?.addEventListener('click', () => {
            this.deletePadScene();
        });

        // Pad scene polling interval slider
        document.getElementById('pad-scene-polling-interval')?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('pad-scene-polling-interval-value').textContent = value + 'ms';
        });

        // Save effects scene
        document.getElementById('save-effects-scene')?.addEventListener('click', () => {
            this.saveEffectsScene();
        });

        // Delete effects scene
        document.getElementById('delete-effects-scene')?.addEventListener('click', () => {
            this.deleteEffectsScene();
        });

        // Effects scene polling interval slider
        document.getElementById('effects-scene-polling-interval')?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('effects-scene-polling-interval-value').textContent = value + 'ms';
        });

        // Close piano scene editor
        document.getElementById('close-piano-scene-editor')?.addEventListener('click', () => {
            this.closePianoSceneEditor();
        });

        // Save piano scene
        document.getElementById('save-piano-scene')?.addEventListener('click', () => {
            this.savePianoScene();
        });

        // Delete piano scene
        document.getElementById('delete-piano-scene')?.addEventListener('click', () => {
            this.deletePianoScene();
        });
    }

    openSceneEditor(sceneId = null) {
        this.currentSceneId = sceneId;

        if (sceneId && sceneId !== 'pads') {
            // Edit existing scene
            const scene = this.sceneManager.scenes.get(sceneId);
            if (scene) {
                this.sceneConfig.name = scene.name;

                // Use slots if available, fallback to columns for backward compatibility
                const items = scene.slots || scene.columns || [];
                const rows = scene.rows || 1;
                const cols = scene.columnsPerRow || Math.ceil(items.length / rows);

                this.sceneConfig.layout = `${rows}x${cols}`;
                this.sceneConfig.faders = items;
                this.sceneConfig.pollingInterval = scene.pollInterval || 250;

                document.getElementById('scene-name').value = scene.name;
                document.getElementById('scene-layout').value = this.sceneConfig.layout;

                // Set polling interval
                const pollingSlider = document.getElementById('scene-polling-interval');
                if (pollingSlider) {
                    pollingSlider.value = this.sceneConfig.pollingInterval;
                    document.getElementById('scene-polling-interval-value').textContent = this.sceneConfig.pollingInterval + 'ms';
                }
            }
        } else {
            // New scene
            this.currentSceneId = 'custom-' + Date.now();
            this.sceneConfig = {
                name: 'Custom Mixer',
                layout: '1x5',
                faders: [],
                pollingInterval: 250
            };
            document.getElementById('scene-name').value = this.sceneConfig.name;
            document.getElementById('scene-layout').value = this.sceneConfig.layout;

            // Set default polling interval
            const pollingSlider = document.getElementById('scene-polling-interval');
            if (pollingSlider) {
                pollingSlider.value = 250;
                document.getElementById('scene-polling-interval-value').textContent = '250ms';
            }
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

        const deviceManager = window.meisterController?.deviceManager;
        let deviceName = 'Default';

        // Get device name from binding
        if (fader.deviceBinding && deviceManager) {
            const device = deviceManager.getDevice(fader.deviceBinding);
            if (device) {
                deviceName = device.name;
            }
        }

        switch(fader.type) {
            case 'MIX':
                return `MIX<br>${fader.label || 'Master'}<br>${deviceName}`;
            case 'INPUT':
                return `INPUT<br>${fader.label || 'Input'}<br>${deviceName}`;
            case 'CHANNEL':
                return `CH ${fader.channel + 1}<br>${deviceName}`;
            case 'TEMPO':
                return `TEMPO<br>${deviceName}`;
            case 'STEREO':
                return `STEREO<br>${deviceName}`;
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

        // Populate device binding dropdown
        this.populateDeviceBindings();

        // Load fader config
        if (fader) {
            document.getElementById('fader-type').value = fader.type;
            document.getElementById('fader-label').value = fader.label || '';
            document.getElementById('fader-channel').value = fader.channel ?? 0;
            document.getElementById('fader-device-binding').value = fader.deviceBinding || '';
        } else {
            document.getElementById('fader-type').value = 'EMPTY';
            document.getElementById('fader-label').value = '';
            document.getElementById('fader-channel').value = 0;
            document.getElementById('fader-device-binding').value = '';
        }

        this.updateFaderEditorFields(document.getElementById('fader-type').value);
        document.getElementById('fader-editor-overlay').classList.add('active');
    }

    populateDeviceBindings() {
        const select = document.getElementById('fader-device-binding');
        if (!select) return;

        // Get device manager from controller
        const deviceManager = window.meisterController?.deviceManager;
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

    closeFaderEditor() {
        document.getElementById('fader-editor-overlay').classList.remove('active');
        this.editingSlotIndex = null;
    }

    updateFaderEditorFields(type) {
        const labelField = document.getElementById('fader-label-field');
        const channelField = document.getElementById('fader-channel-field');
        const deviceField = document.getElementById('fader-device-field');

        labelField.style.display = (type === 'MIX' || type === 'INPUT') ? 'block' : 'none';
        channelField.style.display = type === 'CHANNEL' ? 'block' : 'none';
        deviceField.style.display = (type !== 'EMPTY') ? 'block' : 'none';
    }

    saveFader() {
        if (this.editingSlotIndex === null) return;

        const type = document.getElementById('fader-type').value;

        if (type === 'EMPTY') {
            this.sceneConfig.faders[this.editingSlotIndex] = null;
        } else {
            const deviceBinding = document.getElementById('fader-device-binding').value;
            const fader = {
                type: type,
                deviceBinding: deviceBinding || null
            };

            if (type === 'MIX') {
                fader.label = document.getElementById('fader-label').value || 'Master';
            } else if (type === 'INPUT') {
                fader.label = document.getElementById('fader-label').value || 'Input';
            } else if (type === 'CHANNEL') {
                fader.channel = parseInt(document.getElementById('fader-channel').value) || 0;
            }
            // TEMPO and STEREO don't need additional fields

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

        // Get polling interval from slider
        const pollingInterval = parseInt(document.getElementById('scene-polling-interval').value);

        // console.log(`[SceneEditor] Saving scene "${name}" with ${rows}x${cols} layout, ${pollingInterval}ms polling`);
        // console.log(`[SceneEditor] Faders:`, this.sceneConfig.faders);

        // Collect all device IDs from faders for polling
        const deviceIds = new Set();
        this.sceneConfig.faders.forEach(fader => {
            if (fader && fader.deviceBinding) {
                const deviceManager = this.sceneManager.controller.deviceManager;
                if (deviceManager) {
                    const device = deviceManager.getDevice(fader.deviceBinding);
                    if (device) {
                        deviceIds.add(device.deviceId);
                    }
                }
            }
        });

        // Create scene config with slots (new format)
        const sceneConfig = {
            name: this.sceneConfig.name,
            type: 'slider',
            rows: rows,
            columnsPerRow: cols,
            slots: this.sceneConfig.faders.slice(0, rows * cols), // Include all slots (even nulls/empty)
            pollDevices: Array.from(deviceIds),
            pollInterval: pollingInterval,
            render: () => this.sceneManager.renderSliderScene(this.currentSceneId) // Add render function!
        };

        // console.log(`[SceneEditor] Scene config:`, sceneConfig);

        // Add scene to scene manager
        this.sceneManager.addScene(this.currentSceneId, sceneConfig);

        // Save to localStorage
        this.saveScenesToStorage();

        // Refresh scenes list
        this.refreshScenesList();

        // If we're currently viewing this scene, re-render it
        if (this.sceneManager.currentScene === this.currentSceneId) {
            // console.log(`[SceneEditor] Re-rendering current scene: ${this.currentSceneId}`);
            this.sceneManager.switchScene(this.currentSceneId);
        }

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

    openPadSceneEditor(sceneId = null) {
        if (sceneId) {
            // Edit existing pad scene (including built-in 'pads')
            const scene = this.sceneManager.scenes.get(sceneId);
            if (scene && scene.type === 'grid') {
                this.currentSceneId = sceneId;
                this.padSceneConfig.name = scene.name;
                this.padSceneConfig.layout = scene.layout || '4x4';
                this.padSceneConfig.pollInterval = scene.pollInterval || 250;
                this.padSceneConfig.pollDevices = scene.pollDevices || [];

                document.getElementById('pad-scene-name').value = scene.name;
                document.getElementById('pad-scene-layout').value = this.padSceneConfig.layout;

                // Set polling interval
                const pollingSlider = document.getElementById('pad-scene-polling-interval');
                if (pollingSlider) {
                    pollingSlider.value = this.padSceneConfig.pollInterval;
                    document.getElementById('pad-scene-polling-interval-value').textContent = this.padSceneConfig.pollInterval + 'ms';
                }

                document.getElementById('pad-scene-editor-title').textContent = 'EDIT PAD SCENE';
            }
        } else {
            // New pad scene
            this.currentSceneId = 'custom-pads-' + Date.now();
            this.padSceneConfig = {
                name: 'Custom Pads',
                layout: '4x4',
                pollDevices: [],
                pollInterval: 250
            };
            document.getElementById('pad-scene-name').value = this.padSceneConfig.name;
            document.getElementById('pad-scene-layout').value = this.padSceneConfig.layout;

            // Set default polling interval
            const pollingSlider = document.getElementById('pad-scene-polling-interval');
            if (pollingSlider) {
                pollingSlider.value = 250;
                document.getElementById('pad-scene-polling-interval-value').textContent = '250ms';
            }

            document.getElementById('pad-scene-editor-title').textContent = 'NEW PAD SCENE';
        }

        document.getElementById('pad-scene-editor-overlay').classList.add('active');
    }

    closePadSceneEditor() {
        document.getElementById('pad-scene-editor-overlay').classList.remove('active');
    }

    /**
     * Open effects scene editor
     */
    openEffectsSceneEditor(sceneId = null) {
        // Populate device dropdown
        this.populateEffectsDeviceDropdown();

        if (sceneId) {
            // Edit existing effects scene
            const scene = this.sceneManager.scenes.get(sceneId);
            if (scene && scene.type === 'effects') {
                this.currentSceneId = sceneId;

                document.getElementById('effects-scene-name').value = scene.name;
                document.getElementById('effects-scene-device').value = scene.deviceBinding || '';
                document.getElementById('effects-scene-program').value = scene.programId || 0;

                // Set polling interval
                const pollingSlider = document.getElementById('effects-scene-polling-interval');
                if (pollingSlider) {
                    pollingSlider.value = scene.pollInterval || 250;
                    document.getElementById('effects-scene-polling-interval-value').textContent = (scene.pollInterval || 250) + 'ms';
                }

                document.getElementById('effects-scene-editor-title').textContent = sceneId === 'effects' ? 'EDIT EFFECTS SCENE' : 'EDIT CUSTOM EFFECTS';
            }
        } else {
            // New effects scene
            this.currentSceneId = 'custom-effects-' + Date.now();

            document.getElementById('effects-scene-name').value = 'Custom Effects';
            document.getElementById('effects-scene-device').value = '';
            document.getElementById('effects-scene-program').value = 0;

            // Set default polling interval
            const pollingSlider = document.getElementById('effects-scene-polling-interval');
            if (pollingSlider) {
                pollingSlider.value = 250;
                document.getElementById('effects-scene-polling-interval-value').textContent = '250ms';
            }

            document.getElementById('effects-scene-editor-title').textContent = 'NEW EFFECTS SCENE';
        }

        document.getElementById('effects-scene-editor-overlay').classList.add('active');
    }

    closeEffectsSceneEditor() {
        document.getElementById('effects-scene-editor-overlay').classList.remove('active');
    }

    populateEffectsDeviceDropdown() {
        const select = document.getElementById('effects-scene-device');
        if (!select) return;

        select.innerHTML = '<option value="">-- Select Device --</option>';

        if (this.sceneManager.controller.deviceManager) {
            const devices = this.sceneManager.controller.deviceManager.getAllDevices();
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = `${device.name} (Ch ${device.midiChannel + 1}, ID ${device.deviceId})`;
                select.appendChild(option);
            });
        }
    }

    saveEffectsScene() {
        const name = document.getElementById('effects-scene-name').value.trim();
        const deviceBinding = document.getElementById('effects-scene-device').value;
        const programId = parseInt(document.getElementById('effects-scene-program').value) || 0;
        const pollingInterval = parseInt(document.getElementById('effects-scene-polling-interval').value) || 250;

        if (!name) {
            alert('Please enter a scene name');
            return;
        }

        if (!deviceBinding) {
            alert('Please select a device');
            return;
        }

        // Get device ID for polling
        let deviceId = 0;
        if (this.sceneManager.controller.deviceManager) {
            const device = this.sceneManager.controller.deviceManager.getDevice(deviceBinding);
            if (device) {
                deviceId = device.deviceId;
            }
        }

        // Save scene
        this.sceneManager.addScene(this.currentSceneId, {
            name: name,
            type: 'effects',
            deviceBinding: deviceBinding,
            programId: programId,
            pollDevices: [deviceId],
            pollInterval: pollingInterval
        });

        // console.log(`[SceneEditor] Saved effects scene: ${name} (device: ${deviceBinding}, program: ${programId})`);

        // Save to localStorage
        this.saveScenesToStorage();

        // Refresh scenes list
        this.refreshScenesList();

        // Close editor
        this.closeEffectsSceneEditor();

        // Switch to the scene
        this.sceneManager.switchScene(this.currentSceneId);
    }

    deleteEffectsScene() {
        if (this.currentSceneId === 'effects') {
            alert('Cannot delete the built-in effects scene');
            return;
        }

        if (!confirm('Are you sure you want to delete this effects scene?')) {
            return;
        }

        this.sceneManager.scenes.delete(this.currentSceneId);
        this.saveScenesToStorage();
        this.refreshScenesList();
        this.closeEffectsSceneEditor();

        // console.log(`[SceneEditor] Deleted effects scene: ${this.currentSceneId}`);
    }

    savePadScene() {
        const name = document.getElementById('pad-scene-name').value.trim();
        if (!name) {
            alert('Please enter a scene name');
            return;
        }

        const layout = document.getElementById('pad-scene-layout').value;
        const pollingInterval = parseInt(document.getElementById('pad-scene-polling-interval').value);

        this.padSceneConfig.name = name;
        this.padSceneConfig.layout = layout;
        this.padSceneConfig.pollInterval = pollingInterval;

        // console.log(`[SceneEditor] Saving pad scene "${name}" with ${layout} layout, ${pollingInterval}ms polling`);

        // Collect all device IDs from device manager for polling
        const deviceIds = new Set();
        if (this.sceneManager.controller.deviceManager) {
            const devices = this.sceneManager.controller.deviceManager.getAllDevices();
            devices.forEach(device => {
                deviceIds.add(device.deviceId);
            });
        }

        // Create scene config for grid type
        const sceneConfig = {
            name: this.padSceneConfig.name,
            type: 'grid',
            layout: this.padSceneConfig.layout,
            pollDevices: Array.from(deviceIds),
            pollInterval: pollingInterval
        };

        // console.log(`[SceneEditor] Pad scene config:`, sceneConfig);

        // Add scene to scene manager
        this.sceneManager.addScene(this.currentSceneId, sceneConfig);

        // Save to localStorage
        this.saveScenesToStorage();

        // Refresh scenes list
        this.refreshScenesList();

        // If we're currently viewing this scene, re-render it
        if (this.sceneManager.currentScene === this.currentSceneId) {
            // console.log(`[SceneEditor] Re-rendering current scene: ${this.currentSceneId}`);
            this.sceneManager.switchScene(this.currentSceneId);
        }

        alert(`Pad scene "${name}" saved! Switch to the scene to configure individual pads.`);
        this.closePadSceneEditor();
    }

    deletePadScene() {
        if (!this.currentSceneId || this.currentSceneId === 'pads') {
            alert('Cannot delete the built-in pads scene');
            return;
        }

        if (confirm(`Delete pad scene "${this.padSceneConfig.name}"?`)) {
            this.sceneManager.scenes.delete(this.currentSceneId);
            this.saveScenesToStorage();
            this.refreshScenesList();
            this.closePadSceneEditor();
        }
    }

    /**
     * Open piano scene editor
     */
    openPianoSceneEditor(sceneId = null) {
        if (sceneId) {
            // Edit existing piano scene
            const scene = this.sceneManager.scenes.get(sceneId);
            if (scene && scene.type === 'piano') {
                this.currentSceneId = sceneId;

                document.getElementById('piano-scene-name').value = scene.name;
                document.getElementById('piano-scene-channel').value = scene.midiChannel !== undefined ? scene.midiChannel : 0;
                document.getElementById('piano-scene-octave').value = scene.octave !== undefined ? scene.octave : 4;

                document.getElementById('piano-scene-editor-title').textContent = sceneId === 'piano' ? 'EDIT PIANO SCENE' : 'EDIT CUSTOM PIANO';
            }
        } else {
            // New piano scene
            this.currentSceneId = 'custom-piano-' + Date.now();

            document.getElementById('piano-scene-name').value = 'Custom Piano';
            document.getElementById('piano-scene-channel').value = 0;
            document.getElementById('piano-scene-octave').value = 4;

            document.getElementById('piano-scene-editor-title').textContent = 'NEW PIANO SCENE';
        }

        document.getElementById('piano-scene-editor-overlay').classList.add('active');
    }

    closePianoSceneEditor() {
        document.getElementById('piano-scene-editor-overlay').classList.remove('active');
    }

    savePianoScene() {
        const name = document.getElementById('piano-scene-name').value.trim();
        const midiChannel = parseInt(document.getElementById('piano-scene-channel').value) || 0;
        const octave = parseInt(document.getElementById('piano-scene-octave').value) || 4;

        if (!name) {
            alert('Please enter a scene name');
            return;
        }

        // Save scene
        this.sceneManager.addScene(this.currentSceneId, {
            name: name,
            type: 'piano',
            octave: octave,
            midiChannel: midiChannel,
            deviceBinding: null
        });

        // Save to localStorage
        this.saveScenesToStorage();

        // Refresh scenes list
        this.refreshScenesList();

        // Close editor
        this.closePianoSceneEditor();

        // Switch to the scene
        this.sceneManager.switchScene(this.currentSceneId);
    }

    deletePianoScene() {
        if (this.currentSceneId === 'piano') {
            alert('Cannot delete the built-in piano scene');
            return;
        }

        if (!confirm('Are you sure you want to delete this piano scene?')) {
            return;
        }

        this.sceneManager.scenes.delete(this.currentSceneId);
        this.saveScenesToStorage();
        this.refreshScenesList();
        this.closePianoSceneEditor();
    }

    saveScenesToStorage() {
        const scenes = {};
        this.sceneManager.scenes.forEach((scene, id) => {
            // Save all scenes (pads and mixer can now be saved)
            scenes[id] = {
                name: scene.name,
                type: scene.type,
                enabled: scene.enabled !== undefined ? scene.enabled : true, // Save enabled state
                rows: scene.rows,
                columnsPerRow: scene.columnsPerRow,
                slots: scene.slots,
                columns: scene.columns, // Keep for backward compatibility
                pollDevices: scene.pollDevices,
                pollInterval: scene.pollInterval,
                layout: scene.layout, // For grid-type scenes
                octave: scene.octave, // For piano scenes
                midiChannel: scene.midiChannel, // For piano scenes
                deviceBinding: scene.deviceBinding, // For effects and piano scenes
                programId: scene.programId // For effects scenes
            };
        });

        localStorage.setItem('meisterScenes', JSON.stringify(scenes));
        // console.log(`[SceneEditor] Saved ${Object.keys(scenes).length} scene(s) to localStorage`);
    }

    loadScenesFromStorage() {
        try {
            const saved = localStorage.getItem('meisterScenes');
            if (saved) {
                const scenes = JSON.parse(saved);

                // Load saved scenes BEFORE registering defaults
                // This allows saved mixer scene to override the default
                Object.entries(scenes).forEach(([id, config]) => {
                    // console.log(`[SceneEditor] Loading saved scene: ${id}`);
                    this.sceneManager.addScene(id, config);
                });

                // Re-register defaults with loadSaved=true to skip mixer if saved
                this.sceneManager.registerDefaultScenes(true);
            }
        } catch (e) {
            console.error('Failed to load scenes from storage:', e);
        }

        // Refresh the scenes list UI
        this.refreshScenesList();
    }

    /**
     * Get custom scenes for export (includes pads and mixer)
     */
    getCustomScenes() {
        const scenes = {};
        this.sceneManager.scenes.forEach((scene, id) => {
            // Export all scenes (pads and mixer can now be exported)
            scenes[id] = {
                name: scene.name,
                type: scene.type,
                enabled: scene.enabled !== undefined ? scene.enabled : true,
                rows: scene.rows,
                columns: scene.columns,
                slots: scene.slots,
                columnsPerRow: scene.columnsPerRow,
                pollDevices: scene.pollDevices,
                pollInterval: scene.pollInterval,
                layout: scene.layout, // For grid-type scenes
                octave: scene.octave, // For piano scenes
                midiChannel: scene.midiChannel, // For piano scenes
                deviceBinding: scene.deviceBinding, // For effects and piano scenes
                programId: scene.programId // For effects scenes
            };
        });
        return scenes;
    }

    /**
     * Load custom scenes from imported config
     */
    loadCustomScenes(scenes) {
        if (!scenes || typeof scenes !== 'object') return;

        Object.entries(scenes).forEach(([id, config]) => {
            this.sceneManager.addScene(id, config);
        });

        // Save to localStorage
        this.saveScenesToStorage();

        // Refresh the scenes list UI
        this.refreshScenesList();
    }

    refreshScenesList() {
        const container = document.getElementById('scenes-list');
        if (!container) return;

        const scenes = this.sceneManager.getScenes(true); // Include disabled scenes
        const sceneArray = Array.from(this.sceneManager.scenes.entries());

        container.innerHTML = scenes.map((scene, index) => {
            // Only pads scene is truly non-editable built-in
            const isNonEditable = (scene.id === 'pads');
            const isBuiltIn = (scene.id === 'pads' || scene.id === 'mixer' || scene.id === 'effects' || scene.id === 'piano');
            const isEnabled = scene.enabled !== false;

            let typeLabel = 'Mixer Layout';
            if (scene.type === 'grid') typeLabel = 'Pad Grid';
            else if (scene.type === 'effects') typeLabel = 'Effects';
            else if (scene.type === 'piano') typeLabel = 'Piano Keyboard';

            return `
                <div class="scene-list-item" data-scene-id="${scene.id}" style="
                    background: ${isEnabled ? '#2a2a2a' : '#1a1a1a'};
                    border: 2px solid ${isEnabled ? '#444' : '#333'};
                    border-radius: 4px;
                    padding: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    opacity: ${isEnabled ? '1' : '0.5'};
                ">
                    <div style="flex: 1; cursor: ${isNonEditable ? 'default' : 'pointer'};" class="scene-name-area">
                        <div style="font-weight: bold; color: ${isEnabled ? '#ccc' : '#666'};">${scene.name}</div>
                        <div style="font-size: 0.8em; color: #666; margin-top: 4px;">
                            ${typeLabel}
                            ${isBuiltIn ? '(Built-in)' : ''}
                            ${!isEnabled ? '(Disabled)' : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        ${index > 0 ? '<button class="scene-move-up" style="padding: 5px 8px; background: #333; border: 1px solid #444; color: #888; cursor: pointer; border-radius: 3px; font-size: 0.8em;">▲</button>' : ''}
                        ${index < scenes.length - 1 ? '<button class="scene-move-down" style="padding: 5px 8px; background: #333; border: 1px solid #444; color: #888; cursor: pointer; border-radius: 3px; font-size: 0.8em;">▼</button>' : ''}
                        <button class="scene-toggle" style="padding: 5px 10px; background: ${isEnabled ? '#2a4a2a' : '#4a2a2a'}; border: 1px solid ${isEnabled ? '#3a5a3a' : '#5a3a3a'}; color: ${isEnabled ? '#4a9e4a' : '#9e4a4a'}; cursor: pointer; border-radius: 3px; font-size: 0.8em; min-width: 70px;">${isEnabled ? 'DISABLE' : 'ENABLE'}</button>
                        ${!isNonEditable ? '<div style="color: #cc4444; font-size: 1.2em; cursor: pointer;" class="scene-edit">✏️</div>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers - all scenes except pads are editable
        container.querySelectorAll('.scene-list-item').forEach((item, index) => {
            const sceneId = item.getAttribute('data-scene-id');

            // Edit button handler
            const editBtn = item.querySelector('.scene-edit');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const scene = this.sceneManager.scenes.get(sceneId);
                    if (scene && scene.type === 'grid') {
                        this.openPadSceneEditor(sceneId);
                    } else if (scene && scene.type === 'effects') {
                        this.openEffectsSceneEditor(sceneId);
                    } else if (scene && scene.type === 'piano') {
                        this.openPianoSceneEditor(sceneId);
                    } else {
                        this.openSceneEditor(sceneId);
                    }
                });
            }

            // Name area click handler (same as edit for non-pads)
            const nameArea = item.querySelector('.scene-name-area');
            if (nameArea && sceneId !== 'pads') {
                nameArea.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const scene = this.sceneManager.scenes.get(sceneId);
                    if (scene && scene.type === 'grid') {
                        this.openPadSceneEditor(sceneId);
                    } else if (scene && scene.type === 'effects') {
                        this.openEffectsSceneEditor(sceneId);
                    } else if (scene && scene.type === 'piano') {
                        this.openPianoSceneEditor(sceneId);
                    } else {
                        this.openSceneEditor(sceneId);
                    }
                });
            }

            // Toggle enable/disable
            const toggleBtn = item.querySelector('.scene-toggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const scene = this.sceneManager.scenes.get(sceneId);
                    if (scene) {
                        scene.enabled = !(scene.enabled !== false);
                        this.saveScenesToStorage();
                        this.refreshScenesList();
                        this.sceneManager.updateSceneSelector();
                    }
                });
            }

            // Move up button
            const moveUpBtn = item.querySelector('.scene-move-up');
            if (moveUpBtn) {
                moveUpBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.moveScene(sceneId, -1);
                });
            }

            // Move down button
            const moveDownBtn = item.querySelector('.scene-move-down');
            if (moveDownBtn) {
                moveDownBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.moveScene(sceneId, 1);
                });
            }
        });

        // Update the scene selector dropdown in the status bar
        this.sceneManager.updateSceneSelector();
    }

    /**
     * Move a scene up or down in the order
     */
    moveScene(sceneId, direction) {
        // Convert Map to array
        const scenesArray = Array.from(this.sceneManager.scenes.entries());

        // Find the index of the scene to move
        const currentIndex = scenesArray.findIndex(([id]) => id === sceneId);
        if (currentIndex === -1) return;

        // Calculate new index
        const newIndex = currentIndex + direction;
        if (newIndex < 0 || newIndex >= scenesArray.length) return;

        // Swap scenes
        const temp = scenesArray[currentIndex];
        scenesArray[currentIndex] = scenesArray[newIndex];
        scenesArray[newIndex] = temp;

        // Recreate the Map with new order
        this.sceneManager.scenes.clear();
        scenesArray.forEach(([id, scene]) => {
            this.sceneManager.scenes.set(id, scene);
        });

        // Save and refresh
        this.saveScenesToStorage();
        this.refreshScenesList();
        this.sceneManager.updateSceneSelector();
    }

    /**
     * Apply a template to the current scene being edited
     */
    applyTemplate(templateType) {
        let layout, slots;

        switch (templateType) {
            case '1x10':
                layout = '1x10';
                slots = [
                    { type: 'CHANNEL', channel: 0, deviceBinding: null },
                    { type: 'CHANNEL', channel: 1, deviceBinding: null },
                    { type: 'CHANNEL', channel: 2, deviceBinding: null },
                    { type: 'CHANNEL', channel: 3, deviceBinding: null },
                    { type: 'CHANNEL', channel: 4, deviceBinding: null },
                    { type: 'CHANNEL', channel: 5, deviceBinding: null },
                    { type: 'CHANNEL', channel: 6, deviceBinding: null },
                    { type: 'CHANNEL', channel: 7, deviceBinding: null },
                    { type: 'MIX', label: 'Master', deviceBinding: null },
                    { type: 'TEMPO', label: 'BPM', deviceBinding: null }
                ];
                break;

            case '1x12':
                layout = '1x12';
                slots = [
                    { type: 'CHANNEL', channel: 0, deviceBinding: null },
                    { type: 'CHANNEL', channel: 1, deviceBinding: null },
                    { type: 'CHANNEL', channel: 2, deviceBinding: null },
                    { type: 'CHANNEL', channel: 3, deviceBinding: null },
                    { type: 'CHANNEL', channel: 4, deviceBinding: null },
                    { type: 'CHANNEL', channel: 5, deviceBinding: null },
                    { type: 'CHANNEL', channel: 6, deviceBinding: null },
                    { type: 'CHANNEL', channel: 7, deviceBinding: null },
                    { type: 'INPUT', label: 'Input', deviceBinding: null },
                    { type: 'MIX', label: 'Master', deviceBinding: null },
                    { type: 'STEREO', label: 'Stereo', deviceBinding: null },
                    { type: 'TEMPO', label: 'BPM', deviceBinding: null }
                ];
                break;

            default:
                console.error(`Unknown template type: ${templateType}`);
                return;
        }

        // Update scene config with template
        this.sceneConfig.layout = layout;
        this.sceneConfig.faders = slots;

        // Update layout dropdown
        document.getElementById('scene-layout').value = layout;

        // Re-render the fader grid
        this.renderFaderGrid();

        console.log(`[SceneEditor] Applied ${layout} template`);
    }
}
