import { clamp } from './utils.js';

const STORAGE_KEY = 'gorun.muted';

const midiToHz = (note) => 440 * Math.pow(2, (note - 69) / 12);

const MELODY = [
  76, null, 79, null, 81, 79, 76, 74,
  74, null, 79, null, 83, 81, 79, null,
  84, 81, 76, null, 81, 79, 76, null,
  77, 76, 74, 72, 69, null, 67, null,
];

const BASS = [48, 43, 45, 41];
const MEASURE_CHORDS = [
  [60, 64, 67],
  [55, 59, 62],
  [57, 60, 64],
  [53, 57, 60],
];

export class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.compressor = null;
    this.noiseBuffer = null;
    this.musicTimer = null;
    this.musicOn = false;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.tempo = 118;
    this.energy = 0;
    this.finished = false;
    this.muted = this.readMuted();
    this.stepCounter = 0;
  }

  readMuted() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  saveMuted() {
    try {
      window.localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch (error) {
      /* quiet */
    }
  }

  async unlock() {
    try {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.72;
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 18;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.004;
        this.compressor.release.value = 0.2;
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 0.85;
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0.17;
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoiseBuffer();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return true;
    } catch (error) {
      return false;
    }
  }

  makeNoiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.saveMuted();
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, now, 0.03);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setEnergy(value) {
    this.energy = clamp(value, 0, 1);
  }

  tone({
    frequency,
    time = 0,
    duration = 0.2,
    type = 'sine',
    gain = 0.1,
    attack = 0.005,
    destination = null,
    slideTo = null,
    detune = 0,
  }) {
    if (!this.ctx) return;
    const start = Math.max(time, this.ctx.currentTime + 0.001);
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
    if (detune) osc.detune.value = detune;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(destination || this.sfxBus);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  noise({ duration = 0.15, gain = 0.06, frequency = 1400, time = 0, destination = null, type = 'bandpass' }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const start = Math.max(time, this.ctx.currentTime + 0.001);
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination || this.sfxBus);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  step(combo = 0) {
    if (!this.ctx) return;
    this.stepCounter += 1;
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const note = notes[combo % notes.length];
    const now = this.ctx.currentTime;
    this.tone({
      frequency: note,
      time: now,
      duration: 0.085,
      type: 'triangle',
      gain: 0.055,
    });
    this.tone({
      frequency: note * 2,
      time: now + 0.006,
      duration: 0.045,
      type: 'sine',
      gain: 0.018,
    });
    this.noise({ duration: 0.035, gain: 0.013, frequency: 2600, time: now, type: 'highpass' });
  }

  countdown(n) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tone({
      frequency: n <= 1 ? 660 : 440,
      time: now,
      duration: 0.13,
      type: 'sine',
      gain: 0.085,
    });
    this.tone({
      frequency: n <= 1 ? 990 : 660,
      time: now + 0.035,
      duration: 0.1,
      type: 'triangle',
      gain: 0.025,
    });
  }

  go() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      this.tone({
        frequency,
        time: now + index * 0.025,
        duration: 0.36,
        type: 'triangle',
        gain: 0.07,
      });
    });
    this.noise({ duration: 0.18, gain: 0.035, frequency: 3200, time: now, type: 'highpass' });
  }

  fall() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tone({
      frequency: 620,
      slideTo: 150,
      time: now,
      duration: 0.5,
      type: 'triangle',
      gain: 0.075,
    });
    this.noise({ duration: 0.16, gain: 0.06, frequency: 420, time: now + 0.16, type: 'lowpass' });
    this.tone({
      frequency: 95,
      slideTo: 55,
      time: now + 0.17,
      duration: 0.22,
      type: 'sine',
      gain: 0.12,
    });
  }

  recover() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tone({ frequency: 330, slideTo: 620, time: now, duration: 0.18, type: 'sine', gain: 0.04 });
  }

  combo(amount) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const base = 740 + Math.min(amount, 40) * 8;
    this.tone({ frequency: base, time: now, duration: 0.12, type: 'triangle', gain: 0.045 });
    this.tone({ frequency: base * 1.5, time: now + 0.07, duration: 0.18, type: 'sine', gain: 0.04 });
  }

  finish() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((frequency, index) => {
      this.tone({
        frequency,
        time: now + index * 0.085,
        duration: 0.5,
        type: index % 2 === 0 ? 'triangle' : 'sine',
        gain: 0.085,
      });
    });
    for (let i = 0; i < 5; i += 1) {
      this.tone({
        frequency: 1400 + i * 220,
        time: now + 0.5 + i * 0.07,
        duration: 0.4,
        type: 'sine',
        gain: 0.022,
      });
    }
    this.noise({ duration: 0.4, gain: 0.038, frequency: 4200, time: now + 0.3, type: 'highpass' });
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(0.17, this.ctx.currentTime, 0.08);
    }
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  stopMusic(fade = 0.18) {
    if (this.musicTimer) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicOn = false;
    if (this.ctx && this.musicBus) {
      const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setTargetAtTime(0.0001, now, Math.max(0.02, fade / 3));
    }
  }

  scheduleMusic() {
    if (!this.ctx || !this.musicOn) return;
    const stepDuration = 60 / this.tempo / 2;
    const scheduleUntil = this.ctx.currentTime + 0.16;
    while (this.nextNoteTime < scheduleUntil) {
      this.playMusicStep(this.musicStep, this.nextNoteTime);
      this.musicStep = (this.musicStep + 1) % 32;
      this.nextNoteTime += stepDuration;
    }
  }

  playMusicStep(step, when) {
    if (!this.ctx || !this.musicBus) return;
    const duration = 60 / this.tempo / 2;
    const bar = Math.floor(step / 8) % 4;
    const beatInBar = step % 8;
    const melodyNote = MELODY[step];
    if (melodyNote) {
      const freq = midiToHz(melodyNote);
      this.tone({
        frequency: freq,
        time: when,
        duration: duration * 1.5,
        type: 'triangle',
        gain: 0.065,
        attack: 0.008,
        destination: this.musicBus,
      });
      this.tone({
        frequency: freq * 2,
        time: when,
        duration: duration * 0.65,
        type: 'sine',
        gain: 0.016,
        destination: this.musicBus,
      });
    }
    if (beatInBar === 0 || beatInBar === 4) {
      this.tone({
        frequency: midiToHz(BASS[bar]) * (beatInBar === 4 ? 1.5 : 1),
        time: when,
        duration: duration * 1.8,
        type: 'sine',
        gain: 0.075,
        attack: 0.01,
        destination: this.musicBus,
      });
    }
    if (beatInBar === 0 || beatInBar === 2 || beatInBar === 4 || beatInBar === 6) {
      this.tone({
        frequency: 110,
        slideTo: 48,
        time: when,
        duration: 0.11,
        type: 'sine',
        gain: 0.065,
        destination: this.musicBus,
      });
    }
    if (step % 2 === 1 || (this.energy > 0.55 && step % 2 === 0)) {
      this.noise({
        duration: 0.028,
        gain: 0.012,
        frequency: 7200,
        time: when,
        type: 'highpass',
        destination: this.musicBus,
      });
    }
    if (beatInBar === 0 && step % 16 === 0) {
      const chord = MEASURE_CHORDS[bar];
      chord.forEach((note, i) => {
        this.tone({
          frequency: midiToHz(note + 12),
          time: when + i * 0.012,
          duration: duration * 3.2,
          type: 'sine',
          gain: 0.012,
          attack: 0.06,
          destination: this.musicBus,
        });
      });
    }
  }
}
