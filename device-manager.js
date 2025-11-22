/**
 * Device Manager for Meister
 * Manages Regroove device instances with MIDI channel and SysEx device ID mappings
 */

export class DeviceManager {
    constructor(controller) {
        this.controller = controller;
        this.devices = new Map(); // Map of device binding name -> device config
        this.defaultDeviceId = null;

        this.loadDevices();
        this.setupUI();
    }

    /**
     * Add or update a device instance
     */
    addDevice(id, config) {
        const device = {
            id: id,
            name: config.name || 'Unnamed Device',
            type: config.type || 'generic', // 'generic', 'regroove', or 'samplecrate'
            midiChannel: config.midiChannel ?? 0,
            deviceId: config.deviceId ?? 0,
            color: config.color || '#cc4444',
            midiOutputId: config.midiOutputId || null // null = use default MIDI output
        };

        this.devices.set(id, device);
        this.saveDevices();
        this.refreshDeviceList();

        console.log(`[Devices] Added/updated device: ${device.name} (Type: ${device.type}, Ch ${device.midiChannel}, ID ${device.deviceId}, Output: ${device.midiOutputId || 'default'})`);
    }

    /**
     * Remove a device instance
     */
    removeDevice(id) {
        if (this.devices.delete(id)) {
            // If this was the default device, clear the default
            if (this.defaultDeviceId === id) {
                this.defaultDeviceId = null;
            }

            this.saveDevices();
            this.refreshDeviceList();
            console.log(`[Devices] Removed device: ${id}`);
        }
    }

    /**
     * Get device configuration by ID
     */
    getDevice(id) {
        return this.devices.get(id);
    }

    /**
     * Get device by SysEx device ID (0-15)
     */
    getDeviceByDeviceId(deviceId) {
        for (let device of this.devices.values()) {
            if (device.deviceId === deviceId) {
                return device;
            }
        }
        return null;
    }

    /**
     * Get default device
     */
    getDefaultDevice() {
        if (this.defaultDeviceId) {
            return this.devices.get(this.defaultDeviceId);
        }
        // Return first device if no default set
        const firstDevice = this.devices.values().next().value;
        return firstDevice || null;
    }

    /**
     * Set default device
     */
    setDefaultDevice(id) {
        if (this.devices.has(id)) {
            this.defaultDeviceId = id;
            this.saveDevices();
            this.refreshDeviceList();
            console.log(`[Devices] Default device set to: ${this.devices.get(id).name}`);
        }
    }

    /**
     * Get MIDI output for a device (resolves to actual MIDI output port)
     * Returns the device-specific output if set, otherwise returns the default controller output
     */
    getMidiOutput(deviceId) {
        const device = this.getDevice(deviceId);

        if (!device) {
            // Fallback to controller's default output
            return this.controller.midiOutput;
        }

        // If device has a specific MIDI output assigned, use it
        if (device.midiOutputId && this.controller.midiAccess) {
            const output = this.controller.midiAccess.outputs.get(device.midiOutputId);
            if (output) {
                return output;
            }
            console.warn(`[Devices] MIDI output ${device.midiOutputId} not found for device ${device.name}, using default`);
        }

        // Fallback to controller's default output
        return this.controller.midiOutput;
    }

    /**
     * Get all devices as array
     */
    getAllDevices() {
        return Array.from(this.devices.values());
    }

    /**
     * Save devices to localStorage
     */
    saveDevices() {
        const devicesData = {
            devices: Array.from(this.devices.entries()).map(([id, device]) => ({
                id,
                ...device
            })),
            defaultDeviceId: this.defaultDeviceId
        };

        localStorage.setItem('meisterDevices', JSON.stringify(devicesData));
    }

    /**
     * Load devices from localStorage
     */
    loadDevices() {
        try {
            const saved = localStorage.getItem('meisterDevices');
            if (saved) {
                const data = JSON.parse(saved);

                // Restore devices
                if (data.devices && Array.isArray(data.devices)) {
                    data.devices.forEach(device => {
                        this.devices.set(device.id, {
                            id: device.id,
                            name: device.name,
                            type: device.type || 'generic', // Restore type field!
                            midiChannel: device.midiChannel,
                            deviceId: device.deviceId,
                            color: device.color || '#cc4444',
                            midiOutputId: device.midiOutputId || null
                        });
                        console.log(`[Devices] Loaded: ${device.name} (Type: ${device.type || 'generic'}) - MIDI Ch ${device.midiChannel + 1}, Device ID ${device.deviceId}, Output: ${device.midiOutputId || 'default'}`);
                    });
                }

                // Restore default device
                this.defaultDeviceId = data.defaultDeviceId || null;

                console.log(`[Devices] Loaded ${this.devices.size} device(s) total`);
            } else {
                // Create default device if none exist
                this.createDefaultDevice();
            }
        } catch (e) {
            console.error('[Devices] Failed to load devices:', e);
            this.createDefaultDevice();
        }
    }

    /**
     * Create a default device instance
     */
    createDefaultDevice() {
        const defaultId = 'default';
        this.addDevice(defaultId, {
            name: 'Default Regroove',
            midiChannel: 0,
            deviceId: 0,
            color: '#cc4444'
        });
        this.setDefaultDevice(defaultId);
        console.log('[Devices] Created default device instance');
    }

    /**
     * Setup UI event handlers
     */
    setupUI() {
        // Add device button
        document.getElementById('add-device-btn')?.addEventListener('click', () => {
            this.openDeviceEditor();
        });

        // Close device editor button
        document.getElementById('close-device-editor')?.addEventListener('click', () => {
            this.closeDeviceEditor();
        });

        // Save device button
        document.getElementById('save-device')?.addEventListener('click', () => {
            this.saveDeviceFromEditor();
        });

        // Delete device button
        document.getElementById('delete-device')?.addEventListener('click', () => {
            this.deleteDeviceFromEditor();
        });

        // Color picker change handler
        document.getElementById('device-color')?.addEventListener('input', (e) => {
            const colorValue = document.getElementById('device-color-value');
            if (colorValue) {
                colorValue.textContent = e.target.value;
            }
        });

        // Refresh list on load
        this.refreshDeviceList();
    }

    /**
     * Open device editor panel
     */
    openDeviceEditor(deviceId = null) {
        this.editingDeviceId = deviceId;

        // Set panel title
        const title = deviceId ? 'EDIT DEVICE INSTANCE' : 'ADD DEVICE INSTANCE';
        document.getElementById('device-editor-title').textContent = title;

        // Populate MIDI output dropdown
        this.populateDeviceMidiOutputs();

        if (deviceId) {
            // Edit existing device
            const device = this.devices.get(deviceId);
            if (device) {
                document.getElementById('device-name').value = device.name;
                document.getElementById('device-midi-channel').value = device.midiChannel;
                document.getElementById('device-sysex-id').value = device.deviceId;
                document.getElementById('device-midi-output').value = device.midiOutputId || '';
                document.getElementById('device-type').value = device.type || 'regroove';
                document.getElementById('device-color').value = device.color || '#cc4444';
                document.getElementById('device-color-value').textContent = device.color || '#cc4444';
                document.getElementById('delete-device').style.display = 'inline-block';
            }
        } else {
            // New device - defaults
            document.getElementById('device-name').value = 'New Device';
            document.getElementById('device-midi-channel').value = 0;
            document.getElementById('device-sysex-id').value = 0;
            document.getElementById('device-midi-output').value = '';
            document.getElementById('device-type').value = 'regroove';
            document.getElementById('device-color').value = '#cc4444';
            document.getElementById('device-color-value').textContent = '#cc4444';
            document.getElementById('delete-device').style.display = 'none';
        }

        // Show panel
        document.getElementById('device-editor-overlay').classList.add('active');

        // Focus on name input
        setTimeout(() => {
            document.getElementById('device-name').focus();
            document.getElementById('device-name').select();
        }, 100);
    }

    /**
     * Populate MIDI output dropdown in device editor
     */
    populateDeviceMidiOutputs() {
        const select = document.getElementById('device-midi-output');
        if (!select) return;

        select.innerHTML = '<option value="">Use Default Output</option>';

        if (this.controller.midiAccess) {
            const outputs = Array.from(this.controller.midiAccess.outputs.values());
            outputs.forEach(output => {
                const option = document.createElement('option');
                option.value = output.id;
                option.textContent = output.name;
                select.appendChild(option);
            });
        }
    }

    /**
     * Close device editor panel
     */
    closeDeviceEditor() {
        document.getElementById('device-editor-overlay').classList.remove('active');
        this.editingDeviceId = null;
    }

    /**
     * Save device from editor panel
     */
    saveDeviceFromEditor() {
        const name = document.getElementById('device-name').value.trim();
        if (!name) {
            window.nbDialog.alert('Please enter a device name');
            return;
        }

        const midiChannel = parseInt(document.getElementById('device-midi-channel').value);
        const sysexDeviceId = parseInt(document.getElementById('device-sysex-id').value);
        const midiOutputId = document.getElementById('device-midi-output').value || null;
        const deviceType = document.getElementById('device-type').value || 'regroove';
        const deviceColor = document.getElementById('device-color').value || '#cc4444';

        const id = this.editingDeviceId || `device-${Date.now()}`;

        this.addDevice(id, {
            name: name,
            type: deviceType,
            midiChannel: midiChannel,
            deviceId: sysexDeviceId,
            midiOutputId: midiOutputId,
            color: deviceColor
        });

        // If this is the first device, make it default
        if (this.devices.size === 1 && !this.defaultDeviceId) {
            this.setDefaultDevice(id);
        }

        this.closeDeviceEditor();
    }

    /**
     * Delete device from editor panel
     */
    deleteDeviceFromEditor() {
        if (!this.editingDeviceId) return;

        const device = this.devices.get(this.editingDeviceId);
        if (!device) return;

        window.nbDialog.confirm(`Delete device "${device.name}"?`, (confirmed) => {
            if (confirmed) {
                this.removeDevice(this.editingDeviceId);
                this.closeDeviceEditor();
            }
        });
    }

    /**
     * Refresh device list UI
     */
    refreshDeviceList() {
        const tbody = document.getElementById('devices-list');
        if (!tbody) return;

        const devices = this.getAllDevices();

        if (devices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No device instances configured<br>Add a device instance to get started</td></tr>';
            return;
        }

        tbody.innerHTML = devices.map(device => {
            const isDefault = device.id === this.defaultDeviceId;

            // Get MIDI output name
            let outputName = 'Default';
            if (device.midiOutputId && this.controller.midiAccess) {
                const output = this.controller.midiAccess.outputs.get(device.midiOutputId);
                if (output) {
                    outputName = output.name;
                } else {
                    outputName = 'Not Found';
                }
            }

            // Device type labels
            const typeLabels = {
                'generic': 'Generic',
                'regroove': 'Regroove',
                'samplecrate': 'SampleCrate'
            };
            const typeLabel = typeLabels[device.type] || device.type;

            return `
                <tr>
                    <td style="color: #ddd; font-weight: ${isDefault ? 'bold' : 'normal'};">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 12px; height: 12px; background: ${device.color || '#cc4444'}; border-radius: 2px; flex-shrink: 0;"></div>
                            <div>
                                ${device.name}
                                ${isDefault ? '<span style="color: #4a9eff; font-size: 0.8em;"> (DEFAULT)</span>' : ''}
                                <div style="font-size: 0.75em; color: #666; margin-top: 2px;">${typeLabel}</div>
                            </div>
                        </div>
                    </td>
                    <td style="text-align: center;">${device.midiChannel + 1}</td>
                    <td style="text-align: center;">${device.deviceId}</td>
                    <td style="text-align: center; font-size: 0.85em; color: #aaa;">${outputName}</td>
                    <td style="text-align: center;">
                        ${!isDefault ? `<button class="set-default-btn" data-device-id="${device.id}" style="padding: 3px 8px; font-size: 0.8em;">Set</button>` : '✓'}
                    </td>
                    <td style="text-align: center;">
                        <button class="edit-device-btn" data-device-id="${device.id}" style="padding: 3px 8px; font-size: 0.8em; margin-right: 5px;">✏️</button>
                        <button class="delete-device-btn" data-device-id="${device.id}" style="padding: 3px 8px; font-size: 0.8em;">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Add event listeners
        tbody.querySelectorAll('.edit-device-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const deviceId = btn.getAttribute('data-device-id');
                this.openDeviceEditor(deviceId);
            });
        });

        tbody.querySelectorAll('.delete-device-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const deviceId = btn.getAttribute('data-device-id');
                const device = this.devices.get(deviceId);
                window.nbDialog.confirm(`Delete device "${device.name}"?`, (confirmed) => {
                    if (confirmed) {
                        this.removeDevice(deviceId);
                    }
                });
            });
        });

        tbody.querySelectorAll('.set-default-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const deviceId = btn.getAttribute('data-device-id');
                this.setDefaultDevice(deviceId);
            });
        });
    }
}
