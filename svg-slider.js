/**
 * SVG Vertical Slider Web Component
 * A touch-friendly vertical slider built with SVG
 */

class SvgSlider extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Slider state
        this.value = 0;
        this.min = 0;
        this.max = 127;
        this.isDragging = false;
        this.cachedRect = null;

        this.render();
    }

    static get observedAttributes() {
        return ['value', 'min', 'max', 'width', 'color'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (name === 'value') this.value = parseFloat(newValue);
            if (name === 'min') this.min = parseFloat(newValue);
            if (name === 'max') this.max = parseFloat(newValue);
            this.updateThumbPosition();
        }
    }

    connectedCallback() {
        this.setupEventListeners();

        // Cache the bounding rect after a short delay to ensure layout is complete
        requestAnimationFrame(() => {
            setTimeout(() => {
                this.updateCachedRect();
            }, 100);
        });
    }

    updateCachedRect() {
        this.cachedRect = this.getBoundingClientRect();
    }

    render() {
        const width = this.getAttribute('width') || '60';
        const color = this.getAttribute('color') || '#cc4444';

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: ${width}px;
                    height: 100%;
                    min-height: 100px;
                    touch-action: none;
                    user-select: none;
                    -webkit-user-select: none;
                }

                svg {
                    width: 100%;
                    height: 100%;
                    display: block;
                }

                .track {
                    fill: #2a2a2a;
                }

                .thumb {
                    fill: ${color};
                    cursor: grab;
                    transition: filter 0.1s;
                }

                .thumb:hover {
                    filter: brightness(1.2);
                }

                .thumb.dragging {
                    cursor: grabbing;
                    filter: brightness(0.9);
                }
            </style>

            <svg viewBox="0 0 60 1000" preserveAspectRatio="none">
                <rect class="track" x="0" y="0" width="60" height="1000" rx="4" ry="4"/>
                <rect class="thumb" x="0" y="450" width="60" height="100" rx="2" ry="2"/>
            </svg>
        `;

        this.svg = this.shadowRoot.querySelector('svg');
        this.thumb = this.shadowRoot.querySelector('.thumb');
        this.updateThumbPosition();
    }

    setupEventListeners() {
        const svg = this.svg;

        // Mouse events - track and thumb both start drag
        svg.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.stopDrag());

        // Touch events - track and thumb both start drag
        svg.addEventListener('touchstart', (e) => this.startDrag(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
        document.addEventListener('touchend', () => this.stopDrag());
        document.addEventListener('touchcancel', () => this.stopDrag());
    }

    startDrag(e) {
        e.preventDefault();
        e.stopPropagation();

        // Update cached rect at start of drag to get fresh position
        this.updateCachedRect();

        this.isDragging = true;
        this.thumb.classList.add('dragging');
        this.onDrag(e);
    }

    stopDrag() {
        if (this.isDragging) {
            this.isDragging = false;
            this.thumb.classList.remove('dragging');
        }
    }

    onDrag(e) {
        if (!this.isDragging) return;

        e.preventDefault();
        e.stopPropagation();
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        this.updateValueFromPosition(clientY);
    }

    updateValueFromPosition(clientY) {
        // Use cached rect instead of live getBoundingClientRect
        if (!this.cachedRect || this.cachedRect.height <= 0) {
            return;
        }

        const rect = this.cachedRect;
        const height = rect.height;
        const y = clientY - rect.top;

        // Clamp y to valid range
        const clampedY = Math.max(0, Math.min(height, y));
        const percentage = clampedY / height;

        // Invert: top (y=0, percentage=0) = max, bottom (y=height, percentage=1) = min
        const newValue = this.max - (percentage * (this.max - this.min));

        this.setValue(newValue);
    }

    setValue(newValue) {
        const oldValue = this.value;
        this.value = Math.round(Math.max(this.min, Math.min(this.max, newValue)));

        if (this.value !== oldValue) {
            this.updateThumbPosition();
            this.dispatchEvent(new CustomEvent('change', {
                detail: { value: this.value }
            }));
            this.dispatchEvent(new CustomEvent('input', {
                detail: { value: this.value }
            }));
        }
    }

    updateThumbPosition() {
        if (!this.thumb) {
            return;
        }

        // Calculate percentage (inverted: max at top, min at bottom)
        const percentage = 1 - ((this.value - this.min) / (this.max - this.min));
        const thumbHeight = 100; // Height of thumb in viewBox units
        const trackHeight = 1000; // Height of track in viewBox units

        // Position thumb (0 = top, 1000 = bottom, accounting for thumb height)
        const y = percentage * (trackHeight - thumbHeight);

        this.thumb.setAttribute('y', y);
    }

    getValue() {
        return this.value;
    }
}

customElements.define('svg-slider', SvgSlider);

export { SvgSlider };
