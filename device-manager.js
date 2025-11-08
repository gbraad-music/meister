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
            midiChannel: config.midiChannel ?? 0,
            deviceId: config.deviceId ?? 0,
            color: config.color || '#cc4444'
        };

        this.devices.set(id, device);
        this.saveDevices();
        this.refreshDeviceList();

        console.log(`[Devices] Added/updated device: ${device.name} (Ch ${device.midiChannel}, ID ${device.deviceId})`);
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
                            midiChannel: device.midiChannel,
                            deviceId: device.deviceId,
                            color: device.color || '#cc4444'
                        });
                    });
                }

                // Restore default device
                this.defaultDeviceId = data.defaultDeviceId || null;

                console.log(`[Devices] Loaded ${this.devices.size} device(s)`);
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

        // Refresh list on load
        this.refreshDeviceList();
    }

    /**
     * Open device editor dialog
     */
    openDeviceEditor(deviceId = null) {
        const name = deviceId
            ? this.devices.get(deviceId)?.name || ''
            : '';
        const midiChannel = deviceId
            ? this.devices.get(deviceId)?.midiChannel ?? 0
            : 0;
        const sysexDeviceId = deviceId
            ? this.devices.get(deviceId)?.deviceId ?? 0
            : 0;

        const newName = prompt(
            `Device Name:`,
            name || 'New Device'
        );

        if (!newName) return;

        const newChannel = parseInt(prompt(
            `MIDI Channel (0-15):`,
            midiChannel.toString()
        ));

        if (isNaN(newChannel) || newChannel < 0 || newChannel > 15) {
            alert('Invalid MIDI channel. Must be 0-15.');
            return;
        }

        const newDeviceId = parseInt(prompt(
            `SysEx Device ID (0-15):`,
            sysexDeviceId.toString()
        ));

        if (isNaN(newDeviceId) || newDeviceId < 0 || newDeviceId > 15) {
            alert('Invalid device ID. Must be 0-15.');
            return;
        }

        const id = deviceId || `device-${Date.now()}`;

        this.addDevice(id, {
            name: newName,
            midiChannel: newChannel,
            deviceId: newDeviceId
        });

        // If this is the first device, make it default
        if (this.devices.size === 1 && !this.defaultDeviceId) {
            this.setDefaultDevice(id);
        }
    }

    /**
     * Refresh device list UI
     */
    refreshDeviceList() {
        const tbody = document.getElementById('devices-list');
        if (!tbody) return;

        const devices = this.getAllDevices();

        if (devices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No device instances configured<br>Add a device instance to get started</td></tr>';
            return;
        }

        tbody.innerHTML = devices.map(device => {
            const isDefault = device.id === this.defaultDeviceId;
            return `
                <tr>
                    <td style="color: #ddd; font-weight: ${isDefault ? 'bold' : 'normal'};">
                        ${device.name}
                        ${isDefault ? '<span style="color: #4a9eff; font-size: 0.8em;"> (DEFAULT)</span>' : ''}
                    </td>
                    <td style="text-align: center;">${device.midiChannel + 1}</td>
                    <td style="text-align: center;">${device.deviceId}</td>
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
                if (confirm(`Delete device "${device.name}"?`)) {
                    this.removeDevice(deviceId);
                }
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
