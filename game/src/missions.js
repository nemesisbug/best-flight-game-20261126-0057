// Missions: the objective engine. Each sortie is a checklist the pilot
// walks through — takeoffs, rings and landings — with scoring, medals and
// a plain-English reason when a sortie ends in the drink.
import { MISSIONS, RINGS, SCORE } from './config.js';
import { ringById, runwayById, runwayAt } from './terrain.js';
import { distanceTo, PLANE_LANDED, PLANE_CRASHED, PLANE_FLYING } from './plane.js';
import { playRingChime, playThud, playFanfare } from './audio.js';

export function createMissionState(missionDef) {
  return {
    def: missionDef,
    name: missionDef.name,
    step: 0,
    objectives: missionDef.objectives,
    rings: RINGS.map((ring) => ({ ...ring, passed: false })),
    score: 0,
    ringsHit: 0,
    landings: 0,
    takeoffs: 0,
    started: false,
    finished: false,
    finishReason: '',
    medal: '',
    elapsed: 0,
    wasAirborne: false,
    wasParked: true,
  };
}

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

function currentObjective(mission) {
  return mission.objectives[mission.step] ?? null;
}

function burst(particles, x, y, z, colour, count) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI - Math.PI / 2;
    const speed = 4 + Math.random() * 10;
    particles.push({
      x, y, z,
      vx: Math.cos(a) * Math.cos(b) * speed,
      vy: Math.sin(b) * speed,
      vz: Math.sin(a) * Math.cos(b) * speed,
      life: 0.9,
      maxLife: 0.9,
      size: 0.9 + Math.random() * 1.1,
      colour,
    });
  }
}

export function updateParticles(particles, dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 2 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// Advance the mission one frame. Returns events for the main loop to act on:
// { ring: id } | { landed: runwayId } | { takeoff: true } | { finished }.
export function stepMission(mission, plane, particles, audio, dt) {
  const events = [];
  if (!mission || mission.finished) return events;
  mission.elapsed += dt;

  if (plane.mode === PLANE_FLYING) {
    if (!mission.wasAirborne) {
      mission.wasAirborne = true;
      const objective = currentObjective(mission);
      if (objective && objective.kind === 'takeoff') {
        mission.step += 1;
        mission.score += SCORE.takeoff;
        mission.takeoffs += 1;
        events.push({ takeoff: true });
      }
    }
  } else {
    mission.wasAirborne = false;
  }

  // Rings: flying through the hoop scores, chimes and bursts gold.
  const objective = currentObjective(mission);
  if (objective && objective.kind === 'ring') {
    const ringState = mission.rings.find((r) => r.id === objective.ring);
    const ring = ringById(objective.ring);
    if (ringState && ring && !ringState.passed) {
      const d = distanceTo(plane, ring.x, ring.y, ring.z);
      const prev = ringState.prevDist ?? Infinity;
      ringState.prevDist = d;
      if (d < ring.r * 0.9 && plane.mode === PLANE_FLYING) {
        ringState.passed = true;
        mission.ringsHit += 1;
        mission.score += SCORE.ring;
        mission.step += 1;
        burst(particles, ring.x, ring.y, ring.z, '#ffc93c', 26);
        playRingChime(audio);
        events.push({ ring: ring.id });
      } else if (prev < d && prev < ring.r * 4 && plane.mode === PLANE_FLYING) {
        // Flew past the ring without threading it — no penalty, just a nudge.
        ringState.prevDist = d;
      }
    }
  }

  // Landings: the plane itself reports PLANE_LANDED; the mission credits it
  // when the current objective names that runway.
  if (plane.mode === PLANE_LANDED) {
    const pad = runwayAt(plane.x, plane.z);
    if (pad) {
      const obj = currentObjective(mission);
      if (obj && obj.kind === 'land' && obj.runway === pad.runway.id) {
        mission.step += 1;
        mission.score += SCORE.landing;
        mission.landings += 1;
        playThud(audio);
        events.push({ landed: pad.runway.id });
        plane.mode = 'parked';
        plane.speed = 0;
      }
    }
  }

  // A crash ends the sortie with the plane's own reason.
  if (plane.mode === PLANE_CRASHED && !mission.finished) {
    mission.finished = true;
    mission.finishReason = plane.crashReason || 'The Kestrel went down.';
    mission.score = Math.max(0, mission.score - Math.round(plane.damage * SCORE.damagePenaltyPerPoint * 0.1));
    events.push({ finished: true, crashed: true });
    return events;
  }

  // Fuel out while airborne: glide down and wait for the ground to decide.
  if (plane.fuel <= 0 && plane.mode === PLANE_FLYING && !mission.finished) {
    events.push({ fuelEmpty: true });
  }

  // All objectives done: score the sortie and hand out a medal.
  if (mission.step >= mission.objectives.length && !mission.finished) {
    mission.finished = true;
    const timeBonus = Math.max(0, Math.round((600 - mission.elapsed) * SCORE.timeBonusPerSecond * 0.1));
    const fuelBonus = Math.round(plane.fuel * SCORE.fuelBonusPerUnit * 0.4);
    mission.score += timeBonus + fuelBonus;
    mission.finishReason = `Sortie complete — ${mission.ringsHit} ring${mission.ringsHit === 1 ? '' : 's'}, ${mission.landings} landing${mission.landings === 1 ? '' : 's'}, ${Math.round(plane.fuel)}% fuel left.`;
    mission.medal = mission.score >= SCORE.medalGold ? 'GOLD'
      : mission.score >= SCORE.medalSilver ? 'SILVER'
        : mission.score >= SCORE.medalBronze ? 'BRONZE' : '';
    playFanfare(audio);
    events.push({ finished: true, crashed: false });
  }
  return events;
}

export function nextRingTarget(mission) {
  const objective = currentObjective(mission);
  if (!objective) return null;
  if (objective.kind === 'takeoff') {
    // Aim down the home strip so the takeoff roll stays on the centreline.
    const runway = runwayById('coral');
    if (!runway) return null;
    return {
      x: runway.x - Math.sin(runway.heading) * runway.len * 0.5,
      y: runway.height + 30,
      z: runway.z - Math.cos(runway.heading) * runway.len * 0.5,
      r: 30,
      heading: runway.heading,
    };
  }
  if (objective.kind === 'ring') return ringById(objective.ring);
  if (objective.kind === 'land') {
    const runway = runwayById(objective.runway);
    return runway ? { x: runway.x, y: runway.height + 40, z: runway.z, r: 30, heading: runway.heading } : null;
  }
  return null;
}
