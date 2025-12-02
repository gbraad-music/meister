/**
 * Web Display Adapter
 * Renders DisplayMessages to HTML/DOM elements in the browser
 */

class WebDisplayAdapter {
    constructor(elementId) {
        this.elementId = elementId;
        this.element = document.getElementById(elementId);
        this.lines = [];

        if (!this.element) {
            console.warn(`[WebDisplay] Element not found: ${elementId}`);
        } else {
            console.log(`[WebDisplay] Initialized for element: ${elementId}`);
        }
    }

    /**
     * Send DisplayMessage to web element
     * @param {Object} message - DisplayMessage object
     */
    sendMessage(message) {
        // Re-query element if needed
        if (!this.element) {
            this.element = document.getElementById(this.elementId);
            if (!this.element) {
                console.warn(`[WebDisplay] Element still not found: ${this.elementId}`);
                return;
            }
        }

        // Clear element
        this.element.innerHTML = '';

        // Store lines
        this.lines = message.lines;

        // Render lines
        message.lines.forEach((line, idx) => {
            const lineDiv = document.createElement('div');
            lineDiv.textContent = line;
            lineDiv.style.fontFamily = 'monospace';
            lineDiv.style.fontSize = '14px';
            lineDiv.style.whiteSpace = 'pre';
            lineDiv.style.lineHeight = '1.4';

            // Apply category styling
            if (message.metadata?.category === 'status') {
                lineDiv.style.color = '#4a9eff';
            } else if (message.metadata?.category === 'notification') {
                lineDiv.style.color = '#ffcc00';
                lineDiv.style.fontWeight = 'bold';
            } else if (message.metadata?.category === 'error') {
                lineDiv.style.color = '#ff4444';
                lineDiv.style.fontWeight = 'bold';
            } else {
                lineDiv.style.color = '#d0d0d0';
            }

            this.element.appendChild(lineDiv);
        });

        // Render graphics primitives
        if (message.graphics) {
            message.graphics.forEach(gfx => {
                this.renderGraphicHTML(gfx);
            });
        }

        // Auto-dismiss if duration set
        if (message.metadata?.duration) {
            setTimeout(() => {
                this.clear();
            }, message.metadata.duration);
        }
    }

    /**
     * Render graphic primitive as HTML
     */
    renderGraphicHTML(gfx) {
        if (gfx.type === 'bar') {
            const barDiv = document.createElement('div');
            barDiv.style.width = `${gfx.width * 10}px`;
            barDiv.style.height = '8px';
            barDiv.style.border = '1px solid #4a9eff';
            barDiv.style.position = 'relative';
            barDiv.style.marginTop = '4px';
            barDiv.style.marginLeft = `${gfx.col * 10}px`;

            const fillDiv = document.createElement('div');
            fillDiv.style.width = `${gfx.value * 100}%`;
            fillDiv.style.height = '100%';
            fillDiv.style.background = '#4a9eff';

            barDiv.appendChild(fillDiv);
            this.element.appendChild(barDiv);
        }
    }

    /**
     * Clear display
     */
    clear() {
        if (this.element) {
            this.element.innerHTML = '';
            this.lines = [];
        }
    }

    /**
     * Get current lines
     */
    getLines() {
        return [...this.lines];
    }
}

// Make available globally
window.WebDisplayAdapter = WebDisplayAdapter;
