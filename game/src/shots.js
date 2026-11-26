// Staged screenshot scenes for SKYPOST. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (bank toward the next objective, hold altitude, mind the
// throttle), so the frame is what real play looks like and the same seed
// always gives the same frame. Used by ?shot=cover|cockpit|landing|title.
import { stepPlane, PLANE_FLYING } from './plane.js';
import { createMissionState, stepMission, nextRingTarget } from './missions.js';
import { missionById } from './missions.js';
import { groundHeight } from './terrain.js';

const STEP = 1 / 60;

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Steer the plane toward a world point at a target speed.
function autopilot(plane, target, targetSpeed) {
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const desiredHeading = Math.atan2(dx, -dz);
  const headingError = wrapAngle(desiredHeading - plane.heading);
  const bank = clamp(headingError * 1.4, -1, 1);
  const altError = target.y - plane.y;
  const desiredPitch = clamp(altError * 0.004, -0.3, 0.35);
  const pitch = clamp(desiredPitch / 0.55, -1, 1);
  const throttleSet = plane.speed < targetSpeed ? 0.9 : 0.45;
  return { pitch, bank, throttleDelta: 0, throttleSet, wind: 0 };
}

function takeoffInput(plane) {
  return {
    pitch: plane.speed > 34 ? 0.7 : 0,
    bank: 0,
    throttleDelta: 0,
    throttleSet: 1,
    wind: 0,
  };
}

function runSteps(game, seconds, steer) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = steer(game.plane);
    stepPlane(game.plane, input, STEP, game.time);
    stepMission(game.mission, game.plane, game.particles, game.audio, STEP);
    game.time += STEP;
  }
}

// Set `game` to the named scene and return the screen to draw over it.
export function stageShot(name, game) {
  const missionDef = missionById('first-light');
  game.mission = createMissionState(missionDef);
  game.mission.started = true;
  game.score = 0;
  game.elapsed = 0;
  game.time = 0;
  game.particles = [];
  game.cameraMode = 'chase';
  game.screen = 'play';
  const { plane } = game;
  plane.x = 0;
  plane.z = 900;
  plane.y = groundHeight(0, 900) + 1.6;
  plane.heading = 0;
  plane.pitch = 0;
  plane.bank = 0;
  plane.speed = 0;
  plane.throttle = 0;
  plane.fuel = 100;
  plane.damage = 0;
  plane.gearDown = true;
  plane.flaps = false;
  plane.mode = 'parked';
  plane.crashReason = '';

  if (name === 'cockpit') {
    game.cameraMode = 'cockpit';
    runSteps(game, 21, (p) => {
      if (p.mode !== PLANE_FLYING && p.speed < 34) return takeoffInput(p);
      const target = nextRingTarget(game.mission) ?? { x: 0, y: 110, z: 0 };
      return autopilot(p, target, 62);
    });
    return { screen: 'play', cameraMode: 'cockpit' };
  }

  if (name === 'landing') {
    // Final approach: place the Kestrel on the glide path south of Coral
    // Strip and fly the last seconds in for real — gear down, flaps out.
    // The strip stays ahead in frame, the island ridge behind it.
    plane.x = 30;
    plane.z = 1280;
    plane.y = 82;
    plane.heading = 0.02;
    plane.speed = 46;
    plane.throttle = 0.35;
    plane.mode = PLANE_FLYING;
    plane.verticalSpeed = -3;
    plane.gearDown = true;
    plane.flaps = true;
    game.mission.step = 4; // final objective: land back on Coral Strip
    runSteps(game, 4.5, (p) => {
      const target = { x: 0, y: 30, z: 900 };
      const input = autopilot(p, target, 42);
      input.throttleSet = 0.3;
      return input;
    });
    return { screen: 'play', cameraMode: 'chase' };
  }

  if (name === 'title') {
    // The title screen sits over the First Light ring run in flight — the
    // parked-on-the-strip view reads as a tilted wedge of island, so the
    // title gets the flying scene as its backdrop instead.
    runSteps(game, 24, (p) => {
      if (p.mode !== PLANE_FLYING && p.speed < 34) return takeoffInput(p);
      const target = nextRingTarget(game.mission) ?? { x: -260, y: 120, z: -40 };
      return autopilot(p, target, 62);
    });
    return { screen: 'title', cameraMode: 'chase' };
  }

  // Cover: 24 seconds of the First Light ring run — through Ring 1, lining
  // up Ring 2 over the lagoon, Coral Strip behind, islands all around.
  runSteps(game, 24, (p) => {
    if (p.mode !== PLANE_FLYING && p.speed < 34) return takeoffInput(p);
    const target = nextRingTarget(game.mission) ?? { x: -260, y: 120, z: -40 };
    return autopilot(p, target, 62);
  });
  return { screen: 'play', cameraMode: 'chase' };
}
