// Graphics helpers: procedural textures, tire geometry with tread + sidewall detail, and the yard models.
import * as THREE from 'three';
import { TIRES } from './config.js';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
let seed = 1234; export function srand(s) { seed = s; }
export function prand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

/* ---------- geometry utils ---------- */
export function merge(parts) {
  let n = 0; const gs = [];
  for (const [g0, m] of parts) { const g = g0.index ? g0.toNonIndexed() : g0.clone(); if (m) g.applyMatrix4(m); gs.push(g); n += g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of gs) {
    const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals(); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); return out;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); }
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);

/* ---------- canvas ---------- */
export function cvs(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { srgb = true, rep = null, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function speck(x, w, h, n, a, b, alpha, s = 2) { for (let i = 0; i < n; i++) { const g = rand(a, b) | 0; x.fillStyle = `rgba(${g},${g},${g},${alpha})`; x.fillRect(Math.random() * w, Math.random() * h, rand(0.6, s), rand(0.6, s)); } }

/* ---------- tire: profile with UV regions ---------- */
// v: 0..0.3 lower sidewall (bead -> shoulder), 0.3..0.7 tread, 0.7..1 upper sidewall, liner = 0.02
function tireProfile(R, ri, w, detail = 1) {
  const pts = [], vs = [];
  if (detail < 0.4) { // far LOD: a closed 6-point ring, no hole liner
    const p = [[ri, -w * 0.4, 0.05], [R - w * 0.16, -w * 0.48, 0.28], [R, -w * 0.2, 0.42], [R, w * 0.2, 0.58], [R - w * 0.16, w * 0.48, 0.72], [ri, w * 0.4, 0.95], [ri, -w * 0.4, 0.05]];
    return { pts: p.map(q => new THREE.Vector2(q[0], q[1])), vs: p.map(q => q[2]) };
  }
  const S = detail >= 1 ? 5 : 3, T = detail >= 1 ? 6 : 4, SH = detail >= 1 ? 2 : 1;
  const side = (sign) => {
    const a = [];
    for (let i = 0; i <= S; i++) { const k = i / S; const r = lerp(ri, R - w * 0.2, k); const bulge = Math.sin(k * Math.PI) * w * 0.07; a.push([r, sign * (lerp(w * 0.36, w * 0.47, Math.pow(k, 0.7)) + bulge), lerp(0, 0.26, k)]); }
    return a;
  };
  const shoulder = (sign) => { const a = []; for (let i = 1; i <= SH; i++) { const k = i / (SH + 1), an = k * Math.PI / 2; a.push([R - w * 0.2 + Math.sin(an) * w * 0.2, sign * (w * 0.47 - (1 - Math.cos(an)) * w * 0.09), lerp(0.26, 0.3, k)]); } return a; };
  const lower = side(-1), upper = side(1);
  for (const p of lower) { pts.push(p); }
  for (const p of shoulder(-1)) pts.push(p);
  for (let i = 0; i <= T; i++) { const k = i / T; pts.push([R, lerp(-w * 0.38, w * 0.38, k), lerp(0.3, 0.7, k)]); }
  for (const p of shoulder(1).reverse()) pts.push([p[0], p[1], 1 - p[2]]);
  for (const p of upper.reverse()) pts.push([p[0], p[1], 1 - p[2]]);
  // bead lip + inner liner (visible through the hole)
  pts.push([ri + 0.012, w * 0.3, 0.043]);
  if (detail > 0.4) { pts.push([R - w * 0.32, w * 0.3, 0.043]); pts.push([R - w * 0.32, -w * 0.3, 0.043]); } // liner: dark charcoal band
  pts.push([ri + 0.012, -w * 0.3, 0.043]);
  pts.push([lower[0][0], lower[0][1], 0]);
  return { pts: pts.map(p => new THREE.Vector2(p[0], p[1])), vs: pts.map(p => p[2]) };
}
export function tireGeometry(t = TIRES[1], lod = 'high') {
  const detail = lod === 'high' ? 1 : lod === 'mid' ? 0.5 : 0.2;
  const seg = lod === 'high' ? 32 : lod === 'mid' ? 14 : 7;
  const { pts, vs } = tireProfile(t.R, t.ri, t.w, detail);
  const g = new THREE.LatheGeometry(pts, seg);
  const uv = g.attributes.uv, P = pts.length;
  for (let i = 0; i <= seg; i++) for (let j = 0; j < P; j++) uv.setY(i * P + j, vs[j]);
  g.computeVertexNormals();
  return g;
}
// tread + sidewall texture (color + bump) laid out to match the profile's v regions
export function tireTextures() {
  const W = 1024, H = 512;
  const [c, x] = cvs(W, H), [b, y] = cvs(W, H);
  x.fillStyle = '#29292b'; x.fillRect(0, 0, W, H); y.fillStyle = '#808080'; y.fillRect(0, 0, W, H);
  const band = (v0, v1, col, bump) => { x.fillStyle = col; x.fillRect(0, v0 * H, W, (v1 - v0) * H); if (bump) { y.fillStyle = bump; y.fillRect(0, v0 * H, W, (v1 - v0) * H); } };
  // sidewalls (mirrored)
  for (const flip of [false, true]) {
    const V = v => flip ? 1 - v : v, B = (v0, v1, col, bump) => band(Math.min(V(v0), V(v1)), Math.max(V(v0), V(v1)), col, bump);
    B(0, 0.035, '#5e5e62', '#b0b0b0');       // bead (rim highlight)
    B(0.035, 0.052, '#222428', '#5a5a5a');   // inner liner (seen through the hole): charcoal rubber
    B(0.115, 0.13, '#56565a', '#b8b8b8');    // rim protector line
    B(0.232, 0.243, '#4e4e52', '#b0b0b0');
    // lettering band
    x.save(); y.save();
    const vMid = V(0.18) * H; x.font = 'bold 30px Arial Black, Arial, sans-serif'; y.font = x.font; x.textBaseline = y.textBaseline = 'middle';
    const words = ['UN MILIONE', '205/55 R16 91V', 'M+S', 'TUBELESS', 'RADIAL', 'MADE IN ITALY'];
    let px = 10, k = 0;
    while (px < W) { const wd = words[k++ % words.length]; const tw = x.measureText(wd).width;
      for (const [ctx, col] of [[x, '#9a9a9e'], [y, '#e4e4e4']]) { ctx.save(); ctx.translate(px, vMid); if (flip) ctx.scale(1, -1); ctx.scale(1, 0.62); ctx.fillStyle = col; ctx.fillText(wd, 0, 0); ctx.restore(); }
      px += tw + 46; }
    x.restore(); y.restore();
    // radial ribs near the shoulder
    for (let i = 0; i < W; i += 8) { x.fillStyle = '#232324'; x.fillRect(i, Math.min(V(0.255), V(0.3)) * H, 3, 0.045 * H); y.fillStyle = '#b0b0b0'; y.fillRect(i, Math.min(V(0.255), V(0.3)) * H, 3, 0.045 * H); }
  }
  // tread: rubber blocks with grooves
  band(0.3, 0.7, '#2c2c2e', '#a8a8a8');
  const g = (v0, v1, col = '#0b0b0b', bump = '#202020') => { x.fillStyle = col; x.fillRect(0, v0 * H, W, (v1 - v0) * H); y.fillStyle = bump; y.fillRect(0, v0 * H, W, (v1 - v0) * H); };
  g(0.395, 0.41); g(0.49, 0.51); g(0.59, 0.605);
  const NB = 56;
  for (let i = 0; i < NB; i++) {
    const u = i / NB * W;
    for (const [v0, v1, sl] of [[0.3, 0.395, 9], [0.41, 0.49, -7], [0.51, 0.59, 7], [0.605, 0.7, -9]]) {
      for (const [ctx, col] of [[x, '#0d0d0d'], [y, '#262626']]) { ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(u, v0 * H); ctx.lineTo(u + sl, v1 * H); ctx.stroke(); }
      // sipes
      for (const [ctx, col] of [[x, '#151515'], [y, '#555']]) { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(u + W / NB / 2, v0 * H + 3); ctx.lineTo(u + W / NB / 2 + sl * 0.6, v1 * H - 3); ctx.stroke(); }
    }
  }
  // wear, dust and scuffs
  speck(x, W, H, 9000, 50, 95, 0.18, 2.2);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(120,105,85,${rand(0.03, 0.08)})`; x.beginPath(); x.ellipse(rand(0, W), rand(0, H), rand(20, 90), rand(6, 30), rand(0, 3), 0, 7); x.fill(); }
  speck(y, W, H, 6000, 90, 170, 0.25, 2);
  const map = tex(c, { aniso: 8 }), bump = tex(b, { srgb: false, aniso: 8 });
  map.wrapS = bump.wrapS = THREE.RepeatWrapping; map.repeat.set(2, 1); bump.repeat.set(2, 1);
  return { map, bump };
}
export function tireMaterials() {
  const { map, bump } = tireTextures();
  const rubber = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughness: 0.74, metalness: 0, color: 0xffffff, envMapIntensity: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2, roughness: 0.28, metalness: 1, color: 0xffd36a, emissive: 0x3a2400, emissiveIntensity: 0.6 });
  // gold needs a light base: use the bump as a brightness map
  gold.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\n vec4 sampledDiffuseColor = texture2D( map, vMapUv ); diffuseColor.rgb *= clamp(0.35 + sampledDiffuseColor.r * 4.5, 0.0, 1.2);\n#endif'); };
  const rubberLow = new THREE.MeshStandardMaterial({ map, roughness: 0.68, metalness: 0, color: 0xffffff, emissive: 0x101012 });
  // far golds glow a little more so they sparkle across the whole pile
  const goldFar = gold.clone(); goldFar.emissive = new THREE.Color(0x7a5200); goldFar.emissiveIntensity = 0.9; goldFar.onBeforeCompile = gold.onBeforeCompile;
  return { rubber, gold, rubberLow, goldFar };
}

/* ---------- other textures ---------- */
export function groundTexture() {
  const S = 1024, [c, x] = cvs(S, S), [b, y] = cvs(S, S);
  x.fillStyle = '#6e6a63'; x.fillRect(0, 0, S, S); y.fillStyle = '#808080'; y.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(${rand(70, 110) | 0},${rand(65, 100) | 0},${rand(55, 85) | 0},${rand(0.08, 0.2)})`; x.beginPath(); x.ellipse(rand(0, S), rand(0, S), rand(40, 200), rand(30, 140), rand(0, 3), 0, 7); x.fill(); }
  // gravel
  for (let i = 0; i < 26000; i++) { const g = rand(60, 165) | 0, sx = rand(0, S), sy = rand(0, S), r = rand(0.8, 2.6); x.fillStyle = `rgb(${g},${g - 4},${g - 10})`; x.beginPath(); x.arc(sx, sy, r, 0, 7); x.fill(); y.fillStyle = `rgb(${150 + g / 3 | 0},${150 + g / 3 | 0},${150 + g / 3 | 0})`; y.beginPath(); y.arc(sx, sy, r, 0, 7); y.fill(); }
  // oil stains + tire marks
  for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(20,18,16,${rand(0.08, 0.2)})`; x.beginPath(); x.ellipse(rand(0, S), rand(0, S), rand(15, 60), rand(10, 40), rand(0, 3), 0, 7); x.fill(); }
  return { map: tex(c, { rep: [40, 40], aniso: 8 }), bump: tex(b, { srgb: false, rep: [40, 40], aniso: 8 }) };
}
export function asphaltTexture() {
  const S = 512, [c, x] = cvs(S, S); x.fillStyle = '#3d3d3f'; x.fillRect(0, 0, S, S); speck(x, S, S, 20000, 30, 110, 0.5, 1.6);
  for (let i = 0; i < 12; i++) { x.strokeStyle = 'rgba(15,15,15,.5)'; x.lineWidth = rand(0.5, 1.5); x.beginPath(); let px = rand(0, S), py = rand(0, S); x.moveTo(px, py); for (let k = 0; k < 8; k++) { px += rand(-30, 30); py += rand(-30, 30); x.lineTo(px, py); } x.stroke(); }
  return tex(c, { rep: [3, 14] });
}
export function pileTexture() {
  // the core under the 3D tires: deep shadowed rubber crevices, no painted rings. Gaps between tires read as shadow.
  const S = 512, [c, x] = cvs(S, S), [b, y] = cvs(S, S);
  x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, S, S); y.fillStyle = '#202020'; y.fillRect(0, 0, S, S);
  const wrap = (fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy); };
  // soft low-frequency shading: darker pockets and slightly lit rubber humps
  for (let i = 0; i < 90; i++) {
    const cx = rand(0, S), cy = rand(0, S), r = rand(30, 90), dark = Math.random() < 0.55;
    wrap((dx, dy) => { const g = x.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, r); g.addColorStop(0, dark ? 'rgba(0,0,0,0.55)' : 'rgba(40,41,44,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx + dx - r, cy + dy - r, r * 2, r * 2); });
  }
  // fragments of tread and sidewall peeking out of the dark (short arcs, never full rings)
  for (let i = 0; i < 520; i++) {
    const cx = rand(0, S), cy = rand(0, S), r = rand(10, 30), a0 = rand(0, 7), len = rand(0.5, 1.5), lw = rand(2, 6), g = rand(26, 46) | 0;
    wrap((dx, dy) => {
      x.strokeStyle = `rgba(${g},${g},${g + 3},${rand(0.5, 0.9)})`; x.lineWidth = lw; x.beginPath(); x.arc(cx + dx, cy + dy, r, a0, a0 + len); x.stroke();
      y.strokeStyle = `rgba(200,200,200,0.6)`; y.lineWidth = lw; y.beginPath(); y.arc(cx + dx, cy + dy, r, a0, a0 + len); y.stroke();
    });
  }
  // crevice cracks
  for (let i = 0; i < 140; i++) { x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = rand(1, 3); x.beginPath(); let px = rand(0, S), py = rand(0, S); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += rand(-18, 18); py += rand(-18, 18); x.lineTo(px, py); } x.stroke(); }
  speck(x, S, S, 7000, 18, 52, 0.25, 1.8); speck(y, S, S, 5000, 40, 160, 0.3, 2);
  return { map: tex(c, { rep: [1, 1], aniso: 8 }), bump: tex(b, { srgb: false, rep: [1, 1], aniso: 8 }) };
}
export function fenceTexture() {
  const [c, x] = cvs(128, 128); x.clearRect(0, 0, 128, 128); x.strokeStyle = 'rgba(190,195,200,0.95)'; x.lineWidth = 3;
  for (let i = -128; i < 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke(); }
  const t = tex(c, { rep: [60, 2] }); return t;
}
export function signTexture(lines, bg = '#f2c21a', fg = '#151515', w = 1024, h = 256) {
  const [c, x] = cvs(w, h); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = 10; x.strokeRect(12, 12, w - 24, h - 24);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => { let px = l.size; x.font = `900 ${px}px Arial Black, Arial, sans-serif`; while (x.measureText(l.t).width > w - 70 && px > 10) { px -= 2; x.font = `900 ${px}px Arial Black, Arial, sans-serif`; } x.fillText(l.t, w / 2, l.y * h); });
  return tex(c);
}
export function skyTexture() {
  const [c, x] = cvs(16, 512); const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#3f73b8'); g.addColorStop(0.42, '#8fb7e2'); g.addColorStop(0.5, '#e9d9bf'); g.addColorStop(0.52, '#a9a28f'); g.addColorStop(1, '#6b6355');
  x.fillStyle = g; x.fillRect(0, 0, 16, 512); return tex(c);
}
export function glowTexture() {
  const [c, x] = cvs(128, 128); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,230,140,1)'); g.addColorStop(0.35, 'rgba(255,200,60,.5)'); g.addColorStop(1, 'rgba(255,180,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return tex(c);
}
export function plasterTexture() { const [c, x] = cvs(256, 256); x.fillStyle = '#d9cfbd'; x.fillRect(0, 0, 256, 256); speck(x, 256, 256, 6000, 170, 230, 0.35, 2); for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(120,100,70,${rand(0.04, 0.1)})`; x.fillRect(0, rand(150, 256), 256, rand(4, 30)); } return tex(c, { rep: [3, 1] }); }
export function shutterTexture() { const [c, x] = cvs(128, 256); for (let i = 0; i < 256; i += 8) { x.fillStyle = i % 16 ? '#9aa3aa' : '#b7c0c6'; x.fillRect(0, i, 128, 8); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, i + 7, 128, 1); } return tex(c, { rep: [2, 2] }); }
export function corrugatedTexture() { const [c, x] = cvs(256, 32); const g = x.createLinearGradient(0, 0, 32, 0); g.addColorStop(0, '#8b8f92'); g.addColorStop(0.5, '#c4c8cb'); g.addColorStop(1, '#8b8f92'); x.fillStyle = g; for (let i = 0; i < 256; i += 32) { x.save(); x.translate(i, 0); x.fillRect(0, 0, 32, 32); x.restore(); } return tex(c, { rep: [6, 1] }); }
export function plywoodTexture() { const [c, x] = cvs(256, 256); x.fillStyle = '#b8935f'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(110,75,35,${rand(0.08, 0.25)})`; x.lineWidth = rand(0.5, 2); x.beginPath(); const y0 = rand(0, 256); x.moveTo(0, y0); for (let k = 0; k <= 256; k += 32) x.lineTo(k, y0 + Math.sin(k * 0.03 + i) * rand(2, 6)); x.stroke(); } return tex(c, { rep: [2, 2] }); }

/* ---------- shared materials ---------- */
export function makeMats() {
  return {
    black: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.7, metalness: 0.2 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.55, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1d2a35, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.2, metalness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9ea6ad, roughness: 0.45, metalness: 0.85 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.45, metalness: 0.3 }),
    redLight: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0x880800, roughness: 0.3 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xffa31a, emissive: 0x552800, roughness: 0.3 }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d0, emissiveIntensity: 0.6, roughness: 0.1 }),
    ply: new THREE.MeshStandardMaterial({ map: plywoodTexture(), roughness: 0.85 }),
    cartRed: new THREE.MeshStandardMaterial({ color: 0xd42b1e, roughness: 0.4, metalness: 0.55 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf2c21a, roughness: 0.5 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd9a37e, roughness: 0.7 }),
    denim: new THREE.MeshStandardMaterial({ color: 0x2c3e5c, roughness: 0.85 }),
    hiviz: new THREE.MeshStandardMaterial({ color: 0xff7a12, roughness: 0.7 }),
    boots: new THREE.MeshStandardMaterial({ color: 0x2b2219, roughness: 0.9 }),
  };
}

/* ---------- wheel (tire + rim) for vehicles/cart ---------- */
export function wheelGeo(R, w, rimR) {
  const t = { R, ri: rimR, w };
  return { tire: tireGeometry(t, 'mid'), rim: merge([[cyl(rimR, rimR, w * 0.82, 18), M(0, 0, 0)], [cyl(rimR * 0.35, rimR * 0.35, w * 0.9, 10), M(0, 0, 0)]]) };
}

/* ---------- the van ---------- */
// local frame: x = 0 at the rear opening, +x toward the cab; z lateral; y up. Cargo floor at fl.
export function buildVan(veh, mats, tireMat) {
  const g = new THREE.Group();
  const { L, W, H } = veh.cargo, fl = 0.72, t = 0.045, Wo = W + 2 * t, top = fl + H;
  const paint = new THREE.MeshStandardMaterial({ color: veh.color, roughness: 0.32, metalness: 0.35 });
  const P = { paint: [], black: [], glass: [], ply: [], chrome: [], red: [], amber: [], head: [], plastic: [] };
  // cargo box
  P.ply.push([box(L, 0.02, W), M(L / 2, fl - 0.01, 0)]);
  P.paint.push([box(L, H + t, t), M(L / 2, fl + H / 2, W / 2 + t / 2)], [box(L, H + t, t), M(L / 2, fl + H / 2, -W / 2 - t / 2)]);
  P.paint.push([box(L + 0.02, t, Wo), M(L / 2, top + t / 2, 0)], [box(t, H, W), M(L + t / 2, fl + H / 2, 0)]);
  P.ply.push([box(L - 0.02, H - 0.06, 0.012), M(L / 2, fl + H / 2, W / 2 - 0.006)], [box(L - 0.02, H - 0.06, 0.012), M(L / 2, fl + H / 2, -W / 2 + 0.006)], [box(0.012, H - 0.04, W - 0.02), M(L - 0.006, fl + H / 2, 0)]);
  P.paint.push([box(L, 0.012, W), M(L / 2, top - 0.006, 0)]);
  // lashing rails
  for (const s of [1, -1]) P.chrome.push([box(L - 0.1, 0.03, 0.02), M(L / 2, fl + H * 0.55, s * (W / 2 - 0.02))]);
  // rear frame posts + sill
  for (const s of [1, -1]) P.paint.push([box(0.09, H + 0.06, 0.1), M(0.02, fl + H / 2, s * (W / 2 + 0.02))]);
  P.black.push([box(0.12, 0.08, Wo + 0.04), M(0.0, fl - 0.04, 0)]);
  P.black.push([box(0.18, 0.2, Wo), M(-0.06, fl - 0.24, 0)]); // bumper
  P.chrome.push([box(0.06, 0.06, 0.06), M(-0.14, fl - 0.24, 0)]); // tow hitch
  for (const s of [1, -1]) { P.red.push([box(0.035, 0.32, 0.1), M(-0.02, fl + 0.32, s * (W / 2 - 0.0))]); P.amber.push([box(0.036, 0.08, 0.1), M(-0.021, fl + 0.12, s * (W / 2 - 0.0))]); }
  // cab (extruded side profile with bevel = rounded van nose)
  const cab = new THREE.Shape();
  const x0 = L + t, cl = 1.75, b0 = fl - 0.28;
  cab.moveTo(x0, b0); cab.lineTo(x0 + cl - 0.05, b0); cab.quadraticCurveTo(x0 + cl + 0.08, b0, x0 + cl + 0.07, b0 + 0.2);
  cab.lineTo(x0 + cl + 0.02, fl + 0.55); cab.quadraticCurveTo(x0 + cl - 0.05, fl + 0.78, x0 + cl - 0.35, fl + 0.85);
  cab.lineTo(x0 + 0.95, top - 0.12); cab.quadraticCurveTo(x0 + 0.75, top + t, x0 + 0.4, top + t); cab.lineTo(x0, top + t); cab.lineTo(x0, b0);
  const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: Wo - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 8 });
  cabGeo.translate(0, 0, -(Wo - 0.12) / 2);
  P.paint.push([cabGeo, null]);
  // windscreen (along the sloped line) + side windows
  const wsx = x0 + cl - 0.35, wsy = fl + 0.85, wex = x0 + 0.95, wey = top - 0.12;
  const wl = Math.hypot(wsx - wex, wey - wsy), wa = Math.atan2(wey - wsy, wex - wsx);
  P.glass.push([box(wl * 0.92, 0.02, Wo - 0.16), M((wsx + wex) / 2 + 0.035, (wsy + wey) / 2 + 0.035, 0, 0, 0, wa)]);
  for (const s of [1, -1]) { const sw = new THREE.Shape(); sw.moveTo(x0 + 0.15, fl + 0.9); sw.lineTo(x0 + cl - 0.48, fl + 0.9); sw.lineTo(x0 + 0.98, top - 0.2); sw.lineTo(x0 + 0.15, top - 0.2); const sg = new THREE.ShapeGeometry(sw); sg.translate(0, 0, s * (Wo / 2 + 0.005)); if (s < 0) sg.scale(1, 1, 1); P.glass.push([sg, null]); }
  // grille, bumper, lights, mirrors
  P.plastic.push([box(0.05, 0.32, Wo - 0.3), M(x0 + cl + 0.08, fl + 0.32, 0)]);
  P.black.push([box(0.2, 0.22, Wo + 0.02), M(x0 + cl + 0.06, b0 + 0.1, 0)]);
  for (const s of [1, -1]) { P.head.push([box(0.06, 0.13, 0.3), M(x0 + cl + 0.05, fl + 0.5, s * (Wo / 2 - 0.25))]); P.amber.push([box(0.05, 0.06, 0.1), M(x0 + cl + 0.07, fl + 0.36, s * (Wo / 2 - 0.12))]); }
  for (const s of [1, -1]) { P.black.push([box(0.06, 0.24, 0.05), M(x0 + cl - 0.6, fl + 0.95, s * (Wo / 2 + 0.16))], [box(0.04, 0.03, 0.18), M(x0 + cl - 0.6, fl + 0.9, s * (Wo / 2 + 0.07))]); }
  // side sills + wheel arches + wheels
  for (const s of [1, -1]) P.black.push([box(L + cl, 0.12, 0.04), M((L + cl) / 2, fl - 0.12, s * (Wo / 2 + 0.01))]);
  P.black.push([box(L + cl, 0.2, W * 0.6), M((L + cl) / 2, 0.45, 0)]);
  const wr = 0.31, ww = 0.22, wz = Wo / 2 - 0.12, wheel = wheelGeo(wr, ww, 0.19); // wheel tops (0.62) + arches (0.68) stay under the floor (0.72)
  const wheelX = [0.8, x0 + cl - 0.55];
  if (L > 3.5) wheelX.push(1.55);
  for (const wx of wheelX) for (const s of [1, -1]) {
    const tm = new THREE.Mesh(wheel.tire, tireMat); tm.position.set(wx, wr, s * wz); tm.rotation.x = Math.PI / 2; tm.castShadow = true; g.add(tm);
    const rm = new THREE.Mesh(wheel.rim, mats.steel); rm.position.copy(tm.position); rm.rotation.x = Math.PI / 2; g.add(rm);
    P.black.push([cyl(wr + 0.04, wr + 0.04, 0.05, 16, 1), M(wx, wr + 0.02, s * (Wo / 2 + 0.005), Math.PI / 2)]);
  }
  // number plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshStandardMaterial({ map: signTexture([{ t: 'GM 100 0K', y: 0.52, size: 150 }], '#f4f4f4', '#1a2a6a', 512, 112), roughness: 0.4 }));
  plate.position.set(-0.16, fl - 0.22, 0); plate.rotation.y = -Math.PI / 2; g.add(plate);
  const matFor = { paint, black: mats.black, glass: mats.glass, ply: mats.ply, chrome: mats.chrome, red: mats.redLight, amber: mats.amber, head: mats.headlight, plastic: mats.plastic };
  for (const k in P) if (P[k].length) { const m = new THREE.Mesh(merge(P[k]), matFor[k]); m.castShadow = k !== 'glass'; m.receiveShadow = true; g.add(m); }
  // company decal
  const logoMat = new THREE.MeshStandardMaterial({ map: signTexture([{ t: 'UN MILIONE', y: 0.36, size: 110 }, { t: 'DI GOMME', y: 0.74, size: 92 }], 'rgba(0,0,0,0)', '#1d3f8a', 1024, 300), transparent: true, roughness: 0.4 });
  for (const s of [1, -1]) { const lg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.4, L * 0.75), 0.68), logoMat); lg.position.set(L / 2, fl + H * 0.58, s * (Wo / 2 + 0.004)); if (s < 0) lg.rotation.y = Math.PI; g.add(lg); }
  // barn doors hinged on the outer rear edges, swinging outward ~270°
  const doors = [], dw = Wo / 2;
  for (const s of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(-0.04, fl + H / 2, s * (Wo / 2 + 0.03)); g.add(pivot);
    const leaf = new THREE.Group(); leaf.position.set(0, 0, -s * dw / 2); pivot.add(leaf);
    const outer = new THREE.Mesh(box(0.045, H + 0.02, dw - 0.015), paint); outer.castShadow = true; leaf.add(outer);
    const inn = new THREE.Mesh(box(0.01, H - 0.08, dw - 0.07), mats.ply); inn.position.x = 0.028; leaf.add(inn);
    const win = new THREE.Mesh(box(0.012, H * 0.26, dw * 0.66), mats.glass); win.position.set(-0.026, H * 0.24, 0); leaf.add(win);
    const handle = new THREE.Mesh(box(0.03, 0.03, 0.16), mats.chrome); handle.position.set(-0.035, -0.05, -s * (dw / 2 - 0.08)); leaf.add(handle);
    doors.push({ pivot, sign: s });
  }
  g.userData = { doors, fl, cargo: veh.cargo, wheels: g.children.filter(c => c.geometry === wheel.tire || c.geometry === wheel.rim) };
  poseDoors(g, 1);
  return g;
}
export function poseDoors(van, k) { for (const d of van.userData.doors) d.pivot.rotation.y = d.sign * Math.PI * 1.5 * k; }

/* ---------- the cart ---------- */
// Upright gommista tire hand-truck (carrello portagomme): tubular steel frame, twin rails, curved backrest band,
// angled handles with rubber grips, two pneumatic wheels, curved front cradle arms. Tires lie flat in a stack along the rails.
// Built upright in `rig` with the wheel axle at the origin and +x = the tire side; the caller tilts rig.rotation.z.
// cap <= 6: one stack; 8 and 10: two stacks side by side (double trolley), so it never gets taller than ~1.6 m.
export function buildCart(mats, tireMat, cap = 4) {
  const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
  const stacks = cap > 6 ? 2 : 1, per = Math.ceil(cap / stacks), STEP = 0.228, TR = 0.34;
  const zc = stacks === 1 ? [0] : [-0.39, 0.39], railX = 0.05, xc = railX + 0.025 + TR, base = 0.04;
  const L = base + per * STEP + 0.14, wheelR = 0.17;
  const T = [], K = [];
  const tube = (pts, r = 0.017, seg = 20) => T.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 7, false), M()]);
  const rails = [];
  for (const z of zc) rails.push(z - 0.17, z + 0.17);
  for (const z of rails) T.push([cyl(0.019, 0.019, L + 0.06, 9), M(railX, (L - 0.06) / 2, z)]);
  // crossbars + curved backrest band hugging the stack
  const zMin = Math.min(...rails), zMax = Math.max(...rails);
  for (const y of [0.16, L - 0.04]) T.push([cyl(0.014, 0.014, zMax - zMin, 8), M(railX, y, (zMin + zMax) / 2, Math.PI / 2)]);
  for (const z of zc) {
    const band2 = []; for (let k = 0; k <= 16; k++) { const a = Math.PI * (0.62 + k * (0.76 / 16)); band2.push([xc + Math.cos(a) * (TR + 0.03), L * 0.55, z + Math.sin(a) * (TR + 0.03)]); }
    tube(band2, 0.014, 18);
    // curved front cradle arms around the bottom tire + toe plate
    for (const s of [1, -1]) { const arm = []; for (let k = 0; k <= 10; k++) { const a = s * Math.PI * (0.78 - k * 0.062); arm.push([xc + Math.cos(a) * (TR + 0.025), base - 0.005, z + Math.sin(a) * (TR + 0.025)]); } tube(arm, 0.017, 14); }
    K.push([box(0.3, 0.018, 0.3), M(railX + 0.16, base - 0.03, z)]);
  }
  // handles: rails bend back toward the pusher, black rubber grips
  const outer = [zMin, zMax], grips = [];
  for (const z of outer) {
    const s = Math.sign(z);
    tube([[railX, L - 0.02, z], [railX - 0.02, L + 0.06, z], [railX - 0.13, L + 0.17, z + s * 0.02], [railX - 0.26, L + 0.25, z + s * 0.04]], 0.019, 12);
    grips.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(railX - 0.2, L + 0.214, z + s * 0.032), new THREE.Vector3(railX - 0.33, L + 0.29, z + s * 0.05)]), 6, 0.027, 9, false), M()]);
  }
  // axle + wheel struts
  T.push([cyl(0.016, 0.016, zMax - zMin + 0.16, 8), M(0, 0, (zMin + zMax) / 2, Math.PI / 2)]);
  for (const z of outer) T.push([cyl(0.015, 0.015, 0.2, 8), M(railX * 0.5, 0.08, z, 0, 0, 0.3)]);
  const paint = new THREE.MeshStandardMaterial({ color: 0x1f63d6, roughness: 0.38, metalness: 0.5 });
  const frame = new THREE.Mesh(merge(T), paint); frame.castShadow = true; rig.add(frame);
  const plates = new THREE.Mesh(merge(K), mats.steel); plates.castShadow = true; rig.add(plates);
  const gr = new THREE.Mesh(merge(grips), mats.black); rig.add(gr);
  const wheel = wheelGeo(wheelR, 0.085, 0.09);
  for (const z of outer) {
    const zz = z + Math.sign(z) * 0.08;
    const tm = new THREE.Mesh(wheel.tire, tireMat); tm.position.set(0, 0, zz); tm.rotation.x = Math.PI / 2; tm.castShadow = true; rig.add(tm);
    const rm = new THREE.Mesh(wheel.rim, mats.steel); rm.position.copy(tm.position); rm.rotation.x = Math.PI / 2; rig.add(rm);
  }
  // small rear casters near the top (as on real ones, for laying it down)
  for (const z of outer) { const c = new THREE.Mesh(cyl(0.04, 0.04, 0.03, 12), mats.black); c.position.set(railX - 0.06, L * 0.62, z); c.rotation.x = Math.PI / 2; rig.add(c); }
  // slot i -> position in rig space (stacks filled alternately when double)
  const slot = (i, w = 0.2, out = new THREE.Vector3()) => { const si = i % stacks, lvl = Math.floor(i / stacks); return out.set(xc, base + w / 2 + lvl * STEP, zc[si]); };
  g.userData = { rig, L, wheelR, cap, slot, handleLen: L + 0.29 };
  return g;
}

/* ---------- workers who watch you, unimpressed ---------- */
export function buildWorker(mats, shirt = 0xff7a12) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.75 });
  const legs = new THREE.Mesh(merge([[new THREE.CapsuleGeometry(0.085, 0.62, 4, 8), M(0, 0.45, 0.1)], [new THREE.CapsuleGeometry(0.085, 0.62, 4, 8), M(0, 0.45, -0.1)]]), mats.denim);
  const boots = new THREE.Mesh(merge([[box(0.26, 0.1, 0.12), M(0.05, 0.05, 0.1)], [box(0.26, 0.1, 0.12), M(0.05, 0.05, -0.1)]]), mats.boots);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), shirtMat); torso.position.y = 1.12; torso.scale.set(0.75, 1, 1);
  const band = new THREE.Mesh(cyl(0.205, 0.205, 0.05, 12), mats.yellow); band.position.y = 1.08; band.scale.set(0.76, 1, 1);
  // arms crossed in front
  const arms = new THREE.Mesh(merge([[new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), M(0.12, 1.15, 0.17, 0.3, 0, 1.45)], [new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), M(0.14, 1.2, -0.17, -0.3, 0, 1.6)], [new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), M(0.02, 1.3, 0.24, 0, 0, 0.2)], [new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), M(0.02, 1.3, -0.24, 0, 0, 0.2)]]), shirtMat);
  const head = new THREE.Group(); head.position.y = 1.52;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mats.skin); skull.scale.set(1, 1.1, 0.95); head.add(skull);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), shirtMat); cap.position.y = 0.03; head.add(cap);
  const visor = new THREE.Mesh(box(0.12, 0.015, 0.2), shirtMat); visor.position.set(0.13, 0.04, 0); head.add(visor);
  const brow = new THREE.Mesh(box(0.02, 0.018, 0.13), mats.boots); brow.position.set(0.125, 0.005, 0); brow.rotation.x = 0.08; head.add(brow); // a frown
  const mus = new THREE.Mesh(box(0.02, 0.02, 0.08), mats.boots); mus.position.set(0.128, -0.06, 0); head.add(mus);
  for (const m of [legs, boots, torso, band, arms, skull, cap]) { m.castShadow = true; }
  g.add(legs, boots, torso, band, arms, head);
  g.userData.head = head;
  return g;
}
