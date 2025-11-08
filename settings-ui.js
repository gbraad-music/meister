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

        const scenes = this.controller.sceneManager.getScenes();
        const currentScene = this.controller.sceneManager.currentScene;

        container.innerHTML = scenes.map(scene => `
            <div class="scene-item ${scene.id === currentScene ? 'active' : ''}"
                 data-scene-id="${scene.id}">
                <div class="scene-info">
                    <div class="scene-name">${scene.name}</div>
                    <div class="scene-type" style="color: #666; font-size: 0.85em;">
                        ${scene.type === 'grid' ? 'Grid Layout' : 'Slider Layout'}
                    </div>
                </div>
                <button class="scene-switch-btn" data-scene-id="${scene.id}">
                    ${scene.id === currentScene ? 'Active' : 'Switch'}
                </button>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.scene-switch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sceneId = btn.getAttribute('data-scene-id');
                this.controller.sceneManager.switchScene(sceneId);
                this.refreshScenesList();
            });
        });
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

        // MIDI Learn button
        const learnBtn = document.getElementById('midi-learn-btn');
        if (learnBtn) {
            learnBtn.addEventListener('click', () => {
                this.toggleMIDILearn();
            });
        }
    }

    /**
     * Toggle MIDI learn mode
     */
    toggleMIDILearn() {
        const learnBtn = document.getElementById('midi-learn-btn');
        const actionSelect = document.getElementById('learn-action-select');

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

            // Enable learn mode
            learnBtn.classList.add('active');
            learnBtn.textContent = '⏹ STOP LEARNING (move a control...)';

            this.controller.inputMapper.enableLearnMode((deviceName, channel, number, type) => {
                console.log(`[MIDI Learn] ${type.toUpperCase()} ${number} from ${deviceName}`);

                const mapping = new MidiInputMapping({
                    deviceName,
                    type,
                    channel,
                    number,
                    action: actionId,
                    continuous: type === 'cc',
                });

                this.controller.inputMapper.addMidiMapping(mapping);
                this.controller.saveConfig();

                // Reset UI
                learnBtn.classList.remove('active');
                learnBtn.textContent = '🎹 MIDI LEARN';
                actionSelect.value = '';

                // Refresh list
                this.refreshMIDIMappingsList();

                alert(`Mapped ${type.toUpperCase()} ${number} → ${getActionName(actionId)}`);
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
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No MIDI mappings configured<br>Use MIDI Learn to add mappings</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        mappings.forEach((mapping, index) => {
            const row = document.createElement('tr');

            // Device
            const deviceCell = document.createElement('td');
            deviceCell.textContent = mapping.deviceName || 'Any';
            deviceCell.style.fontSize = '0.8em';
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
