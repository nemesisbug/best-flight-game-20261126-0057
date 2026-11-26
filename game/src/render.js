// The 3D view: a small software renderer on a 2D canvas. No engine, no
// library — the camera chases the Kestrel (or sits in its cockpit), the
// terrain is a heightfield mesh drawn back-to-front, and the plane itself is
// a set of polygons built from its own points.
import { PALETTE, RUNWAYS } from './config.js';
import { groundHeight, PALMS, CLOUDS, LIGHTHOUSE } from './terrain.js';
import { hash2 } from './random.js';

const FOV = (62 * Math.PI) / 180;
const NEAR = 2;
const FAR = 3400;

export function createRenderer(canvas) {
  return { canvas, ctx: canvas.getContext('2d'), width: 0, height: 0, focal: 0 };
}

export function resizeRenderer(renderer) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = renderer.canvas.clientWidth || window.innerWidth;
  const h = renderer.canvas.clientHeight || window.innerHeight;
  renderer.canvas.width = Math.round(w * dpr);
  renderer.canvas.height = Math.round(h * dpr);
  renderer.width = renderer.canvas.width;
  renderer.height = renderer.canvas.height;
  renderer.focal = (renderer.height / 2) / Math.tan(FOV / 2);
}

function makeCamera(plane, mode, time) {
  const h = plane.heading;
  const p = plane.pitch;
  const fx = Math.sin(h) * Math.cos(p);
  const fy = Math.sin(p);
  const fz = -Math.cos(h) * Math.cos(p);
  const rx = Math.cos(h);
  const rz = Math.sin(h);
  // Right and up, rolled with the plane so the horizon banks with it.
  const ux = -Math.sin(h) * Math.sin(p);
  const uy = Math.cos(p);
  const uz = Math.cos(h) * Math.sin(p);
  const roll = plane.bank;
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const right = {
    x: rx * cosR + ux * sinR,
    y: 0 * cosR + uy * sinR,
    z: rz * cosR + uz * sinR,
  };
  const up = {
    x: ux * cosR - rx * sinR,
    y: uy * cosR - 0 * sinR,
    z: uz * cosR - rz * sinR,
  };
  const forward = { x: fx, y: fy, z: fz };
  let pos;
  let look;
  if (mode === 'cockpit') {
    pos = {
      x: plane.x + fx * 1.1 + up.y * 0 + up.x * 0.95,
      y: plane.y + 0.95,
      z: plane.z + fz * 1.1,
    };
    look = { x: plane.x + fx * 60, y: plane.y + fy * 60 + 2, z: plane.z + fz * 60 };
  } else {
    const dist = 21 + plane.speed * 0.05;
    const bob = Math.sin(time * 2.1) * 0.12;
    pos = {
      x: plane.x - fx * dist + up.x * 0 + right.x * 0,
      y: plane.y - fy * dist + 4.6 + bob,
      z: plane.z - fz * dist,
    };
    look = { x: plane.x + fx * 42, y: plane.y + 1.0, z: plane.z + fz * 42 };
  }
  // Recompute the basis from the look direction so the camera never rolls
  // past the plane's own bank in chase view.
  const lx = look.x - pos.x;
  const ly = look.y - pos.y;
  const lz = look.z - pos.z;
  const len = Math.hypot(lx, ly, lz) || 1;
  const fwd = { x: lx / len, y: ly / len, z: lz / len };
  const rLen = Math.hypot(fwd.z, 0, -fwd.x) || 1;
  const rgt = { x: -fwd.z / rLen, y: 0, z: fwd.x / rLen };
  const upv = {
    x: rgt.y * fwd.z - rgt.z * fwd.y,
    y: rgt.z * fwd.x - rgt.x * fwd.z,
    z: rgt.x * fwd.y - rgt.y * fwd.x,
  };
  // Chase view keeps the horizon level; cockpit view banks with the plane.
  if (mode === 'cockpit') return { pos, forward: fwd, right, up, planeForward: forward };
  return { pos, forward: fwd, right: rgt, up: upv, planeForward: forward };
}

function project(renderer, camera, x, y, z) {
  const dx = x - camera.pos.x;
  const dy = y - camera.pos.y;
  const dz = z - camera.pos.z;
  const cx = dx * camera.right.x + dy * camera.right.y + dz * camera.right.z;
  const cy = dx * camera.up.x + dy * camera.up.y + dz * camera.up.z;
  const cz = dx * camera.forward.x + dy * camera.forward.y + dz * camera.forward.z;
  if (cz < NEAR) return null;
  const s = renderer.focal / cz;
  return {
    x: renderer.width / 2 + cx * s,
    y: renderer.height / 2 - cy * s,
    depth: cz,
    scale: s,
  };
}

function hexMix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
  return `rgb(${r},${g},${bl})`;
}

// Scale an `rgb(r,g,b)` colour's brightness by `factor`.
function shade(rgb, factor) {
  const parts = rgb.slice(4, -1).split(',').map((n) => Math.max(0, Math.min(255, Math.round(Number(n) * factor))));
  return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
}

function terrainColour(h, slope) {
  if (h < 2.2) return PALETTE.sand;
  if (h < 30) return slope > 0.55 ? PALETTE.forest : PALETTE.grass;
  if (h < 52) return PALETTE.meadow;
  if (h < 82) return PALETTE.rock;
  return PALETTE.snow;
}

function drawSky(renderer, camera, time, storm) {
  const ctx = renderer.ctx;
  const w = renderer.width;
  const h = renderer.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (storm) {
    grad.addColorStop(0, '#3d4d63');
    grad.addColorStop(0.55, '#6d7d90');
    grad.addColorStop(1, '#aab6bd');
  } else {
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyHorizon);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Sun: a fixed point far along the morning sun direction.
  const sun = project(renderer, camera, camera.pos.x + 2600, camera.pos.y + 900, camera.pos.z - 2600);
  if (sun) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, h * 0.22);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.25, 'rgba(255,217,122,0.55)');
    glow.addColorStop(1, 'rgba(255,217,122,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - h * 0.22, sun.y - h * 0.22, h * 0.44, h * 0.44);
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, Math.max(10, h * 0.028), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSea(renderer, camera) {
  const ctx = renderer.ctx;
  const f = camera.forward;
  const r = camera.right;
  const pts = [];
  for (const [along, across] of [[3200, -3200], [3200, 3200], [-600, 3200], [-600, -3200]]) {
    const p = project(
      renderer,
      camera,
      camera.pos.x + f.x * along + r.x * across,
      0.4,
      camera.pos.z + f.z * along + r.z * across,
    );
    pts.push(p);
  }
  if (pts.some((p) => p === null)) return;
  const grad = ctx.createLinearGradient(0, renderer.height * 0.4, 0, renderer.height);
  grad.addColorStop(0, PALETTE.seaShallow);
  grad.addColorStop(1, PALETTE.seaDeep);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

function drawTerrain(renderer, camera, plane) {
  const ctx = renderer.ctx;
  const tris = [];
  function grid(cell, half, maxDist) {
    const cx = Math.round(plane.x / cell) * cell;
    const cz = Math.round(plane.z / cell) * cell;
    const n = Math.ceil(half / cell);
    for (let ix = -n; ix < n; ix += 1) {
      for (let iz = -n; iz < n; iz += 1) {
        const x0 = cx + ix * cell;
        const z0 = cz + iz * cell;
        const x1 = x0 + cell;
        const z1 = z0 + cell;
        const dx = x0 + cell / 2 - camera.pos.x;
        const dz = z0 + cell / 2 - camera.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > maxDist) continue;
        const h00 = groundHeight(x0, z0);
        const h10 = groundHeight(x1, z0);
        const h01 = groundHeight(x0, z1);
        const h11 = groundHeight(x1, z1);
        const avg = (h00 + h10 + h01 + h11) / 4;
        if (avg < 0.4) continue; // sea covers it
        const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / cell;
        tris.push({ x0, z0, x1, z1, h00, h10, h01, h11, avg, slope, dist });
      }
    }
  }
  grid(70, 640, 900);
  grid(220, 2200, 2600);
  tris.sort((a, b) => b.dist - a.dist);
  for (const t of tris) {
    const p00 = project(renderer, camera, t.x0, t.h00, t.z0);
    const p10 = project(renderer, camera, t.x1, t.h10, t.z0);
    const p01 = project(renderer, camera, t.x0, t.h01, t.z1);
    const p11 = project(renderer, camera, t.x1, t.h11, t.z1);
    if (!p00 || !p10 || !p01 || !p11) continue;
    const fog = Math.min(0.75, Math.max(0, (t.dist - 900) / 2400));
    const base = terrainColour(t.avg, t.slope);
    // A whisper of per-cell variation so the ground reads as terrain, not
    // one flat plate: ±4% brightness, fixed per cell.
    const jitter = 0.96 + hash2(t.x0, t.z0) * 0.08;
    const colour = shade(hexMix(base, PALETTE.skyHorizon, fog * 0.85), jitter);
    ctx.fillStyle = colour;
    // Each half of the quad is drawn only when it clears the water, so the
    // coastline follows the heightfield instead of cutting square plates.
    if ((t.h00 + t.h10 + t.h11) / 3 > 0.5) {
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.closePath();
      ctx.fill();
    }
    if ((t.h00 + t.h11 + t.h01) / 3 > 0.5) {
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRunways(renderer, camera) {
  const ctx = renderer.ctx;
  for (const runway of RUNWAYS) {
    const cos = Math.cos(runway.heading);
    const sin = Math.sin(runway.heading);
    function corner(lx, lz) {
      const wx = runway.x + lx * cos - lz * sin;
      const wz = runway.z + lx * sin + lz * cos;
      return project(renderer, camera, wx, runway.height + 0.5, wz);
    }
    const hw = runway.w / 2;
    const hl = runway.len / 2;
    const a = corner(-hw, -hl);
    const b = corner(hw, -hl);
    const c = corner(hw, hl);
    const d = corner(-hw, hl);
    if (!a || !b || !c || !d) continue;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    ctx.strokeStyle = PALETTE.runwayLine;
    ctx.lineWidth = Math.max(1, renderer.height * 0.003);
    for (let lz = -hl + 20; lz < hl - 10; lz += 40) {
      const p1 = corner(0, lz);
      const p2 = corner(0, lz + 20);
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
}

function drawPalms(renderer, camera) {
  const ctx = renderer.ctx;
  for (const palm of PALMS) {
    const dx = palm.x - camera.pos.x;
    const dz = palm.z - camera.pos.z;
    if (dx * dx + dz * dz > 1100 * 1100) continue;
    const base = project(renderer, camera, palm.x, palm.y, palm.z);
    const top = project(renderer, camera, palm.x, palm.y + 7 * palm.s, palm.z);
    if (!base || !top) continue;
    ctx.strokeStyle = '#6b4a2f';
    ctx.lineWidth = Math.max(1, 2.4 * palm.s * top.scale * 0.4);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.fillStyle = PALETTE.forest;
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, 9 * palm.s * top.scale * 0.35 + 2, 4 * palm.s * top.scale * 0.35 + 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLighthouse(renderer, camera) {
  const ctx = renderer.ctx;
  const baseY = groundHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  const base = project(renderer, camera, LIGHTHOUSE.x, baseY, LIGHTHOUSE.z);
  const top = project(renderer, camera, LIGHTHOUSE.x, baseY + 26, LIGHTHOUSE.z);
  if (!base || !top) return;
  const w = Math.max(2, Math.abs(top.y - base.y) * 0.16);
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(top.x - w / 2, top.y, w, base.y - top.y);
  ctx.fillStyle = PALETTE.planeRed;
  ctx.fillRect(top.x - w / 2, top.y + (base.y - top.y) * 0.4, w, (base.y - top.y) * 0.18);
  ctx.fillStyle = '#2c3844';
  ctx.beginPath();
  ctx.arc(top.x, top.y, w * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(renderer, camera, time) {
  const ctx = renderer.ctx;
  for (const cloud of CLOUDS) {
    const cx = cloud.x + time * cloud.drift;
    const dx = cx - camera.pos.x;
    const dz = cloud.z - camera.pos.z;
    if (dx * dx + dz * dz > FAR * FAR) continue;
    const p = project(renderer, camera, cx, cloud.y, cloud.z);
    if (!p) continue;
    const s = cloud.s * p.scale * 0.5;
    if (s < 2) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    for (const [ox, oy, r] of [[0, 0, 1], [-0.9, 0.25, 0.62], [0.9, 0.3, 0.7], [0.3, -0.35, 0.55]]) {
      ctx.beginPath();
      ctx.ellipse(p.x + ox * s, p.y + oy * s, r * s, r * s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRings(renderer, camera, rings) {
  const ctx = renderer.ctx;
  for (const ring of rings) {
    if (ring.passed) continue;
    const cos = Math.cos(ring.heading);
    const sin = Math.sin(ring.heading);
    const pts = [];
    for (let i = 0; i <= 28; i += 1) {
      const a = (i / 28) * Math.PI * 2;
      const rx = cos * Math.sin(a) * ring.r;
      const ry = Math.cos(a) * ring.r;
      const rz = sin * Math.sin(a) * ring.r;
      pts.push(project(renderer, camera, ring.x + rx, ring.y + ry, ring.z + rz));
    }
    if (pts.some((p) => p === null)) continue;
    const near = pts[0];
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,223,126,0.45)';
    ctx.lineWidth = Math.max(3, near.scale * ring.r * 0.16);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.ringGold;
    ctx.lineWidth = Math.max(1.5, near.scale * ring.r * 0.07);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // A small buoy marks the ring from the water below.
    const buoy = project(renderer, camera, ring.x, Math.max(1, groundHeight(ring.x, ring.z)) + 1, ring.z);
    if (buoy) {
      ctx.fillStyle = PALETTE.ringGold;
      ctx.beginPath();
      ctx.arc(buoy.x, buoy.y, Math.max(2, buoy.scale * 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// The Kestrel, built from polygons in its own local frame:
// +x right wing, +y up, +z toward the tail, nose at -z.
function planePolygons(plane) {
  const h = plane.heading;
  const p = plane.pitch;
  const fx = Math.sin(h) * Math.cos(p);
  const fy = Math.sin(p);
  const fz = -Math.cos(h) * Math.cos(p);
  const r0x = Math.cos(h);
  const r0z = Math.sin(h);
  const u0x = -Math.sin(h) * Math.sin(p);
  const u0y = Math.cos(p);
  const u0z = Math.cos(h) * Math.sin(p);
  const roll = plane.bank;
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const R = { x: r0x * cosR + u0x * sinR, y: u0y * sinR, z: r0z * cosR + u0z * sinR };
  const U = { x: u0x * cosR - r0x * sinR, y: u0y * cosR, z: u0z * cosR - r0z * sinR };
  const F = { x: fx, y: fy, z: fz };
  function P(lx, ly, lz) {
    return {
      x: plane.x + R.x * lx + U.x * ly - F.x * lz,
      y: plane.y + R.y * lx + U.y * ly - F.y * lz,
      z: plane.z + R.z * lx + U.z * ly - F.z * lz,
    };
  }
  const cream = PALETTE.planeCream;
  const red = PALETTE.planeRed;
  const teal = PALETTE.planeTeal;
  const dark = '#2c3844';
  const polys = [
    // Fuselage: nose, spine, tail — cream with a red stripe along the top.
    { pts: [P(0, 0.15, -3.4), P(0.55, 0.35, -1.2), P(0.5, 0.3, 2.6), P(0, 0.55, 3.1)], colour: cream },
    { pts: [P(0, 0.15, -3.4), P(0, 0.55, 3.1), P(-0.5, 0.3, 2.6), P(-0.55, 0.35, -1.2)], colour: cream },
    { pts: [P(0, 0.95, -0.6), P(0.5, 0.35, -1.2), P(0, 0.15, -3.4), P(-0.5, 0.35, -1.2)], colour: red },
    { pts: [P(0, 0.95, -0.6), P(0.45, 0.55, 1.4), P(0, 0.55, 3.1), P(-0.45, 0.55, 1.4)], colour: red },
    { pts: [P(0.55, 0.35, -1.2), P(0.5, -0.5, -0.6), P(0.5, -0.35, 2.6), P(0.5, 0.3, 2.6)], colour: cream },
    { pts: [P(-0.55, 0.35, -1.2), P(-0.5, 0.3, 2.6), P(-0.5, -0.35, 2.6), P(-0.5, -0.5, -0.6)], colour: cream },
    // Wings, cream with red tips.
    { pts: [P(0.5, 0.3, -0.9), P(3.6, 0.22, 0.3), P(4.4, 0.2, 0.7), P(0.55, 0.18, 0.9)], colour: cream },
    { pts: [P(-0.5, 0.3, -0.9), P(-0.55, 0.18, 0.9), P(-4.4, 0.2, 0.7), P(-3.6, 0.22, 0.3)], colour: cream },
    { pts: [P(3.6, 0.22, 0.3), P(4.4, 0.2, 0.7), P(4.4, 0.2, 1.1), P(3.6, 0.22, 0.9)], colour: red },
    { pts: [P(-3.6, 0.22, 0.3), P(-3.6, 0.22, 0.9), P(-4.4, 0.2, 1.1), P(-4.4, 0.2, 0.7)], colour: red },
    // Tailplane and fin.
    { pts: [P(0.3, 0.5, 2.4), P(1.7, 0.5, 2.7), P(1.7, 0.5, 3.1), P(0.3, 0.5, 3.0)], colour: red },
    { pts: [P(-0.3, 0.5, 2.4), P(-0.3, 0.5, 3.0), P(-1.7, 0.5, 3.1), P(-1.7, 0.5, 2.7)], colour: red },
    { pts: [P(0, 0.55, 2.2), P(0, 1.75, 2.85), P(0, 1.75, 3.05), P(0, 0.55, 3.05)], colour: red },
    // Floats under the belly — the courier lands on water too.
    { pts: [P(0.55, -0.75, -1.6), P(1.25, -0.75, -1.6), P(1.25, -0.75, 1.8), P(0.55, -0.75, 1.8)], colour: teal },
    { pts: [P(-1.25, -0.75, -1.6), P(-0.55, -0.75, -1.6), P(-0.55, -0.75, 1.8), P(-1.25, -0.75, 1.8)], colour: teal },
    // Cockpit windows.
    { pts: [P(0.42, 0.62, -1.5), P(0.42, 0.62, -0.4), P(0.1, 0.9, -0.5), P(0.1, 0.9, -1.4)], colour: dark },
    { pts: [P(-0.42, 0.62, -1.5), P(-0.1, 0.9, -1.4), P(-0.1, 0.9, -0.5), P(-0.42, 0.62, -0.4)], colour: dark },
  ];
  return { polys, nose: P(0, 0.15, -3.4), propAngle: plane.propAngle };
}

function drawPlane(renderer, camera, plane) {
  const { polys, nose } = planePolygons(plane);
  const ctx = renderer.ctx;
  const drawn = [];
  for (const poly of polys) {
    const pts = poly.pts.map((p) => project(renderer, camera, p.x, p.y, p.z));
    if (pts.some((p) => p === null)) continue;
    const depth = pts.reduce((s, p) => s + p.depth, 0) / pts.length;
    drawn.push({ pts, colour: poly.colour, depth });
  }
  drawn.sort((a, b) => b.depth - a.depth);
  for (const poly of drawn) {
    ctx.fillStyle = poly.colour;
    ctx.beginPath();
    ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
    for (let i = 1; i < poly.pts.length; i += 1) ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,45,60,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Spinning propeller: a translucent disc and two blades at the nose.
  const noseP = project(renderer, camera, nose.x, nose.y, nose.z);
  if (noseP) {
    const a = plane.propAngle;
    const r = Math.max(3, noseP.scale * 1.15);
    ctx.fillStyle = 'rgba(220,230,240,0.28)';
    ctx.beginPath();
    ctx.ellipse(noseP.x, noseP.y, r, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(44,56,68,0.85)';
    ctx.lineWidth = Math.max(1, r * 0.08);
    for (const off of [0, Math.PI]) {
      const ang = a + off;
      ctx.beginPath();
      ctx.moveTo(noseP.x - Math.cos(ang) * r, noseP.y - Math.sin(ang) * r * 0.92);
      ctx.lineTo(noseP.x + Math.cos(ang) * r, noseP.y + Math.sin(ang) * r * 0.92);
      ctx.stroke();
    }
  }
}

function drawParticles(renderer, camera, particles) {
  const ctx = renderer.ctx;
  for (const particle of particles) {
    const p = project(renderer, camera, particle.x, particle.y, particle.z);
    if (!p) continue;
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, p.scale * particle.size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRain(renderer, storm) {
  if (!storm) return;
  const ctx = renderer.ctx;
  const w = renderer.width;
  const h = renderer.height;
  ctx.strokeStyle = 'rgba(200,215,230,0.4)';
  ctx.lineWidth = 1;
  const t = performance.now() / 1000;
  for (let i = 0; i < 90; i += 1) {
    const x = ((i * 137.5 + t * 320) % (w + 40)) - 20;
    const y = ((i * 89.3 + t * 900) % (h + 40)) - 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, y + 22);
    ctx.stroke();
  }
}

function drawCockpitFrame(renderer, plane) {
  const ctx = renderer.ctx;
  const w = renderer.width;
  const h = renderer.height;
  // Glareshield and dashboard: dark teal, drawn in screen space.
  ctx.fillStyle = '#16323a';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.82);
  ctx.quadraticCurveTo(w * 0.5, h * 0.74, w, h * 0.82);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0f242b';
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  // Window pillars.
  ctx.fillStyle = '#16323a';
  ctx.beginPath();
  ctx.moveTo(w * 0.32, 0);
  ctx.lineTo(w * 0.36, h * 0.8);
  ctx.lineTo(w * 0.34, h * 0.8);
  ctx.lineTo(w * 0.28, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.68, 0);
  ctx.lineTo(w * 0.64, h * 0.8);
  ctx.lineTo(w * 0.66, h * 0.8);
  ctx.lineTo(w * 0.72, 0);
  ctx.closePath();
  ctx.fill();
  // A small compass card on the glareshield, banked with the plane.
  ctx.save();
  ctx.translate(w / 2, h * 0.79);
  ctx.rotate(-plane.bank * 0.6);
  ctx.fillStyle = '#f6ead2';
  ctx.beginPath();
  ctx.arc(0, 0, h * 0.028, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8442c';
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.022);
  ctx.lineTo(h * 0.008, 0);
  ctx.lineTo(-h * 0.008, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// One frame: sky, sea, terrain, runways, palms, lighthouse, clouds, rings,
// the plane, particles, rain and (in cockpit view) the cockpit frame.
export function renderFrame(renderer, state) {
  const { plane, cameraMode, time, rings, particles, storm } = state;
  const ctx = renderer.ctx;
  const camera = makeCamera(plane, cameraMode, time);
  drawSky(renderer, camera, time, storm);
  drawSea(renderer, camera);
  drawClouds(renderer, camera, time);
  drawTerrain(renderer, camera, plane);
  drawRunways(renderer, camera);
  drawPalms(renderer, camera);
  drawLighthouse(renderer, camera);
  drawRings(renderer, camera, rings);
  if (cameraMode !== 'cockpit') drawPlane(renderer, camera, plane);
  drawParticles(renderer, camera, particles);
  drawRain(renderer, storm);
  if (cameraMode === 'cockpit') drawCockpitFrame(renderer, plane);
  ctx.fillStyle = 'rgba(10,25,40,0.10)';
  ctx.fillRect(0, 0, renderer.width, 4);
}
