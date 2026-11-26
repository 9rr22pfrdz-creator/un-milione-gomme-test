// Herringbone ("treccia a spina di pesce") layout for a cargo box. Pure math, no THREE.
// Cargo local frame: x = 0 at the rear opening, +x toward the cab; z across the width; y up from the floor.
// Every tire stands slanted across the width; seen from the rear doors each row looks like //// and the
// row above like \\\\, each tire half-overlapping its neighbour and resting in the V notches below.
export const SLOT_R = 0.34, SLOT_W = 0.225; // biggest tire (18") decides the grid

function fit(span, item, pitchMin) { return span < item ? 0 : Math.floor((span - item) / pitchMin + 1e-6) + 1; }

export function braidLayout(cargo, R = SLOT_R, w = SLOT_W) {
  const { L, W, H } = cargo;
  let best = null;
  for (let deg = 30; deg <= 52; deg += 1) {
    const a = deg * Math.PI / 180, sa = Math.sin(a), ca = Math.cos(a);
    const fz = 2 * R * ca + w * sa;          // horizontal footprint of one slanted tire
    const hRow = 2 * R * sa + w * ca;        // height of one row
    const sMin = (w * 0.82) / sa;            // tires half-nest: sidewalls slightly interleaved
    const pMin = hRow * 0.66;                // next row sits in the notches
    const n = fit(W - 0.012, fz, sMin), rows = fit(H - 0.03, hRow, pMin);
    if (n < 1 || rows < 1) continue;
    const s = n > 1 ? (W - 0.012 - fz) / (n - 1) : 0; // spread wall to wall
    const p = rows > 1 ? Math.min(pMin * 1.18, (H - 0.03 - hRow) / (rows - 1)) : 0;
    const leftover = (W - 0.012 - fz - s * (n - 1)) / W + (H - 0.03 - hRow - p * (rows - 1)) / H;
    const score = n * rows - leftover * 0.9;
    if (!best || score > best.score) best = { deg, a, n, rows, s, p, fz, hRow, score };
  }
  const d = 2 * R * 0.98, walls = Math.max(1, Math.floor((L - 0.05) / d));
  const dWall = (L - 0.05) / walls;
  const slots = [];
  for (let k = 0; k < walls; k++) {
    const x = L - 0.03 - dWall * (k + 0.5); // cab end first, toward the doors
    for (let j = 0; j < best.rows; j++) {
      const dir = j % 2 === 0 ? 1 : -1;         // opposite slant on every row
      const y = best.hRow / 2 + j * best.p + 0.015;
      const off = (j % 2) * best.s * 0.0;
      for (let i = 0; i < best.n; i++) {
        const z = -W / 2 + 0.006 + best.fz / 2 + i * best.s + off;
        slots.push({ i: slots.length, wall: k, row: j, col: i, x, y, z, rx: -dir * best.a, dir });
      }
    }
  }
  return { slots, cap: slots.length, walls, rows: best.rows, perRow: best.n, angleDeg: best.deg, rowPitch: best.p, spacing: best.s, wallPitch: dWall };
}
// Slot fill state: each slot holds one tire or two scooter tires (half slots).
// fill[slot] = array of tire type ids; `isHalf(type)` tells the scooter tires (id 3 by default).
export function placeTire(fill, cap, half, isHalf = t => t === 3) {
  if (half) { const k = fill.findIndex(f => f && f.length === 1 && isHalf(f[0])); if (k >= 0) return { slot: k, sub: 1 }; }
  const k = fill.length < cap ? fill.length : -1;
  return k >= 0 ? { slot: k, sub: 0 } : null;
}
