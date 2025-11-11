/**
 * Settings UI Management for Meister
 * Handles tabbed settings interface and input mapping UI
 */

import { InputAction, getActionName, MidiInputMapping, KeyboardMapping } from './input-actions.js';
import { MidiDeviceConfig } from './input-mapper.js';

export class SettingsUI {
    constructor(controller) {
        this.controller = controller;
        this.setupTabSwitching();
        this.setupScenesUI();
        this.setupMIDIDevicesUI();
        this.setupMIDIMappingsUI();
        this.setupKeyboardUI();
    }

    /**
     * Setup tab switching functionality
     */
    setupTabSwitching() {
        const tabs = document.querySelectorAll('.settings-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs and contents
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                // Add active class to clicked tab
                tab.classList.add('active');

                // Show corresponding content
                const tabId = tab.getAttribute('data-tab');
                const content = document.getElementById(`tab-${tabId}`);
                if (content) {
                    content.classList.add('active');

                    // Refresh content when tab is activated
                    if (tabId === 'scenes') {
                        this.refreshScenesList();
                    } else if (tabId === 'midi-devices') {
                        this.refreshMIDIDevicesList();
                    } else if (tabId === 'midi-mappings') {
                        this.refreshMIDIMappingsList();
                    } else if (tabId === 'keyboard') {
                        this.refreshKeyboardShortcutsList();
                    }
                }
            });
        });
    }

    /**
     * Setup Scenes UI
     */
    setupScenesUI() {
        this.refreshScenesList();
    }

    /**
     * Refresh scenes list display
     */
    refreshScenesList() {
        const container = document.getElementById('scenes-list');
        if (!container) return;

        if (!this.controller.sceneManager) {
            container.innerHTML = '<div class="empty-state">Scene manager not initialized</div>';
            return;
        }

        const scenes = this.controller.sceneManager.getScenes(true); // Include disabled scenes
        const currentScene = this.controller.sceneManager.currentScene;

        container.innerHTML = scenes.map((scene, index) => {
            const isBuiltIn = ['pads', 'mixer', 'effects', 'piano'].includes(scene.id);
            const isEnabled = scene.enabled !== false;
            const isActive = scene.id === currentScene;

            let typeLabel = 'Mixer';
            if (scene.type === 'grid') typeLabel = 'Grid';
            else if (scene.type === 'effects') typeLabel = 'Effects';
            else if (scene.type === 'piano') typeLabel = 'Piano';
            else if (scene.type === 'split') typeLabel = 'Split';

            return `
                <div class="scene-item ${isActive ? 'active' : ''}" data-scene-id="${scene.id}" style="opacity: ${isEnabled ? '1' : '0.5'};">
                    <div class="scene-info" style="min-width: 150px; flex: 0 0 auto;">
                        <div class="scene-name" style="color: ${isEnabled ? '#ccc' : '#666'};">${scene.name}</div>
                        <div class="scene-type" style="color: #666; font-size: 0.85em;">
                            ${typeLabel}
                            ${isBuiltIn ? ' (Built-in)' : ''}
                            ${!isEnabled ? ' (Disabled)' : ''}
                        </div>
                    </div>
                    <button class="scene-switch-btn" data-scene-id="${scene.id}" style="flex: 1; margin: 0 10px;">
                        ${isActive ? 'Active' : 'Switch'}
                    </button>
                    <div style="display: flex; gap: 4px; align-items: center; flex-shrink: 0; margin-left: 8px;">
                        <button class="scene-move-up" data-scene-id="${scene.id}" style="padding: 3px 7px; background: #333; border: 1px solid #444; color: ${index > 0 ? '#888' : '#333'}; cursor: ${index > 0 ? 'pointer' : 'default'}; border-radius: 2px; font-size: 0.75em;" ${index === 0 ? 'disabled' : ''}>▲</button>
                        <button class="scene-move-down" data-scene-id="${scene.id}" style="padding: 3px 7px; background: #333; border: 1px solid #444; color: ${index < scenes.length - 1 ? '#888' : '#333'}; cursor: ${index < scenes.length - 1 ? 'pointer' : 'default'}; border-radius: 2px; font-size: 0.75em;" ${index === scenes.length - 1 ? 'disabled' : ''}>▼</button>
                        <button class="scene-toggle" data-scene-id="${scene.id}" style="padding: 3px 10px; background: ${isEnabled ? '#4a2a2a' : '#2a4a2a'}; border: 1px solid ${isEnabled ? '#5a3a3a' : '#3a5a3a'}; color: ${isEnabled ? '#9e4a4a' : '#4a9e4a'}; cursor: pointer; border-radius: 2px; font-size: 0.75em; white-space: nowrap;">${isEnabled ? 'DISABLE' : 'ENABLE'}</button>
                        <div style="color: #cc4444; font-size: 1em; cursor: pointer; padding: 0 4px; display: flex; align-items: center;" class="scene-edit" data-scene-id="${scene.id}">✏️</div>
                        <div style="color: #cc4444; font-size: 1em; cursor: pointer; padding: 0 4px; display: flex; align-items: center;" class="scene-delete" data-scene-id="${scene.id}">🗑️</div>
                    </div>
                </div>
            `;
        }).join('');

        // Add switch handlers
        container.querySelectorAll('.scene-switch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sceneId = btn.getAttribute('data-scene-id');
                this.controller.sceneManager.switchScene(sceneId);
                this.refreshScenesList();
            });
        });

        // Add edit handlers
        container.querySelectorAll('.scene-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const sceneId = btn.getAttribute('data-scene-id');
                const scene = this.controller.sceneManager.scenes.get(sceneId);
                if (!scene) return;

                if (scene.type === 'grid') {
                    this.controller.sceneEditor.openPadSceneEditor(sceneId);
                } else if (scene.type === 'effects') {
                    this.controller.sceneEditor.openEffectsSceneEditor(sceneId);
                } else if (scene.type === 'piano') {
                    this.controller.sceneEditor.openPianoSceneEditor(sceneId);
                } else if (scene.type === 'split') {
                    this.controller.sceneEditor.openSplitSceneEditor(sceneId);
                } else {
                    this.controller.sceneEditor.openSceneEditor(sceneId);
                }
            });
        });

        // Add move up handlers
        container.querySelectorAll('.scene-move-up').forEach(btn => {
            btn.addEventListener('click', () => {
                const sceneId = btn.getAttribute('data-scene-id');
                this.moveScene(sceneId, -1);
            });
        });

        // Add move down handlers
        container.querySelectorAll('.scene-move-down').forEach(btn => {
            btn.addEventListener('click', () => {
                const sceneId = btn.getAttribute('data-scene-id');
                this.moveScene(sceneId, 1);
            });
        });

        // Add toggle handlers
        container.querySelectorAll('.scene-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const sceneId = btn.getAttribute('data-scene-id');
                const scene = this.controller.sceneManager.scenes.get(sceneId);
                if (scene) {
                    scene.enabled = !scene.enabled;
                    this.controller.sceneEditor?.saveScenesToStorage();
                    this.refreshScenesList();
                }
            });
        });

        // Add delete handlers
        container.querySelectorAll('.scene-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const sceneId = btn.getAttribute('data-scene-id');
                const scene = this.controller.sceneManager.scenes.get(sceneId);
                if (scene && confirm(`Delete scene "${scene.name}"?\n\nThis action cannot be undone.`)) {
                    this.controller.sceneManager.scenes.delete(sceneId);
                    this.controller.sceneEditor?.saveScenesToStorage();
                    this.refreshScenesList();
                }
            });
        });
    }

    moveScene(sceneId, direction) {
        const scenesArray = Array.from(this.controller.sceneManager.scenes.entries());
        const currentIndex = scenesArray.findIndex(([id]) => id === sceneId);

        if (currentIndex === -1) return;

        const newIndex = currentIndex + direction;
        if (newIndex < 0 || newIndex >= scenesArray.length) return;

        // Swap scenes
        [scenesArray[currentIndex], scenesArray[newIndex]] = [scenesArray[newIndex], scenesArray[currentIndex]];

        // Rebuild scenes map in new order
        this.controller.sceneManager.scenes.clear();
        scenesArray.forEach(([id, scene]) => {
            this.controller.sceneManager.scenes.set(id, scene);
        });

        // Save and refresh
        this.controller.sceneEditor?.saveScenesToStorage();
        this.refreshScenesList();
    }

    /**
     * Setup MIDI Devices UI
     */
    setupMIDIDevicesUI() {
        // Refresh devices list when settings are opened
        const settingsOverlay = document.getElementById('settings-overlay');
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (settingsOverlay.classList.contains('active')) {
                        this.refreshMIDIDevicesList();
                    }
                }
            });
        });
        observer.observe(settingsOverlay, { attributes: true });
    }

    /**
     * Refresh MIDI devices list
     */
    refreshMIDIDevicesList() {
        const tbody = document.getElementById('midi-devices-list');
        if (!tbody || !this.controller.midiAccess) return;

        const inputs = Array.from(this.controller.midiAccess.inputs.values());

        if (inputs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No MIDI input devices detected</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        inputs.forEach(input => {
            const config = this.controller.inputMapper.getDeviceConfig(input.name);
            const row = document.createElement('tr');

            // Device name
            const nameCell = document.createElement('td');
            nameCell.textContent = input.name;
            row.appendChild(nameCell);

            // Routing mode
            const modeCell = document.createElement('td');
            const modeSelect = document.createElement('select');
            modeSelect.innerHTML = `
                <option value="input" ${config.routingMode === 'input' ? 'selected' : ''}>INPUT (Actions)</option>
                <option value="routed" ${config.routingMode === 'routed' ? 'selected' : ''}>ROUTED (Direct)</option>
            `;
            modeSelect.addEventListener('change', (e) => {
                this.updateDeviceRouting(input.name, e.target.value);
            });
            modeCell.appendChild(modeSelect);
            row.appendChild(modeCell);

            // Route to output
            const outputCell = document.createElement('td');
            if (config.routingMode === 'routed') {
                const outputSelect = document.createElement('select');
                outputSelect.innerHTML = '<option value="">-- Select Output --</option>';

                // Populate with available outputs
                if (this.controller.midiAccess) {
                    const outputs = Array.from(this.controller.midiAccess.outputs.values());
                    outputs.forEach(output => {
                        const option = document.createElement('option');
                        option.value = output.name;
                        option.textContent = output.name;
                        option.selected = config.routeToOutput === output.name;
                        outputSelect.appendChild(option);
                    });
                }

                outputSelect.addEventListener('change', (e) => {
                    this.updateDeviceOutput(input.name, e.target.value);
                });
                outputCell.appendChild(outputSelect);
            } else {
                outputCell.textContent = '—';
                outputCell.style.color = '#555';
            }
            row.appendChild(outputCell);

            tbody.appendChild(row);
        });
    }

    /**
     * Update device routing mode
     */
    updateDeviceRouting(deviceName, mode) {
        const currentConfig = this.controller.inputMapper.getDeviceConfig(deviceName);
        const newConfig = new MidiDeviceConfig({
            deviceName,
            routingMode: mode,
            routeToOutput: currentConfig.routeToOutput || '',
            enabled: true,
        });

        this.controller.inputMapper.setDeviceConfig(deviceName, newConfig);
        this.controller.saveConfig();

        console.log(`[Settings] ${deviceName} → ${mode.toUpperCase()} mode`);
        this.refreshMIDIDevicesList(); // Refresh to show/hide output selector
    }

    /**
     * Update device output routing
     */
    updateDeviceOutput(deviceName, outputName) {
        const currentConfig = this.controller.inputMapper.getDeviceConfig(deviceName);
        const newConfig = new MidiDeviceConfig({
            deviceName,
            routingMode: currentConfig.routingMode,
            routeToOutput: outputName,
            enabled: true,
        });

        this.controller.inputMapper.setDeviceConfig(deviceName, newConfig);
        this.controller.saveConfig();

        console.log(`[Settings] ${deviceName} routes to ${outputName}`);
    }

    /**
     * Setup MIDI Mappings UI
     */
    setupMIDIMappingsUI() {
        // Populate action select
        this.populateActionSelect('learn-action-select');

        // Populate target device select
        this.populateTargetDeviceSelect();

        // MIDI Learn button
        const learnBtn = document.getElementById('midi-learn-btn');
        if (learnBtn) {
            learnBtn.addEventListener('click', () => {
                this.toggleMIDILearn();
            });
        }

        // Refresh device selector when MIDI mappings tab is shown
        const settingsOverlay = document.getElementById('settings-overlay');
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (settingsOverlay.classList.contains('active')) {
                        const activeTab = document.querySelector('.settings-tab.active');
                        if (activeTab && activeTab.getAttribute('data-tab') === 'midi-mappings') {
                            this.populateTargetDeviceSelect();
                        }
                    }
                }
            });
        });
        observer.observe(settingsOverlay, { attributes: true });
    }

    /**
     * Populate target device selector
     */
    populateTargetDeviceSelect() {
        const select = document.getElementById('learn-target-device-select');
        if (!select) return;

        // Default option
        select.innerHTML = '<option value="0">Target: Default Device (0)</option>';

        // Add all registered devices
        if (this.controller.deviceManager) {
            const devices = this.controller.deviceManager.getAllDevices();
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId.toString();
                option.textContent = `Target: ${device.name} (${device.deviceId})`;
                select.appendChild(option);
            });
        }
    }

    /**
     * Toggle MIDI learn mode
     */
    toggleMIDILearn() {
        const learnBtn = document.getElementById('midi-learn-btn');
        const actionSelect = document.getElementById('learn-action-select');
        const targetDeviceSelect = document.getElementById('learn-target-device-select');

        if (this.controller.inputMapper.learnMode) {
            // Disable learn mode
            this.controller.inputMapper.disableLearnMode();
            learnBtn.classList.remove('active');
            learnBtn.textContent = '🎹 MIDI LEARN';
        } else {
            // Check if action is selected
            const actionId = parseInt(actionSelect.value);
            if (!actionId) {
                alert('Please select an action first');
                return;
            }

            // Get target device ID
            const targetDeviceId = parseInt(targetDeviceSelect.value) || 0;

            // Enable learn mode
            learnBtn.classList.add('active');
            learnBtn.textContent = '⏹ STOP LEARNING (move a control...)';

            this.controller.inputMapper.enableLearnMode((deviceName, channel, number, type) => {
                console.log(`[MIDI Learn] ${type.toUpperCase()} ${number} from ${deviceName} → Action ${actionId} on Device ${targetDeviceId}`);

                const mapping = new MidiInputMapping({
                    deviceName,
                    type,
                    channel,
                    number,
                    action: actionId,
                    continuous: type === 'cc',
                    targetDeviceId: targetDeviceId,
                    targetProgramId: 0, // Default to 0 (Regroove)
                });

                this.controller.inputMapper.addMidiMapping(mapping);
                this.controller.saveConfig();

                // Reset UI
                learnBtn.classList.remove('active');
                learnBtn.textContent = '🎹 MIDI LEARN';
                actionSelect.value = '';

                // Refresh list
                this.refreshMIDIMappingsList();

                // Get target device name for alert
                let targetDeviceName = `Device ${targetDeviceId}`;
                if (this.controller.deviceManager) {
                    const devices = this.controller.deviceManager.getAllDevices();
                    const targetDevice = devices.find(d => d.deviceId === targetDeviceId);
                    if (targetDevice) {
                        targetDeviceName = targetDevice.name;
                    }
                }

                alert(`Mapped ${type.toUpperCase()} ${number} → ${getActionName(actionId)}\nTarget: ${targetDeviceName}`);
            });
        }
    }

    /**
     * Refresh MIDI mappings list
     */
    refreshMIDIMappingsList() {
        const tbody = document.getElementById('midi-mappings-list');
        if (!tbody) return;

        const mappings = this.controller.inputMapper.midiMappings;

        if (mappings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No MIDI mappings configured<br>Use MIDI Learn to add mappings</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        mappings.forEach((mapping, index) => {
            const row = document.createElement('tr');

            // From Device
            const deviceCell = document.createElement('td');
            deviceCell.textContent = mapping.deviceName || 'Any';
            deviceCell.style.fontSize = '0.75em';
            row.appendChild(deviceCell);

            // Type
            const typeCell = document.createElement('td');
            typeCell.textContent = mapping.type.toUpperCase();
            typeCell.style.fontSize = '0.8em';
            row.appendChild(typeCell);

            // Number
            const numberCell = document.createElement('td');
            numberCell.textContent = mapping.number;
            row.appendChild(numberCell);

            // Action
            const actionCell = document.createElement('td');
            actionCell.textContent = getActionName(mapping.action);
            actionCell.style.fontSize = '0.85em';
            row.appendChild(actionCell);

            // Target Device
            const targetCell = document.createElement('td');
            const targetDeviceId = mapping.targetDeviceId !== undefined ? mapping.targetDeviceId : 0;

            // Get target device name
            let targetName = `Dev ${targetDeviceId}`;
            if (this.controller.deviceManager) {
                const devices = this.controller.deviceManager.getAllDevices();
                const targetDevice = devices.find(d => d.deviceId === targetDeviceId);
                if (targetDevice) {
                    targetName = targetDevice.name;
                }
            }

            targetCell.textContent = targetName;
            targetCell.style.fontSize = '0.75em';
            targetCell.style.color = '#888';
            row.appendChild(targetCell);

            // Delete button
            const deleteCell = document.createElement('td');
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', () => {
                this.deleteMIDIMapping(index);
            });
            deleteCell.appendChild(deleteBtn);
            row.appendChild(deleteCell);

            tbody.appendChild(row);
        });
    }

    /**
     * Delete MIDI mapping
     */
    deleteMIDIMapping(index) {
        if (confirm('Delete this MIDI mapping?')) {
            this.controller.inputMapper.removeMidiMapping(index);
            this.controller.saveConfig();
            this.refreshMIDIMappingsList();
        }
    }

    /**
     * Setup keyboard shortcuts UI
     */
    setupKeyboardUI() {
        const addBtn = document.getElementById('add-keyboard-shortcut-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.addKeyboardShortcut();
            });
        }

        // Initial refresh
        this.refreshKeyboardShortcutsList();
    }

    /**
     * Refresh keyboard shortcuts list
     */
    refreshKeyboardShortcutsList() {
        const tbody = document.getElementById('keyboard-shortcuts-list');
        if (!tbody) return;

        const mappings = this.controller.inputMapper.keyboardMappings;

        if (mappings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Only default shortcuts active<br>Click "ADD SHORTCUT" to add custom shortcuts</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        mappings.forEach((mapping, index) => {
            const row = document.createElement('tr');

            // Key
            const keyCell = document.createElement('td');
            keyCell.textContent = mapping.key || mapping.code;
            row.appendChild(keyCell);

            // Modifiers
            const modCell = document.createElement('td');
            const mods = [];
            if (mapping.ctrl) mods.push('Ctrl');
            if (mapping.shift) mods.push('Shift');
            if (mapping.alt) mods.push('Alt');
            modCell.textContent = mods.join(' + ') || '—';
            modCell.style.fontSize = '0.85em';
            row.appendChild(modCell);

            // Action
            const actionCell = document.createElement('td');
            actionCell.textContent = getActionName(mapping.action);
            actionCell.style.fontSize = '0.85em';
            row.appendChild(actionCell);

            // Delete button
            const deleteCell = document.createElement('td');
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', () => {
                this.deleteKeyboardShortcut(index);
            });
            deleteCell.appendChild(deleteBtn);
            row.appendChild(deleteCell);

            tbody.appendChild(row);
        });
    }

    /**
     * Add keyboard shortcut
     */
    addKeyboardShortcut() {
        // TODO: Show a dialog to add new shortcut
        alert('Keyboard shortcut editor coming soon!\n\nFor now, use console:\nimport { KeyboardMapping, InputAction } from "./input-actions.js";\nmeisterController.inputMapper.addKeyboardMapping(new KeyboardMapping({ key: "r", action: InputAction.ACTION_REGROOVE_RECORD_TOGGLE }));');
    }

    /**
     * Delete keyboard shortcut
     */
    deleteKeyboardShortcut(index) {
        if (confirm('Delete this keyboard shortcut?')) {
            this.controller.inputMapper.removeKeyboardMapping(index);
            this.controller.saveConfig();
            this.refreshKeyboardShortcutsList();
        }
    }

    /**
     * Populate action select dropdown
     */
    populateActionSelect(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;

        const groups = {
            'Transport': [
                InputAction.ACTION_REGROOVE_PLAY,
                InputAction.ACTION_REGROOVE_STOP,
                InputAction.ACTION_REGROOVE_PLAY_PAUSE,
                InputAction.ACTION_REGROOVE_RETRIGGER,
                InputAction.ACTION_REGROOVE_LOOP_TOGGLE,
            ],
            'Navigation': [
                InputAction.ACTION_REGROOVE_ORDER_NEXT,
                InputAction.ACTION_REGROOVE_ORDER_PREV,
            ],
            'Files': [
                InputAction.ACTION_REGROOVE_FILE_LOAD,
                InputAction.ACTION_REGROOVE_FILE_NEXT,
                InputAction.ACTION_REGROOVE_FILE_PREV,
            ],
            'Mixer - Master': [
                InputAction.ACTION_REGROOVE_MASTER_VOLUME,
                InputAction.ACTION_REGROOVE_MASTER_PAN,
                InputAction.ACTION_REGROOVE_MASTER_MUTE,
            ],
            'Mixer - Input': [
                InputAction.ACTION_REGROOVE_INPUT_VOLUME,
                InputAction.ACTION_REGROOVE_INPUT_PAN,
                InputAction.ACTION_REGROOVE_INPUT_MUTE,
            ],
            'Mixer - Other': [
                InputAction.ACTION_REGROOVE_FX_ROUTING,
                InputAction.ACTION_REGROOVE_TEMPO_SET,
                InputAction.ACTION_REGROOVE_STEREO_SEP,
            ],
            'Effects': [
                InputAction.ACTION_REGROOVE_FX_ENABLE,
                InputAction.ACTION_REGROOVE_FX_PARAM,
            ],
            'MIDI Clock': [
                InputAction.ACTION_CLOCK_MASTER_TOGGLE,
                InputAction.ACTION_CLOCK_START,
                InputAction.ACTION_CLOCK_STOP,
                InputAction.ACTION_CLOCK_BPM_INC,
                InputAction.ACTION_CLOCK_BPM_DEC,
            ],
            'MIDI Sync': [
                InputAction.ACTION_REGROOVE_SYNC_TEMPO_TOGGLE,
                InputAction.ACTION_REGROOVE_SYNC_TRANSPORT_TOGGLE,
                InputAction.ACTION_REGROOVE_SYNC_SPP_TOGGLE,
                InputAction.ACTION_REGROOVE_SYNC_RECEIVE_TOGGLE,
                InputAction.ACTION_REGROOVE_SYNC_SEND_TOGGLE,
            ],
        };

        Object.entries(groups).forEach(([groupName, actions]) => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupName;

            actions.forEach(actionId => {
                const option = document.createElement('option');
                option.value = actionId;
                option.textContent = getActionName(actionId);
                optgroup.appendChild(option);
            });

            select.appendChild(optgroup);
        });
    }
}
