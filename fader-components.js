/**
 * Fader Components for Meister
 * Web components for MIX, CHANNEL, and TEMPO faders
 */

import './svg-slider.js';

/**
 * Base Fader Component
 * Shared functionality for all fader types
 */
class BaseFader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    createSlider(value, min, max, step = 1) {
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'fader-slider';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = value;
        return slider;
    }

    createButton(label, className = '') {
        const button = document.createElement('button');
        button.className = `fader-button ${className}`;
        button.textContent = label;
        return button;
    }

    getBaseStyles() {
        return `
            :host {
                display: inline-flex;
                flex-direction: column;
                width: 80px;
                height: 100%;
                background: transparent;
                padding: 0;
                gap: 8px;
                font-family: Arial, sans-serif;
                box-sizing: border-box;
                margin: 0 8px;
                align-items: center;
                justify-content: flex-start;
            }

            .fader-label {
                text-align: center;
                color: #aaa;
                font-size: 0.75em;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                padding: 6px;
                background: #1a1a1a;
                border-radius: 4px;
                font-weight: bold;
            }

            .fader-button {
                width: 60px;
                min-height: 44px;
                padding: 12px;
                margin: 0 auto;
                background: #2a2a2a;
                color: #aaa;
                border: none;
                cursor: pointer;
                font-size: 1em;
                font-weight: bold;
                text-transform: uppercase;
                transition: all 0.15s;
                border-radius: 4px;
                touch-action: manipulation;
            }

            .fader-button:hover {
                background: #3a3a3a;
            }

            .fader-button:active {
                transform: scale(0.98);
            }

            .fader-button.active {
                background: #cc4444;
                color: #fff;
            }

            /* FX button specific states (only for mix-fader) */
            #fx-btn.active {
                background: #ccaa44;
                color: #fff;
            }

            #fx-btn.warning {
                background: #cc4444;
                color: #fff;
            }

            .slider-container {
                width: 60px;
                flex: 1;
                min-height: 0;
                display: flex;
                align-items: stretch;
            }

            svg-slider {
                width: 100%;
                height: 100%;
            }

            .pan-container {
                display: flex;
                flex-direction: column;
                gap: 6px;
                align-items: center;
                width: 100%;
            }

            .pan-slider {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 16px;
                background: #2a2a2a;
                outline: none;
                border-radius: 4px;
                cursor: pointer;
                touch-action: none;
            }

            .pan-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 24px;
                height: 24px;
                background: #cc4444;
                cursor: grab;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            .pan-slider::-webkit-slider-thumb:active {
                cursor: grabbing;
                box-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }

            .pan-slider::-moz-range-thumb {
                width: 24px;
                height: 24px;
                background: #cc4444;
                cursor: grab;
                border: none;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            .pan-slider::-moz-range-thumb:active {
                cursor: grabbing;
                box-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }
        `;
    }
}

/**
 * MIX Fader Component
 * Format: Label, FX Toggle, Pan, Volume, Mute
 */
class MixFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['label', 'volume', 'pan', 'fx', 'muted'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    render() {
        const label = this.getAttribute('label') || 'MIX';
        const volume = parseInt(this.getAttribute('volume') || '100');
        const pan = parseInt(this.getAttribute('pan') || '0');
        const fxAttr = this.getAttribute('fx') || 'false';
        const muted = this.getAttribute('muted') === 'true';

        // FX states: 'false' (off), 'true'/'active' (yellow - enabled for this fader), 'warning' (red - enabled elsewhere)
        let fxClass = '';
        if (fxAttr === 'true' || fxAttr === 'active') {
            fxClass = 'active'; // Yellow
        } else if (fxAttr === 'warning') {
            fxClass = 'warning'; // Red
        }

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">${label}</div>
            <button class="fader-button ${fxClass}" id="fx-btn">FX</button>
            <div class="pan-container">
                <input type="range" class="pan-slider" id="pan-slider"
                       min="-100" max="100" value="${pan}" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="volume-slider" min="0" max="127" value="${volume}" width="60"></svg-slider>
            </div>
            <button class="fader-button ${muted ? 'active' : ''}" id="mute-btn">M</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const fxBtn = this.shadowRoot.getElementById('fx-btn');
        const panSlider = this.shadowRoot.getElementById('pan-slider');
        const volumeSlider = this.shadowRoot.getElementById('volume-slider');
        const muteBtn = this.shadowRoot.getElementById('mute-btn');

        fxBtn?.addEventListener('click', () => {
            // FX button logic:
            // Yellow (active for us) → Off
            // Red (active elsewhere) → Yellow (take over)
            // Off → Yellow (turn on for us)
            const currentState = this.getAttribute('fx') || 'false';
            const newState = (currentState === 'active') ? false : true;
            this.dispatchEvent(new CustomEvent('fx-toggle', { detail: { enabled: newState } }));
        });

        panSlider?.addEventListener('input', (e) => {
            this.setAttribute('pan', e.target.value);
            this.dispatchEvent(new CustomEvent('pan-change', { detail: { value: parseInt(e.target.value) } }));
        });

        volumeSlider?.addEventListener('input', (e) => {
            const value = e.detail?.value ?? e.target?.value;
            this.setAttribute('volume', value);
            // Mark that we're actively changing the volume
            this.dataset.volumeChanging = 'true';
            clearTimeout(this._volumeChangeTimeout);
            this._volumeChangeTimeout = setTimeout(() => {
                delete this.dataset.volumeChanging;
            }, 300); // 300ms debounce to prevent state updates during drag
            this.dispatchEvent(new CustomEvent('volume-change', { detail: { value: parseInt(value) } }));
        });

        muteBtn?.addEventListener('click', () => {
            const newState = !muteBtn.classList.contains('active');
            this.setAttribute('muted', newState);
            this.dispatchEvent(new CustomEvent('mute-toggle', { detail: { muted: newState } }));
        });
    }
}

/**
 * CHANNEL Fader Component
 * Format: Channel #, Solo, Pan, Volume, Mute
 */
class ChannelFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['channel', 'volume', 'pan', 'solo', 'muted'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    render() {
        const channel = parseInt(this.getAttribute('channel') || '0');
        const volume = parseInt(this.getAttribute('volume') || '100');
        const pan = parseInt(this.getAttribute('pan') || '0');
        const solo = this.getAttribute('solo') === 'true';
        const muted = this.getAttribute('muted') === 'true';
        const deviceName = this.dataset.deviceName || '';

        // Create label with optional device name
        const labelText = deviceName ? `CH ${channel + 1}<br><span style="font-size: 0.8em; opacity: 0.7;">${deviceName}</span>` : `CH ${channel + 1}`;

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">${labelText}</div>
            <button class="fader-button ${solo ? 'active' : ''}" id="solo-btn">S</button>
            <div class="pan-container">
                <input type="range" class="pan-slider" id="pan-slider"
                       min="-100" max="100" value="${pan}" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="volume-slider" min="0" max="127" value="${volume}" width="60"></svg-slider>
            </div>
            <button class="fader-button ${muted ? 'active' : ''}" id="mute-btn">M</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const channel = parseInt(this.getAttribute('channel') || '0');
        const soloBtn = this.shadowRoot.getElementById('solo-btn');
        const panSlider = this.shadowRoot.getElementById('pan-slider');
        const volumeSlider = this.shadowRoot.getElementById('volume-slider');
        const muteBtn = this.shadowRoot.getElementById('mute-btn');

        soloBtn?.addEventListener('click', () => {
            const newState = !soloBtn.classList.contains('active');
            this.setAttribute('solo', newState);
            this.dispatchEvent(new CustomEvent('solo-toggle', {
                detail: { channel, solo: newState },
                bubbles: true,
                composed: true
            }));
        });

        panSlider?.addEventListener('input', (e) => {
            this.setAttribute('pan', e.target.value);
            this.dispatchEvent(new CustomEvent('pan-change', {
                detail: { channel, value: parseInt(e.target.value) }
            }));
        });

        volumeSlider?.addEventListener('input', (e) => {
            const value = e.detail?.value ?? e.target?.value;
            this.setAttribute('volume', value);
            // Mark that we're actively changing the volume
            this.dataset.volumeChanging = 'true';
            clearTimeout(this._volumeChangeTimeout);
            this._volumeChangeTimeout = setTimeout(() => {
                delete this.dataset.volumeChanging;
            }, 300); // 300ms debounce to prevent state updates during drag
            this.dispatchEvent(new CustomEvent('volume-change', {
                detail: { channel, value: parseInt(value) }
            }));
        });

        muteBtn?.addEventListener('click', () => {
            const newState = !muteBtn.classList.contains('active');
            this.setAttribute('muted', newState);
            this.dispatchEvent(new CustomEvent('mute-toggle', {
                detail: { channel, muted: newState }
            }));
        });
    }
}

/**
 * TEMPO Fader Component
 * Format: Just slider with reset button
 */
class TempoFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['bpm'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    render() {
        const bpm = parseInt(this.getAttribute('bpm') || '120');

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">TEMPO</div>
            <button class="fader-button" style="display: none;">S</button>
            <div class="pan-container" style="display: none;">
                <input type="range" class="pan-slider"
                       min="-100" max="100" value="0" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="tempo-slider" min="20" max="300" value="${bpm}" width="60"></svg-slider>
            </div>
            <button class="fader-button" id="reset-btn">R</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const tempoSlider = this.shadowRoot.getElementById('tempo-slider');
        const resetBtn = this.shadowRoot.getElementById('reset-btn');

        tempoSlider?.addEventListener('input', (e) => {
            const value = e.detail?.value ?? e.target?.value;
            this.setAttribute('bpm', value);
            // Mark that we're actively changing the tempo
            this.dataset.tempoChanging = 'true';
            clearTimeout(this._tempoChangeTimeout);
            this._tempoChangeTimeout = setTimeout(() => {
                delete this.dataset.tempoChanging;
            }, 300); // 300ms debounce to prevent state updates during drag
            this.dispatchEvent(new CustomEvent('tempo-change', {
                detail: { bpm: parseInt(value) }
            }));
        });

        resetBtn?.addEventListener('click', () => {
            this.setAttribute('bpm', '125');
            this.dispatchEvent(new CustomEvent('tempo-reset', { detail: { bpm: 125 } }));
        });
    }
}

/**
 * STEREO SEPARATION Fader Component
 * Format: Just slider with reset button
 * Range: 0-127 (maps to 0-200, where 64≈100=normal)
 */
class StereoFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['separation'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    render() {
        const separation = parseInt(this.getAttribute('separation') || '64'); // Default to 64 (≈100 = normal)

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">STEREO</div>
            <button class="fader-button" style="display: none;">S</button>
            <div class="pan-container" style="display: none;">
                <input type="range" class="pan-slider"
                       min="-100" max="100" value="0" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="stereo-slider" min="0" max="127" value="${separation}" width="60"></svg-slider>
            </div>
            <button class="fader-button" id="reset-btn">R</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const stereoSlider = this.shadowRoot.getElementById('stereo-slider');
        const resetBtn = this.shadowRoot.getElementById('reset-btn');

        stereoSlider?.addEventListener('input', (e) => {
            const value = e.detail?.value ?? e.target?.value;
            this.setAttribute('separation', value);
            // Mark that we're actively changing the separation
            this.dataset.separationChanging = 'true';
            clearTimeout(this._separationChangeTimeout);
            this._separationChangeTimeout = setTimeout(() => {
                delete this.dataset.separationChanging;
            }, 300); // 300ms debounce to prevent state updates during drag
            this.dispatchEvent(new CustomEvent('separation-change', {
                detail: { separation: parseInt(value) }
            }));
        });

        resetBtn?.addEventListener('click', () => {
            this.setAttribute('separation', '64'); // Reset to 64 (≈100 = normal stereo)
            this.dispatchEvent(new CustomEvent('separation-reset', { detail: { separation: 64 } }));
        });
    }
}

/**
 * Program Fader Component (for Samplecrate)
 * Format: Label, FX Enable, Pan, Volume, Mute
 * Similar to CHANNEL but with FX button instead of SOLO
 */
class ProgramFader extends BaseFader {
    constructor() {
        super();
        this.render();
    }

    static get observedAttributes() {
        return ['program', 'label', 'volume', 'pan', 'fx', 'muted'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        this.render();
    }

    render() {
        const program = parseInt(this.getAttribute('program') || '0');
        const label = this.getAttribute('label') || `PROG ${program}`;
        const volume = parseInt(this.getAttribute('volume') || '100');
        const pan = parseInt(this.getAttribute('pan') || '0');
        const fx = this.getAttribute('fx') === 'true';
        const muted = this.getAttribute('muted') === 'true';

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">${label}</div>
            <button class="fader-button ${fx ? 'active' : ''}" id="fx-btn">FX</button>
            <div class="pan-container">
                <input type="range" class="pan-slider" id="pan-slider"
                       min="-100" max="100" value="${pan}" step="1">
            </div>
            <div class="slider-container">
                <svg-slider id="volume-slider" min="0" max="127" value="${volume}" width="60"></svg-slider>
            </div>
            <button class="fader-button ${muted ? 'active' : ''}" id="mute-btn">M</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const program = parseInt(this.getAttribute('program') || '0');
        const fxBtn = this.shadowRoot.getElementById('fx-btn');
        const panSlider = this.shadowRoot.getElementById('pan-slider');
        const volumeSlider = this.shadowRoot.getElementById('volume-slider');
        const muteBtn = this.shadowRoot.getElementById('mute-btn');

        fxBtn?.addEventListener('click', () => {
            const newState = !fxBtn.classList.contains('active');
            this.setAttribute('fx', newState);
            this.dispatchEvent(new CustomEvent('fx-toggle', {
                detail: { program, enabled: newState },
                bubbles: true,
                composed: true
            }));
        });

        panSlider?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.setAttribute('pan', value);
            this.dispatchEvent(new CustomEvent('pan-change', {
                detail: { program, value },
                bubbles: true,
                composed: true
            }));
        });

        volumeSlider?.addEventListener('input', (e) => {
            const value = e.detail?.value ?? e.target?.value;
            this.setAttribute('volume', value);

            // Mark that we're actively changing the volume
            this.dataset.volumeChanging = 'true';
            clearTimeout(this._volumeChangeTimeout);
            this._volumeChangeTimeout = setTimeout(() => {
                delete this.dataset.volumeChanging;
            }, 300); // 300ms debounce

            this.dispatchEvent(new CustomEvent('volume-change', {
                detail: { program, value: parseInt(value) },
                bubbles: true,
                composed: true
            }));
        });

        muteBtn?.addEventListener('click', () => {
            const newState = !muteBtn.classList.contains('active');
            this.setAttribute('muted', newState);
            this.dispatchEvent(new CustomEvent('mute-toggle', {
                detail: { program, muted: newState },
                bubbles: true,
                composed: true
            }));
        });
    }
}

// Register custom elements
customElements.define('mix-fader', MixFader);
customElements.define('channel-fader', ChannelFader);
customElements.define('tempo-fader', TempoFader);
customElements.define('stereo-fader', StereoFader);
customElements.define('program-fader', ProgramFader);

export { MixFader, ChannelFader, TempoFader };
