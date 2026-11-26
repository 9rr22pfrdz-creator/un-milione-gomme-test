// Macchina dei fascioni: a dedicated workbay next to the storage rack. Left: the sidewall cutter (two spinning steel
// discs slice both sidewalls off a tire, leaving the tread band = a "fascione"). Middle: the nesting table where you push
// the fascioni one inside the other ("tutun tutun") into stacks of 10. Right: the supplier's pallet with the strapped bundles.
import * as THREE from 'three';
import { merge, M, box, cyl, cvs } from './gfx.js';
import { FASC } from './fase5.js';
import { weathered, hazardTex } from './pulley.js';

export const FBAY = { x0: -3.5, x1: 3.5, z0: -14.25, z1: -10.1 };
export const CUTTER = { x: -1.9, z: -13.1 }, TABLE = { x: 0.9, z: -12.95 }, PALLET = { x: 2.62, z: -13.0 };
export const CUT_ZONE = { x0: -3.1, x1: -0.75, z0: -12.5, z1: -10.1 }, TABLE_ZONE = { x0: -0.45, x1: 2.25, z0: -12.4, z1: -10.1 };
const BAND_R = 0.3, BAND_H = 0.19;

function label(text, w, h, bg = '#f2c21a', fg = '#151515', size = 0) {
  const [c, x] = cvs(w, h); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
  x.fillStyle = fg; x.font = `900 ${size || Math.round(h * 0.5)}px Arial Black, Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function treadTex() {
  const [c, x] = cvs(256, 64); x.fillStyle = '#1d1d1f'; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 256; i += 10) { x.fillStyle = '#0d0d0e'; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 5, 0); x.lineTo(i + 9, 32); x.lineTo(i + 5, 64); x.lineTo(i, 64); x.lineTo(i + 4, 32); x.fill(); }
  x.fillStyle = '#0a0a0a'; x.fillRect(0, 29, 256, 6);
  for (let i = 0; i < 800; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 64, 2, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
}
export function buildFascioni(scene, { mats, colliders, tireMesh, freeMesh, onCut }) {
  const root = new THREE.Group(); scene.add(root);
  const MT = {
    green: new THREE.MeshStandardMaterial({ map: weathered('#2f6b5e', 0.12), roughness: 0.55, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ map: weathered('#2b2f33', 0.05), roughness: 0.5, metalness: 0.7 }),
    orange: new THREE.MeshStandardMaterial({ map: weathered('#e86a12', 0.1), roughness: 0.5, metalness: 0.25 }),
    disc: new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.22, metalness: 1 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTex(5), roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ map: weathered('#a27b4a', 0.02), roughness: 0.85 }),
    band: new THREE.MeshStandardMaterial({ map: treadTex(), roughness: 0.88, side: THREE.DoubleSide }),
    bundle: new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.9 }),
    strap: new THREE.MeshStandardMaterial({ color: 0xf2c21a, roughness: 0.5 }),
    red: new THREE.MeshStandardMaterial({ color: 0xd8281e, roughness: 0.4, emissive: 0x400000 }),
    lime: new THREE.MeshStandardMaterial({ color: 0x3ad35b, roughness: 0.4, emissive: 0x0c3a12 }),
    tarp: new THREE.MeshStandardMaterial({ color: 0x3f5f86, roughness: 0.95 }),
  };
  const mesh = (geo, mat, parent = root, sh = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = sh; m.receiveShadow = true; parent.add(m); return m; };
  // ---- the bay: painted floor + sign on two posts (always there) ----
  const { x0, x1, z0, z1 } = FBAY, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: 0xf2c21a, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.016, cz); root.add(floor);
  const lineM = new THREE.MeshBasicMaterial({ color: 0xf2c21a, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3 });
  root.add(new THREE.Mesh(merge([[box(x1 - x0, 0.01, 0.1), M(cx, 0.02, z1)], [box(0.1, 0.01, z1 - z0), M(x0, 0.02, cz)], [box(0.1, 0.01, z1 - z0), M(x1, 0.02, cz)]]), lineM));
  const floorTxt = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.42), new THREE.MeshBasicMaterial({ map: label('FASCIONI', 512, 90, 'rgba(0,0,0,0)', '#f2c21a', 64), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  floorTxt.rotation.x = -Math.PI / 2; floorTxt.position.set(cx, 0.022, z1 - 0.45); root.add(floorTxt);
  mesh(merge([[box(0.1, 3.0, 0.1), M(x0 + 0.6, 1.5, z0 + 0.12)], [box(0.1, 3.0, 0.1), M(x1 - 0.6, 1.5, z0 + 0.12)]]), mats.steel || MT.dark);
  const sign = mesh(new THREE.PlaneGeometry(4.2, 0.62), new THREE.MeshStandardMaterial({ map: label('MACCHINA DEI FASCIONI', 1024, 150), roughness: 0.6 })); sign.position.set(cx, 2.75, z0 + 0.18);
  const soon = mesh(new THREE.PlaneGeometry(2.6, 0.42), new THREE.MeshStandardMaterial({ map: label('PROSSIMAMENTE', 640, 100, '#1e2226', '#f2c21a'), roughness: 0.6 })); soon.position.set(cx, 2.22, z0 + 0.19);
  // ---- covered machine while locked ----
  const tarp = new THREE.Group(); root.add(tarp);
  mesh(merge([[box(1.9, 1.3, 1.25), M(CUTTER.x, 0.65, CUTTER.z, 0, 0, 0.02)], [box(1.5, 0.95, 1.0), M(TABLE.x, 0.48, TABLE.z, 0, 0.05, 0)]]), MT.tarp, tarp);
  // ---- the machine (visible once bought) ----
  const mach = new THREE.Group(); root.add(mach);
  const C = CUTTER, top = 0.97;
  mesh(merge([[box(1.7, 0.95, 1.1), M(C.x, 0.475, C.z)]]), MT.green, mach);
  mesh(merge([[box(1.72, 0.12, 1.12), M(C.x, 0.12, C.z)]]), MT.hazard, mach);
  mesh(merge([[box(1.76, 0.05, 1.16), M(C.x, top, C.z)], [box(0.5, 0.06, 0.7), M(C.x - 1.0, 0.86, C.z + 0.05, 0, 0, -0.18)], // infeed tray
    [cyl(0.05, 0.05, 0.62, 10), M(C.x - 0.16, top + 0.07, C.z + 0.05, Math.PI / 2)], [cyl(0.05, 0.05, 0.62, 10), M(C.x + 0.16, top + 0.07, C.z + 0.05, Math.PI / 2)], // support rollers
    [box(0.16, 0.42, 0.3), M(C.x - 0.42, top + 0.42, C.z - 0.28)], [box(0.16, 0.42, 0.3), M(C.x + 0.42, top + 0.42, C.z - 0.28)], // disc motors
    [box(0.62, 0.05, 0.75), M(C.x + 1.1, 0.78, C.z + 0.02, 0, 0, 0.12)], [box(0.05, 0.78, 0.05), M(C.x + 1.36, 0.39, C.z - 0.3)], [box(0.05, 0.78, 0.05), M(C.x + 1.36, 0.39, C.z + 0.34)], // output tray
    [box(0.06, 1.2, 0.06), M(C.x + 0.55, 0.6, C.z + 0.62)], [box(0.62, 0.42, 0.42), M(C.x - 0.15, 0.25, C.z - 0.85)]]), MT.dark, mach); // panel post, scrap bin
  // the two cutting discs (axis x) either side of the tire + their orange guards
  const discGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.018, 36); discGeo.rotateZ(Math.PI / 2);
  const discs = [-1, 1].map(s => { const d = mesh(discGeo, MT.disc, mach); d.position.set(C.x + s * 0.14, top + 0.48, C.z - 0.24); return d; });
  mesh(merge([[box(0.05, 0.36, 0.56), M(C.x - 0.2, top + 0.66, C.z - 0.32)], [box(0.05, 0.36, 0.56), M(C.x + 0.2, top + 0.66, C.z - 0.32)], [box(0.45, 0.05, 0.56), M(C.x, top + 0.85, C.z - 0.32)]]), MT.orange, mach);
  const panel = mesh(box(0.34, 0.26, 0.12), MT.orange, mach); panel.position.set(C.x + 0.55, 1.28, C.z + 0.62);
  const bR = mesh(cyl(0.05, 0.05, 0.05, 12), MT.red, mach); bR.rotation.x = Math.PI / 2; bR.position.set(C.x + 0.48, 1.3, C.z + 0.7);
  const bG = mesh(cyl(0.035, 0.035, 0.04, 12), MT.lime, mach); bG.rotation.x = Math.PI / 2; bG.position.set(C.x + 0.62, 1.3, C.z + 0.7);
  // scrap sidewall rings in the bin
  const ringGeo = new THREE.TorusGeometry(0.2, 0.035, 6, 18);
  for (let i = 0; i < 7; i++) { const r = mesh(ringGeo, MT.bundle, mach); r.position.set(C.x - 0.15 + Math.sin(i * 2.1) * 0.12, 0.46 + (i % 3) * 0.03, C.z - 0.85 + Math.cos(i * 1.7) * 0.08); r.rotation.set(Math.PI / 2 + Math.sin(i) * 0.3, 0, i); }
  const bandGeo = new THREE.CylinderGeometry(BAND_R, BAND_R, BAND_H, 28, 1, true);
  // ready fascioni lying on the output tray (up to 10)
  const ready = []; for (let i = 0; i < FASC.READY_MAX; i++) { const b = mesh(bandGeo, MT.band, mach); b.scale.set(0.92, 0.6, 0.92); b.position.set(C.x + 1.05 + (i % 2) * 0.05, 0.86 + Math.floor(i / 1) * 0.06, C.z + 0.02 + (i % 2 ? 0.03 : -0.03)); b.rotation.z = 0.12; b.visible = false; ready.push(b); }
  // waiting tires on the infeed tray (meshes provided by the game)
  // ---- nesting table ----
  const T = TABLE;
  mesh(merge([[box(1.5, 0.08, 0.95), M(T.x, 0.84, T.z)]]), MT.wood, mach);
  mesh(merge([[box(0.06, 0.8, 0.06), M(T.x - 0.68, 0.4, T.z - 0.4)], [box(0.06, 0.8, 0.06), M(T.x + 0.68, 0.4, T.z - 0.4)], [box(0.06, 0.8, 0.06), M(T.x - 0.68, 0.4, T.z + 0.4)], [box(0.06, 0.8, 0.06), M(T.x + 0.68, 0.4, T.z + 0.4)], [box(1.4, 0.05, 0.05), M(T.x, 0.2, T.z - 0.4)], [box(1.4, 0.05, 0.05), M(T.x, 0.2, T.z + 0.4)], [cyl(0.36, 0.36, 0.03, 28), M(T.x - 0.1, 0.895, T.z)]]), MT.dark, mach);
  const stackG = new THREE.Group(); stackG.position.set(T.x - 0.1, 0.91, T.z); mach.add(stackG);
  const rings = []; for (let i = 0; i < FASC.STACK; i++) { const b = mesh(bandGeo, MT.band, stackG); const k = 1 - i * 0.042; b.scale.set(k, 1, k); b.position.y = BAND_H / 2 + i * 0.006; b.visible = false; rings.push(b); }
  // a small counter plate on the table
  const [cc, cx2] = cvs(256, 128); const ctex = new THREE.CanvasTexture(cc); ctex.colorSpace = THREE.SRGBColorSpace;
  const counter = mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.6 }), mach); counter.position.set(T.x + 0.5, 1.02, T.z - 0.2); counter.rotation.x = -0.5;
  mesh(box(0.42, 0.04, 0.08), MT.dark, mach).position.set(T.x + 0.5, 0.9, T.z - 0.26);
  function drawCounter(n, rd) { cx2.fillStyle = '#1e2226'; cx2.fillRect(0, 0, 256, 128); cx2.fillStyle = '#f2c21a'; cx2.font = '900 64px Arial Black, Arial'; cx2.textAlign = 'center'; cx2.textBaseline = 'middle'; cx2.fillText(`${n}/${FASC.STACK}`, 128, 52); cx2.font = '700 24px Arial'; cx2.fillStyle = '#c9ced3'; cx2.fillText(`pronti: ${rd}`, 128, 104); ctex.needsUpdate = true; }
  // ---- supplier pallet with strapped bundles ----
  const PL = PALLET;
  mesh(merge([[box(1.2, 0.03, 1.0), M(PL.x, 0.135, PL.z)], ...[-0.5, 0, 0.5].map(dz => [box(1.2, 0.09, 0.12), M(PL.x, 0.06, PL.z + dz * 0.92)])]), MT.wood, mach);
  const bundleGeo = merge([[cyl(BAND_R, BAND_R, 0.24, 24), M(0, 0, 0)]]), strapGeo = merge([[box(0.66, 0.25, 0.03), M(0, 0, 0)], [box(0.03, 0.25, 0.66), M(0, 0, 0)]]);
  const slots = [[-0.3, -0.25, 0], [0.3, -0.25, 0], [-0.3, 0.25, 0], [0.3, 0.25, 0], [-0.15, 0, 1], [0.18, 0.02, 1]];
  const bundles = slots.map(([dx, dz, l]) => { const g = new THREE.Group(); g.position.set(PL.x + dx, 0.27 + l * 0.25, PL.z + dz); mach.add(g); mesh(bundleGeo, MT.bundle, g); const s = mesh(strapGeo, MT.strap, g); s.scale.set(1.0, 1.02, 1.0); const t = mesh(bandGeo, MT.band, g); t.scale.set(1.01, 1.25, 1.01); g.visible = false; return g; });
  colliders.push({ x0: C.x - 1.35, x1: C.x + 1.45, z0: C.z - 1.1, z1: C.z + 0.7 }, { x0: T.x - 0.8, x1: T.x + 0.8, z0: T.z - 0.5, z1: T.z + 0.5 }, { x0: PL.x - 0.62, x1: PL.x + 0.62, z0: PL.z - 0.52, z1: PL.z + 0.52 });
  // ---- state + animation ----
  let unlocked = false, cut = null, nestAnim = 0, bundleFly = null, lastStack = 0, waitMeshes = [];
  const api = {
    root, CUTTER, TABLE, PALLET,
    infeedPos: new THREE.Vector3(C.x - 0.95, 1.05, C.z + 0.05), cutPos: new THREE.Vector3(C.x, top + 0.4, C.z + 0.05),
    setUnlocked(b) { unlocked = b; mach.visible = b; tarp.visible = !b; soon.visible = !b; },
    get unlocked() { return unlocked; },
    // f = S.fascioni, waiting = tire types on the infeed tray
    setState(f, waiting = []) {
      ready.forEach((b, i) => b.visible = i < Math.min(FASC.READY_MAX, f.ready));
      rings.forEach((b, i) => b.visible = i < f.stack);
      bundles.forEach((b, i) => b.visible = i < f.pallet);
      drawCounter(f.stack, f.ready);
      // tires waiting on the infeed tray (max 2 shown)
      while (waitMeshes.length > Math.min(2, waiting.length)) freeMesh(waitMeshes.pop());
      while (waitMeshes.length < Math.min(2, waiting.length)) waitMeshes.push(tireMesh(waiting[waitMeshes.length]));
      waitMeshes.forEach((m, i) => { m.position.set(C.x - 1.05 - i * 0.12, 1.12 - i * 0.04, C.z + 0.05); m.quaternion.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 - 0.18)); });
      lastStack = f.stack;
    },
    cutting() { return !!cut; },
    // a tire mesh (from the game) is sliced: it stands between the discs and spins; onCut() when done
    startCut(m, type) { cut = { m, type, t: 0, base: m.scale.clone() }; },
    nest(n) { nestAnim = 0.28; },
    bundleDone() { bundleFly = { t: 0 }; },
    transit() { return cut ? [cut.type] : []; },
    update(dt) {
      if (!unlocked) return;
      const spin = cut ? 38 : 2; for (const d of discs) d.rotation.x += dt * spin;
      if (cut) {
        cut.t += dt; const k = Math.min(1, cut.t / FASC.CUT_T), m = cut.m;
        m.position.set(C.x, top + 0.07 + 0.33 + Math.sin(cut.t * 40) * 0.004, C.z + 0.05 - (k < 0.15 ? (0.15 - k) * 2 : 0));
        m.quaternion.setFromEuler(new THREE.Euler(0, cut.t * 9, Math.PI / 2, 'ZYX'));
        bG.material.emissive.setHex(0x2aff4a);
        if (k >= 1) { m.scale.copy(cut.base); freeMesh(m); const t = cut.type; cut = null; bG.material.emissive.setHex(0x0c3a12); onCut(t); }
      }
      if (nestAnim > 0) { nestAnim = Math.max(0, nestAnim - dt); const k = 1 - nestAnim / 0.28; const sq = 1 - Math.sin(k * Math.PI) * 0.22; stackG.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5); const top1 = rings[Math.max(0, lastStack - 1)]; if (top1 && lastStack) top1.position.y = BAND_H / 2 + (lastStack - 1) * 0.006 + (1 - Math.min(1, k * 2.2)) * 0.35; }
      else stackG.scale.set(1, 1, 1);
      if (bundleFly) { bundleFly.t += dt; const k = Math.min(1, bundleFly.t / 0.5); stackG.visible = k < 0.05 || k >= 1; if (k >= 1) bundleFly = null; }
    },
  };
  api.setUnlocked(false); drawCounter(0, 0);
  return api;
}
