// Regroove Device State Manager
// Handles state tracking, SysEx response parsing, and device polling for Regroove instances

class RegrooveStateManager {
    constructor() {
        // Multi-device state tracking (Map: deviceId -> deviceState)
        this.deviceStates = new Map();

        // Default player state (for backward compatibility)
        this.playerState = {
            playing: false,
            mode: 0, // 00=song, 01=pattern/loop, 10=performance, 11=record
            order: 0,
            row: 0,
            pattern: 0,
            totalRows: 0,
            numChannels: 0,
            mutedChannels: [],
            soloedChannels: [], // Track solo state locally (not in SysEx response)
            channelVolumes: []
        };

        // State polling
        this.statePollingInterval = null;
        this.pollingIntervalMs = 500; // Poll every 500ms
        this.targetDeviceId = 0; // Target Regroove device ID for polling

        // Connection watchdog
        this.lastStateUpdate = null;
        this.stateTimeoutMs = 3000; // 3 seconds without update = disconnected
        this.connectionWatchdog = null;
        this.isConnectedToRegroove = false;

        // Callbacks
        this.onStateUpdate = null; // Called when state is updated
        this.onConnectionChange = null; // Called when connection status changes
        this.sendSysExCallback = null; // Callback to send SysEx messages
    }

    // Initialize with MIDI send callback
    init(sendSysExCallback) {
        this.sendSysExCallback = sendSysExCallback;
    }

    // Start polling for player state
    startPolling(deviceId = 0) {
        this.targetDeviceId = deviceId;

        if (this.statePollingInterval) {
            clearInterval(this.statePollingInterval);
        }

        this.statePollingInterval = setInterval(() => {
            this.requestPlayerState(this.targetDeviceId);
        }, this.pollingIntervalMs);

        // Request immediately
        this.requestPlayerState(this.targetDeviceId);

        console.log(`[RegrooveState] Started polling device ${deviceId} every ${this.pollingIntervalMs}ms`);
    }

    // Stop polling
    stopPolling() {
        if (this.statePollingInterval) {
            clearInterval(this.statePollingInterval);
            this.statePollingInterval = null;
            console.log('[RegrooveState] Stopped polling');
        }
    }

    // Request player state from device
    requestPlayerState(deviceId) {
        if (this.sendSysExCallback) {
            // Send GET_PLAYER_STATE (0x60)
            this.sendSysExCallback(deviceId, 0x60, []);
        } else {
            console.warn(`[RegrooveState] Cannot request state - sendSysExCallback not initialized`);
        }
    }

    // Parse and handle PLAYER_STATE_RESPONSE (0x61)
    handlePlayerStateResponse(deviceId, data) {
        if (!data || data.length < 12) {
            console.warn('[RegrooveState] PLAYER_STATE_RESPONSE data too short');
            return;
        }

        // Parse header
        const flags = data[0];
        const order = data[1];
        const row = data[2];
        const pattern = data[3];
        const totalRows = data[4];
        const numChannels = data[5];
        const masterVolume = data[6];
        const mixerFlags = data[7];
        const inputVolume = data[8];
        const fxRouting = data[9];

        // Extract playback state
        const playing = (flags & 0x01) !== 0;
        const mode = (flags >> 1) & 0x03; // bits 1-2

        // Extract mixer flags
        const masterMute = (mixerFlags & 0x01) !== 0;
        const inputMute = (mixerFlags & 0x02) !== 0;

        // Parse bit-packed mute data
        const muteBytes = Math.ceil(numChannels / 8);
        if (data.length < 10 + muteBytes) {
            console.warn('[RegrooveState] PLAYER_STATE_RESPONSE incomplete mute data');
            return;
        }

        const mutedChannels = [];
        for (let ch = 0; ch < numChannels; ch++) {
            const byteIdx = 10 + Math.floor(ch / 8);
            const bitIdx = ch % 8;
            if (data[byteIdx] & (1 << bitIdx)) {
                mutedChannels.push(ch);
            }
        }

        // Parse channel volumes array
        const volumeStartIdx = 10 + muteBytes;
        const channelVolumes = [];
        if (data.length >= volumeStartIdx + numChannels) {
            for (let ch = 0; ch < numChannels; ch++) {
                channelVolumes.push(data[volumeStartIdx + ch]);
            }
        }

        // Get existing state to preserve local-only fields (like soloedChannels)
        const existingState = this.deviceStates.get(deviceId);
        const soloedChannels = existingState?.soloedChannels || [];

        // Update state for this specific device
        const deviceState = {
            deviceId,
            playing,
            mode,
            order,
            row,
            pattern,
            totalRows,
            numChannels,
            masterVolume,
            masterMute,
            inputVolume,
            inputMute,
            fxRouting,
            mutedChannels,
            channelVolumes,
            soloedChannels, // Preserve local solo state
            lastUpdate: Date.now()
        };

        this.deviceStates.set(deviceId, deviceState);

        // Maintain backward compatibility: use device 0 as default player state
        if (deviceId === 0) {
            this.playerState = deviceState;
        }

        // Update connection timestamp
        this.lastStateUpdate = Date.now();
        if (!this.isConnectedToRegroove) {
            this.isConnectedToRegroove = true;
            console.log('[RegrooveState] Connected - receiving state updates');
            if (this.onConnectionChange) {
                this.onConnectionChange(true);
            }
        }

        // Start watchdog if not already running
        this.startConnectionWatchdog();

        // Notify callback
        if (this.onStateUpdate) {
            this.onStateUpdate(deviceId, deviceState);
        }
    }

    // Connection watchdog - detect when state updates stop
    startConnectionWatchdog() {
        if (this.connectionWatchdog) {
            return; // Already running
        }

        this.connectionWatchdog = setInterval(() => {
            if (this.lastStateUpdate && (Date.now() - this.lastStateUpdate > this.stateTimeoutMs)) {
                if (this.isConnectedToRegroove) {
                    this.isConnectedToRegroove = false;
                    console.log('[RegrooveState] Connection lost - no state updates');
                    if (this.onConnectionChange) {
                        this.onConnectionChange(false);
                    }
                }
            }
        }, 1000); // Check every second
    }

    stopConnectionWatchdog() {
        if (this.connectionWatchdog) {
            clearInterval(this.connectionWatchdog);
            this.connectionWatchdog = null;
        }
    }

    // Device State Query Methods
    getDeviceState(deviceId) {
        // Get state for specific device, or fall back to default
        if (this.deviceStates.has(deviceId)) {
            return this.deviceStates.get(deviceId);
        }
        // Fallback to device 0 or playerState
        return this.deviceStates.get(0) || this.playerState;
    }

    isLoopEnabled(deviceId) {
        const state = this.getDeviceState(deviceId);
        return state.mode === 0x01; // Mode 01 = pattern/loop
    }

    isChannelMuted(deviceId, channel) {
        const state = this.getDeviceState(deviceId);
        return state.mutedChannels && state.mutedChannels.includes(channel);
    }

    isChannelSoloed(deviceId, channel) {
        const state = this.getDeviceState(deviceId);
        return state.soloedChannels && state.soloedChannels.includes(channel);
    }

    getChannelVolume(deviceId, channel) {
        const state = this.getDeviceState(deviceId);
        return state.channelVolumes && state.channelVolumes[channel];
    }

    getCurrentPosition(deviceId) {
        const state = this.getDeviceState(deviceId);
        return {
            order: state.order,
            row: state.row,
            pattern: state.pattern,
            totalRows: state.totalRows
        };
    }

    isPlaying(deviceId) {
        const state = this.getDeviceState(deviceId);
        return state.playing;
    }

    getPlaybackMode(deviceId) {
        const state = this.getDeviceState(deviceId);
        const modes = ['song', 'pattern/loop', 'performance', 'record'];
        return modes[state.mode] || 'unknown';
    }

    // State Mutation Methods (for toggle operations)
    toggleChannelMuteState(deviceId, channel) {
        // Update local state tracking
        const state = this.getDeviceState(deviceId);
        if (!state.mutedChannels) {
            state.mutedChannels = [];
        }

        const index = state.mutedChannels.indexOf(channel);
        if (index > -1) {
            state.mutedChannels.splice(index, 1);
            return false; // Now unmuted
        } else {
            state.mutedChannels.push(channel);
            return true; // Now muted
        }
    }

    toggleChannelSoloState(deviceId, channel) {
        // Update local state tracking
        const state = this.getDeviceState(deviceId);
        if (!state.soloedChannels) {
            state.soloedChannels = [];
        }

        const index = state.soloedChannels.indexOf(channel);
        if (index > -1) {
            state.soloedChannels.splice(index, 1);
            return false; // Now unsoloed
        } else {
            state.soloedChannels.push(channel);
            return true; // Now soloed
        }
    }

    // Get all devices
    getAllDeviceIds() {
        return Array.from(this.deviceStates.keys());
    }

    // Clear all state
    clearAllState() {
        this.deviceStates.clear();
        this.lastStateUpdate = null;
        this.isConnectedToRegroove = false;
    }

    // Cleanup
    destroy() {
        this.stopPolling();
        this.stopConnectionWatchdog();
        this.clearAllState();
    }
}
