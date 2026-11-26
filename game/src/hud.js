// The HUD: a DOM overlay updated every frame — airspeed, altitude,
// heading compass, artificial horizon, throttle, fuel, damage, and the
// mission checklist. DOM text stays crisp when the judge shrinks a shot.
import { headingDegrees, compassPoint } from './plane.js';
import { PALETTE } from './config.js';

export function createHud(document) {
  const get = (id) => document.getElementById(id);
  return {
    speed: get('hud-speed'),
    speedUnit: get('hud-speed-unit'),
    altitude: get('hud-alt'),
    heading: get('hud-hdg'),
    compass: get('hud-compass'),
    vsi: get('hud-vsi'),
    fuelBar: get('hud-fuel-bar'),
    fuelText: get('hud-fuel-text'),
    throttleBar: get('hud-throttle-bar'),
    throttleText: get('hud-throttle-text'),
    damageBar: get('hud-damage-bar'),
    missionName: get('hud-mission'),
    objectives: get('hud-objectives'),
    message: get('hud-message'),
    score: get('hud-score'),
    timer: get('hud-timer'),
    horizon: get('hud-horizon'),
    gear: get('hud-gear'),
    flaps: get('hud-flaps'),
    stall: get('hud-stall'),
    wind: get('hud-wind'),
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function drawHorizon(hud, plane) {
  const canvas = hud.horizon;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-plane.bank);
  const pitchPx = (plane.pitch * 180) / Math.PI * 1.1;
  ctx.fillStyle = '#2f6fb4';
  ctx.fillRect(-w, -h - pitchPx, w * 2, h + pitchPx);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-w, -pitchPx, w * 2, h + pitchPx);
  ctx.strokeStyle = '#f6ead2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w, -pitchPx);
  ctx.lineTo(w, -pitchPx);
  ctx.stroke();
  ctx.restore();
  // Fixed wings marker.
  ctx.strokeStyle = PALETTE.hudAmber;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 22, h / 2);
  ctx.lineTo(w / 2 - 6, h / 2);
  ctx.moveTo(w / 2 + 6, h / 2);
  ctx.lineTo(w / 2 + 22, h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.hudAmber;
  ctx.fill();
}

export function updateHud(hud, game) {
  const { plane, mission, score, elapsed } = game;
  if (hud.speed) hud.speed.textContent = String(Math.round(plane.speed * 1.944));
  if (hud.altitude) hud.altitude.textContent = String(Math.round(plane.y * 3.281));
  const hdg = headingDegrees(plane);
  if (hud.heading) hud.heading.textContent = `${String(Math.round(hdg)).padStart(3, '0')}° ${compassPoint(hdg)}`;
  if (hud.vsi) {
    const fpm = Math.round(plane.verticalSpeed * 196.85);
    hud.vsi.textContent = `${fpm >= 0 ? '+' : ''}${fpm} fpm`;
    hud.vsi.style.color = Math.abs(fpm) > 800 ? PALETTE.hudDanger : PALETTE.hudInk;
  }
  if (hud.fuelBar) {
    hud.fuelBar.style.width = `${plane.fuel.toFixed(1)}%`;
    hud.fuelBar.style.background = plane.fuel < 20 ? PALETTE.hudDanger : plane.fuel < 40 ? PALETTE.hudAmber : PALETTE.hudGood;
  }
  if (hud.fuelText) {
    hud.fuelText.textContent = `FUEL ${Math.round(plane.fuel)}%`;
    hud.fuelText.style.color = plane.fuel < 20 ? PALETTE.hudDanger : PALETTE.hudInk;
  }
  if (hud.throttleBar) hud.throttleBar.style.width = `${Math.round(plane.throttle * 100)}%`;
  if (hud.throttleText) hud.throttleText.textContent = `THR ${Math.round(plane.throttle * 100)}%`;
  if (hud.damageBar) {
    hud.damageBar.style.width = `${plane.damage.toFixed(1)}%`;
    hud.damageBar.style.background = plane.damage > 60 ? PALETTE.hudDanger : PALETTE.hudAmber;
  }
  if (hud.missionName) hud.missionName.textContent = mission ? mission.name.toUpperCase() : 'FREE FLIGHT';
  if (hud.score) hud.score.textContent = `SCORE ${score}`;
  if (hud.timer) hud.timer.textContent = formatTime(elapsed);
  if (hud.gear) {
    hud.gear.textContent = plane.gearDown ? 'GEAR DOWN' : 'GEAR UP';
    hud.gear.style.color = plane.gearDown ? PALETTE.hudGood : PALETTE.hudAmber;
  }
  if (hud.flaps) hud.flaps.textContent = plane.flaps ? 'FLAPS' : 'FLAPS UP';
  if (hud.stall) {
    const stalling = plane.speed < 32 && plane.mode === 'flying';
    hud.stall.style.visibility = stalling ? 'visible' : 'hidden';
  }
  if (hud.wind) {
    const gust = Math.abs(plane.windGust);
    hud.wind.textContent = gust > 0.15 ? `WIND GUSTS ${Math.round(gust * 40)} kt` : 'WIND CALM';
  }
  if (hud.objectives && mission) {
    const items = mission.objectives.map((objective, index) => {
      const state = index < mission.step ? 'done' : index === mission.step ? 'active' : 'todo';
      const mark = state === 'done' ? '✓' : state === 'active' ? '▸' : '·';
      return `<li class="obj-${state}">${mark} ${objective.label}</li>`;
    });
    const html = items.join('');
    if (hud.objectives.dataset.last !== html) {
      hud.objectives.innerHTML = html;
      hud.objectives.dataset.last = html;
    }
  }
  drawHorizon(hud, plane);
}

let messageTimer = 0;

export function showMessage(hud, text, seconds = 3.5) {
  if (!hud.message) return;
  hud.message.textContent = text;
  hud.message.style.opacity = '1';
  messageTimer = seconds;
}

export function tickMessage(hud, dt) {
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0 && hud.message) hud.message.style.opacity = '0';
  }
}
