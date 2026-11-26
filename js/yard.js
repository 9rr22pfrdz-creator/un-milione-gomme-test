// v4 outdoor yard: warm late-afternoon look, weathered industrial materials.
// All canvas textures are generated once at startup and cached here.
import * as THREE from 'three';
import { cvs, merge, M, box, cyl, lerp, srand, prand, rand } from './gfx.js';

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
function tex(c, { srgb = true, rep = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
// wraps drawing so blobs crossing the edge continue on the other side (seamless tiles)
function wrapDraw(S, x0, y0, r, fn) { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { if (x0 + dx < -r || x0 + dx > S + r || y0 + dy < -r || y0 + dy > S + r) continue; fn(x0 + dx, y0 + dy); } }
function crack(ctxs, S, x0, y0, len, w) {
  let px = x0, py = y0, a = rand(0, 6.28);
  const pts = [[px, py]]; for (let k = 0; k < len; k++) { a += rand(-0.7, 0.7); px += Math.cos(a) * rand(6, 16); py += Math.sin(a) * rand(6, 16); pts.push([px, py]); }
  for (const [ctx, col, lw] of ctxs) { ctx.strokeStyle = col; ctx.lineWidth = lw * w; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
}

/* ---------- ground: sun-baked dusty concrete slabs (5 m per tile) ---------- */
export function yardGroundTextures() {
  return once('ground', () => {
    const S = 1024, [c, x] = cvs(S, S), [b, y] = cvs(S, S), [r, z] = cvs(S, S);
    x.fillStyle = '#9a8d79'; x.fillRect(0, 0, S, S); y.fillStyle = '#808080'; y.fillRect(0, 0, S, S); z.fillStyle = '#e0e0e0'; z.fillRect(0, 0, S, S);
    // large tonal variation (dust, sun bleaching, damp patches)
    for (let i = 0; i < 90; i++) { const cx = rand(0, S), cy = rand(0, S), rr = rand(40, 220), t = rand(0, 1);
      const col = t < 0.45 ? [rand(165, 190), rand(152, 175), rand(128, 150)] : t < 0.8 ? [rand(120, 140), rand(110, 128), rand(92, 108)] : [rand(95, 110), rand(88, 100), rand(78, 88)];
      wrapDraw(S, cx, cy, rr, (px, py) => { const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, rgba(...col, rand(0.12, 0.28))); g.addColorStop(1, rgba(...col, 0)); x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); }); }
    // fine aggregate + grit
    for (let i = 0; i < 70000; i++) { const g = rand(95, 200), px = rand(0, S), py = rand(0, S), s = rand(0.6, 1.8); x.fillStyle = rgba(g, g * 0.93, g * 0.82, rand(0.15, 0.4)); x.fillRect(px, py, s, s); y.fillStyle = rgba(g, g, g, 0.35); y.fillRect(px, py, s, s); }
    for (let i = 0; i < 2500; i++) { const g = rand(60, 120), px = rand(0, S), py = rand(0, S), s = rand(1.5, 3.5); x.fillStyle = rgba(g, g * 0.95, g * 0.88, 0.5); x.beginPath(); x.arc(px, py, s, 0, 7); x.fill(); y.fillStyle = '#c8c8c8'; y.beginPath(); y.arc(px, py, s, 0, 7); y.fill(); }
    // expansion seams at the tile border + a saw cut through the middle
    for (const [ctx, col, w] of [[x, 'rgba(62,54,44,0.85)', 5], [y, '#303030', 5], [z, '#ffffff', 6]]) { ctx.fillStyle = col; ctx.fillRect(0, 0, S, w / 2); ctx.fillRect(0, S - w / 2, S, w / 2); ctx.fillRect(0, 0, w / 2, S); ctx.fillRect(S - w / 2, 0, w / 2, S); }
    for (const [ctx, col] of [[x, 'rgba(70,62,50,0.45)'], [y, '#555555']]) { ctx.fillStyle = col; ctx.fillRect(S / 2 - 1, 0, 2, S); }
    // seam edges slightly chipped/lighter
    for (let i = 0; i < 400; i++) { const t = rand(0, S), e = [0, S][i % 2]; x.fillStyle = rgba(190, 178, 155, 0.5); if (i % 4 < 2) x.fillRect(t, e - 4 + rand(0, 8), rand(2, 6), 2); else x.fillRect(e - 4 + rand(0, 8), t, 2, rand(2, 6)); }
    // hairline cracks
    for (let i = 0; i < 14; i++) crack([[x, 'rgba(55,47,38,0.7)', 1.2], [y, '#3a3a3a', 1.4]], S, rand(60, S - 60), rand(60, S - 60), rand(6, 16), rand(0.8, 1.6));
    // oil/rubber stains
    for (let i = 0; i < 10; i++) { const cx = rand(60, S - 60), cy = rand(60, S - 60), rr = rand(14, 60); const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, 'rgba(38,32,26,0.35)'); g.addColorStop(1, 'rgba(38,32,26,0)'); x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); z.fillStyle = 'rgba(150,150,150,0.4)'; z.beginPath(); z.arc(cx, cy, rr * 0.6, 0, 7); z.fill(); }
    return { map: tex(c, { rep: [52, 52] }), bump: tex(b, { srgb: false, rep: [52, 52] }), rough: tex(r, { srgb: false, rep: [52, 52] }) };
  });
}
// worn tire tracks + scattered rubber crumbs (transparent decal, stretched along the path)
export function tracksTexture() {
  return once('tracks', () => {
    const W = 256, H = 1024, [c, x] = cvs(W, H); x.clearRect(0, 0, W, H);
    for (const lane of [0.3, 0.7]) for (let k = 0; k < 3; k++) {
      const off = lane * W + rand(-10, 10); x.lineWidth = rand(16, 30); x.strokeStyle = rgba(55, 46, 36, rand(0.08, 0.16)); x.beginPath();
      for (let v = 0; v <= H; v += 32) x.lineTo(off + Math.sin(v * 0.006 + k) * 8, v); x.stroke();
    }
    for (let i = 0; i < 1800; i++) { x.fillStyle = rgba(30, 28, 26, rand(0.15, 0.4)); x.fillRect(rand(0, W), rand(0, H), rand(1, 3), rand(1, 3)); }
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = g; x.fillRect(0, 0, W, H);
    return tex(c);
  });
}
// dark rubber debris that rings the mountain foot so the pile sits in its own mess
export function debrisTexture() {
  return once('debris', () => {
    const S = 512, [c, x] = cvs(S, S); x.clearRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) { const g = rand(18, 50); x.fillStyle = rgba(g, g * 0.96, g * 0.9, rand(0.3, 0.8)); x.fillRect(rand(0, S), rand(0, S), rand(1, 3.5), rand(1, 3.5)); }
    for (let i = 0; i < 40; i++) { const cx = rand(0, S), cy = rand(0, S), rr = rand(20, 70); wrapDraw(S, cx, cy, rr, (px, py) => { const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, 'rgba(40,34,28,0.35)'); g.addColorStop(1, 'rgba(40,34,28,0)'); x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); }); }
    return tex(c, { rep: [1, 1] });
  });
}
/* ---------- asphalt loading bay: feathered edges, polished wheel lanes ---------- */
export function bayAsphaltTexture() {
  return once('asphalt', () => {
    const W = 512, H = 512, [c, x] = cvs(W, H); // u along the road (repeats), v across (no repeat)
    x.fillStyle = '#3e3b38'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 40000; i++) { const g = rand(30, 120); x.fillStyle = rgba(g, g * 0.97, g * 0.93, rand(0.2, 0.5)); x.fillRect(rand(0, W), rand(0, H), rand(0.6, 1.8), rand(0.6, 1.8)); }
    for (const v of [0.3, 0.7]) { const g = x.createLinearGradient(0, (v - 0.09) * H, 0, (v + 0.09) * H); g.addColorStop(0, 'rgba(20,18,16,0)'); g.addColorStop(0.5, 'rgba(20,18,16,0.35)'); g.addColorStop(1, 'rgba(20,18,16,0)'); x.fillStyle = g; x.fillRect(0, (v - 0.09) * H, W, 0.18 * H); }
    for (let i = 0; i < 14; i++) crack([[x, 'rgba(15,14,12,0.6)', 1.3]], W, rand(0, W), rand(60, H - 60), rand(5, 12), 1);
    for (let i = 0; i < 6; i++) { const cx = rand(0, W), cy = rand(120, H - 120), rr = rand(20, 50); const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, 'rgba(10,10,10,0.4)'); g.addColorStop(1, 'rgba(10,10,10,0)'); x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); }
    // dusty, broken edges that melt into the concrete
    x.globalCompositeOperation = 'destination-out';
    for (const e of [0, 1]) { const g = x.createLinearGradient(0, e ? H : 0, 0, e ? H - 70 : 70); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, e ? H - 70 : 0, W, 70);
      for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(0,0,0,${rand(0.3, 1)})`; x.beginPath(); x.arc(rand(0, W), e ? H - rand(0, 80) : rand(0, 80), rand(2, 9), 0, 7); x.fill(); } }
    x.globalCompositeOperation = 'source-over';
    const t = tex(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
  });
}
// scuffed yellow paint (alpha) for the bay lines
export function scuffedPaintTexture() {
  return once('paint', () => {
    const W = 512, H = 32, [c, x] = cvs(W, H); x.fillStyle = '#e6b52a'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(0,0,0,${rand(0.2, 0.9)})`; x.fillRect(rand(0, W), rand(0, H), rand(2, 18), rand(1, 6)); }
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 500; i++) { x.fillStyle = rgba(120, 100, 70, rand(0.1, 0.3)); x.fillRect(rand(0, W), rand(0, H), rand(1, 4), rand(1, 4)); }
    const t = tex(c); t.wrapS = THREE.RepeatWrapping; return t;
  });
}

/* ---------- sky: warm late afternoon, hazy horizon ---------- */
export function warmSkyTexture() {
  return once('sky', () => {
    const [c, x] = cvs(16, 512); const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#4f7fb6'); g.addColorStop(0.28, '#7ea3cb'); g.addColorStop(0.42, '#b9c8d4'); g.addColorStop(0.48, '#ead7b8'); g.addColorStop(0.5, '#f0d6ac');
    g.addColorStop(0.53, '#c9b393'); g.addColorStop(1, '#8a7a63');
    x.fillStyle = g; x.fillRect(0, 0, 16, 512); return tex(c);
  });
}

/* ---------- building materials ---------- */
function corrugatedSiding(base, rust = 0.5) {
  const W = 512, H = 512, [c, x] = cvs(W, H), [b, y] = cvs(W, H);
  const P = 32; // one rib per 32 px
  for (let i = 0; i < W; i += P) { const g = x.createLinearGradient(i, 0, i + P, 0); g.addColorStop(0, base[0]); g.addColorStop(0.25, base[1]); g.addColorStop(0.55, base[2]); g.addColorStop(1, base[0]); x.fillStyle = g; x.fillRect(i, 0, P, H);
    const h = y.createLinearGradient(i, 0, i + P, 0); h.addColorStop(0, '#202020'); h.addColorStop(0.4, '#e0e0e0'); h.addColorStop(0.6, '#e0e0e0'); h.addColorStop(1, '#202020'); y.fillStyle = h; y.fillRect(i, 0, P, H); }
  // streaks running down from the top + dirt splash at the bottom
  for (let i = 0; i < 70; i++) { const px = rand(0, W), w = rand(2, 10), len = rand(60, 380); const g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, rgba(70, 55, 40, rand(0.15, 0.35) * rust * 2)); g.addColorStop(1, rgba(70, 55, 40, 0)); x.fillStyle = g; x.fillRect(px, 0, w, len); }
  { const g = x.createLinearGradient(0, H, 0, H - 160); g.addColorStop(0, 'rgba(110,92,70,0.55)'); g.addColorStop(1, 'rgba(110,92,70,0)'); x.fillStyle = g; x.fillRect(0, H - 160, W, 160); }
  for (let i = 0; i < 30 * rust; i++) { const cx = rand(0, W), cy = rand(0, H), rr = rand(3, 16); x.fillStyle = rgba(120, 62, 30, rand(0.2, 0.5)); x.beginPath(); x.ellipse(cx, cy, rr, rr * rand(0.5, 2), 0, 0, 7); x.fill(); }
  for (let i = 0; i < 9000; i++) { const g = rand(60, 200); x.fillStyle = rgba(g, g, g, 0.06); x.fillRect(rand(0, W), rand(0, H), 1.5, 1.5); }
  return { map: tex(c, { rep: [1, 1] }), bump: tex(b, { srgb: false, rep: [1, 1] }) };
}
export function yardMaterials() {
  return once('mats', () => {
    const siding = corrugatedSiding(['#6f7478', '#a9aeb1', '#8d9295'], 0.6);
    const roofT = corrugatedSiding(['#5b5f62', '#8f9497', '#74787b'], 0.8);
    const contRed = corrugatedSiding(['#6d2c20', '#9a4532', '#7f3727'], 1.0);
    const contOlive = corrugatedSiding(['#4b5235', '#6f7650', '#5a6141'], 0.8);
    // concrete base wall
    const [c, x] = cvs(256, 256); x.fillStyle = '#8f877b'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) { const g = rand(90, 190); x.fillStyle = rgba(g, g * 0.96, g * 0.9, 0.25); x.fillRect(rand(0, 256), rand(0, 256), 1.6, 1.6); }
    for (let i = 0; i < 20; i++) { const px = rand(0, 256); const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(60,52,42,0.25)'); g.addColorStop(1, 'rgba(60,52,42,0)'); x.fillStyle = g; x.fillRect(px, 0, rand(3, 12), 256); }
    x.fillStyle = 'rgba(50,45,38,0.5)'; x.fillRect(0, 0, 256, 3); x.fillRect(127, 0, 2, 256);
    const concrete = tex(c, { rep: [4, 1] });
    // roll-up shutter: horizontal slats, grime toward the bottom
    const [s, sx] = cvs(256, 512), [sb, sy] = cvs(256, 512);
    for (let i = 0; i < 512; i += 16) { const g = sx.createLinearGradient(0, i, 0, i + 16); g.addColorStop(0, '#8e959a'); g.addColorStop(0.45, '#b9bfc3'); g.addColorStop(0.85, '#7c8388'); g.addColorStop(1, '#3d4246'); sx.fillStyle = g; sx.fillRect(0, i, 256, 16);
      const h = sy.createLinearGradient(0, i, 0, i + 16); h.addColorStop(0, '#606060'); h.addColorStop(0.45, '#e8e8e8'); h.addColorStop(1, '#181818'); sy.fillStyle = h; sy.fillRect(0, i, 256, 16); }
    { const g = sx.createLinearGradient(0, 512, 0, 250); g.addColorStop(0, 'rgba(90,72,52,0.6)'); g.addColorStop(1, 'rgba(90,72,52,0)'); sx.fillStyle = g; sx.fillRect(0, 250, 256, 262); }
    for (let i = 0; i < 40; i++) { sx.fillStyle = rgba(60, 50, 40, rand(0.05, 0.2)); sx.fillRect(rand(0, 256), rand(0, 512), rand(10, 60), rand(1, 3)); }
    const shutter = tex(s), shutterB = tex(sb, { srgb: false });
    // dark painted sign with stenciled lettering
    const [g2, gx] = cvs(1024, 220); gx.fillStyle = '#23262a'; gx.fillRect(0, 0, 1024, 220);
    for (let i = 0; i < 6000; i++) { const v = rand(25, 70); gx.fillStyle = rgba(v, v, v, 0.2); gx.fillRect(rand(0, 1024), rand(0, 220), 2, 2); }
    gx.strokeStyle = '#c9a23a'; gx.lineWidth = 4; gx.strokeRect(18, 16, 988, 188);
    gx.fillStyle = '#efe6cf'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.font = '900 92px "Arial Black", Impact, Arial, sans-serif'; gx.fillText('GOMMERIA · SMALTIMENTO', 512, 90, 940);
    gx.fillStyle = '#e1b23c'; gx.font = '700 44px "Arial Narrow", Arial, sans-serif'; gx.fillText('PNEUMATICI USATI · RITIRO E RECUPERO', 512, 160, 900);
    gx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 1500; i++) { gx.fillStyle = `rgba(0,0,0,${rand(0.1, 0.5)})`; gx.fillRect(rand(0, 1024), rand(0, 220), rand(1, 4), rand(1, 3)); }
    gx.globalCompositeOperation = 'destination-over'; gx.fillStyle = '#23262a'; gx.fillRect(0, 0, 1024, 220);
    const sign = tex(g2);
    // wooden pallet planks
    const [w, wx] = cvs(256, 64); wx.fillStyle = '#b08c5e'; wx.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 40; i++) { wx.strokeStyle = rgba(110, 80, 45, rand(0.15, 0.4)); wx.lineWidth = rand(0.5, 1.6); wx.beginPath(); const y0 = rand(0, 64); wx.moveTo(0, y0); for (let k = 0; k <= 256; k += 16) wx.lineTo(k, y0 + Math.sin(k * 0.05 + i) * 2); wx.stroke(); }
    for (let i = 0; i < 2000; i++) { wx.fillStyle = rgba(80, 65, 50, 0.1); wx.fillRect(rand(0, 256), rand(0, 64), 2, 1); }
    const wood = tex(w);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    return {
      siding: std({ map: siding.map, bumpMap: siding.bump, bumpScale: 2.5, roughness: 0.62, metalness: 0.55 }), sidingTex: siding,
      roof: std({ map: roofT.map, bumpMap: roofT.bump, bumpScale: 2.5, roughness: 0.6, metalness: 0.6 }), roofTex: roofT,
      contRed: std({ map: contRed.map, bumpMap: contRed.bump, bumpScale: 3, roughness: 0.7, metalness: 0.35 }), contRedTex: contRed,
      contOlive: std({ map: contOlive.map, bumpMap: contOlive.bump, bumpScale: 3, roughness: 0.72, metalness: 0.3 }), contOliveTex: contOlive,
      concrete: std({ map: concrete, roughness: 0.93 }),
      jersey: std({ color: 0xa9a294, roughness: 0.95 }),
      shutter: std({ map: shutter, bumpMap: shutterB, bumpScale: 2, roughness: 0.5, metalness: 0.6 }),
      sign: std({ map: sign, roughness: 0.75 }),
      wood: std({ map: wood, roughness: 0.9 }),
      steelDark: std({ color: 0x3f4448, roughness: 0.55, metalness: 0.7 }),
      galv: std({ color: 0xa9b0b4, roughness: 0.42, metalness: 0.85 }),
      lampGlow: std({ color: 0xfff1cf, emissive: 0xffc77a, emissiveIntensity: 2.2, roughness: 0.3 }),
      bollard: std({ color: 0xe5b021, roughness: 0.5, metalness: 0.3 }),
      drumBlue: std({ color: 0x2f5d8a, roughness: 0.5, metalness: 0.5 }), drumRed: std({ color: 0x8e2f22, roughness: 0.55, metalness: 0.45 }),
      trunk: std({ color: 0x4a3a2c, roughness: 0.95 }),
      olive: std({ color: 0x6b7350, roughness: 0.9 }), pine: std({ color: 0x45522f, roughness: 0.9 }), cypress: std({ color: 0x2f3d27, roughness: 0.92 }),
      hills: std({ color: 0x8c9373, roughness: 1 }), hillsFar: std({ color: 0xa3a58e, roughness: 1 }),
    };
  });
}

/* ---------- jersey barrier profile ---------- */
function jerseyGeo(len) {
  const s = new THREE.Shape(); const p = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.18, 0.25], [0.08, 0.8], [-0.08, 0.8], [-0.18, 0.25], [-0.3, 0.08]];
  s.moveTo(...p[0]); p.slice(1).forEach(q => s.lineTo(...q)); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); return g;
}
function palletParts(x, y, z, ry, P) {
  const r = (lx, ly, lz) => { const c = Math.cos(ry), s = Math.sin(ry); return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c]; };
  for (let i = 0; i < 7; i++) { const [px, py, pz] = r(-0.54 + i * 0.18, 0.133, 0); P.push([box(0.13, 0.022, 0.8), M(px, py, pz, 0, ry, 0)]); }
  for (const lz of [-0.36, 0, 0.36]) { const [px, py, pz] = r(0, 0.072, lz); P.push([box(1.2, 0.1, 0.09), M(px, py, pz, 0, ry, 0)]); }
  for (const lx of [-0.5, 0, 0.5]) { const [px, py, pz] = r(lx, 0.011, 0); P.push([box(0.14, 0.022, 0.8), M(px, py, pz, 0, ry, 0)]); }
}

/* ---------- the whole yard dressing ---------- */
export function buildYardV4(scene, ctx) {
  const { mats, tm, colliders, FENCE, VAN_X, VAN_Z, T16, tireGeometry, low } = ctx;
  const Y = yardMaterials();
  const add = (g, m, cast = true, recv = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = recv; scene.add(o); return o; };

  // ---- chain-link fence: galvanized posts + top rail ----
  {
    const [c, x] = cvs(128, 128); x.clearRect(0, 0, 128, 128); x.strokeStyle = 'rgba(200,205,208,0.95)'; x.lineWidth = 2.4;
    for (let i = -128; i < 256; i += 26) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke(); }
    const ft = tex(c); ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    const posts = [], rails = [];
    const seg = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), t = ft.clone(); t.repeat.set(len / 1.1, 2); t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.1), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.7 }));
      m.position.set((x0 + x1) / 2, 1.1, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); scene.add(m);
      const n = Math.ceil(len / 3); for (let i = 0; i <= n; i++) { const k = i / n; posts.push([cyl(0.045, 0.045, 2.35, 8), M(lerp(x0, x1, k), 1.17, lerp(z0, z1, k))]); posts.push([cyl(0.055, 0.055, 0.05, 8), M(lerp(x0, x1, k), 2.36, lerp(z0, z1, k))]); }
      rails.push([cyl(0.022, 0.022, len, 6), M((x0 + x1) / 2, 2.18, (z0 + z1) / 2, 0, -Math.atan2(z1 - z0, x1 - x0), Math.PI / 2)]);
    };
    const F = FENCE;
    seg(F.x0, F.z0, F.x1, F.z0); seg(F.x0, F.z1, F.x1, F.z1); seg(F.x0, F.z0, F.x0, F.z1);
    seg(F.x1, F.z0, F.x1, VAN_Z - 4.2); seg(F.x1, VAN_Z + 4.2, F.x1, F.z1);
    add(merge(posts.concat(rails)), Y.galv, true, false);
    // gate pillars: concrete with a steel cap
    for (const s of [1, -1]) { add(box(0.55, 2.7, 0.55), Y.concrete).position.set(F.x1, 1.35, VAN_Z + s * 4.4); add(box(0.62, 0.08, 0.62), Y.steelDark).position.set(F.x1, 2.74, VAN_Z + s * 4.4); }
  }

  // ---- the yard office / workshop ----
  const bx = 21, bz = -15, bw = 12, bd = 8, bh = 4.6, fz = bz + bd / 2;
  {
    const baseH = 1.0;
    add(box(bw + 0.08, baseH, bd + 0.08), Y.concrete).position.set(bx, baseH / 2, bz);
    const st = Y.sidingTex; const sid = Y.siding.clone(); sid.map = st.map.clone(); sid.bumpMap = st.bump.clone();
    for (const t of [sid.map, sid.bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(bw / 1.6, 1); t.needsUpdate = true; }
    add(box(bw, bh - baseH, bd), sid).position.set(bx, baseH + (bh - baseH) / 2, bz);
    // steel corner columns + eave girt
    const S = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.push([box(0.2, bh + 0.05, 0.2), M(bx + sx * bw / 2, (bh + 0.05) / 2, bz + sz * bd / 2)]);
    S.push([box(bw + 0.2, 0.16, 0.12), M(bx, bh - 0.08, fz + 0.06)]);
    S.push([box(bw + 0.2, 0.08, 0.1), M(bx, baseH + 0.04, fz + 0.06)]);
    // corrugated roof, single pitch, deep front overhang carried by rafters
    const ov = 1.6, roofL = bd + ov + 0.4, pitch = 0.09;
    const rt = Y.roofTex, rm = Y.roof.clone(); rm.map = rt.map.clone(); rm.bumpMap = rt.bump.clone();
    for (const t of [rm.map, rm.bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((bw + 0.8) / 1.6, 1); t.rotation = 0; t.needsUpdate = true; }
    const roof = add(box(bw + 0.8, 0.07, roofL), rm); roof.position.set(bx, bh + 0.32, bz + (ov - 0.4) / 2 + 0.2); roof.rotation.x = pitch;
    for (let i = 0; i <= 6; i++) { const rx = bx - bw / 2 + i * bw / 6; S.push([box(0.09, 0.16, ov + 0.3), M(rx, bh + 0.17, fz + ov / 2 - 0.05, pitch, 0, 0)]); }
    S.push([box(bw + 0.8, 0.2, 0.06), M(bx, bh + 0.17, fz + ov + 0.05)]); // fascia
    for (const sx of [-1, 1]) S.push([box(0.1, 0.1, 1.9), M(bx + sx * (bw / 2 - 0.3), bh - 0.5, fz + 0.85, -0.55, 0, 0)]); // knee braces
    // gutter + downpipe
    S.push([cyl(0.07, 0.07, bw + 0.8, 10), M(bx, bh + 0.05, fz + ov + 0.12, 0, 0, Math.PI / 2)]);
    S.push([cyl(0.045, 0.045, bh, 8), M(bx + bw / 2 + 0.15, bh / 2, fz + 0.15)]);
    add(merge(S), Y.steelDark);
    // roll-up shutter with frame, hood and bottom bar
    const shW = 4.2, shH = 3.0, shX = bx - 2.2;
    add(new THREE.PlaneGeometry(shW, shH), Y.shutter, false).position.set(shX, shH / 2 + 0.02, fz + 0.03);
    const F = [[box(0.14, shH + 0.3, 0.14), M(shX - shW / 2 - 0.07, (shH + 0.3) / 2, fz + 0.07)], [box(0.14, shH + 0.3, 0.14), M(shX + shW / 2 + 0.07, (shH + 0.3) / 2, fz + 0.07)],
      [box(shW + 0.5, 0.4, 0.4), M(shX, shH + 0.21, fz + 0.2)], [box(shW, 0.06, 0.06), M(shX, 0.05, fz + 0.06)]];
    add(merge(F), Y.galv);
    // door + window, framed
    const door = add(new THREE.PlaneGeometry(1.0, 2.2), new THREE.MeshStandardMaterial({ color: 0x4b5157, roughness: 0.55, metalness: 0.5 }), false); door.position.set(bx + 1.0, 1.1, fz + 0.03);
    const win = add(new THREE.PlaneGeometry(2.4, 1.3), mats.glass, false); win.position.set(bx + 3.6, 2.05, fz + 0.03);
    const D = [[box(1.16, 0.08, 0.1), M(bx + 1.0, 2.24, fz + 0.05)], [box(0.08, 2.24, 0.1), M(bx + 0.46, 1.12, fz + 0.05)], [box(0.08, 2.24, 0.1), M(bx + 1.54, 1.12, fz + 0.05)],
      [box(2.56, 0.08, 0.1), M(bx + 3.6, 2.74, fz + 0.05)], [box(2.6, 0.06, 0.22), M(bx + 3.6, 1.38, fz + 0.1)], [box(0.08, 1.4, 0.1), M(bx + 2.36, 2.05, fz + 0.05)], [box(0.08, 1.4, 0.1), M(bx + 4.84, 2.05, fz + 0.05)], [box(0.05, 1.3, 0.06), M(bx + 3.6, 2.05, fz + 0.05)],
      [box(0.04, 0.18, 0.06), M(bx + 1.38, 1.05, fz + 0.06)]];
    add(merge(D), Y.steelDark);
    // dark painted sign board with a steel frame, bolted to the eave
    const sgW = 6.4, sgH = 1.08, sgX = bx + 0.6, sgY = 4.0, sgZ = fz + 0.1;
    const sign = add(new THREE.PlaneGeometry(sgW, sgH), Y.sign, false); sign.position.set(sgX, sgY, sgZ);
    add(merge([[box(sgW + 0.16, 0.08, 0.08), M(sgX, sgY + sgH / 2 + 0.04, sgZ)], [box(sgW + 0.16, 0.08, 0.08), M(sgX, sgY - sgH / 2 - 0.04, sgZ)], [box(0.08, sgH + 0.16, 0.08), M(sgX - sgW / 2 - 0.04, sgY, sgZ)], [box(0.08, sgH + 0.16, 0.08), M(sgX + sgW / 2 + 0.04, sgY, sgZ)]]), Y.steelDark);
    // caged work lamps above shutter and door (emissive + glow, no extra lights)
    const L = [], G = [];
    for (const lx of [shX - shW / 2 - 0.45, shX + shW / 2 + 0.45, bx + 1.0]) {
      const ly = lx === bx + 1.0 ? 2.75 : 3.0, lz = fz + 0.32;
      L.push([box(0.06, 0.06, 0.32), M(lx, ly + 0.14, fz + 0.16)]);
      L.push([cyl(0.12, 0.09, 0.1, 12), M(lx, ly + 0.08, lz)]);
      for (let k = 0; k < 4; k++) L.push([box(0.012, 0.18, 0.012), M(lx + Math.cos(k * Math.PI / 2) * 0.09, ly - 0.04, lz + Math.sin(k * Math.PI / 2) * 0.09)]);
      L.push([new THREE.TorusGeometry(0.09, 0.008, 4, 14), M(lx, ly - 0.12, lz, Math.PI / 2)]);
      G.push([new THREE.SphereGeometry(0.06, 10, 8), M(lx, ly - 0.02, lz)]);
    }
    add(merge(L), Y.steelDark); add(merge(G), Y.lampGlow, false, false);
    // yellow bollards at the corners + a couple of oil drums
    const B = [], DR = [], DB = [];
    for (const [px, pz] of [[bx - bw / 2 - 0.6, fz + 0.7], [bx + bw / 2 + 0.6, fz + 0.7], [shX + shW / 2 + 0.5, fz + 0.9]]) { B.push([cyl(0.1, 0.1, 1.0, 12), M(px, 0.5, pz)]); B.push([new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(px, 1.0, pz)]); colliders.push({ x0: px - 0.15, x1: px + 0.15, z0: pz - 0.15, z1: pz + 0.15 }); }
    add(merge(B), Y.bollard);
    for (const [px, pz, red] of [[bx + bw / 2 - 0.7, fz + 0.6, 0], [bx + bw / 2 - 1.35, fz + 0.55, 1], [bx + bw / 2 - 1.0, fz + 1.15, 0]]) { const arr = red ? DR : DB; arr.push([cyl(0.29, 0.29, 0.88, 16), M(px, 0.44, pz)]); for (const yy of [0.29, 0.59]) arr.push([new THREE.TorusGeometry(0.295, 0.012, 4, 20), M(px, yy, pz, Math.PI / 2)]); }
    add(merge(DB), Y.drumBlue); add(merge(DR), Y.drumRed);
    colliders.push({ x0: bx + bw / 2 - 1.8, x1: bx + bw / 2 - 0.3, z0: fz, z1: fz + 1.5 });
    colliders.push({ x0: bx - bw / 2 - 0.3, x1: bx + bw / 2 + 0.3, z0: bz - bd / 2 - 0.3, z1: fz + 0.3 });
    // display rack of new tires by the door
    const geoM = tireGeometry(T16, 'mid');
    const rack = new THREE.InstancedMesh(geoM, tm.rubber, 6); const m4 = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) { rack.setMatrixAt(i, m4.compose(new THREE.Vector3(bx + 6.6 - i * 0.24, 0.32, fz + 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1))); }
    rack.castShadow = true; scene.add(rack);
  }

  // ---- containers: rust red + olive, ribbed, corner castings, door bars ----
  {
    const mk = (cx, cz, ry, mat, texs) => {
      const m = mat.clone(); m.map = texs.map.clone(); m.bumpMap = texs.bump.clone();
      for (const t of [m.map, m.bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6.1 / 1.2, 1); t.needsUpdate = true; }
      const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; scene.add(g);
      const body = new THREE.Mesh(box(6.06, 2.5, 2.4), m); body.position.y = 1.3; body.castShadow = body.receiveShadow = true; g.add(body);
      const P = [];
      for (const sx of [-1, 1]) for (const sy of [0.06, 2.54]) for (const sz of [-1, 1]) P.push([box(0.18, 0.12, 0.18), M(sx * 2.98, sy, sz * 1.16)]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push([box(0.1, 2.5, 0.1), M(sx * 3.0, 1.3, sz * 1.18)]);
      for (const sz of [-1, 1]) for (const sy of [0.08, 2.52]) P.push([box(6.0, 0.1, 0.08), M(0, sy, sz * 1.2)]);
      for (const z of [-0.75, -0.3, 0.3, 0.75]) { P.push([cyl(0.022, 0.022, 2.3, 6), M(3.06, 1.3, z)]); P.push([box(0.04, 0.12, 0.08), M(3.08, 1.05, z)]); }
      const f = new THREE.Mesh(merge(P), Y.steelDark); f.castShadow = true; g.add(f);
    };
    mk(24, 14, 0.2, Y.contRed, Y.contRedTex);
    colliders.push({ x0: 20.6, x1: 27.4, z0: 12.2, z1: 15.8 });
    mk(25.5, 20.2, 0.05, Y.contOlive, Y.contOliveTex);
    colliders.push({ x0: 22.2, x1: 28.8, z0: 18.8, z1: 21.6 });
  }
  // ---- pallets (individual planks), stacked ----
  {
    const P = [];
    for (let i = 0; i < 5; i++) palletParts(16 + Math.sin(i) * 0.05, i * 0.145, 12, 0.06 * i, P);
    for (let i = 0; i < 3; i++) palletParts(17.5, i * 0.145, 13.4, 1.5 + 0.04 * i, P);
    palletParts(18.9, 0, 12.2, 0.4, P);
    add(merge(P), Y.wood);
    colliders.push({ x0: 15.2, x1: 19.6, z0: 11.4, z1: 14.2 });
  }
  // ---- concrete jersey barriers along the north side of the bay ----
  {
    const J = [];
    for (const [x, z, ry] of [[14.2, 5.6, Math.PI / 2], [17.4, 5.7, Math.PI / 2 + 0.03], [20.6, 5.6, Math.PI / 2 - 0.02], [-2, 26, 0.3], [1.0, 27.0, 0.3]]) { J.push([jerseyGeo(3.0), M(x, 0, z, 0, ry, 0)]); const c = Math.abs(Math.sin(ry)) > 0.7; colliders.push(c ? { x0: x - 1.5, x1: x + 1.5, z0: z - 0.35, z1: z + 0.35 } : { x0: x - 0.8, x1: x + 0.8, z0: z - 1.6, z1: z + 1.6 }); }
    add(merge(J), Y.jersey);
  }
  // ---- light poles ----
  {
    const P = [], Lg = [];
    for (const [x, z] of [[4, -9], [4, 10], [-30, 30], [-30, -38], [28, -4]]) {
      P.push([cyl(0.08, 0.13, 7, 10), M(x, 3.5, z)], [cyl(0.2, 0.24, 0.3, 10), M(x, 0.15, z)], [box(1.2, 0.08, 0.08), M(x + 0.5, 7, z)], [box(0.55, 0.12, 0.32), M(x + 1, 6.97, z)]);
      Lg.push([box(0.46, 0.03, 0.26), M(x + 1, 6.9, z)]);
      colliders.push({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25 });
    }
    add(merge(P), Y.galv); add(merge(Lg), mats.headlight, false, false);
  }

  // ---- trees outside the fence: umbrella pines, olive-like clumps, cypresses ----
  {
    const trunk = [], olive = [], pine = [], cyp = [];
    srand(77);
    const blob = (r, det = 1) => { const g = new THREE.IcosahedronGeometry(r, det); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3) * 0.08 + Math.cos(p.getY(i) * 4.7) * 0.06); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.computeVertexNormals(); return g; };
    const det = low ? 1 : 2;
    for (let i = 0; i < 64; i++) {
      let x, z; const side = i % 4;
      if (side === 0) { x = lerp(FENCE.x0, FENCE.x1, prand()); z = FENCE.z1 + 5 + prand() * 24; }
      else if (side === 1) { x = lerp(FENCE.x0, FENCE.x1, prand()); z = FENCE.z0 - 5 - prand() * 24; }
      else if (side === 2) { x = FENCE.x0 - 5 - prand() * 22; z = lerp(FENCE.z0, FENCE.z1, prand()); }
      else { x = FENCE.x1 + 7 + prand() * 26; z = lerp(FENCE.z0, FENCE.z1, prand()); if (Math.abs(z - VAN_Z) < 7) z += 15; }
      const kind = prand(), h = 6 + prand() * 6;
      if (kind < 0.4) { // stone/umbrella pine: tall leaning trunk, flat wide canopy of clumps
        const lean = (prand() - 0.5) * 0.25;
        trunk.push([cyl(0.16, 0.3, h * 0.82, 7), M(x, h * 0.41, z, 0, 0, lean)]);
        const tx = x - Math.sin(lean) * h * 0.8, ty = h * 0.84;
        for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + prand(), rr = h * (0.18 + prand() * 0.14); pine.push([blob(h * 0.2, det), M(tx + Math.cos(a) * rr, ty + prand() * 0.5, z + Math.sin(a) * rr, 0, 0, 0, 1.25, 0.45, 1.25)]); }
        pine.push([blob(h * 0.24, det), M(tx, ty + 0.5, z, 0, 0, 0, 1.3, 0.45, 1.3)]);
      } else if (kind < 0.75) { // rounded clumpy broadleaf (olive / holm oak)
        const hh = h * 0.7; trunk.push([cyl(0.14, 0.24, hh * 0.5, 7), M(x, hh * 0.25, z)]);
        for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28 + prand(); olive.push([blob(hh * (0.22 + prand() * 0.1), det), M(x + Math.cos(a) * hh * 0.2, hh * (0.62 + prand() * 0.18), z + Math.sin(a) * hh * 0.2, 0, prand() * 3, 0, 1, 0.8, 1)]); }
      } else { // cypress
        const hh = h * 1.15; trunk.push([cyl(0.1, 0.16, 1.2, 6), M(x, 0.6, z)]);
        const g = new THREE.SphereGeometry(1, 10, 10); cyp.push([g, M(x, hh * 0.52, z, 0, 0, 0, hh * 0.11, hh * 0.5, hh * 0.11)]);
      }
    }
    add(merge(trunk), Y.trunk, true, false);
    add(merge(olive), Y.olive, true, false); add(merge(pine), Y.pine, true, false); add(merge(cyp), Y.cypress, true, false);
    // distant hills in two bands, smooth, soaked in haze
    const near = [], far = [];
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2 + prand() * 0.1, r = 210 + prand() * 30; near.push([new THREE.SphereGeometry(45 + prand() * 35, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(-25 + Math.cos(a) * r, -3, Math.sin(a) * r, 0, 0, 0, 1.7, 0.28 + prand() * 0.22, 1.2)]); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + 0.2, r = 300 + prand() * 40; far.push([new THREE.SphereGeometry(70 + prand() * 40, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(-25 + Math.cos(a) * r, -5, Math.sin(a) * r, 0, 0, 0, 1.8, 0.35 + prand() * 0.25, 1.3)]); }
    add(merge(near), Y.hills, false, false); add(merge(far), Y.hillsFar, false, false);
  }
}
