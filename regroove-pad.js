// Minimalist Regroove Pad Component
class RegroovePad extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._active = false;
        this._state = 0; // 0 = off, 1 = on
    }

    static get observedAttributes() {
        return ['label', 'sublabel', 'cc', 'note', 'mmc', 'sysex', 'action', 'active', 'state', 'color'];
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
        const hasSysEx = this.getAttribute('sysex') !== null;
        const hasAction = this.getAttribute('action') !== null;
        const isEmpty = !hasCC && !hasNote && !hasMMC && !hasSysEx && !hasAction;

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

                .pad.color-blue {
                    background: #1A6BB3;
                    border-color: #0a2a4a;
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

                .pad.active.color-blue {
                    background: #2e90d9 !important;
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

        pad.classList.remove('active', 'state-on', 'color-green', 'color-red', 'color-yellow', 'color-blue');

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

        this.addEventListener('mousedown', (e) => {
            // Don't trigger on Ctrl key (used for drag)
            if (e.ctrlKey) return;
            // Don't trigger on right-click (button 2, used for editing)
            if (e.button !== 0) return;
            this.handlePress(e.shiftKey);
        });
        this.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handlePress(false);
        });
    }

    handlePress(isShiftHeld = false) {
        // Check if pad has any message type
        const hasCC = this.getAttribute('cc') !== null;
        const hasNote = this.getAttribute('note') !== null;
        const hasMMC = this.getAttribute('mmc') !== null;
        const hasSysEx = this.getAttribute('sysex') !== null;
        const hasAction = this.getAttribute('action') !== null;
        const hasSecondaryCC = this.getAttribute('secondary-cc') !== null;
        const hasSecondaryNote = this.getAttribute('secondary-note') !== null;
        const hasSecondaryMMC = this.getAttribute('secondary-mmc') !== null;

        if (!hasCC && !hasNote && !hasMMC && !hasSysEx && !hasAction) return; // Empty pad

        this.trigger();

        // Use secondary action if Shift is held and secondary exists
        const useSecondary = isShiftHeld && (hasSecondaryCC || hasSecondaryNote || hasSecondaryMMC);

        this.dispatchEvent(new CustomEvent('pad-press', {
            bubbles: true,
            composed: true,
            detail: {
                cc: useSecondary ? this.getAttribute('secondary-cc') : this.getAttribute('cc'),
                note: useSecondary ? this.getAttribute('secondary-note') : this.getAttribute('note'),
                mmc: useSecondary ? this.getAttribute('secondary-mmc') : this.getAttribute('mmc'),
                sysex: this.getAttribute('sysex'),
                action: this.getAttribute('action'),
                label: this.getAttribute('label') || '',
                isSecondary: useSecondary
            }
        }));
    }
}

customElements.define('regroove-pad', RegroovePad);
