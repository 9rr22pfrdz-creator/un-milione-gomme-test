// Bracci meccanici: heavy orange hydraulic arms on bolted steel pedestals. Placed on the 2 m build grid (like the belts),
// they pick real tires off the mountain (1-3 per swing), swing round and drop them on a belt, into the vehicle or the rack.
// 3D + animation here; the game (main.js) provides the world through `host` callbacks.
import * as THREE from 'three';
import { merge, M, box, cyl, cvs } from './gfx.js';
import { cellCenter } from './beltlogic.js';

export const ARM_COST = 900;      // € per placed arm (100% back when dismantled); how many = the "Bracci" upgrade level
export const ARM_REACH = 3.3;     // m from the pedestal centre: where the claw can pick and drop
const PED_H = 0.5, SH_Y = 1.18, L1 = 1.8, L2 = 1.62, CLAW = 0.5;

function paintTexture(base, rust = 0.1) {
  const [c, x] = cvs(256, 256); x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { const a = Math.random() * 0.16; x.fillStyle = Math.random() < 0.55 ? `rgba(0,0,0,${a})` : `rgba(255,236,210,${a * 0.6})`; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(70,40,20,${rust * (0.4 + Math.random())})`; x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 18, 2 + Math.random() * 7, Math.random() * 3, 0, 7); x.fill(); }
  for (let i = 0; i < 8; i++) { x.strokeStyle = `rgba(40,30,20,${0.08 + Math.random() * 0.1})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const sx = Math.random() * 256; x.moveTo(sx, 0); x.lineTo(sx + (Math.random() - 0.5) * 30, 256); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function hazard() {
  const [c, x] = cvs(128, 32); x.fillStyle = '#e2a91e'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#161616';
  for (let i = -32; i < 160; i += 32) { x.beginPath(); x.moveTo(i, 32); x.lineTo(i + 16, 32); x.lineTo(i + 32, 0); x.lineTo(i + 16, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
}
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    orange: new THREE.MeshStandardMaterial({ map: paintTexture('#e86a12', 0.12), roughness: 0.48, metalness: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ map: paintTexture('#33383d', 0.05), roughness: 0.55, metalness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.6, metalness: 0.3 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.16, metalness: 1 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazard(), roughness: 0.6 }),
    hose: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.85 }),
  };
  return MATS;
}
// geometry, built once and shared by every arm (each part in its own local frame)
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const G = {};
  { // pedestal: bolted base plate + square column + hazard band
    const st = [], hz = [], bl = [];
    st.push([box(1.24, 0.07, 1.24), M(0, 0.035, 0)], [box(0.92, PED_H - 0.07, 0.92), M(0, 0.07 + (PED_H - 0.07) / 2, 0)], [box(1.0, 0.06, 1.0), M(0, PED_H - 0.03, 0)]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { bl.push([cyl(0.035, 0.035, 0.05, 6), M(sx * 0.54, 0.09, sz * 0.54)]); st.push([box(0.06, 0.26, 0.2), M(sx * 0.49, 0.2, sz * 0.3)], [box(0.2, 0.26, 0.06), M(sx * 0.3, 0.2, sz * 0.49)]); }
    hz.push([box(0.94, 0.08, 0.94), M(0, 0.18, 0)]);
    G.ped = { steel: merge(st), hazard: merge(hz), black: merge(bl) };
  }
  { // turntable + shoulder cheeks + motor housing (in the yaw frame, y from the pedestal top)
    const or = [], bl = [], st = [];
    or.push([cyl(0.5, 0.54, 0.22, 24), M(0, 0.11, 0)]);
    bl.push([cyl(0.56, 0.56, 0.05, 24), M(0, 0.02, 0)]);
    for (const s of [1, -1]) or.push([box(0.5, 0.62, 0.08), M(0.02, 0.5, s * 0.2)]);
    or.push([box(0.46, 0.34, 0.34), M(-0.42, 0.36, 0)]); bl.push([box(0.12, 0.26, 0.3), M(-0.66, 0.36, 0)]);
    for (let i = 0; i < 5; i++) bl.push([box(0.012, 0.22, 0.3), M(-0.64 + 0.0, 0.36, 0, 0, 0, 0)]); // fins
    bl.push([cyl(0.15, 0.15, 0.56, 16), M(0, SH_Y - PED_H, 0, Math.PI / 2)]);
    st.push([cyl(0.07, 0.07, 0.6, 10), M(0, SH_Y - PED_H, 0, Math.PI / 2)]);
    // base of the lift cylinder
    bl.push([cyl(0.07, 0.07, 0.16, 10), M(0.28, 0.3, 0, Math.PI / 2)]);
    G.yaw = { orange: merge(or), black: merge(bl), chrome: merge(st) };
  }
  { // boom along +x, length L1 (box beam with a top web + lift ram)
    const or = [], bl = [], ch = [], hs = [];
    or.push([box(L1 - 0.1, 0.3, 0.26), M(L1 / 2, 0, 0)], [box(L1 * 0.6, 0.08, 0.3), M(L1 * 0.45, 0.17, 0)]);
    bl.push([cyl(0.13, 0.13, 0.4, 16), M(L1, 0, 0, Math.PI / 2)]);
    // hydraulic ram under the boom: black barrel + chrome rod
    bl.push([cyl(0.065, 0.065, 0.72, 12), M(0.55, -0.24, 0, 0, 0, Math.PI / 2 - 0.12)]);
    ch.push([cyl(0.035, 0.035, 0.5, 10), M(1.1, -0.2, 0, 0, 0, Math.PI / 2 - 0.12)]);
    bl.push([box(0.12, 0.12, 0.12), M(1.32, -0.17, 0)]);
    // hoses along the side
    for (const s of [1, -1]) hs.push([cyl(0.022, 0.022, L1 - 0.3, 6), M(L1 / 2, 0.08, s * 0.15, 0, 0, Math.PI / 2)]);
    G.boom = { orange: merge(or), black: merge(bl), chrome: merge(ch), hose: merge(hs) };
  }
  { // forearm along +x, length L2
    const or = [], bl = [], ch = [];
    or.push([box(L2 - 0.08, 0.22, 0.2), M(L2 / 2, 0, 0)]);
    bl.push([cyl(0.1, 0.1, 0.3, 14), M(L2, 0, 0, Math.PI / 2)]);
    bl.push([cyl(0.05, 0.05, 0.6, 10), M(0.45, 0.18, 0, 0, 0, Math.PI / 2)]); ch.push([cyl(0.028, 0.028, 0.42, 8), M(0.95, 0.18, 0, 0, 0, Math.PI / 2)]);
    or.push([box(0.3, 0.12, 0.22), M(0.15, 0.14, 0)]);
    G.fore = { orange: merge(or), black: merge(bl), chrome: merge(ch) };
  }
  { // wrist + claw body pointing along +x (the wrist frame points down)
    const bl = [], or = [], st = [];
    bl.push([cyl(0.09, 0.09, 0.14, 12), M(0.08, 0, 0, 0, 0, Math.PI / 2)]);
    or.push([box(0.12, 0.26, 0.26), M(0.2, 0, 0)]);
    st.push([cyl(0.15, 0.15, 0.05, 16), M(0.28, 0, 0, 0, 0, Math.PI / 2)]);
    G.wrist = { black: merge(bl), orange: merge(or), steel: merge(st) };
    // one finger (rotates open/closed about its root at x = 0)
    const f = [[box(0.24, 0.05, 0.07), M(0.12, 0, 0)], [box(0.05, 0.16, 0.07), M(0.22, -0.06, 0)]];
    G.finger = merge(f);
  }
  GEO = G; return G;
}
function meshes(parent, set, M8, shadow = true) {
  for (const k in set) { const m = new THREE.Mesh(set[k], M8[k]); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); }
}
// a complete arm (posable). Returns the root group with userData.rig
export function buildArm() {
  const G = geos(), MT = mats();
  const root = new THREE.Group();
  meshes(root, G.ped, MT);
  const yaw = new THREE.Group(); yaw.position.y = PED_H; root.add(yaw); meshes(yaw, G.yaw, MT);
  const shoulder = new THREE.Group(); shoulder.position.y = SH_Y - PED_H; yaw.add(shoulder);
  const boom = new THREE.Group(); shoulder.add(boom); meshes(boom, G.boom, MT);
  const elbow = new THREE.Group(); elbow.position.x = L1; boom.add(elbow);
  const fore = new THREE.Group(); elbow.add(fore); meshes(fore, G.fore, MT);
  const wrist = new THREE.Group(); wrist.position.x = L2; fore.add(wrist); meshes(wrist, G.wrist, MT);
  const fingers = [];
  for (let i = 0; i < 3; i++) {
    const hub = new THREE.Group(); hub.position.x = 0.3; hub.rotation.x = i * Math.PI * 2 / 3; wrist.add(hub);
    const f = new THREE.Group(); f.position.y = 0.11; hub.add(f);
    const m = new THREE.Mesh(G.finger, MT.black); m.castShadow = true; f.add(m); fingers.push(f);
  }
  const tip = new THREE.Object3D(); tip.position.x = CLAW; wrist.add(tip);
  root.userData.rig = { yaw, boom, fore, wrist, fingers, tip };
  return root;
}
export function poseArm(rig, p) {
  rig.yaw.rotation.y = p.yaw; rig.boom.rotation.z = p.a1; rig.fore.rotation.z = p.a2; rig.wrist.rotation.z = -Math.PI / 2 - (p.a1 + p.a2);
  for (const f of rig.fingers) f.rotation.z = -0.12 + (p.open ?? 0.5) * 0.62; // open = fingers spread outward
  rig.wrist.rotation.x = p.spin || 0;
}
// inverse kinematics: base at (bx, bz), claw tip at world (x, y, z) -> {yaw, a1, a2}
export function solveIK(bx, bz, x, y, z) {
  const dx = x - bx, dz = z - bz, r = Math.max(0.35, Math.hypot(dx, dz)), h = (y + CLAW + 0.04) - SH_Y;
  const yaw = Math.atan2(-dz, dx);
  const d = Math.min(L1 + L2 - 0.02, Math.max(0.4, Math.hypot(r, h)));
  const ce = Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2))), e = Math.acos(ce);
  const base = Math.atan2(h, r) * (Math.hypot(r, h) > d ? 1 : 1);
  const a1 = base + Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e));
  return { yaw, a1, a2: -e };
}
const REST = { yaw: 0, a1: 1.05, a2: -1.9, open: 0.6 };
const ease = k => k * k * (3 - 2 * k);
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };

export class ArmWorld {
  // host: { scene, source(arm) -> {x,y,z}|null, dest(arm, n) -> target|null, take(arm, at, n) -> [types],
  //         release(arm, type, pos, target) -> bool, tireMesh(type), freeMesh(m), sfx, att(x,z) }
  constructor(host) {
    this.host = host; this.list = []; this.speed = 1; this.grab = 1;
    const MT = mats();
    // blueprint preview: the whole arm in rest pose, glowing, + a ring showing the reach
    const bp = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.bpMat = { ok: bp(0x46b4ff, 0.42), bad: bp(0xff3b30, 0.42), del: bp(0xff8a1e, 0.5) };
    this.bpEdge = { ok: new THREE.LineBasicMaterial({ color: 0xb8e6ff, transparent: true, opacity: 0.9, fog: false }), bad: new THREE.LineBasicMaterial({ color: 0xffb0aa, transparent: true, opacity: 0.9, fog: false }), del: new THREE.LineBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0.9, fog: false }) };
    const pv = buildArm(); poseArm(pv.userData.rig, { ...REST, yaw: 0 });
    const ms = [], es = [];
    pv.traverse(o => { if (o.isMesh) { o.material = this.bpMat.ok; o.castShadow = false; o.renderOrder = 5; ms.push(o); } });
    for (const m of ms) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 35), this.bpEdge.ok); e.renderOrder = 6; m.add(e); es.push(e); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(ARM_REACH - 0.06, ARM_REACH + 0.06, 64), bp(0x46b4ff, 0.6)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; pv.add(ring);
    pv.userData.ms = ms; pv.userData.es = es; pv.userData.ring = ring; pv.visible = false; host.scene.add(pv); this.preview = pv;
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  static footprint(gx, gz) { const c = cellCenter(gx, gz); return { x0: c.x - 0.65, x1: c.x + 0.65, z0: c.z - 0.65, z1: c.z + 0.65 }; }
  at(gx, gz) { return this.list.find(a => a.gx === gx && a.gz === gz) || null; }
  hit(x, z, pad = 0) { for (const a of this.list) { const f = ArmWorld.footprint(a.gx, a.gz); if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad) return a; } return null; }
  serialize() { return this.list.map(a => ({ gx: a.gx, gz: a.gz, rot: a.rot })); }
  add(gx, gz, rot = 0, pop = true) {
    if (this.at(gx, gz)) return null;
    const c = cellCenter(gx, gz), g = buildArm(); g.position.set(c.x, 0, c.z); this.host.scene.add(g);
    const yaw0 = -rot * Math.PI / 2;
    const a = { type: 'arm', gx, gz, rot: ((rot % 4) + 4) % 4, x: c.x, z: c.z, g, rig: g.userData.rig, state: 'idle', t: 0.3 + Math.random() * 0.4, pose: { ...REST, yaw: yaw0 }, from: null, to: null, held: [], target: null, dest: null, cycles: 0, pop: pop ? 0 : null, wait: 0 };
    poseArm(a.rig, a.pose); if (pop) g.scale.setScalar(0.01);
    this.list.push(a); return a;
  }
  remove(a) { const i = this.list.indexOf(a); if (i < 0) return null; this.list.splice(i, 1); this.host.scene.remove(a.g); for (const h of a.held) this.host.freeMesh(h.mesh); const types = a.held.map(h => h.type); a.held = []; return types; }
  load(list) { for (const a of this.list.slice()) this.remove(a); for (const q of list || []) this.add(q.gx, q.gz, q.rot, false); }
  transit() { const out = []; for (const a of this.list) for (const h of a.held) out.push(h.type); return out; }
  count() { return this.list.length; }
  showPreview(gx, gz, rot, state) {
    const pv = this.preview; if (gx == null) { pv.visible = false; return; }
    const c = cellCenter(gx, gz); pv.visible = true; pv.position.set(c.x, 0.004, c.z); pv.userData.rig.yaw.rotation.y = -rot * Math.PI / 2;
    const mm = this.bpMat[state]; mm.opacity = 0.34 + Math.sin(performance.now() / 180) * 0.08;
    pv.userData.ms.forEach(m => m.material = mm); pv.userData.es.forEach(e => e.material = this.bpEdge[state]);
    pv.userData.ring.material.color.setHex(state === 'bad' ? 0xff3b30 : state === 'del' ? 0xff8a1e : 0x46b4ff);
  }
  // move to a pose over `dur` seconds
  go(a, to, dur, state) { a.from = { ...a.pose }; a.to = { ...a.pose, ...to }; a.dur = Math.max(0.05, dur); a.t = 0; a.state = state; }
  tipPos(a, out) { a.g.updateMatrixWorld(true); return a.rig.tip.getWorldPosition(out); }
  update(dt) {
    const H = this.host, sp = this.speed;
    for (const a of this.list) {
      if (a.pop != null) { a.pop = Math.min(1, a.pop + dt * 4); const k = a.pop; a.g.scale.setScalar(k >= 1 ? 1 : Math.max(0.01, k * (1 + Math.sin(k * Math.PI) * 0.12))); if (k >= 1) a.pop = null; }
      a.t += dt;
      if (a.to) { const k = Math.min(1, a.t / a.dur), e = ease(k); a.pose.yaw = angLerp(a.from.yaw, a.to.yaw, e); a.pose.a1 = a.from.a1 + (a.to.a1 - a.from.a1) * e; a.pose.a2 = a.from.a2 + (a.to.a2 - a.from.a2) * e; a.pose.open = a.from.open + (a.to.open - a.from.open) * e; }
      const done = !a.to || a.t >= a.dur;
      switch (a.state) {
        case 'idle': {
          if (a.t < (a.idleFor || 0.4)) break;
          const n = this.grab, src = H.source(a), dst = src && H.dest(a, n);
          if (!src || !dst) { a.idleFor = 0.8; a.t = 0; a.status = !src ? 'nomountain' : 'nodest'; break; }
          a.status = 'ok'; a.target = src;
          const ik = solveIK(a.x, a.z, src.x, src.y + 0.05, src.z);
          this.go(a, { ...ik, open: 1 }, 0.75 / sp, 'reach'); H.sfx.servo && H.sfx.servo(H.att(a.x, a.z) * 0.8, 0.7 / sp);
          break;
        }
        case 'reach': if (done) { this.go(a, { open: 0 }, 0.22 / sp, 'grip'); } break;
        case 'grip': if (done) {
          const types = H.take(a, a.target, this.grab);
          if (!types.length) { this.go(a, { ...REST, yaw: a.pose.yaw }, 0.4 / sp, 'back'); break; }
          H.sfx.clack && H.sfx.clack(H.att(a.x, a.z), true);
          a.held = types.map(type => ({ type, mesh: H.tireMesh(type) }));
          const up = solveIK(a.x, a.z, a.target.x, a.target.y + 1.1, a.target.z);
          this.go(a, { ...up, open: 0 }, 0.35 / sp, 'lift');
        } break;
        case 'lift': if (done) this.toDest(a); break;
        case 'wait': if (a.t > 0.3) this.toDest(a); break;
        case 'swing': if (done) { a.state = 'drop'; a.t = 0; a.to = null; a.dropT = 0; } break;
        case 'drop': {
          a.dropT -= dt; if (a.dropT > 0) break;
          if (!a.held.length) { this.go(a, { ...REST, yaw: a.pose.yaw, open: 0.6 }, 0.45 / sp, 'back'); a.cycles++; break; }
          const h = a.held[0], p = this.tipPos(a, new THREE.Vector3()); p.y -= 0.12;
          if (H.release(a, h.type, p, a.dest)) {
            a.held.shift(); H.freeMesh(h.mesh); a.pose.open = 1; a.delivered = (a.delivered || 0) + 1; H.sfx.clack && H.sfx.clack(H.att(a.x, a.z) * 0.8, false); a.dropT = 0.16 / sp;
          } else { a.dropT = 0.15; a.stuck = (a.stuck || 0) + 0.15; if (a.stuck > 1.2) { a.stuck = 0; this.toDest(a); } }
          break;
        }
        case 'back': if (done) { a.state = 'idle'; a.t = 0; a.to = null; a.idleFor = 0.12 / sp; } break;
      }
      poseArm(a.rig, a.pose);
      // the held tires hang from the claw, stacked
      if (a.held.length) { a.g.updateMatrixWorld(true); const p = a.rig.tip.getWorldPosition(this._v); a.rig.tip.getWorldQuaternion(this._q);
        a.held.forEach((h, i) => { h.mesh.position.set(p.x, p.y - 0.06 - i * 0.2, p.z); h.mesh.quaternion.set(0, 0, 0, 1); h.mesh.rotateY(a.pose.yaw + i * 0.7); }); }
    }
  }
  toDest(a) {
    const H = this.host, d = H.dest(a, a.held.length || 1);
    if (!d) { a.state = 'wait'; a.t = 0; a.to = null; a.status = 'nodest'; return; }
    a.dest = d; a.stuck = 0;
    const ik = solveIK(a.x, a.z, d.x, d.y + 0.25 + a.held.length * 0.2, d.z);
    this.go(a, { ...ik, open: 0 }, 0.8 / this.speed, 'swing'); H.sfx.servo && H.sfx.servo(H.att(a.x, a.z), 0.8 / this.speed);
  }
}
export { REST };
