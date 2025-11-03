// Minimalist Regroove Pad Component
class RegroovePad extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._active = false;
        this._state = 0; // 0 = off, 1 = on
    }

    static get observedAttributes() {
        return ['label', 'sublabel', 'cc', 'note', 'active', 'state'];
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
        }, 100);
    }

    render() {
        const label = this.getAttribute('label') || '';
        const sublabel = this.getAttribute('sublabel') || '';

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
                    background: #1a1a1a;
                    border: 1px solid #0a0a0a;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.05s ease;
                    position: relative;
                }

                .pad.active {
                    background: #2a2a2a;
                }

                .pad.state-on {
                    background: #2a2a2a;
                    border-color: #333;
                }

                .label {
                    font-size: 0.85em;
                    font-weight: normal;
                    text-align: center;
                    line-height: 1.3;
                    color: #888;
                    white-space: pre-line;
                    letter-spacing: 0.02em;
                }

                .pad.active .label {
                    color: #aaa;
                }

                .pad.state-on .label {
                    color: #aaa;
                }

                .sublabel {
                    font-size: 0.65em;
                    margin-top: 4px;
                    color: #555;
                    text-align: center;
                }

                .pad:active {
                    background: #333;
                }

                /* Empty pad styling */
                .pad.empty {
                    background: #0a0a0a;
                    border-color: #0a0a0a;
                    cursor: default;
                }
            </style>

            <div class="pad ${!label ? 'empty' : ''}">
                ${label ? `
                    <div class="label">${label}</div>
                    ${sublabel ? `<div class="sublabel">${sublabel}</div>` : ''}
                ` : ''}
            </div>
        `;

        this.updateVisuals();
    }

    updateVisuals() {
        const pad = this.shadowRoot.querySelector('.pad');
        if (!pad) return;

        pad.classList.remove('active', 'state-on');

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
        const label = this.getAttribute('label');
        if (!label) return; // Empty pad

        this.trigger();
        this.dispatchEvent(new CustomEvent('pad-press', {
            bubbles: true,
            composed: true,
            detail: {
                cc: this.getAttribute('cc'),
                note: this.getAttribute('note'),
                label: label
            }
        }));
    }
}

customElements.define('regroove-pad', RegroovePad);
