// SKYPOST — Island Courier. Main loop and screens: title, mission
// briefing, flying, pause, and the end of a sortie. Wires the physics,
// the renderer, the HUD and the mission engine together.
import { createPlane, stepPlane, PLANE_FLYING, PLANE_LANDED, PLANE_CRASHED, PLANE_PARKED } from './plane.js';
import { createInput, bindInput, pollInput } from './input.js';
import { createAudio, unlockAudio, updateEngineSound, playClick, playWarning, setMuted } from './audio.js';
import { createRenderer, resizeRenderer, renderFrame } from './render.js';
import { createHud, updateHud, showMessage, tickMessage } from './hud.js';
import { createMissionState, missionById, stepMission, updateParticles } from './missions.js';
import { stageShot } from './shots.js';
import { MISSIONS } from './config.js';
import { runwayAt } from './terrain.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const hud = createHud(document);
const input = createInput();
const audio = createAudio();

const game = {
  screen: 'title',
  plane: createPlane(),
  mission: null,
  missionDef: null,
  particles: [],
  cameraMode: 'chase',
  time: 0,
  elapsed: 0,
  paused: false,
  score: 0,
  fuelWarned: false,
  shotMode: false,
  frozen: false,
  audio,
};

function showScreen(name) {
  game.screen = name;
  for (const id of ['screen-title', 'screen-briefing', 'screen-pause', 'screen-end']) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== `screen-${name}`);
  }
  const hudEl = document.getElementById('hud');
  if (hudEl) hudEl.classList.toggle('hidden', name !== 'play');
}

function startMission(def) {
  game.missionDef = def;
  game.mission = createMissionState(def);
  game.mission.started = true;
  game.plane = createPlane();
  game.plane.fuel = def.fuelStart;
  game.particles = [];
  game.elapsed = 0;
  game.score = 0;
  game.fuelWarned = false;
  game.cameraMode = 'chase';
  showScreen('play');
  showMessage(hud, `${def.name} — ${def.objectives[0].label}`, 4);
  playClick(audio);
}

function endSortie(crashed) {
  const mission = game.mission;
  const el = document.getElementById('screen-end');
  document.getElementById('end-title').textContent = crashed ? 'The Kestrel went down' : 'Sortie complete';
  document.getElementById('end-reason').textContent = mission.finishReason;
  document.getElementById('end-score').textContent = `Score ${mission.score}`;
  document.getElementById('end-detail').textContent =
    `Rings ${mission.ringsHit} · Landings ${mission.landings} · Time ${formatClock(mission.elapsed)} · Fuel ${Math.round(game.plane.fuel)}% left`;
  const medal = document.getElementById('end-medal');
  medal.textContent = mission.medal ? `${mission.medal} MEDAL` : '';
  medal.className = mission.medal ? `medal medal-${mission.medal.toLowerCase()}` : 'medal';
  showScreen('end');
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildBriefing() {
  const list = document.getElementById('mission-list');
  list.innerHTML = '';
  for (const def of MISSIONS) {
    const card = document.createElement('button');
    card.className = 'mission-card';
    card.type = 'button';
    card.innerHTML = `<span class="mission-name">${def.name}</span>
      <span class="mission-diff">${def.difficulty} · wind ${def.wind === 0 ? 'calm' : def.wind < 0.4 ? 'breeze' : 'gusty'}</span>
      <span class="mission-tag">${def.tagline}</span>
      <span class="mission-objs">${def.objectives.length} objectives</span>`;
    card.addEventListener('click', () => {
      unlockAudio(audio);
      startMission(def);
    });
    list.appendChild(card);
  }
}

function handlePlayFrame(frame, dt) {
  const { plane } = game;
  if (frame.gearPressed) {
    plane.gearDown = !plane.gearDown;
    showMessage(hud, plane.gearDown ? 'Gear down' : 'Gear up — mind the belly landing', 2);
  }
  if (frame.flapsPressed) {
    plane.flaps = !plane.flaps;
    showMessage(hud, plane.flaps ? 'Flaps down — slower, steadier' : 'Flaps up', 2);
  }
  if (frame.cameraPressed) {
    game.cameraMode = game.cameraMode === 'chase' ? 'cockpit' : 'chase';
    showMessage(hud, game.cameraMode === 'cockpit' ? 'Cockpit view' : 'Chase view', 1.5);
  }
  if (frame.mutePressed) {
    setMuted(audio, !audio.muted);
    showMessage(hud, audio.muted ? 'Sound off' : 'Sound on', 1.5);
  }
  if (frame.pausePressed) {
    game.paused = true;
    showScreen('pause');
    return;
  }
  if (frame.restartPressed) {
    startMission(game.missionDef);
    return;
  }

  const control = {
    pitch: frame.pitch,
    bank: frame.bank,
    throttleDelta: frame.throttleDelta,
    wind: game.missionDef.wind,
  };
  stepPlane(plane, control, dt, game.time);
  if (frame.brake && (plane.mode === PLANE_PARKED || plane.mode === 'rolling')) {
    plane.speed = Math.max(0, plane.speed - 30 * dt);
  }

  const events = stepMission(game.mission, plane, game.particles, audio, dt);

  // A landing that is not the objective still counts as a landing: the
  // pilot can throttle up and take off again from wherever she stopped.
  // (Checked after the mission engine, so an objective landing credits first.)
  if (plane.mode === PLANE_LANDED) {
    const pad = runwayAt(plane.x, plane.z);
    showMessage(hud, pad ? `Down safe on ${pad.runway.name} — throttle up to go again` : 'Down safe — throttle up to go again', 3);
    plane.mode = PLANE_PARKED;
    plane.speed = 0;
  }

  for (const event of events) {
    if (event.ring) showMessage(hud, `Ring threaded! +500 — ${game.mission.objectives[game.mission.step]?.label ?? 'keep flying'}`, 3);
    if (event.takeoff) showMessage(hud, 'Airborne! +150', 2.5);
    if (event.landed) showMessage(hud, `Down safe — parcel delivered! +800`, 3.5);
    if (event.fuelEmpty && !game.fuelWarned) {
      game.fuelWarned = true;
      playWarning(audio);
      showMessage(hud, 'Fuel empty — glide her down, gently', 4);
    }
    if (event.finished) endSortie(event.crashed);
  }
  updateParticles(game.particles, dt);

  game.elapsed = game.mission.elapsed;
  game.score = game.mission.score;
  updateEngineSound(audio, plane.throttle, plane.speed, plane.mode === PLANE_FLYING);
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (!game.paused && game.screen === 'play' && !game.frozen) {
    game.time += dt;
    const frame = pollInput(input);
    handlePlayFrame(frame, dt);
    tickMessage(hud, dt);
    updateHud(hud, game);
  }
  renderFrame(renderer, {
    plane: game.plane,
    cameraMode: game.cameraMode,
    time: game.time,
    rings: game.mission ? game.mission.rings : [],
    particles: game.particles,
    storm: game.missionDef ? game.missionDef.wind >= 0.6 : false,
  });
  requestAnimationFrame(loop);
}

function init() {
  bindInput(input, window);
  buildBriefing();
  resizeRenderer(renderer);
  window.addEventListener('resize', () => resizeRenderer(renderer));
  window.addEventListener('pointerdown', () => unlockAudio(audio), { once: true });
  window.addEventListener('keydown', () => unlockAudio(audio), { once: true });

  document.getElementById('btn-fly').addEventListener('click', () => {
    unlockAudio(audio);
    playClick(audio);
    showScreen('briefing');
  });
  document.getElementById('btn-back').addEventListener('click', () => {
    playClick(audio);
    showScreen('title');
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    game.paused = false;
    showScreen('play');
  });
  document.getElementById('btn-restart-pause').addEventListener('click', () => {
    game.paused = false;
    startMission(game.missionDef);
  });
  document.getElementById('btn-quit-pause').addEventListener('click', () => {
    game.paused = false;
    game.mission = null;
    showScreen('title');
  });
  document.getElementById('btn-again').addEventListener('click', () => startMission(game.missionDef));
  document.getElementById('btn-missions').addEventListener('click', () => showScreen('briefing'));

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    // Screenshot mode: stage one fixed scene, then keep re-rendering the
    // same frozen frame through the normal loop so the browser composites
    // the canvas (a single one-off paint is not reliably captured).
    game.shotMode = true;
    game.frozen = true;
    game.missionDef = missionById('first-light');
    const staged = stageShot(shot, game);
    game.cameraMode = staged.cameraMode;
    game.screen = staged.screen === 'title' ? 'title' : 'play';
    game.mission.elapsed = 0;
    game.score = game.mission.score;
    // Hide every overlay except the one the staged scene wants.
    for (const id of ['screen-title', 'screen-briefing', 'screen-pause', 'screen-end']) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== `screen-${game.screen}`);
    }
    if (game.screen === 'play') {
      const hudEl = document.getElementById('hud');
      if (hudEl) hudEl.classList.remove('hidden');
      updateHud(hud, game);
      showMessage(hud, 'SKYPOST — Island Courier · First Light', 60);
    }
    requestAnimationFrame(loop);
    return;
  }

  showScreen('title');
  requestAnimationFrame(loop);
}

init();
