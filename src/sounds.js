class SoundBoard {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.volume = 0.7;
  }

  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      this.context = new Context();
    } catch {
      this.context = null;
    }
  }

  tone({ type = 'sine', from = 440, to = from, duration = 0.1, gain = 0.4, delay = 0 }) {
    const ctx = this.context;
    if (!ctx || ctx.state === 'closed') return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const amplifier = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, from), start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    amplifier.gain.setValueAtTime(0.0001, start);
    amplifier.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * this.volume), start + 0.012);
    amplifier.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(amplifier).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  play(name) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context) return;
    const jitter = () => 0.96 + Math.random() * 0.08;
    switch (name) {
      case 'pick':
        this.tone({ type: 'sine', from: 300 * jitter(), to: 380 * jitter(), duration: 0.07, gain: 0.22 });
        break;
      case 'drop':
        this.tone({ type: 'sine', from: 220 * jitter(), to: 135 * jitter(), duration: 0.09, gain: 0.26 });
        break;
      case 'snap':
        this.tone({ type: 'triangle', from: 480 * jitter(), to: 720 * jitter(), duration: 0.08, gain: 0.42 });
        this.tone({ type: 'sine', from: 980 * jitter(), to: 1420 * jitter(), duration: 0.11, gain: 0.22, delay: 0.025 });
        this.tone({ type: 'sine', from: 180, to: 80, duration: 0.06, gain: 0.3 }); // subtle tactile wooden click
        break;
      case 'rotate':
        this.tone({ type: 'square', from: 620 * jitter(), to: 860 * jitter(), duration: 0.06, gain: 0.1 });
        break;
      case 'click':
        this.tone({ type: 'square', from: 760 * jitter(), to: 760 * jitter(), duration: 0.035, gain: 0.09 });
        break;
      case 'error':
        this.tone({ type: 'sawtooth', from: 180, to: 110, duration: 0.16, gain: 0.18 });
        break;
      case 'join':
        this.tone({ type: 'sine', from: 440, to: 660, duration: 0.14, gain: 0.24 });
        this.tone({ type: 'sine', from: 660, to: 880, duration: 0.16, gain: 0.18, delay: 0.1 });
        break;
      case 'leave':
        this.tone({ type: 'sine', from: 500, to: 300, duration: 0.14, gain: 0.18 });
        break;
      case 'complete':
        [523, 659, 784, 1047].forEach((frequency, index) => this.tone({ type: 'triangle', from: frequency, duration: 0.32, gain: 0.3, delay: index * 0.12 }));
        this.tone({ type: 'sine', from: 2093, to: 2093, duration: 0.5, gain: 0.12, delay: 0.48 });
        break;
      default:
        break;
    }
  }
}

export const sounds = new SoundBoard();
