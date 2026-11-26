// Synthesised sound for SKYPOST — no audio files, everything is built with
// the Web Audio API: an engine hum that follows the throttle, wind that
// rises with speed, a chime for rings and a thud for landings. Silent until
// the pilot first presses a key or clicks, as browsers require.
export function createAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windSource: null,
    windGain: null,
    windFilter: null,
    muted: false,
    started: false,
  };
}

function ensureContext(audio) {
  if (audio.ctx) return true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  audio.ctx = new Ctx();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.5;
  audio.master.connect(audio.ctx.destination);

  audio.engineOsc = audio.ctx.createOscillator();
  audio.engineOsc.type = 'sawtooth';
  audio.engineOsc.frequency.value = 52;
  audio.engineOsc2 = audio.ctx.createOscillator();
  audio.engineOsc2.type = 'square';
  audio.engineOsc2.frequency.value = 26;
  const engineFilter = audio.ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 420;
  audio.engineGain = audio.ctx.createGain();
  audio.engineGain.gain.value = 0;
  audio.engineOsc.connect(engineFilter);
  audio.engineOsc2.connect(engineFilter);
  engineFilter.connect(audio.engineGain);
  audio.engineGain.connect(audio.master);
  audio.engineOsc.start();
  audio.engineOsc2.start();

  const length = audio.ctx.sampleRate * 2;
  const buffer = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  audio.windSource = audio.ctx.createBufferSource();
  audio.windSource.buffer = buffer;
  audio.windSource.loop = true;
  audio.windFilter = audio.ctx.createBiquadFilter();
  audio.windFilter.type = 'bandpass';
  audio.windFilter.frequency.value = 600;
  audio.windFilter.Q.value = 0.6;
  audio.windGain = audio.ctx.createGain();
  audio.windGain.gain.value = 0;
  audio.windSource.connect(audio.windFilter);
  audio.windFilter.connect(audio.windGain);
  audio.windGain.connect(audio.master);
  audio.windSource.start();
  audio.started = true;
  return true;
}

export function unlockAudio(audio) {
  if (!ensureContext(audio)) return;
  if (audio.ctx.state === 'suspended') audio.ctx.resume();
}

export function updateEngineSound(audio, throttle, speed, airborne) {
  if (!audio.ctx || audio.muted) return;
  const now = audio.ctx.currentTime;
  const target = airborne || throttle > 0.05 ? 0.045 + throttle * 0.075 : 0;
  audio.engineGain.gain.setTargetAtTime(target, now, 0.15);
  audio.engineOsc.frequency.setTargetAtTime(46 + throttle * 58 + speed * 0.12, now, 0.1);
  audio.engineOsc2.frequency.setTargetAtTime(23 + throttle * 29, now, 0.1);
  audio.windGain.gain.setTargetAtTime(Math.min(0.12, speed * 0.0011), now, 0.2);
  audio.windFilter.frequency.setTargetAtTime(380 + speed * 6, now, 0.2);
}

function tone(audio, frequency, startAt, duration, type, volume) {
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

export function playRingChime(audio) {
  if (!audio.ctx || audio.muted) return;
  const now = audio.ctx.currentTime;
  tone(audio, 880, now, 0.5, 'sine', 0.22);
  tone(audio, 1318, now + 0.09, 0.6, 'sine', 0.18);
}

export function playThud(audio) {
  if (!audio.ctx || audio.muted) return;
  const now = audio.ctx.currentTime;
  tone(audio, 70, now, 0.28, 'sine', 0.4);
  tone(audio, 48, now + 0.05, 0.3, 'triangle', 0.25);
}

export function playClick(audio) {
  if (!audio.ctx || audio.muted) return;
  tone(audio, 660, audio.ctx.currentTime, 0.08, 'sine', 0.12);
}

export function playFanfare(audio) {
  if (!audio.ctx || audio.muted) return;
  const now = audio.ctx.currentTime;
  [523, 659, 784, 1046].forEach((freq, i) => tone(audio, freq, now + i * 0.12, 0.5, 'triangle', 0.16));
}

// Two low beeps: fuel is out, or the airframe is about to give up.
export function playWarning(audio) {
  if (!audio.ctx || audio.muted) return;
  const now = audio.ctx.currentTime;
  tone(audio, 220, now, 0.18, 'square', 0.12);
  tone(audio, 220, now + 0.25, 0.18, 'square', 0.12);
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master) audio.master.gain.value = muted ? 0 : 0.5;
}
