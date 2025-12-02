/**
 * Display System Initialization
 * Initializes the display message system and registers adapters
 *
 * Include this file in index.html after all display components are loaded
 */

(function() {
    console.log('[DisplaySystem] Initializing...');

    // Wait for DOM and dependencies
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // Check dependencies
        if (!window.DisplayMessageManager) {
            console.error('[DisplaySystem] DisplayMessageManager not found');
            return;
        }

        if (!window.deviceManager) {
            console.warn('[DisplaySystem] DeviceManager not found, will retry later');
            // Retry after a delay
            setTimeout(init, 1000);
            return;
        }

        // Initialize DisplayMessageManager
        window.displayManager = new window.DisplayMessageManager(window.deviceManager);
        console.log('[DisplaySystem] DisplayMessageManager initialized');

        // Auto-register displays for existing devices
        autoRegisterDisplays();

        // Listen for new device additions
        if (window.deviceManager.on) {
            window.deviceManager.on('device-added', (device) => {
                registerDisplayForDevice(device);
            });
        }

        console.log('[DisplaySystem] Initialization complete');
    }

    /**
     * Auto-register displays for existing devices
     */
    function autoRegisterDisplays() {
        if (!window.deviceManager.getAllDevices) return;

        const devices = window.deviceManager.getAllDevices();
        console.log(`[DisplaySystem] Auto-registering displays for ${devices.length} devices`);

        devices.forEach(device => {
            registerDisplayForDevice(device);
        });
    }

    /**
     * Register display adapter for a device
     */
    function registerDisplayForDevice(device) {
        const deviceType = device.type || 'generic';
        let adapter = null;

        // Choose adapter based on device type
        if (deviceType === 'regroove' || deviceType === 'samplecrate' || deviceType === 'generic') {
            // Basic text display adapter
            if (window.BasicTextDisplayAdapter) {
                adapter = new window.BasicTextDisplayAdapter(device);
                console.log(`[DisplaySystem] Registered BasicTextDisplayAdapter for: ${device.name || device.id}`);
            }
        } else if (deviceType === 'fire') {
            // Fire OLED adapter (physical mode)
            if (window.FireOLEDAdapter) {
                adapter = new window.FireOLEDAdapter(device, 'physical');
                console.log(`[DisplaySystem] Registered FireOLEDAdapter (physical) for: ${device.name || device.id}`);
            }
        }

        // Register with display manager
        if (adapter && window.displayManager) {
            window.displayManager.registerDisplay(device.id, deviceType, adapter);
        }
    }

    /**
     * Create a display test function for debugging
     */
    window.testDisplayMessage = function(deviceId, messageType = 'status') {
        if (!window.displayManager) {
            console.error('DisplayManager not initialized');
            return;
        }

        const device = window.deviceManager?.getDevice(deviceId);
        if (!device) {
            console.error(`Device not found: ${deviceId}`);
            return;
        }

        let message;
        if (messageType === 'status') {
            message = window.displayManager.createStatusMessage(deviceId, device.type, {
                bpm: 140,
                playing: true,
                order: 5,
                pattern: 3,
                row: 24,
                channelMutes: 'M-SM',
                pad: 8,
                volume: 75,
                filter: 60,
                resonance: 30,
                sequence: 2
            });
        } else if (messageType === 'notification') {
            message = window.displayManager.createNotification(deviceId, 'Test notification message!', 3000);
        } else if (messageType === 'progress') {
            message = window.DisplayMessageBuilder?.createProgressBar(deviceId, 'Loading...', 0.65);
        }

        if (message) {
            window.displayManager.sendMessage(message);
            console.log(`[DisplaySystem] Sent ${messageType} message to ${deviceId}`, message);
        }
    };

    console.log('[DisplaySystem] Test function available: testDisplayMessage(deviceId, type)');
})();
