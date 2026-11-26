// The Kestrel: arcade flight physics for the little courier plane.
// State is plain numbers; step() advances it one frame from the inputs.
// The plane is either parked, rolling, flying, or down (crashed / landed).
import { FLIGHT, WORLD } from './config.js';
import { groundHeight, runwayAt } from './terrain.js';

export const PLANE_PARKED = 'parked';
export const PLANE_ROLLING = 'rolling';
export const PLANE_FLYING = 'flying';
export const PLANE_LANDED = 'landed';
export const PLANE_CRASHED = 'crashed';

export function createPlane() {
  return {
    x: WORLD.startX,
    y: groundHeight(WORLD.startX, WORLD.startZ) + FLIGHT.gearHeight,
    z: WORLD.startZ,
    heading: WORLD.startHeading,
    pitch: 0,
    bank: 0,
    speed: 0,
    verticalSpeed: 0,
    throttle: 0,
    fuel: 100,
    damage: 0,
    gearDown: true,
    flaps: false,
    mode: PLANE_PARKED,
    propAngle: 0,
    crashReason: '',
    airborneTime: 0,
    distanceFlown: 0,
    windGust: 0,
    scrapeCooldown: 0,
  };
}

export function resetPlane(plane, fuel) {
  const fresh = createPlane();
  Object.assign(plane, fresh);
  plane.fuel = fuel;
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

// One physics step. `input` holds pitch (-1..1, + = pull up), bank (-1..1),
// throttleDelta, gear toggle requests and the mission wind strength.
export function stepPlane(plane, input, dt, time) {
  if (plane.mode === PLANE_CRASHED || plane.mode === PLANE_LANDED) return;

  // Throttle: W/S nudge it; it stays where the pilot leaves it.
  plane.throttle = clamp(plane.throttle + (input.throttleDelta || 0) * dt, 0, 1);
  if (input.throttleSet !== undefined) plane.throttle = clamp(input.throttleSet, 0, 1);
  plane.scrapeCooldown = Math.max(0, (plane.scrapeCooldown || 0) - dt);

  // Gusts: slow sine swell plus a sharper gust in strong wind.
  const gustBase = Math.sin(time * 0.31) * 0.5 + Math.sin(time * 0.83) * 0.5;
  plane.windGust = gustBase * (input.wind || 0) * 0.55;

  const onGround = plane.mode === PLANE_PARKED || plane.mode === PLANE_ROLLING;
  const ground = groundHeight(plane.x, plane.z);

  // Speed: thrust fights drag; flaps cost speed, gear costs a little more.
  const drag = FLIGHT.drag * (plane.flaps ? 1.5 : 1) * (plane.gearDown ? 1.15 : 1);
  const thrust = plane.throttle * FLIGHT.maxSpeed * 0.42;
  plane.speed += (thrust - drag * plane.speed * plane.speed * 0.06 - plane.speed * 0.02) * dt;
  plane.speed = clamp(plane.speed, 0, FLIGHT.maxSpeed * 1.15);

  // Pitch and bank answer the stick, then ease back toward level. Pitch
  // works on the ground too: pulling up at takeoff speed is what lifts off.
  const pitchTarget = clamp(input.pitch * FLIGHT.pitchMax, -FLIGHT.pitchMax, FLIGHT.pitchMax);
  const bankTarget = clamp(input.bank * FLIGHT.bankMax, -FLIGHT.bankMax, FLIGHT.bankMax);
  plane.pitch += (pitchTarget - plane.pitch) * Math.min(1, FLIGHT.pitchRate * 2.4 * dt);
  plane.bank += (bankTarget - plane.bank) * Math.min(1, FLIGHT.bankRate * 2.2 * dt);
  if (!input.bank) plane.bank *= Math.max(0, 1 - 1.4 * dt);
  if (!input.pitch) plane.pitch *= Math.max(0, 1 - 1.1 * dt);

  // A banked wing turns the plane; the turn bites harder with speed.
  const turnRate = Math.sin(plane.bank) * FLIGHT.turnFactor * (plane.speed / FLIGHT.cruiseSpeed);
  plane.heading += turnRate * dt + plane.windGust * 0.12 * dt;

  // Lift: above stall speed the wing holds; below it the nose drops.
  const flying = !onGround;
  if (flying) {
    const liftFactor = clamp(plane.speed / FLIGHT.stallSpeed, 0, 1.4);
    let climb = Math.sin(plane.pitch) * plane.speed * liftFactor;
    if (plane.speed < FLIGHT.stallSpeed) {
      climb -= (FLIGHT.stallSpeed - plane.speed) * 0.55;
      plane.pitch -= 0.25 * dt;
    }
    plane.verticalSpeed += (climb - plane.verticalSpeed) * Math.min(1, 3.2 * dt);
    plane.y += plane.verticalSpeed * dt;
    plane.airborneTime += dt;
  }

  // Move along the heading.
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  plane.x += fx * plane.speed * dt;
  plane.z += fz * plane.speed * dt;
  plane.distanceFlown += plane.speed * dt;

  // Fuel burns with throttle; empty tanks mean a glider, not a crash.
  const burn = (FLIGHT.fuelBurnIdle + plane.throttle * FLIGHT.fuelBurnFull) * dt;
  plane.fuel = Math.max(0, plane.fuel - burn);
  if (plane.fuel <= 0 && plane.throttle > 0.05) plane.throttle = 0.05;

  plane.propAngle += (4 + plane.throttle * FLIGHT.propSpin) * dt;

  // Takeoff: rolling fast enough with the nose up lifts off the ground.
  if (onGround && plane.speed > FLIGHT.takeoffSpeed && plane.pitch > 0.06) {
    plane.mode = PLANE_FLYING;
    plane.y = ground + FLIGHT.gearHeight + 0.5;
    plane.verticalSpeed = 2;
  } else if (onGround) {
    plane.mode = plane.speed > 2 ? PLANE_ROLLING : PLANE_PARKED;
    plane.y = ground + FLIGHT.gearHeight;
    plane.verticalSpeed = 0;
  }

  // Ground contact while flying: landing, bounce, or crash.
  if (flying && plane.y <= ground + FLIGHT.gearHeight) {
    const pad = runwayAt(plane.x, plane.z);
    const descent = -plane.verticalSpeed;
    const aligned = pad !== null;
    if (aligned && plane.gearDown && descent < 4.5 && plane.speed < 52 && Math.abs(plane.bank) < 0.35) {
      plane.mode = PLANE_LANDED;
      plane.y = ground + FLIGHT.gearHeight;
      plane.verticalSpeed = 0;
      plane.speed *= 0.55;
    } else if (descent < 3 && plane.speed > 20 && plane.scrapeCooldown <= 0) {
      // A survivable scrape: bounce back up, take damage, keep flying.
      // One scrape starts a short cooldown so a rough touchdown cannot
      // stack five scrapes into a wreck in a single second.
      plane.damage = Math.min(100, plane.damage + FLIGHT.damageScrape);
      plane.scrapeCooldown = 1.5;
      plane.verticalSpeed = 3.5;
      plane.y = ground + FLIGHT.gearHeight + 1;
      plane.speed *= 0.82;
    } else if (descent < 3 && plane.speed > 20) {
      // Still inside the scrape cooldown: bounce without extra damage.
      plane.verticalSpeed = 3.5;
      plane.y = ground + FLIGHT.gearHeight + 1;
      plane.speed *= 0.9;
    } else {
      plane.mode = PLANE_CRASHED;
      plane.crashReason = !plane.gearDown && aligned
        ? 'Belly landing — the gear was up.'
        : descent >= 4.5
          ? 'Came down too hard — the Kestrel broke apart.'
          : 'Flew into the ground.';
      plane.y = ground + FLIGHT.gearHeight;
    }
  }

  // Out of the archipelago: the sea is far, turn the pilot back.
  const half = WORLD.size / 2;
  if (Math.abs(plane.x) > half || Math.abs(plane.z) > half) {
    plane.heading += Math.PI * dt * 0.5;
  }

  // A wrecked airframe cannot fly on.
  if (plane.damage >= 100 && plane.mode !== PLANE_CRASHED) {
    plane.mode = PLANE_CRASHED;
    plane.crashReason = 'The Kestrel took too much damage and gave up.';
  }
}

// Heading in degrees, 0 = north, clockwise.
export function headingDegrees(plane) {
  return ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
}

// Compass point for a heading in degrees.
export function compassPoint(degrees) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(degrees / 22.5) % 16];
}

// Distance in metres from the plane to a world point.
export function distanceTo(plane, x, y, z) {
  const dx = x - plane.x;
  const dy = y - plane.y;
  const dz = z - plane.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
