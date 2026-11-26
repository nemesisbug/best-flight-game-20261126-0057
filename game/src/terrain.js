// The archipelago: heightfield islands, flat runway pads, ring anchors,
// clouds and palm clusters. Everything is built from the seeded config so
// the world is identical on every load.
import { ISLANDS, RUNWAYS, RINGS, WORLD } from './config.js';
import { mulberry32, makeNoise, scatterOnIsland } from './random.js';

const noise = makeNoise(WORLD.seed);
const rand = mulberry32(WORLD.seed);

function islandHeight(x, z) {
  let h = -14;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d2 = dx * dx + dz * dz;
    const r2 = island.r * island.r;
    if (d2 > r2 * 1.6) continue;
    const fall = Math.exp(-d2 / (r2 * 0.45));
    h += island.h * fall;
  }
  return h + noise(x, z) * 3.2;
}

function runwayFlatten(x, z) {
  for (const runway of RUNWAYS) {
    const cos = Math.cos(runway.heading);
    const sin = Math.sin(runway.heading);
    const dx = x - runway.x;
    const dz = z - runway.z;
    // Rotate into runway-local frame: local z along the strip.
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    const halfW = runway.w / 2;
    const halfL = runway.len / 2;
    // The pad blends into the island over a wide shoulder (140 m), so the
    // ground beside a strip is a gentle slope, not a wall to fly into.
    if (Math.abs(lx) > halfW + 140 || Math.abs(lz) > halfL + 140) continue;
    const edgeX = Math.max(0, (Math.abs(lx) - halfW) / 140);
    const edgeZ = Math.max(0, (Math.abs(lz) - halfL) / 140);
    const edge = Math.min(1, Math.max(edgeX, edgeZ));
    const blend = edge * edge * (3 - 2 * edge);
    return runway.height + (islandHeight(x, z) - runway.height) * blend;
  }
  return null;
}

// Ground height at a world point (metres above sea level).
export function groundHeight(x, z) {
  const flat = runwayFlatten(x, z);
  return flat === null ? islandHeight(x, z) : flat;
}

// Which runway, if any, covers a world point (used for landing checks).
export function runwayAt(x, z) {
  for (const runway of RUNWAYS) {
    const cos = Math.cos(runway.heading);
    const sin = Math.sin(runway.heading);
    const dx = x - runway.x;
    const dz = z - runway.z;
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;
    if (Math.abs(lx) <= runway.w / 2 + 4 && Math.abs(lz) <= runway.len / 2) {
      return { runway, localX: lx, localZ: lz };
    }
  }
  return null;
}

export function ringById(id) {
  return RINGS.find((ring) => ring.id === id) ?? null;
}

export function runwayById(id) {
  return RUNWAYS.find((runway) => runway.id === id) ?? null;
}

// Palm clusters per island, kept clear of the runway pads.
export const PALMS = (() => {
  const out = [];
  for (const island of ISLANDS) {
    const pad = RUNWAYS.find((r) => Math.hypot(r.x - island.x, r.z - island.z) < island.r);
    const clearX = pad ? pad.x : island.x + 99999;
    const clearZ = pad ? pad.z : island.z + 99999;
    const spots = scatterOnIsland(rand, island, island.trees, clearX, clearZ, 90);
    for (const spot of spots) {
      out.push({ x: spot.x, z: spot.z, y: groundHeight(spot.x, spot.z), s: spot.s });
    }
  }
  return out;
})();

// Clouds drift slowly across the sky; positions are fixed per seed.
export const CLOUDS = (() => {
  const out = [];
  for (let i = 0; i < 42; i += 1) {
    out.push({
      x: (rand() - 0.5) * 5200,
      z: (rand() - 0.5) * 5200,
      y: 260 + rand() * 180,
      s: 60 + rand() * 130,
      drift: 1.5 + rand() * 2.5,
    });
  }
  return out;
})();

// A lighthouse stands on the east island's northern point.
export const LIGHTHOUSE = { x: 1250, z: -1520, y: groundHeight(1250, -1520) };
