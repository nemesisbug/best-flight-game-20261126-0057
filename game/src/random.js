// Deterministic randomness for SKYPOST: one seeded generator drives the
// terrain noise, the cloud field and the palm clusters, so the same seed
// always builds the same archipelago and the same screenshot.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Small value-noise field: smooth pseudo-random bumps for terrain detail.
export function makeNoise(seed) {
  const rand = mulberry32(seed * 7919 + 13);
  const grid = new Float32Array(64 * 64);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
  function at(ix, iz) {
    const x = ((ix % 64) + 64) % 64;
    const z = ((iz % 64) + 64) % 64;
    return grid[z * 64 + x];
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  return function noise(x, z) {
    const scale = 1 / 420;
    const gx = x * scale;
    const gz = z * scale;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = smooth(gx - x0);
    const fz = smooth(gz - z0);
    const a = at(x0, z0);
    const b = at(x0 + 1, z0);
    const c = at(x0, z0 + 1);
    const d = at(x0 + 1, z0 + 1);
    return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
  };
}

// Pick `count` points inside an island's disc, clear of its runway pad.
export function scatterOnIsland(rand, island, count, clearX, clearZ, clearR) {
  const points = [];
  let guard = 0;
  while (points.length < count && guard < count * 40) {
    guard += 1;
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * island.r * 0.82;
    const x = island.x + Math.cos(angle) * dist;
    const z = island.z + Math.sin(angle) * dist;
    const dx = x - clearX;
    const dz = z - clearZ;
    if (dx * dx + dz * dz < clearR * clearR) continue;
    points.push({ x, z, s: 0.7 + rand() * 0.7 });
  }
  return points;
}

// Deterministic 0..1 hash of a grid cell — used to vary terrain shading
// from cell to cell so flat-shaded ground does not read as one big plate.
export function hash2(x, z) {
  let h = (Math.floor(x) * 374761393 + Math.floor(z) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
