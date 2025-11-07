/**
 * Fader Components for Meister
 * Web components for MIX, CHANNEL, and TEMPO faders
 */

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
        slider.orient = 'vertical';
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
                width: 70px;
                background: transparent;
                padding: 0;
                gap: 8px;
                font-family: Arial, sans-serif;
                box-sizing: border-box;
                margin: 0 5px;
            }

            .fader-label {
                text-align: center;
                color: #aaa;
                font-size: 0.7em;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                padding: 4px;
                background: #1a1a1a;
                border-radius: 3px;
            }

            .fader-button {
                width: 100%;
                min-height: 40px;
                padding: 10px;
                background: #2a2a2a;
                color: #aaa;
                border: none;
                cursor: pointer;
                font-size: 0.9em;
                font-weight: bold;
                text-transform: uppercase;
                transition: all 0.15s;
                border-radius: 3px;
                touch-action: manipulation;
            }

            .fader-button:hover {
                background: #3a3a3a;
            }

            .fader-button:active {
                transform: scale(0.95);
            }

            .fader-button.active {
                background: #cc4444;
                color: #fff;
            }

            .fader-slider {
                -webkit-appearance: none;
                appearance: none;
                width: 50px;
                height: 300px;
                background: #2a2a2a;
                outline: none;
                margin: 0 auto;
                border-radius: 3px;
                cursor: pointer;
                touch-action: none;
            }

            .fader-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 50px;
                height: 20px;
                background: #cc4444;
                cursor: grab;
                border-radius: 2px;
            }

            .fader-slider::-webkit-slider-thumb:active {
                cursor: grabbing;
            }

            .fader-slider::-moz-range-thumb {
                width: 50px;
                height: 20px;
                background: #cc4444;
                cursor: grab;
                border: none;
                border-radius: 2px;
            }

            .fader-slider::-moz-range-thumb:active {
                cursor: grabbing;
            }

            .pan-container {
                display: flex;
                flex-direction: column;
                gap: 4px;
                align-items: center;
            }

            .pan-slider {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 12px;
                background: #2a2a2a;
                outline: none;
                border-radius: 3px;
                cursor: pointer;
                touch-action: none;
            }

            .pan-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 20px;
                height: 20px;
                background: #cc4444;
                cursor: grab;
                border-radius: 3px;
            }

            .pan-slider::-webkit-slider-thumb:active {
                cursor: grabbing;
            }

            .pan-slider::-moz-range-thumb {
                width: 20px;
                height: 20px;
                background: #cc4444;
                cursor: grab;
                border: none;
                border-radius: 3px;
            }

            .pan-slider::-moz-range-thumb:active {
                cursor: grabbing;
            }

            .pan-indicator {
                width: 10px;
                height: 10px;
                background: #cc4444;
                border-radius: 50%;
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
        const fx = this.getAttribute('fx') === 'true';
        const muted = this.getAttribute('muted') === 'true';

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">${label}</div>
            <button class="fader-button ${fx ? 'active' : ''}" id="fx-btn">FX</button>
            <div class="pan-container">
                <div class="pan-indicator"></div>
                <input type="range" class="pan-slider" id="pan-slider"
                       min="-100" max="100" value="${pan}" step="1">
            </div>
            <input type="range" class="fader-slider" id="volume-slider"
                   min="0" max="127" value="${volume}" step="1">
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
            const newState = !fxBtn.classList.contains('active');
            this.setAttribute('fx', newState);
            this.dispatchEvent(new CustomEvent('fx-toggle', { detail: { enabled: newState } }));
        });

        panSlider?.addEventListener('input', (e) => {
            this.setAttribute('pan', e.target.value);
            this.dispatchEvent(new CustomEvent('pan-change', { detail: { value: parseInt(e.target.value) } }));
        });

        volumeSlider?.addEventListener('input', (e) => {
            this.setAttribute('volume', e.target.value);
            this.dispatchEvent(new CustomEvent('volume-change', { detail: { value: parseInt(e.target.value) } }));
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

        this.shadowRoot.innerHTML = `
            <style>${this.getBaseStyles()}</style>
            <div class="fader-label">CH ${channel + 1}</div>
            <button class="fader-button ${solo ? 'active' : ''}" id="solo-btn">S</button>
            <div class="pan-container">
                <div class="pan-indicator"></div>
                <input type="range" class="pan-slider" id="pan-slider"
                       min="-100" max="100" value="${pan}" step="1">
            </div>
            <input type="range" class="fader-slider" id="volume-slider"
                   min="0" max="127" value="${volume}" step="1">
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
                detail: { channel, solo: newState }
            }));
        });

        panSlider?.addEventListener('input', (e) => {
            this.setAttribute('pan', e.target.value);
            this.dispatchEvent(new CustomEvent('pan-change', {
                detail: { channel, value: parseInt(e.target.value) }
            }));
        });

        volumeSlider?.addEventListener('input', (e) => {
            this.setAttribute('volume', e.target.value);
            this.dispatchEvent(new CustomEvent('volume-change', {
                detail: { channel, value: parseInt(e.target.value) }
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
            <style>
                ${this.getBaseStyles()}
                .tempo-slider {
                    height: 350px !important;
                }
                .spacer {
                    flex: 1;
                }
            </style>
            <div class="fader-label">TEMPO</div>
            <div class="spacer"></div>
            <input type="range" class="fader-slider tempo-slider" id="tempo-slider"
                   min="20" max="300" value="${bpm}" step="1">
            <button class="fader-button" id="reset-btn">R</button>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const tempoSlider = this.shadowRoot.getElementById('tempo-slider');
        const resetBtn = this.shadowRoot.getElementById('reset-btn');

        tempoSlider?.addEventListener('input', (e) => {
            this.setAttribute('bpm', e.target.value);
            this.dispatchEvent(new CustomEvent('tempo-change', {
                detail: { bpm: parseInt(e.target.value) }
            }));
        });

        resetBtn?.addEventListener('click', () => {
            this.setAttribute('bpm', '120');
            this.dispatchEvent(new CustomEvent('tempo-reset', { detail: { bpm: 120 } }));
        });
    }
}

// Register custom elements
customElements.define('mix-fader', MixFader);
customElements.define('channel-fader', ChannelFader);
customElements.define('tempo-fader', TempoFader);

export { MixFader, ChannelFader, TempoFader };
