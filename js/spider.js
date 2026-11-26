// Fase 7: il braccio a ragno. A heavy hexagonal steel turret with a rotating amber beacon and four independent
// articulated orange arms radiating around it like a spider. Each arm runs its own staggered cycle: the arms that
// reach the mountain grab tires and feed whatever is in reach (belts, the vehicle, a shredder, the rack); the ones
// that can't reach a destination drop them in the central hopper, where the arms on the far side pick them up.
// Placed with the blueprint (piece 8). 3D + logic here; the world comes from main.js through `host`.
import * as THREE from 'three';
import { merge, M, box, cyl, cvs } from './gfx.js';
import { cellCenter } from './beltlogic.js';
import { ArmWorld, REST } from './arms.js';
import { weathered, hazardTex } from './pulley.js';

export const SPIDER = { COST: 4000, HALF: 1.75, LIMB_R: 1.12, HOP_Y: 1.95, HOP_MAX: 4 };
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    steel: new THREE.MeshStandardMaterial({ map: weathered('#3a3f44', 0.08), roughness: 0.55, metalness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.6, metalness: 0.4 }),
    orange: new THREE.MeshStandardMaterial({ map: weathered('#e86a12', 0.1), roughness: 0.5, metalness: 0.25 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTex(10), roughness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.16, metalness: 1 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff8a00, emissiveIntensity: 1.6, transparent: true, opacity: 0.88, roughness: 0.2 }),
    beam: new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  };
  return MATS;
}
const hex = (r, h, y, open = false) => { const g = new THREE.CylinderGeometry(r, r, h, 6, 1, open); g.rotateY(Math.PI / 6); g.translate(0, y + h / 2, 0); return g; };
export function buildTurret() {
  const MT = mats(), g = new THREE.Group();
  const st = [hex(1.75, 0.22, 0), hex(1.55, 0.7, 0.25), hex(1.62, 0.08, 0.95), hex(0.78, 0.7, 1.03)];
  const dk = [hex(1.8, 0.04, 0.0), hex(0.84, 0.06, 1.7)];
  for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; dk.push(new THREE.BoxGeometry(0.1, 0.5, 0.36).translate(Math.cos(a) * 1.5, 0.6, Math.sin(a) * 1.5)); } // access panels / ribs
  const sm = new THREE.Mesh(merge(st.map(x => [x, new THREE.Matrix4()])), MT.steel); sm.castShadow = sm.receiveShadow = true; g.add(sm);
  const dm = new THREE.Mesh(merge(dk.map(x => [x, new THREE.Matrix4()])), MT.dark); dm.castShadow = true; g.add(dm);
  const hz = new THREE.Mesh(hex(1.57, 0.12, 0.3, true), MT.hazard); g.add(hz);
  const hz2 = new THREE.Mesh(hex(0.8, 0.1, 1.55, true), MT.hazard); g.add(hz2);
  // the central hopper bowl
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.42, 0.34, 6, 1, true), new THREE.MeshStandardMaterial({ map: MT.orange.map, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }));
  bowl.position.y = 1.73 + 0.17; bowl.castShadow = true; g.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.04, 6, 6), MT.dark); rim.rotation.x = Math.PI / 2; rim.position.y = 2.07; g.add(rim);
  // amber beacon on a short mast at the back of the core
  const mast = new THREE.Mesh(cyl(0.05, 0.06, 0.75, 8), MT.dark); mast.position.set(-0.62, 2.05, 0); g.add(mast);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), MT.amber); cap.position.set(-0.62, 2.43, 0); g.add(cap);
  const base = new THREE.Mesh(cyl(0.16, 0.16, 0.06, 14), MT.dark); base.position.set(-0.62, 2.42, 0); g.add(base);
  const rot = new THREE.Group(); rot.position.set(-0.62, 2.5, 0); g.add(rot);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 16, 1, true), MT.beam); beam.rotation.z = Math.PI / 2; beam.position.x = 1.3; rot.add(beam);
  // big bolts on the skid
  const bl = []; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; bl.push([cyl(0.05, 0.05, 0.06, 6), M(Math.cos(a) * 1.62, 0.25, Math.sin(a) * 1.62)]); }
  g.add(new THREE.Mesh(merge(bl), MT.chrome));
  g.userData = { rot, beam };
  return g;
}

export class SpiderWorld {
  // host: like ArmWorld's ({ scene, sfx, att, tireMesh, freeMesh, source(limb), take(limb, at, n), dest(limb, n), release(limb, type, pos, d) })
  constructor(host) {
    this.host = host; this.list = []; this.speed = 1.6; this.grab = 2; this.halted = false;
    this.limbs = new ArmWorld({ scene: host.scene, sfx: host.sfx, att: host.att, tireMesh: host.tireMesh, freeMesh: host.freeMesh,
      source: l => this.source(l), take: (l, at, n) => this.take(l, at, n), dest: (l, n) => this.dest(l, n), release: (l, type, pos, d) => this.release(l, type, pos, d) });
    // blueprint ghost
    const bp = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.bpMat = { ok: bp(0x46b4ff, 0.4), bad: bp(0xff3b30, 0.4), del: bp(0xff8a1e, 0.5) };
    const pv = buildTurret(); const ms = []; pv.traverse(o => { if (o.isMesh) { o.material = this.bpMat.ok; o.castShadow = false; o.renderOrder = 5; ms.push(o); } });
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 0.24), this.bpMat.ok); leg.position.set(Math.cos(a) * 2.2, 1.4, -Math.sin(a) * 2.2); leg.rotation.y = a; leg.rotation.z = 0.35; pv.add(leg); ms.push(leg); }
    pv.userData.ms = ms; pv.visible = false; host.scene.add(pv); this.preview = pv;
  }
  static footprint(gx, gz) { const c = cellCenter(gx, gz), h = SPIDER.HALF; return { x0: c.x - h, x1: c.x + h, z0: c.z - h, z1: c.z + h }; }
  at(gx, gz) { return this.list.find(s => s.gx === gx && s.gz === gz) || null; }
  hit(x, z, pad = 0) { for (const s of this.list) if (Math.hypot(x - s.x, z - s.z) < SPIDER.HALF - 0.05 + pad) return s; return null; }
  serialize() { return this.list.map(s => ({ gx: s.gx, gz: s.gz })); }
  count() { return this.list.length; }
  add(gx, gz, pop = true) {
    if (this.at(gx, gz)) return null;
    const c = cellCenter(gx, gz), g = buildTurret(); g.position.set(c.x, 0, c.z); this.host.scene.add(g);
    const s = { type: 'spider', gx, gz, x: c.x, z: c.z, g, limbs: [], hop: [], hopMeshes: [], pop: pop ? 0 : null, delivered: 0 };
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; s.limbs.push(this.limbs.addFree(c.x + Math.cos(a) * SPIDER.LIMB_R, c.z - Math.sin(a) * SPIDER.LIMB_R, a, { spider: s, k, t: k * 0.45 })); }
    if (pop) { g.scale.setScalar(0.01); for (const l of s.limbs) l.g.scale.setScalar(0.01); }
    this.list.push(s); return s;
  }
  remove(s) {
    const i = this.list.indexOf(s); if (i < 0) return null; this.list.splice(i, 1); this.host.scene.remove(s.g);
    let types = s.hop.slice(); s.hop = []; this.syncHop(s);
    for (const l of s.limbs) types = types.concat(this.limbs.remove(l) || []);
    return types;
  }
  load(list) { for (const s of this.list.slice()) this.remove(s); for (const q of list || []) this.add(q.gx, q.gz, false); }
  transit() { const out = []; for (const s of this.list) { out.push(...s.hop); for (const l of s.limbs) for (const h of l.held) out.push(h.type); } return out; }
  // the finale: let go of everything (the game counts it), arms back to rest
  dropAll() { const out = []; for (const s of this.list) { out.push(...s.hop); s.hop = []; this.syncHop(s); for (const l of s.limbs) { for (const h of l.held) { out.push(h.type); this.host.freeMesh(h.mesh); } l.held = []; this.limbs.go(l, { ...REST, yaw: l.pose.yaw }, 1.2, 'back'); } } return out; }
  delivered() { let n = 0; for (const s of this.list) for (const l of s.limbs) n += l.delivered || 0; return n; }
  source(l) {
    if (this.halted) return null;
    const s = l.spider;
    // the hopper is a relay: an arm that can deliver somewhere real empties it first
    if (s.hop.length && this.host.dest(l, Math.min(this.grab, s.hop.length))) { l.spSrc = 'h'; return { x: s.x, y: SPIDER.HOP_Y - 0.12, z: s.z }; }
    const m = this.host.source(l);
    if (m) { l.spSrc = 'm'; return m; }
    if (s.hop.length) { l.spSrc = 'h'; return { x: s.x, y: SPIDER.HOP_Y - 0.12, z: s.z }; }
    l.spSrc = null; return null;
  }
  take(l, at, n) {
    if (l.spSrc === 'h') { const s = l.spider, out = s.hop.splice(Math.max(0, s.hop.length - n), n); this.syncHop(s); return out; }
    return this.host.take(l, at, n);
  }
  dest(l, n) {
    const real = this.host.dest(l, n); if (real) return real;
    const s = l.spider; if (l.spSrc === 'm' && s.hop.length + n <= SPIDER.HOP_MAX) return { kind: 'hop', x: s.x, y: SPIDER.HOP_Y + 0.05, z: s.z };
    return null;
  }
  release(l, type, pos, d) {
    if (d.kind === 'hop') { const s = l.spider; if (s.hop.length >= SPIDER.HOP_MAX) return false; s.hop.push(type); this.syncHop(s); return true; }
    const ok = this.host.release(l, type, pos, d); if (ok) l.spider.delivered++; return ok;
  }
  syncHop(s) {
    for (const m of s.hopMeshes) this.host.freeMesh(m); s.hopMeshes = [];
    s.hop.forEach((type, i) => { const m = this.host.tireMesh(type); m.position.set(s.x + (i % 2 ? 0.08 : -0.08), SPIDER.HOP_Y - 0.08 + i * 0.12, s.z + (i % 3 - 1) * 0.06); m.quaternion.set(0, 0, 0, 1); m.rotateY(i * 1.1); s.hopMeshes.push(m); });
  }
  showPreview(gx, gz, state) {
    const pv = this.preview; if (gx == null) { pv.visible = false; return; }
    const c = cellCenter(gx, gz); pv.visible = true; pv.position.set(c.x, 0.004, c.z);
    const mm = this.bpMat[state]; mm.opacity = 0.32 + Math.sin(performance.now() / 180) * 0.08; pv.userData.ms.forEach(m => m.material = mm);
  }
  update(dt) {
    for (const s of this.list) {
      if (s.pop != null) { s.pop = Math.min(1, s.pop + dt * 3); const k = s.pop, sc = k >= 1 ? 1 : Math.max(0.01, k * (1 + Math.sin(k * Math.PI) * 0.1)); s.g.scale.setScalar(sc); for (const l of s.limbs) l.g.scale.setScalar(sc); if (k >= 1) s.pop = null; }
      const busy = !this.halted && s.limbs.some(l => l.state !== 'idle' || l.held.length);
      s.g.userData.rot.rotation.y += dt * (busy ? 5 : 0); s.g.userData.beam.visible = busy;
    }
    // halted (the finale): source() returns nothing, so the arms ease back to rest and stay there
    this.limbs.speed = this.speed; this.limbs.grab = this.grab; this.limbs.update(dt);
  }
}
