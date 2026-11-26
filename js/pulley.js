// Carrucola magnetica: two weathered steel lattice pylons + a taut steel cable over the yard. A motorised trolley runs on
// the cable; at the pick end it lowers a heavy electromagnet that snaps up a cluster of 4-10 tires (thanks to their steel
// belts), carries it across and drops it into the vehicle / onto a belt / into a shredder, the rack or the fascioni cutter.
// Placed in 2 clicks (pylon A, then pylon B) in build mode. 3D + animation here; main.js gives the world via `host`.
import * as THREE from 'three';
import { merge, M, box, cyl, cvs } from './gfx.js';
import { cellCenter } from './beltlogic.js';
import { PULLEY } from './fase5.js';

const { H, CABLE_Y, JIB } = PULLEY;
const TOP_Y = CABLE_Y - 0.62;     // magnet fully raised (its top under the trolley)
const ease = k => k * k * (3 - 2 * k);

export function weathered(base, rust = 0.15, w = 256) {
  const [c, x] = cvs(w, w); x.fillStyle = base; x.fillRect(0, 0, w, w);
  for (let i = 0; i < w * 10; i++) { const a = Math.random() * 0.18; x.fillStyle = Math.random() < 0.55 ? `rgba(0,0,0,${a})` : `rgba(255,240,220,${a * 0.5})`; x.fillRect(Math.random() * w, Math.random() * w, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(${110 + Math.random() * 40},${55 + Math.random() * 20},20,${rust * (0.4 + Math.random())})`; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * w, 2 + Math.random() * 16, 2 + Math.random() * 6, Math.random() * 3, 0, 7); x.fill(); }
  for (let i = 0; i < 10; i++) { x.strokeStyle = `rgba(90,50,20,${0.06 + Math.random() * 0.1})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const sx = Math.random() * w; x.moveTo(sx, Math.random() * w * 0.3); x.lineTo(sx + (Math.random() - 0.5) * 8, w); x.stroke(); } // rust streaks
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function hazardTex(rep = 3) {
  const [c, x] = cvs(128, 32); x.fillStyle = '#e2a91e'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#161616';
  for (let i = -32; i < 160; i += 32) { x.beginPath(); x.moveTo(i, 32); x.lineTo(i + 16, 32); x.lineTo(i + 32, 0); x.lineTo(i + 16, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, 1); return t;
}
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    steel: new THREE.MeshStandardMaterial({ map: weathered('#6f7a82', 0.22), roughness: 0.62, metalness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ map: weathered('#2b2f33', 0.06), roughness: 0.5, metalness: 0.7 }),
    concrete: new THREE.MeshStandardMaterial({ map: weathered('#a29b8f', 0.02), roughness: 0.95 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.35, metalness: 0.9 }),
    yellow: new THREE.MeshStandardMaterial({ map: weathered('#e2a91e', 0.1), roughness: 0.5, metalness: 0.3 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8692e, roughness: 0.32, metalness: 0.9 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTex(6), roughness: 0.6 }),
    led: new THREE.MeshStandardMaterial({ color: 0x18ff6a, emissive: 0x18ff6a, emissiveIntensity: 2.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.18, metalness: 1 }),
  };
  return MATS;
}
// a box beam from p0 to p1 (w x w section)
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _qq = new THREE.Quaternion();
function beam(p0, p1, w = 0.07, d = w) {
  _d.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); const L = _d.length(); _d.normalize(); _qq.setFromUnitVectors(_up, _d);
  return [box(w, L, d), new THREE.Matrix4().compose(new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2), _qq.clone(), new THREE.Vector3(1, 1, 1))];
}
// pylon geometry, local frame: +x toward the other pylon, the jib overhangs along -x at cable height
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const st = [], dk = [], cn = [], hz = [], ye = [];
  const b0 = 0.42, b1 = 0.24, legs = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const at = (sx, sz, y) => { const k = y / H, r = b0 + (b1 - b0) * k; return [sx * r, y, sz * r]; };
  for (const [sx, sz] of legs) st.push(beam(at(sx, sz, 0.25), at(sx, sz, H), 0.085));
  // X bracing on the 4 faces + horizontal rings
  const lv = [0.25, 1.15, 2.05, 2.95, 3.85, 4.75, 5.65, H];
  for (let i = 0; i < lv.length - 1; i++) for (let f = 0; f < 4; f++) {
    const [ax, az] = legs[f], [bx, bz] = legs[(f + 1) % 4];
    st.push(beam(at(ax, az, lv[i]), at(bx, bz, lv[i + 1]), 0.04), beam(at(bx, bz, lv[i]), at(ax, az, lv[i + 1]), 0.04), beam(at(ax, az, lv[i + 1]), at(bx, bz, lv[i + 1]), 0.05));
  }
  // footing, base plate, anchor bolts, hazard collar
  cn.push([box(1.25, 0.24, 1.25), M(0, 0.12, 0)]);
  dk.push([box(1.0, 0.04, 1.0), M(0, 0.26, 0)]);
  for (const [sx, sz] of legs) { dk.push([cyl(0.03, 0.03, 0.12, 6), M(sx * 0.4, 0.3, sz * 0.4)], [cyl(0.055, 0.055, 0.025, 6), M(sx * 0.4, 0.29, sz * 0.4)]); }
  hz.push([box(0.9, 0.22, 0.9), M(0, 0.5, 0)]);
  // head: cap plate + saddle with the pulley wheel (axis along z) + the jib along -x with its end wheel and a stay
  dk.push([box(0.62, 0.06, 0.62), M(0, H + 0.03, 0)]);
  st.push([box(0.1, 0.32, 0.36), M(0, H - 0.1, 0)]);
  st.push([box(JIB + 0.5, 0.16, 0.12), M(-JIB / 2 + 0.1, CABLE_Y - 0.02, 0)]);
  st.push(beam([-0.22, H - 1.45, 0], [-JIB + 0.15, CABLE_Y - 0.1, 0], 0.06));
  for (const s of [1, -1]) st.push([box(0.08, 0.36, 0.03), M(-JIB, CABLE_Y + 0.05, s * 0.1)]);
  ye.push([box(0.32, 0.3, 0.3), M(0.12, H - 0.42, 0.26)]); // winch motor housing
  dk.push([cyl(0.12, 0.12, 0.36, 12), M(0.12, H - 0.42, 0.26, Math.PI / 2)]);
  GEO = { steel: merge(st), dark: merge(dk), concrete: merge(cn), hazard: merge(hz), yellow: merge(ye), wheel: (() => { const w = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20); w.rotateX(Math.PI / 2); return w; })() };
  return GEO;
}
function addMeshes(parent, set, MT, keys) { for (const k of keys) { const m = new THREE.Mesh(set[k], MT[k]); m.castShadow = true; m.receiveShadow = true; parent.add(m); } }
export function buildPylon() {
  const G = geos(), MT = mats(), g = new THREE.Group();
  addMeshes(g, G, MT, ['steel', 'dark', 'concrete', 'hazard', 'yellow']);
  const w1 = new THREE.Mesh(G.wheel, MT.dark); w1.position.set(0, CABLE_Y + 0.02, 0); g.add(w1);
  const w2 = new THREE.Mesh(G.wheel, MT.dark); w2.position.set(-JIB, CABLE_Y + 0.02, 0); g.add(w2);
  g.userData.wheels = [w1, w2];
  return g;
}
function buildTrolley() {
  const MT = mats(), g = new THREE.Group();
  const body = new THREE.Mesh(merge([[box(0.7, 0.3, 0.34), M(0, -0.28, 0)], [box(0.5, 0.06, 0.4), M(0, -0.11, 0)]]), MT.yellow); body.castShadow = true; g.add(body);
  const dk = new THREE.Mesh(merge([[box(0.06, 0.24, 0.06), M(-0.24, -0.04, 0)], [box(0.06, 0.24, 0.06), M(0.24, -0.04, 0)], [box(0.3, 0.2, 0.22), M(0, -0.5, 0.0)], [cyl(0.09, 0.09, 0.4, 12), M(0, -0.28, 0.24, Math.PI / 2)]]), MT.dark); dk.castShadow = true; g.add(dk);
  const hz = new THREE.Mesh(box(0.72, 0.06, 0.36), MT.hazard); hz.position.y = -0.4; g.add(hz);
  const wg = new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14); wg.rotateX(Math.PI / 2);
  const wheels = [-0.24, 0.24].map(x => { const w = new THREE.Mesh(wg, MT.chrome); w.position.set(x, 0.06, 0); g.add(w); return w; });
  g.userData.wheels = wheels; return g;
}
function buildMagnet() {
  const MT = mats(), g = new THREE.Group();
  const disc = new THREE.Mesh(merge([[cyl(0.56, 0.58, 0.2, 28), M(0, -0.12, 0)], [cyl(0.46, 0.5, 0.06, 28), M(0, 0.01, 0)], [box(0.08, 0.2, 0.08), M(0, 0.12, 0)], [cyl(0.05, 0.05, 0.36, 8), M(0, 0.26, 0, 0, 0, Math.PI / 2)]]), MT.dark); disc.castShadow = true; g.add(disc);
  const coil = new THREE.Mesh(cyl(0.6, 0.6, 0.075, 28), MT.copper); coil.position.y = -0.1; g.add(coil);
  const hz = new THREE.Mesh(cyl(0.585, 0.6, 0.04, 28, 1, true), MT.hazard); hz.position.y = -0.2; g.add(hz);
  const ledMat = MT.led.clone(); const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), ledMat); led.position.set(0.3, 0.05, 0.3); g.add(led);
  const box2 = new THREE.Mesh(box(0.2, 0.1, 0.14), MT.yellow); box2.position.set(0.24, 0.05, -0.2); g.add(box2);
  g.userData.led = ledMat; return g;
}
const CLUSTER = [[0, 0, -0.36], [0.44, 0.1, -0.4], [-0.44, -0.1, -0.4], [0.1, 0.44, -0.42], [-0.1, -0.44, -0.42], [0.3, -0.3, -0.62], [-0.3, 0.3, -0.62], [0.32, 0.3, -0.66], [-0.3, -0.32, -0.66], [0, 0, -0.72]];

export class PulleyWorld {
  // host: { scene, source(line)->{x,y,z}|null, take(line, at, n)->[types], dest(line, n)->target|null,
  //         release(line, type, pos, target)->bool, tireMesh(type), freeMesh(m), sfx, att(x,z) }
  constructor(host) {
    this.host = host; this.list = []; this.speed = 1; this.grab = 4;
    const bp = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.bpMat = { ok: bp(0x46b4ff, 0.4), bad: bp(0xff3b30, 0.4), del: bp(0xff8a1e, 0.5) };
    const mk = () => { const p = buildPylon(); const ms = []; p.traverse(o => { if (o.isMesh) { o.material = this.bpMat.ok; o.castShadow = false; o.renderOrder = 5; ms.push(o); } }); p.userData.ms = ms; p.visible = false; host.scene.add(p); return p; };
    this.pvA = mk(); this.pvB = mk();
    this.pvCable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    this.pvCable.visible = false; this.pvCable.renderOrder = 6; host.scene.add(this.pvCable);
    const ring = (c) => { const r = new THREE.Mesh(new THREE.RingGeometry(PULLEY.PICK_R - 0.07, PULLEY.PICK_R + 0.07, 48), bp(c, 0.65)); r.rotation.x = -Math.PI / 2; r.visible = false; host.scene.add(r); return r; };
    this.pvPick = ring(0x46b4ff); this.pvDrop = ring(0x5cff8a);
    this._v = new THREE.Vector3();
  }
  static footprint(gx, gz) { const c = cellCenter(gx, gz); return { x0: c.x - 0.62, x1: c.x + 0.62, z0: c.z - 0.62, z1: c.z + 0.62 }; }
  // the line geometry: A/B pylon centres, u = unit A->B, the two jib tips, pick + drop points
  static geom(a, b, pick = 'a') {
    const A = cellCenter(a.gx, a.gz), B = cellCenter(b.gx, b.gz), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1, u = { x: dx / L, z: dz / L };
    const endA = { x: A.x - u.x * JIB, z: A.z - u.z * JIB }, endB = { x: B.x + u.x * JIB, z: B.z + u.z * JIB };
    const P = pick === 'a' ? { x: endA.x + u.x * 0.15, z: endA.z + u.z * 0.15 } : { x: endB.x - u.x * 0.15, z: endB.z - u.z * 0.15 };
    const D = pick === 'a' ? { x: endB.x - u.x * 0.15, z: endB.z - u.z * 0.15 } : { x: endA.x + u.x * 0.15, z: endA.z + u.z * 0.15 };
    return { A, B, u, L, endA, endB, P, D, span: L + 2 * JIB - 0.3 };
  }
  at(gx, gz) { return this.list.find(l => (l.a.gx === gx && l.a.gz === gz) || (l.b.gx === gx && l.b.gz === gz)) || null; }
  hit(x, z, pad = 0) { for (const l of this.list) for (const c of [l.a, l.b]) { const f = PulleyWorld.footprint(c.gx, c.gz); if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad) return l; } return null; }
  serialize() { return this.list.map(l => ({ a: { ...l.a }, b: { ...l.b }, pick: l.pick })); }
  count() { return this.list.length; }
  transit() { const out = []; for (const l of this.list) for (const h of l.held) out.push(h.type); return out; }
  add(a, b, pick = 'a', pop = true) {
    if (this.at(a.gx, a.gz) || this.at(b.gx, b.gz)) return null;
    const MT = mats(), g = new THREE.Group(), geo = PulleyWorld.geom(a, b, pick);
    const pa = buildPylon(), pb = buildPylon();
    pa.position.set(geo.A.x, 0, geo.A.z); pa.rotation.y = Math.atan2(-geo.u.z, geo.u.x);
    pb.position.set(geo.B.x, 0, geo.B.z); pb.rotation.y = Math.atan2(geo.u.z, -geo.u.x);
    g.add(pa, pb);
    // the cable (jib tip to jib tip, over both pylon wheels) + two guy wires per pylon to the ground behind it
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), MT.cable); cab.castShadow = true;
    const L2 = geo.L + 2 * JIB; cab.scale.y = L2; cab.position.set((geo.endA.x + geo.endB.x) / 2, CABLE_Y + 0.2, (geo.endA.z + geo.endB.z) / 2);
    cab.quaternion.setFromUnitVectors(_up, new THREE.Vector3(geo.u.x, 0, geo.u.z)); g.add(cab);
    const trolley = buildTrolley(), magnet = buildMagnet();
    trolley.rotation.y = Math.atan2(-geo.u.z, geo.u.x); g.add(trolley); g.add(magnet);
    const hoist = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 5), MT.cable); g.add(hoist);
    const hoist2 = hoist.clone(); g.add(hoist2);
    this.host.scene.add(g);
    const l = { type: 'pulley', a: { gx: a.gx, gz: a.gz }, b: { gx: b.gx, gz: b.gz }, pick, geo, g, pylons: [pa, pb], trolley, magnet, hoist, hoist2,
      pos: 0, hy: TOP_Y, state: 'idle', t: Math.random() * 0.4, held: [], target: null, dest: null, cycles: 0, delivered: 0, lifted: 0, pop: pop ? 0 : null, status: 'ok', on: false, wait: 0 };
    if (pop) g.scale.setScalar(0.01);
    this.list.push(l); this.pose(l); return l;
  }
  remove(l) { const i = this.list.indexOf(l); if (i < 0) return null; this.list.splice(i, 1); this.host.scene.remove(l.g); for (const h of l.held) this.host.freeMesh(h.mesh); const types = l.held.map(h => h.type); l.held = []; return types; }
  load(list) { for (const l of this.list.slice()) this.remove(l); for (const q of list || []) this.add(q.a, q.b, q.pick, false); }
  // world position of the trolley / magnet for a line
  trolleyXZ(l) { const G = l.geo, k = ease(Math.max(0, Math.min(1, l.pos))); return { x: G.P.x + (G.D.x - G.P.x) * k, z: G.P.z + (G.D.z - G.P.z) * k }; }
  pose(l) {
    const p = this.trolleyXZ(l);
    l.trolley.position.set(p.x, CABLE_Y + 0.2, p.z);
    l.magnet.position.set(p.x, l.hy, p.z); l.magnet.rotation.y = l.spin || 0;
    // two hoist ropes from the trolley down to the magnet eye
    const top = CABLE_Y - 0.25, len = Math.max(0.05, top - (l.hy + 0.28));
    for (const [h, o] of [[l.hoist, 0.08], [l.hoist2, -0.08]]) { h.scale.y = len; h.position.set(p.x + l.geo.u.x * o, l.hy + 0.28 + len / 2, p.z + l.geo.u.z * o); }
    l.magnet.userData.led.color.setHex(l.on ? 0xff3b1e : 0x18ff6a); l.magnet.userData.led.emissive.setHex(l.on ? 0xff3b1e : 0x18ff6a);
    l.held.forEach((h, i) => { const c = CLUSTER[i % CLUSTER.length]; const s = l.spin || 0, cs = Math.cos(s), sn = Math.sin(s);
      h.mesh.position.set(p.x + c[0] * cs - c[1] * sn, l.hy + c[2], p.z + c[0] * sn + c[1] * cs); h.mesh.quaternion.set(0, 0, 0, 1); h.mesh.rotateY(i * 1.3); h.mesh.rotateX((i % 3 - 1) * 0.22); });
  }
  showPreview(a, b, state, pick = null) {
    const hide = () => { this.pvA.visible = this.pvB.visible = this.pvCable.visible = this.pvPick.visible = this.pvDrop.visible = false; };
    if (!a) { hide(); return; }
    const mm = this.bpMat[state]; mm.opacity = 0.34 + Math.sin(performance.now() / 180) * 0.08;
    const A = cellCenter(a.gx, a.gz); this.pvA.visible = true; this.pvA.position.set(A.x, 0.004, A.z); this.pvA.userData.ms.forEach(m => m.material = mm);
    if (!b || (b.gx === a.gx && b.gz === a.gz)) { this.pvA.rotation.y = 0; this.pvB.visible = this.pvCable.visible = this.pvPick.visible = this.pvDrop.visible = false; return; }
    const G = PulleyWorld.geom(a, b, pick || 'a');
    this.pvA.rotation.y = Math.atan2(-G.u.z, G.u.x);
    this.pvB.visible = true; this.pvB.position.set(G.B.x, 0.004, G.B.z); this.pvB.rotation.y = Math.atan2(G.u.z, -G.u.x); this.pvB.userData.ms.forEach(m => m.material = mm);
    const c = this.pvCable; c.visible = true; c.scale.y = G.L + 2 * JIB; c.position.set((G.endA.x + G.endB.x) / 2, CABLE_Y + 0.2, (G.endA.z + G.endB.z) / 2); c.quaternion.setFromUnitVectors(_up, new THREE.Vector3(G.u.x, 0, G.u.z));
    c.material.color.setHex(state === 'bad' ? 0xff6a5a : 0x7fd0ff); c.material.opacity = 0.6 + Math.sin(performance.now() / 140) * 0.25;
    if (pick) { this.pvPick.visible = this.pvDrop.visible = true; this.pvPick.position.set(G.P.x, 0.06, G.P.z); this.pvDrop.position.set(G.D.x, 0.06, G.D.z); this.pvDrop.scale.setScalar(PULLEY.DROP_R / PULLEY.PICK_R); }
    else this.pvPick.visible = this.pvDrop.visible = false;
  }
  go(l, state) { l.state = state; l.t = 0; }
  update(dt) {
    const H = this.host, sp = this.speed, vT = 4.6 * sp, vH = 3.4 * sp;
    for (const l of this.list) {
      if (l.pop != null) { l.pop = Math.min(1, l.pop + dt * 3); const k = l.pop; l.g.scale.setScalar(k >= 1 ? 1 : Math.max(0.01, k * (1 + Math.sin(k * Math.PI) * 0.1))); if (k >= 1) l.pop = null; }
      l.t += dt; const ga = H.att(l.trolley.position.x, l.trolley.position.z);
      switch (l.state) {
        case 'idle': {
          if (l.t < (l.idleFor || 0.5)) break;
          const src = H.source(l), dst = src && H.dest(l, this.grab);
          if (!src || !dst) { l.idleFor = 0.8; l.t = 0; l.status = !src ? 'nomountain' : 'nodest'; break; }
          l.status = 'ok'; l.target = src; l.ty = Math.min(TOP_Y - 0.4, src.y + 0.42); this.go(l, 'lower'); H.sfx.winch && H.sfx.winch(ga, (TOP_Y - l.ty) / vH, false); break;
        }
        case 'lower': l.hy = Math.max(l.ty, l.hy - vH * dt); if (l.hy <= l.ty + 1e-4) { this.go(l, 'grab'); l.on = true; H.sfx.magnetOn && H.sfx.magnetOn(ga); } break;
        case 'grab': if (l.t >= 0.28) {
          const types = H.take(l, l.target, this.grab);
          l.held = types.map(type => ({ type, mesh: H.tireMesh(type) })); l.lifted += types.length;
          if (!types.length) l.on = false;
          this.go(l, 'raise'); H.sfx.winch && H.sfx.winch(ga, (TOP_Y - l.hy) / vH, true);
        } break;
        case 'raise': l.hy = Math.min(TOP_Y, l.hy + vH * dt); if (l.hy >= TOP_Y - 1e-4) { if (!l.held.length) { this.go(l, 'idle'); l.idleFor = 0.6; break; } this.go(l, 'travel'); H.sfx.trolley && H.sfx.trolley(ga, l.geo.span / vT); } break;
        case 'travel': l.pos = Math.min(1, l.pos + dt * vT / l.geo.span); l.spin = (l.spin || 0) + dt * 0.25; if (l.pos >= 1) {
          const d = H.dest(l, l.held.length); if (!d) { l.status = 'nodest'; l.t = 0; l.state = 'hover'; break; }
          l.dest = d; l.ty = Math.max(2.0, Math.min(TOP_Y, d.y + 0.85 + Math.min(4, l.held.length) * 0.06)); this.go(l, 'lowerD'); H.sfx.winch && H.sfx.winch(ga, (TOP_Y - l.ty) / vH, false);
        } break;
        case 'hover': if (l.t > 0.6) { const d = H.dest(l, l.held.length); l.t = 0; if (d) { l.status = 'ok'; l.dest = d; l.ty = Math.max(2.0, Math.min(TOP_Y, d.y + 0.85)); this.go(l, 'lowerD'); } } break;
        case 'lowerD': l.hy = Math.max(l.ty, l.hy - vH * dt); if (l.hy <= l.ty + 1e-4) { this.go(l, 'release'); l.relT = 0; l.first = true; l.stuck = 0; } break;
        case 'release': {
          l.relT -= dt; if (l.relT > 0) break;
          if (!l.held.length) { l.on = false; this.go(l, 'raiseD'); l.cycles++; H.sfx.winch && H.sfx.winch(ga, (TOP_Y - l.hy) / vH, true); break; }
          const h = l.held[l.held.length - 1], pos = h.mesh.position.clone();
          if (H.release(l, h.type, pos, l.dest)) {
            if (l.first) { H.sfx.magnetOff && H.sfx.magnetOff(ga); l.first = false; }
            l.held.pop(); H.freeMesh(h.mesh); l.delivered++; l.relT = 0.07; l.stuck = 0;
          } else { l.relT = 0.12; l.stuck += 0.12; if (l.stuck > 0.9) { const d = H.dest(l, l.held.length); l.stuck = 0; if (d) l.dest = d; else { this.go(l, 'hover'); l.status = 'nodest'; } } }
          break;
        }
        case 'raiseD': l.hy = Math.min(TOP_Y, l.hy + vH * dt); if (l.hy >= TOP_Y - 1e-4) { this.go(l, 'return'); H.sfx.trolley && H.sfx.trolley(ga * 0.7, l.geo.span / vT); } break;
        case 'return': l.pos = Math.max(0, l.pos - dt * vT / l.geo.span); l.spin = (l.spin || 0) - dt * 0.25; if (l.pos <= 0) { this.go(l, 'idle'); l.idleFor = 0.2; } break;
      }
      // trolley wheels + pylon pulleys spin while it moves
      if (l.state === 'travel' || l.state === 'return') { const w = (l.state === 'travel' ? -1 : 1) * dt * 14; for (const wh of l.trolley.userData.wheels) wh.rotation.z += w; for (const p of l.pylons) for (const wh of p.userData.wheels) wh.rotation.z += w * 0.4; }
      this.pose(l);
    }
  }
}
