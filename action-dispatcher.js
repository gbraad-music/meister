/**
 * Action Dispatcher for Meister
 * Handles execution of InputActions
 */

import { InputAction, ActionCategory, getActionCategory } from './input-actions.js';

/**
 * ActionDispatcher
 * Central dispatcher for all input actions
 */
export class ActionDispatcher {
    constructor(controller) {
        this.controller = controller;
        this.macros = new Map(); // macro_id -> array of actions
    }

    /**
     * Handle an InputEvent
     * @param {InputEvent} event - The input event to process
     */
    handleEvent(event) {
        if (!event || event.action === InputAction.ACTION_NONE) {
            return;
        }

        const category = getActionCategory(event.action);
        const normalizedValue = event.getNormalizedValue();
        const meetsThreshold = event.meetsThreshold();

        // Log action for debugging
        console.log(`[Action] ${event.action} (cat: ${category}, val: ${event.value}, param: ${event.parameter})`);

        switch (event.action) {
            // === REGROOVE TRANSPORT CONTROL ===
            case InputAction.ACTION_REGROOVE_PLAY:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(41, 127); // Play
                }
                break;

            case InputAction.ACTION_REGROOVE_STOP:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(42, 127); // Stop
                }
                break;

            case InputAction.ACTION_REGROOVE_PLAY_PAUSE:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(41, 127); // Play/Pause toggle
                }
                break;

            case InputAction.ACTION_REGROOVE_RETRIGGER:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(45, 127); // Retrigger
                }
                break;

            case InputAction.ACTION_REGROOVE_LOOP_TOGGLE:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(46, 127); // Loop toggle
                }
                break;

            // === REGROOVE NAVIGATION ===
            case InputAction.ACTION_REGROOVE_ORDER_NEXT:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(44, 127); // Next order
                }
                break;

            case InputAction.ACTION_REGROOVE_ORDER_PREV:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(43, 127); // Previous order
                }
                break;

            case InputAction.ACTION_REGROOVE_ORDER_JUMP:
                if (meetsThreshold) {
                    // TODO: Implement order jump via SysEx
                    console.warn('ACTION_REGROOVE_ORDER_JUMP not yet implemented');
                }
                break;

            // === REGROOVE FILE OPERATIONS ===
            case InputAction.ACTION_REGROOVE_FILE_LOAD:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(60, 127); // Load file
                }
                break;

            case InputAction.ACTION_REGROOVE_FILE_NEXT:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(62, 127); // Next file
                }
                break;

            case InputAction.ACTION_REGROOVE_FILE_PREV:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(61, 127); // Previous file
                }
                break;

            // === REGROOVE CHANNEL CONTROL ===
            case InputAction.ACTION_REGROOVE_CHANNEL_MUTE:
                if (meetsThreshold) {
                    const channel = event.parameter;
                    if (channel >= 0 && channel <= 7) {
                        this.controller.sendRegrooveCC(48 + channel, 127); // Mute channel
                    }
                }
                break;

            case InputAction.ACTION_REGROOVE_CHANNEL_SOLO:
                if (meetsThreshold) {
                    const channel = event.parameter;
                    if (channel >= 0 && channel <= 7) {
                        this.controller.sendRegrooveCC(32 + channel, 127); // Solo channel
                    }
                }
                break;

            case InputAction.ACTION_REGROOVE_CHANNEL_VOLUME:
                {
                    const channel = event.parameter;
                    if (channel >= 0 && channel <= 7) {
                        // TODO: Implement channel volume control (needs SysEx or dedicated CC range)
                        console.warn('ACTION_REGROOVE_CHANNEL_VOLUME not yet implemented');
                    }
                }
                break;

            case InputAction.ACTION_REGROOVE_MUTE_ALL:
                if (meetsThreshold) {
                    // Mute all channels
                    for (let i = 0; i < 8; i++) {
                        this.controller.sendRegrooveCC(48 + i, 127);
                    }
                }
                break;

            case InputAction.ACTION_REGROOVE_UNMUTE_ALL:
                if (meetsThreshold) {
                    // Unmute all channels (send again to toggle off)
                    for (let i = 0; i < 8; i++) {
                        this.controller.sendRegrooveCC(48 + i, 127);
                    }
                }
                break;

            // === REGROOVE MIDI SYNC ===
            case InputAction.ACTION_REGROOVE_SYNC_TEMPO_TOGGLE:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(70, 127);
                }
                break;

            case InputAction.ACTION_REGROOVE_SYNC_TRANSPORT_TOGGLE:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(71, 127);
                }
                break;

            case InputAction.ACTION_REGROOVE_SYNC_SPP_TOGGLE:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(72, 127);
                }
                break;

            case InputAction.ACTION_REGROOVE_SYNC_RECEIVE_TOGGLE:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(73, 127);
                }
                break;

            case InputAction.ACTION_REGROOVE_SYNC_SEND_TOGGLE:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(74, 127);
                }
                break;

            // === REGROOVE PERFORMANCE ===
            case InputAction.ACTION_REGROOVE_RECORD_TOGGLE:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(80, 127);
                }
                break;

            case InputAction.ACTION_REGROOVE_TAP_TEMPO:
                if (meetsThreshold) {
                    this.controller.sendRegrooveCC(81, 127);
                }
                break;

            // === REGROOVE MIXER CONTROL ===
            case InputAction.ACTION_REGROOVE_MASTER_VOLUME:
                {
                    const deviceId = event.deviceId || 0;
                    this.controller.sendSysExMasterVolume(deviceId, event.value);
                }
                break;

            case InputAction.ACTION_REGROOVE_MASTER_PAN:
                {
                    const deviceId = event.deviceId || 0;
                    this.controller.sendSysExMasterPanning(deviceId, event.value);
                }
                break;

            case InputAction.ACTION_REGROOVE_MASTER_MUTE:
                if (meetsThreshold) {
                    const deviceId = event.deviceId || 0;
                    this.controller.sendSysExMasterMute(deviceId, 1); // Toggle
                }
                break;

            case InputAction.ACTION_REGROOVE_INPUT_VOLUME:
                {
                    const deviceId = event.deviceId || 0;
                    this.controller.sendSysExInputVolume(deviceId, event.value);
                }
                break;

            case InputAction.ACTION_REGROOVE_INPUT_PAN:
                {
                    const deviceId = event.deviceId || 0;
                    this.controller.sendSysExInputPanning(deviceId, event.value);
                }
                break;

            case InputAction.ACTION_REGROOVE_INPUT_MUTE:
                if (meetsThreshold) {
                    const deviceId = event.deviceId || 0;
                    this.controller.sendSysExInputMute(deviceId, 1); // Toggle
                }
                break;

            case InputAction.ACTION_REGROOVE_CHANNEL_PAN:
                {
                    const channel = event.parameter;
                    const deviceId = event.deviceId || 0;
                    if (channel >= 0 && channel <= 63) {
                        this.controller.sendSysExChannelPanning(deviceId, channel, event.value);
                    }
                }
                break;

            case InputAction.ACTION_REGROOVE_FX_ROUTING:
                {
                    const route = event.parameter; // 0=off, 1=master, 2=playback, 3=input
                    const deviceId = event.deviceId || 0;
                    if (route >= 0 && route <= 3) {
                        this.controller.sendSysExFxSetRoute(deviceId, route);
                    }
                }
                break;

            case InputAction.ACTION_REGROOVE_TEMPO_SET:
                {
                    const deviceId = event.deviceId || 0;
                    // Map 0-127 to 20-300 BPM
                    const bpm = Math.round(20 + (event.value / 127) * 280);
                    this.controller.sendSysExSetTempo(deviceId, bpm);
                }
                break;

            case InputAction.ACTION_REGROOVE_STEREO_SEP:
                {
                    const deviceId = event.deviceId || 0;
                    this.controller.sendSysExStereoSeparation(deviceId, event.value);
                }
                break;

            // === REGROOVE EFFECTS CONTROL ===
            case InputAction.ACTION_REGROOVE_FX_ENABLE:
                {
                    const effectId = event.parameter;
                    const deviceId = event.deviceId || 0;
                    const programId = event.programId || 0;
                    const enabled = meetsThreshold;

                    // Get current parameters from scene manager if available
                    const params = this.controller.sceneManager?.getEffectParams(effectId) || [64, 64, 64];
                    this.controller.sendSysExFxEffectSet(deviceId, programId, effectId, enabled, ...params);
                }
                break;

            case InputAction.ACTION_REGROOVE_FX_PARAM:
                {
                    // Parameter is encoded as (effect_id << 8) | param_index
                    const effectId = (event.parameter >> 8) & 0xFF;
                    const paramIndex = event.parameter & 0xFF;
                    const deviceId = event.deviceId || 0;
                    const programId = event.programId || 0;

                    // Get current parameters and update the specified one
                    const params = this.controller.sceneManager?.getEffectParams(effectId) || [64, 64, 64];
                    params[paramIndex] = event.value;

                    // Get enable state
                    const enabled = true; // Assume enabled when adjusting parameters
                    this.controller.sendSysExFxEffectSet(deviceId, programId, effectId, enabled, ...params);
                }
                break;

            // === MIDI CLOCK CONTROL ===
            case InputAction.ACTION_CLOCK_MASTER_TOGGLE:
                if (meetsThreshold) {
                    this.controller.toggleClockMaster();
                }
                break;

            case InputAction.ACTION_CLOCK_START:
                if (meetsThreshold) {
                    this.controller.startClock();
                }
                break;

            case InputAction.ACTION_CLOCK_STOP:
                if (meetsThreshold) {
                    this.controller.stopClock();
                }
                break;

            case InputAction.ACTION_CLOCK_BPM_SET:
                {
                    const bpm = event.parameter || Math.round(20 + normalizedValue * 280); // Map 0-127 to 20-300
                    this.controller.setBPM(bpm);
                }
                break;

            case InputAction.ACTION_CLOCK_BPM_INC:
                if (meetsThreshold) {
                    const currentBPM = this.controller.config.bpm || 120;
                    this.controller.setBPM(Math.min(300, currentBPM + 1));
                }
                break;

            case InputAction.ACTION_CLOCK_BPM_DEC:
                if (meetsThreshold) {
                    const currentBPM = this.controller.config.bpm || 120;
                    this.controller.setBPM(Math.max(20, currentBPM - 1));
                }
                break;

            // === CONFIGURATION/PRESET ===
            case InputAction.ACTION_CONFIG_LOAD:
                if (meetsThreshold) {
                    // TODO: Implement config loading by name/index
                    console.warn('ACTION_CONFIG_LOAD not yet implemented');
                }
                break;

            case InputAction.ACTION_CONFIG_SAVE:
                if (meetsThreshold) {
                    this.controller.saveConfig();
                }
                break;

            case InputAction.ACTION_CONFIG_NEXT:
            case InputAction.ACTION_CONFIG_PREV:
                if (meetsThreshold) {
                    // TODO: Implement config preset cycling
                    console.warn('Config preset cycling not yet implemented');
                }
                break;

            // === MIDI OUTPUT ===
            case InputAction.ACTION_MIDI_NOTE:
                if (meetsThreshold) {
                    const note = event.parameter;
                    const velocity = event.value;
                    this.controller.sendMidiNote(note, velocity);
                }
                break;

            case InputAction.ACTION_MIDI_CC:
                {
                    const cc = event.parameter;
                    const value = event.value;
                    this.controller.sendMidiCC(cc, value);
                }
                break;

            case InputAction.ACTION_MIDI_PROGRAM_CHANGE:
                if (meetsThreshold) {
                    const program = event.parameter;
                    this.controller.sendProgramChange(program);
                }
                break;

            case InputAction.ACTION_MIDI_MMC:
                if (meetsThreshold) {
                    // TODO: Parse MMC command from parameters field
                    console.warn('ACTION_MIDI_MMC not yet implemented');
                }
                break;

            // === MULTI-ACTION MACROS ===
            case InputAction.ACTION_MACRO:
                if (meetsThreshold) {
                    this.executeMacro(event.parameter);
                }
                break;

            // === EXTERNAL ROUTING ===
            case InputAction.ACTION_ROUTE_MIDI_NOTE:
                if (meetsThreshold) {
                    // Direct routing (already handled by routing layer)
                    const note = event.parameter;
                    const velocity = event.value;
                    this.controller.sendMidiNote(note, velocity);
                }
                break;

            case InputAction.ACTION_ROUTE_MIDI_CC:
                {
                    // Direct routing (already handled by routing layer)
                    const cc = event.parameter;
                    const value = event.value;
                    this.controller.sendMidiCC(cc, value);
                }
                break;

            default:
                console.warn(`Unhandled action: ${event.action}`);
                break;
        }
    }

    /**
     * Execute a macro (sequence of actions)
     * @param {number} macroId - The macro ID
     */
    executeMacro(macroId) {
        const macro = this.macros.get(macroId);
        if (!macro) {
            console.warn(`Macro ${macroId} not found`);
            return;
        }

        console.log(`Executing macro ${macroId} with ${macro.length} actions`);
        for (const event of macro) {
            // Execute each action in sequence
            this.handleEvent(event);
        }
    }

    /**
     * Register a macro
     * @param {number} macroId - The macro ID
     * @param {Array<InputEvent>} actions - Array of InputEvents to execute
     */
    registerMacro(macroId, actions) {
        this.macros.set(macroId, actions);
        console.log(`Registered macro ${macroId} with ${actions.length} actions`);
    }

    /**
     * Clear all macros
     */
    clearMacros() {
        this.macros.clear();
    }

    /**
     * Get all registered macros
     */
    getMacros() {
        return Array.from(this.macros.entries()).map(([id, actions]) => ({
            id,
            actions: actions.length,
        }));
    }
}
