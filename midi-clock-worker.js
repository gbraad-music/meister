// MIDI Clock Worker - Runs timing loop in separate thread
// This prevents UI rendering from blocking the clock!

let clockInterval = null;
let pulseCount = 0;
let isRunning = false;

self.onmessage = function(e) {
    const { cmd, bpm } = e.data;

    if (cmd === 'start') {
        if (isRunning) {
            self.postMessage({ type: 'error', message: 'Clock already running' });
            return;
        }

        startClock(bpm);
    } else if (cmd === 'stop') {
        stopClock();
    } else if (cmd === 'setBPM') {
        // Restart with new BPM
        if (isRunning) {
            stopClock();
            startClock(bpm);
        }
    }
};

function startClock(bpm) {
    const PULSES_PER_QUARTER_NOTE = 24;
    const msPerBeat = 60000 / bpm;
    const interval = msPerBeat / PULSES_PER_QUARTER_NOTE;

    self.postMessage({
        type: 'started',
        bpm: bpm,
        interval: interval.toFixed(2)
    });

    isRunning = true;
    pulseCount = 0;
    let nextPulseTime = performance.now();

    const clockTick = () => {
        if (!isRunning) return;

        pulseCount++;

        // Tell main thread to send MIDI pulse
        self.postMessage({
            type: 'pulse',
            count: pulseCount
        });

        // Schedule next pulse with drift compensation
        nextPulseTime += interval;
        const delay = Math.max(0, nextPulseTime - performance.now());

        clockInterval = setTimeout(clockTick, delay);
    };

    // Start immediately
    clockInterval = setTimeout(clockTick, 0);
}

function stopClock() {
    if (clockInterval) {
        clearTimeout(clockInterval);
        clockInterval = null;
    }
    isRunning = false;

    self.postMessage({
        type: 'stopped',
        totalPulses: pulseCount
    });
}
