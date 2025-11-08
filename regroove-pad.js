// Minimalist Regroove Pad Component
class RegroovePad extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._active = false;
        this._state = 0; // 0 = off, 1 = on
    }

    static get observedAttributes() {
        return ['label', 'sublabel', 'cc', 'note', 'mmc', 'active', 'state', 'color'];
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    get active() {
        return this._active;
    }

    set active(val) {
        this._active = val;
        this.updateVisuals();
    }

    get state() {
        return this._state;
    }

    set state(val) {
        this._state = val;
        this.updateVisuals();
    }

    trigger() {
        this._active = true;
        this.updateVisuals();
        setTimeout(() => {
            this._active = false;
            this.updateVisuals();
        }, 150);
    }

    render() {
        const label = this.getAttribute('label') || '';
        const sublabel = this.getAttribute('sublabel') || '';

        // Check if this pad has any message type
        const hasCC = this.getAttribute('cc') !== null;
        const hasNote = this.getAttribute('note') !== null;
        const hasMMC = this.getAttribute('mmc') !== null;
        const isEmpty = !hasCC && !hasNote && !hasMMC;

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    cursor: pointer;
                    user-select: none;
                }

                .pad {
                    width: 100%;
                    height: 100%;
                    background: #6b7b8c;
                    border: 3px solid #1a2a3a;
                    border-radius: 6px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.05s ease, border-color 0.05s ease;
                    position: relative;
                }

                .pad.active {
                    background: #4a9eff !important;
                    border-color: #000000 !important;
                }

                .pad.state-on {
                    background: #7b8b9c;
                    border-color: #2a3a4a;
                }

                /* Color states */
                .pad.color-green {
                    background: #26A626;
                    border-color: #0a2a0a;
                }

                .pad.color-red {
                    background: #B31F24;
                    border-color: #4a0a0a;
                }

                .pad.color-yellow {
                    background: #B3801A;
                    border-color: #4a3a0a;
                }

                .pad.active.color-green {
                    background: #2ec02e !important;
                    border-color: #000000 !important;
                }

                .pad.active.color-red {
                    background: #d92730 !important;
                    border-color: #000000 !important;
                }

                .pad.active.color-yellow {
                    background: #d99820 !important;
                    border-color: #000000 !important;
                }

                .label {
                    font-size: 0.85em;
                    font-weight: bold;
                    text-align: center;
                    line-height: 1.3;
                    color: #d0d0d0;
                    white-space: pre-line;
                    letter-spacing: 0.02em;
                }

                .pad.active .label {
                    color: #ffffff !important;
                    font-weight: normal;
                }

                .pad.state-on .label {
                    color: #ffffff;
                }

                .sublabel {
                    font-size: 0.65em;
                    margin-top: 4px;
                    color: #555;
                    text-align: center;
                }

                .pad:active:not(.active) {
                    background: #7b8b9c;
                }

                /* Empty pad styling */
                .pad.empty {
                    background: #1a1a1a;
                    border-color: #000000;
                    cursor: default;
                }
            </style>

            <div class="pad ${isEmpty ? 'empty' : ''}">
                ${!isEmpty ? `
                    ${label ? `<div class="label">${label}</div>` : '<div class="label">•</div>'}
                    ${sublabel ? `<div class="sublabel">${sublabel}</div>` : ''}
                ` : ''}
            </div>
        `;

        this.updateVisuals();
    }

    updateVisuals() {
        const pad = this.shadowRoot.querySelector('.pad');
        if (!pad) return;

        pad.classList.remove('active', 'state-on', 'color-green', 'color-red', 'color-yellow');

        // Apply color if set
        const color = this.getAttribute('color');
        if (color) {
            pad.classList.add(`color-${color}`);
        }

        if (this._active) {
            pad.classList.add('active');
        } else if (this._state === 1) {
            pad.classList.add('state-on');
        }
    }

    setupEventListeners() {
        const pad = this.shadowRoot.querySelector('.pad');
        if (!pad) return;

        // Don't add listeners to empty pads
        if (pad.classList.contains('empty')) return;

        this.addEventListener('mousedown', () => this.handlePress());
        this.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handlePress();
        });
    }

    handlePress() {
        // Check if pad has any message type
        const hasCC = this.getAttribute('cc') !== null;
        const hasNote = this.getAttribute('note') !== null;
        const hasMMC = this.getAttribute('mmc') !== null;

        if (!hasCC && !hasNote && !hasMMC) return; // Empty pad

        this.trigger();
        this.dispatchEvent(new CustomEvent('pad-press', {
            bubbles: true,
            composed: true,
            detail: {
                cc: this.getAttribute('cc'),
                note: this.getAttribute('note'),
                mmc: this.getAttribute('mmc'),
                label: this.getAttribute('label') || ''
            }
        }));
    }
}

customElements.define('regroove-pad', RegroovePad);
