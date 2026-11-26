// Trituratore: heavy olive-green twin-shaft shredder on a steel skid. Counter-rotating toothed shafts in the top hopper,
// a side chute filling a woven "GRANULATO" sack. Placed on the 2 m build grid; fed by the player, belts, arms, the pulley.
import * as THREE from 'three';
import { merge, M, box, cyl, cvs } from './gfx.js';
import { cellCenter } from './beltlogic.js';
import { SHRED, shredKg } from './fase5.js';
import { weathered, hazardTex } from './pulley.js';

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const [c, x] = cvs(256, 256); x.fillStyle = '#d9cfb4'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) { x.fillStyle = 'rgba(120,100,70,0.18)'; x.fillRect(i, 0, 1, 256); x.fillRect(0, i, 256, 1); }
  x.fillStyle = '#1d5c2e'; x.font = '900 40px Arial Black, Arial'; x.textAlign = 'center'; x.fillText('GRANULATO', 128, 120); x.font = '700 26px Arial'; x.fillText('DI GOMMA · 25 kg', 128, 160);
  const sackT = new THREE.CanvasTexture(c); sackT.colorSpace = THREE.SRGBColorSpace;
  MATS = {
    olive: new THREE.MeshStandardMaterial({ map: weathered('#5b6b3a', 0.14), roughness: 0.58, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ map: weathered('#2b2f33', 0.06), roughness: 0.5, metalness: 0.7 }),
    teeth: new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.3, metalness: 0.95 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTex(8), roughness: 0.6 }),
    sack: new THREE.MeshStandardMaterial({ map: sackT, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9a7a4c, roughness: 0.9 }),
    crumb: new THREE.MeshStandardMaterial({ color: 0x1c1c1d, roughness: 0.95 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xffa31a, emissive: 0xff8a00, emissiveIntensity: 0.4, transparent: true, opacity: 0.9 }),
  };
  return MATS;
}
// hopper plate between 4 corners (a quad, double sided via 2 tris each way)
function quad(a, b, c, d) { const g = new THREE.BufferGeometry(); const p = [...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c]; g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1], 2)); g.computeVertexNormals(); return g; }
const HX = -0.15; // hopper / cabinet centre x (local); chute + sack on +x
export function buildShredder() {
  const MT = mats(), g = new THREE.Group();
  const add = (parts, mat, sh = true) => { const m = new THREE.Mesh(merge(parts), mat); m.castShadow = sh; m.receiveShadow = true; g.add(m); return m; };
  add([[box(1.75, 0.12, 1.55), M(0, 0.06, 0)], [box(0.5, 0.5, 0.42), M(HX - 0.35, 0.55, -0.82)], [cyl(0.16, 0.16, 0.5, 14), M(HX + 0.15, 0.55, -0.82, Math.PI / 2)], [box(0.12, 0.8, 0.12), M(HX + 0.55, 1.6, 0.55)]], MT.dark);
  add([[box(1.25, 1.05, 1.2), M(HX, 0.65, 0)], [box(1.3, 0.12, 1.25), M(HX, 1.24, 0)]], MT.olive);
  add([[box(1.27, 0.13, 1.22), M(HX, 0.32, 0)]], MT.hazard);
  // hopper: 4 sloped plates + a hazard rim
  const lo = { x0: HX - 0.55, x1: HX + 0.55, z0: -0.52, z1: 0.52, y: 1.3 }, hi = { x0: HX - 0.8, x1: HX + 0.8, z0: -0.74, z1: 0.74, y: 2.0 };
  const P = (o, sx, sz) => [sx ? o.x1 : o.x0, o.y, sz ? o.z1 : o.z0];
  const hop = [quad(P(lo, 0, 0), P(lo, 1, 0), P(hi, 1, 0), P(hi, 0, 0)), quad(P(lo, 1, 1), P(lo, 0, 1), P(hi, 0, 1), P(hi, 1, 1)), quad(P(lo, 0, 1), P(lo, 0, 0), P(hi, 0, 0), P(hi, 0, 1)), quad(P(lo, 1, 0), P(lo, 1, 1), P(hi, 1, 1), P(hi, 1, 0))];
  for (const q of hop) { const m = new THREE.Mesh(q, MT.olive); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  add([[box(1.66, 0.08, 0.08), M(HX, 2.02, 0.75)], [box(1.66, 0.08, 0.08), M(HX, 2.02, -0.75)], [box(0.08, 0.08, 1.56), M(HX - 0.81, 2.02, 0)], [box(0.08, 0.08, 1.56), M(HX + 0.81, 2.02, 0)]], MT.hazard);
  // the two counter-rotating toothed shafts (axis z), visible in the hopper throat
  const shafts = [-1, 1].map(s => {
    const sg = new THREE.Group(); sg.position.set(HX + s * 0.21, 1.36, 0); g.add(sg);
    const parts = [[cyl(0.1, 0.1, 1.0, 12), M(0, 0, 0, Math.PI / 2)]];
    for (let i = 0; i < 7; i++) { const z = -0.42 + i * 0.14; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 + i * 0.6; parts.push([box(0.07, 0.12, 0.07), M(Math.cos(a) * 0.15, Math.sin(a) * 0.15, z, 0, 0, a)]); } parts.push([cyl(0.13, 0.13, 0.05, 10), M(0, 0, z, Math.PI / 2)]); }
    const m = new THREE.Mesh(merge(parts), MT.teeth); m.castShadow = true; sg.add(m); return sg;
  });
  // side chute + sack on a little pallet
  add([[box(0.62, 0.05, 0.46), M(HX + 0.8, 0.95, 0, 0, 0, -0.5)], [box(0.62, 0.18, 0.04), M(HX + 0.8, 1.02, 0.23, 0, 0, -0.5)], [box(0.62, 0.18, 0.04), M(HX + 0.8, 1.02, -0.23, 0, 0, -0.5)]], MT.dark);
  add([[box(0.62, 0.1, 0.7), M(0.68, 0.17, 0)]], MT.wood);
  const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 1, 12), MT.sack); sack.castShadow = true; sack.position.set(0.68, 0.22, 0); g.add(sack);
  const crumbs = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 12), MT.crumb); g.add(crumbs);
  // amber beacon on a mast (spins while chewing)
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 10), MT.beacon.clone()); beacon.position.set(HX + 0.55, 2.07, 0.55); g.add(beacon);
  // a tire being chewed (shown while busy)
  g.userData = { shafts, sack, crumbs, beacon };
  return g;
}
export class ShredWorld {
  // host: { scene, onShred(s, type, kg), tireMesh(type), freeMesh(m), sfx, att(x,z), crumbs(pos) }
  constructor(host) {
    this.host = host; this.list = [];
    const bp = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.bpMat = { ok: bp(0x46b4ff, 0.42), bad: bp(0xff3b30, 0.42), del: bp(0xff8a1e, 0.5) };
    const pv = buildShredder(); const ms = []; pv.traverse(o => { if (o.isMesh) { o.material = this.bpMat.ok; o.castShadow = false; o.renderOrder = 5; ms.push(o); } });
    pv.userData.ms = ms; pv.visible = false; host.scene.add(pv); this.preview = pv;
  }
  static footprint(gx, gz) { const c = cellCenter(gx, gz); return { x0: c.x - 0.95, x1: c.x + 0.95, z0: c.z - 0.95, z1: c.z + 0.95 }; }
  at(gx, gz) { return this.list.find(s => s.gx === gx && s.gz === gz) || null; }
  hit(x, z, pad = 0) { for (const s of this.list) { const f = ShredWorld.footprint(s.gx, s.gz); if (x > f.x0 + 0.08 - pad && x < f.x1 - 0.08 + pad && z > f.z0 + 0.08 - pad && z < f.z1 - 0.08 + pad) return s; } return null; }
  serialize() { return this.list.map(s => ({ gx: s.gx, gz: s.gz, rot: s.rot, kg: Math.round(s.kg * 10) / 10 })); }
  count() { return this.list.length; }
  transit() { const out = []; for (const s of this.list) for (const t of s.queue) out.push(t); return out; }
  add(gx, gz, rot = 0, kg = 0, pop = true) {
    if (this.at(gx, gz)) return null;
    const c = cellCenter(gx, gz), g = buildShredder(); g.position.set(c.x, 0, c.z); g.rotation.y = -rot * Math.PI / 2; this.host.scene.add(g);
    const s = { type: 'shredder', gx, gz, rot: ((rot % 4) + 4) % 4, x: c.x, z: c.z, g, queue: [], inbound: 0, chew: 0, kg, done: 0, chewing: null, pop: pop ? 0 : null };
    this.list.push(s); this.setSack(s); if (pop) g.scale.setScalar(0.01); return s;
  }
  remove(s) { const i = this.list.indexOf(s); if (i < 0) return null; this.list.splice(i, 1); this.host.scene.remove(s.g); if (s.chewing) { this.host.freeMesh(s.chewing.mesh); } const types = s.queue.slice(); s.queue = []; return types; }
  load(list) { for (const s of this.list.slice()) this.remove(s); for (const q of list || []) this.add(q.gx, q.gz, q.rot, q.kg || 0, false); }
  // where tires are thrown in (world)
  hopperPos(s, out = new THREE.Vector3()) { s.g.updateMatrixWorld(true); return s.g.localToWorld(out.set(HX, 1.75, 0)); }
  accepts(s, n = 1) { return s.queue.length + s.inbound + n <= SHRED.QUEUE; }
  feed(s, type) { s.queue.push(type); }
  setSack(s) { const U = s.g.userData, f = (s.kg % SHRED.SACK) / SHRED.SACK; U.sack.scale.y = 0.18 + f * 0.62; U.sack.position.y = 0.22 + U.sack.scale.y / 2; U.crumbs.position.set(0.68, 0.23 + U.sack.scale.y, 0); }
  showPreview(gx, gz, rot, state) {
    const pv = this.preview; if (gx == null) { pv.visible = false; return; }
    const c = cellCenter(gx, gz); pv.visible = true; pv.position.set(c.x, 0.004, c.z); pv.rotation.y = -rot * Math.PI / 2;
    const mm = this.bpMat[state]; mm.opacity = 0.34 + Math.sin(performance.now() / 180) * 0.08; pv.userData.ms.forEach(m => m.material = mm);
  }
  update(dt) {
    const H = this.host;
    for (const s of this.list) {
      const U = s.g.userData;
      if (s.pop != null) { s.pop = Math.min(1, s.pop + dt * 4); const k = s.pop; s.g.scale.setScalar(k >= 1 ? 1 : Math.max(0.01, k * (1 + Math.sin(k * Math.PI) * 0.12))); if (k >= 1) s.pop = null; }
      const busy = s.queue.length > 0 || !!s.chewing;
      const w = busy ? 7 : 0.6; U.shafts[0].rotation.z += dt * w; U.shafts[1].rotation.z -= dt * w;
      U.beacon.rotation.y += dt * (busy ? 9 : 0); U.beacon.material.emissiveIntensity = busy ? 1.6 + Math.sin(performance.now() / 70) * 0.8 : 0.25;
      if (!s.chewing && s.queue.length) {
        const type = s.queue[0], mesh = H.tireMesh(type); s.chewing = { type, mesh, base: mesh.scale.clone() }; s.chew = 0;
        H.sfx.shred && H.sfx.shred(H.att(s.x, s.z));
      }
      if (s.chewing) {
        s.chew += dt; const k = Math.min(1, s.chew / SHRED.CHEW_T), C = s.chewing, m = C.mesh;
        this.hopperPos(s, m.position); m.position.y = 1.78 - k * 0.45;
        m.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2 + Math.sin(s.chew * 30) * 0.08, s.g.rotation.y, 0, 'YXZ'));
        m.scale.copy(C.base).multiplyScalar(1 - k * 0.55);
        s.g.position.y = Math.sin(s.chew * 60) * 0.006;
        if (k >= 1) {
          s.queue.shift(); m.scale.copy(C.base); H.freeMesh(m); s.chewing = null; s.g.position.y = 0;
          const kg = shredKg(C.type); s.kg += kg; s.done++; this.setSack(s);
          H.onShred(s, C.type, kg);
        }
      }
    }
  }
}
