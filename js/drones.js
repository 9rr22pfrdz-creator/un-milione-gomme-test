// Fase 6: la flotta di droni. Compact industrial quadcopters (matte charcoal + safety yellow, four spinning rotor
// discs, a status LED, a belly grapple carrying 1-2 real tires) take off from the painted DRONI pad, swoop down
// on the mountain, pick tires and deliver them to the vehicle, the shredder or the fascioni machine, banking
// smoothly through the air. One soft shared hum for the whole fleet (audio.js setDrones).
// 3D + flight logic here; the game (main.js) provides the world through `host` callbacks.
import * as THREE from 'three';
import { merge, M, box, cyl, cvs } from './gfx.js';

export const DPAD = { x: 19, z: -6, w: 5.2, d: 5.2 };
export const PAD_BOX = { x0: DPAD.x - DPAD.w / 2, x1: DPAD.x + DPAD.w / 2 + 0.9, z0: DPAD.z - DPAD.d / 2, z1: DPAD.z + DPAD.d / 2 };
const SPOTS = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) SPOTS.push({ x: DPAD.x - 1.8 + c * 1.2, z: DPAD.z - 2.4 + r * 1.6 });
export const padSpot = i => SPOTS[i % SPOTS.length];
const REST_Y = 0.2, CRUISE = 5.0, VMAX = 9.5;
const wrap = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

function padTexture() {
  const [c, x] = cvs(512, 512);
  x.fillStyle = '#6d6a64'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { const a = Math.random() * 0.14; x.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,250,235,${a * 0.6})`; x.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  x.strokeStyle = '#e8b21c'; x.lineWidth = 16; x.strokeRect(12, 12, 488, 488);
  // hazard corners
  x.fillStyle = '#161616'; for (const [cx, cy, sx, sy] of [[12, 12, 1, 1], [500, 12, -1, 1], [12, 500, 1, -1], [500, 500, -1, -1]]) for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(cx + sx * (20 + k * 22), cy); x.lineTo(cx + sx * (32 + k * 22), cy); x.lineTo(cx, cy + sy * (32 + k * 22)); x.lineTo(cx, cy + sy * (20 + k * 22)); x.fill(); }
  // 8 little landing circles (4 x 2), matching padSpot()
  for (let r = 0; r < 2; r++) for (let cc = 0; cc < 4; cc++) { const px = 256 + (-1.8 + cc * 1.2) / DPAD.w * 512, py = 256 + (-1.2 + r * 2.4) / DPAD.d * 512;
    x.strokeStyle = 'rgba(240,236,224,0.85)'; x.lineWidth = 5; x.beginPath(); x.arc(px, py, 44, 0, 7); x.stroke();
    x.fillStyle = 'rgba(240,236,224,0.85)'; x.font = '900 40px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', px, py + 2); }
  x.fillStyle = '#e8b21c'; x.font = '900 70px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('DRONI', 256, 258);
  // scuffs
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(30,25,20,${0.05 + Math.random() * 0.08})`; x.lineWidth = 2 + Math.random() * 6; x.beginPath(); const sx = Math.random() * 512, sy = Math.random() * 512; x.moveTo(sx, sy); x.lineTo(sx + (Math.random() - 0.5) * 120, sy + (Math.random() - 0.5) * 40); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    body: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.72, metalness: 0.25 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe8b21c, roughness: 0.5, metalness: 0.15 }),
    motor: new THREE.MeshStandardMaterial({ color: 0x8b9298, roughness: 0.35, metalness: 0.85 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }),
    disc: new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    hook: new THREE.MeshStandardMaterial({ color: 0xc9cfd4, roughness: 0.3, metalness: 0.9 }),
  };
  return MATS;
}
let GEO = null;
function geos() {
  if (GEO) return GEO;
  const b = [], y = [], m = [], h = [];
  b.push([box(0.46, 0.13, 0.36), M(0, 0, 0)], [box(0.3, 0.08, 0.26), M(-0.04, -0.1, 0)]);
  y.push([box(0.34, 0.035, 0.26), M(0.02, 0.083, 0)], [box(0.06, 0.07, 0.3), M(0.24, 0, 0)]); // top plate + nose stripe
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const ang = Math.atan2(sz, sx);
    b.push([box(0.5, 0.04, 0.05), M(sx * 0.2, 0.02, sz * 0.2, 0, -ang, 0)]);
    m.push([cyl(0.045, 0.05, 0.09, 12), M(sx * 0.38, 0.06, sz * 0.38)]);
  }
  for (const s of [1, -1]) { b.push([box(0.04, 0.16, 0.04), M(0.12, -0.18, s * 0.15)], [box(0.04, 0.16, 0.04), M(-0.12, -0.18, s * 0.15)]); y.push([box(0.46, 0.03, 0.035), M(0, -0.26, s * 0.15)]); } // skids
  h.push([cyl(0.025, 0.025, 0.16, 8), M(0, -0.22, 0)], [new THREE.TorusGeometry(0.055, 0.014, 6, 14), M(0, -0.32, 0, Math.PI / 2)]); // grapple
  GEO = { body: merge(b), yellow: merge(y), motor: merge(m), hook: merge(h), blade: box(0.4, 0.008, 0.035), disc: new THREE.CircleGeometry(0.21, 20) };
  return GEO;
}
export function buildDrone() {
  const G = geos(), MT = mats(), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  for (const k of ['body', 'yellow', 'motor', 'hook']) { const ms = new THREE.Mesh(G[k], MT[k]); ms.castShadow = true; body.add(ms); }
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const r = new THREE.Group(); r.position.set(sx * 0.38, 0.115, sz * 0.38); body.add(r);
    const b1 = new THREE.Mesh(G.blade, MT.blade), b2 = new THREE.Mesh(G.blade, MT.blade); b2.rotation.y = Math.PI / 2; r.add(b1, b2);
    const d = new THREE.Mesh(G.disc, MT.disc); d.rotation.x = -Math.PI / 2; d.visible = false; r.add(d);
    rotors.push({ r, d, b1, b2, dir: sx * sz });
  }
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x18ff6a, emissive: 0x18ff6a, emissiveIntensity: 2.2 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), ledMat); led.position.set(0.24, 0.02, 0); body.add(led);
  const led2 = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 2 })); led2.position.set(-0.24, 0.0, 0); body.add(led2);
  g.userData = { body, rotors, ledMat, led2 };
  return g;
}
// the painted pad + a charging cabinet and a windsock
export function buildPad(scene, colliders) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(DPAD.w, DPAD.d), new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, transparent: false }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(DPAD.x, 0.015, DPAD.z); pad.receiveShadow = true; g.add(pad);
  const MT = mats(), cab = [], cy = [];
  const cx = DPAD.x + DPAD.w / 2 + 0.45;
  cab.push([box(0.6, 1.25, 1.1), M(cx, 0.625, DPAD.z)], [box(0.66, 0.06, 1.16), M(cx, 1.28, DPAD.z)]);
  cy.push([box(0.62, 0.12, 1.12), M(cx, 0.2, DPAD.z)], [box(0.02, 0.3, 0.5), M(cx - 0.31, 0.95, DPAD.z)]);
  const cm = new THREE.Mesh(merge(cab), MT.body), ym = new THREE.Mesh(merge(cy), MT.yellow); cm.castShadow = ym.castShadow = true; g.add(cm, ym);
  // charging cables from the cabinet
  const cable = new THREE.Mesh(cyl(0.025, 0.025, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })); cable.rotation.z = Math.PI / 2; cable.position.set(cx - 1.05, 0.03, DPAD.z + 0.3); g.add(cable);
  // windsock
  const pole = new THREE.Mesh(cyl(0.035, 0.04, 3.2, 8), MT.motor); pole.position.set(DPAD.x - DPAD.w / 2 - 0.4, 1.6, DPAD.z - DPAD.d / 2 + 0.2); pole.castShadow = true; g.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xff6a12, roughness: 0.8, side: THREE.DoubleSide }));
  sock.rotation.z = Math.PI / 2 + 0.25; sock.position.set(pole.position.x + 0.5, 3.0, pole.position.z); g.add(sock); g.userData.sock = sock;
  scene.add(g);
  const col = { x0: cx - 0.32, x1: cx + 0.32, z0: DPAD.z - 0.58, z1: DPAD.z + 0.58 }; colliders.push(col);
  return { g, col };
}

const _a = new THREE.Vector3(), _d = new THREE.Vector3();
export class DroneWorld {
  // host: { scene, sfx, att(x,z), tireMesh(type), freeMesh(m), pick(drone) -> {x,y,z}|null, take(drone, at, n) -> [types],
  //         dest(drone, n) -> {kind,x,y,z,...}|null, release(drone, type, pos, dest) -> bool }
  get agile() { return Math.max(1, this.speed / 1.8); } // better batteries: snappier, not only a higher top speed
  constructor(host) { this.host = host; this.list = []; this.speed = 1; this.lift = 1; this.halted = false; this.delivered = 0; this.hum = 0; this.t = 0; }
  count() { return this.list.length; }
  setCount(n) {
    while (this.list.length < n) {
      const i = this.list.length, g = buildDrone(), s = padSpot(i);
      g.position.set(s.x, REST_Y, s.z); this.host.scene.add(g);
      this.list.push({ i, g, U: g.userData, p: new THREE.Vector3(s.x, REST_Y, s.z), v: new THREE.Vector3(), yaw: Math.PI / 2, roll: 0, pitch: 0, state: 'pad', t: Math.random() * 0.6 + i * 0.35, held: [], pick: null, dest: null, cruise: CRUISE + (i % 4) * 0.55, spin: 0, delivered: 0, cycles: 0, lifted: 0 });
    }
    while (this.list.length > n) { const d = this.list.pop(); this.host.scene.remove(d.g); for (const h of d.held) this.host.freeMesh(h.mesh); }
  }
  transit() { const out = []; for (const d of this.list) for (const h of d.held) out.push(h.type); return out; }
  // the finale: drop everything (the game counts it as delivered) and go home
  dropAll() { const out = []; for (const d of this.list) { for (const h of d.held) { out.push(h.type); this.host.freeMesh(h.mesh); } d.held = []; if (d.state !== 'pad') this.goHome(d); } return out; }
  flying() { return this.list.filter(d => d.state !== 'pad').length; }
  go(d, state) { d.state = state; d.t = 0; }
  goHome(d) { const s = padSpot(d.i); d.tgt = new THREE.Vector3(s.x, d.cruise, s.z); this.go(d, d.p.y < d.cruise - 0.5 ? 'climbHome' : 'home'); }
  nextJob(d) {
    if (this.halted) { this.goHome(d); return; }
    const pk = this.host.pick(d), ds = pk && this.host.dest(d, this.lift);
    if (pk && ds) { d.pick = pk; d.status = 'ok'; this.go(d, 'toPick'); }
    else { d.status = !pk ? 'nomountain' : 'nodest'; this.goHome(d); }
  }
  // smooth steering toward a point; returns the remaining distance
  steer(d, x, y, z, dt, vmax, soft = 2.4) {
    _d.set(x - d.p.x, y - d.p.y, z - d.p.z); const dist = _d.length();
    const want = dist > 1e-4 ? _d.multiplyScalar(Math.min(vmax, dist * soft * this.agile) / dist) : _d.set(0, 0, 0);
    _a.copy(want).sub(d.v).multiplyScalar(Math.min(1, dt * 3.6 * this.agile));
    d.v.add(_a); d.p.addScaledVector(d.v, dt);
    // banking: tilt into the acceleration (nose down speeding up, roll into turns)
    const fx = Math.cos(d.yaw), fz = -Math.sin(d.yaw), ax = _a.x / Math.max(dt, 1e-3), az = _a.z / Math.max(dt, 1e-3);
    const af = ax * fx + az * fz, al = ax * -fz + az * fx;
    d.pitch += (Math.max(-0.38, Math.min(0.38, af * 0.06)) - d.pitch) * Math.min(1, dt * 5);
    d.roll += (Math.max(-0.42, Math.min(0.42, al * 0.06)) - d.roll) * Math.min(1, dt * 5);
    const hs = Math.hypot(d.v.x, d.v.z); if (hs > 0.6) d.yaw += wrap(Math.atan2(-d.v.z, d.v.x) - d.yaw) * Math.min(1, dt * 2.2);
    return dist;
  }
  update(dt) {
    const H = this.host, vmax = VMAX * this.speed; this.t += dt; let hum = 0;
    for (const d of this.list) {
      d.t += dt;
      switch (d.state) {
        case 'pad':
          d.v.set(0, 0, 0); d.pitch *= 0.9; d.roll *= 0.9;
          if (!this.halted && d.t > 0.35) { d.t = 0; const pk = H.pick(d), ds = pk && H.dest(d, this.lift); if (pk && ds) { d.pick = pk; d.tgt = new THREE.Vector3(d.p.x, d.cruise, d.p.z); this.go(d, 'up'); } else d.status = !pk ? 'nomountain' : 'nodest'; }
          break;
        case 'up': if (this.steer(d, d.tgt.x, d.tgt.y, d.tgt.z, dt, vmax * 0.6, 2.2) < 0.6) { if (this.halted) this.goHome(d); else if (d.held.length) this.toDest(d); else this.nextJob(d); } break;
        case 'toPick': { const pk = d.pick; this.steer(d, pk.x, d.cruise, pk.z, dt, vmax); if (Math.hypot(pk.x - d.p.x, pk.z - d.p.z) < 0.7) this.go(d, 'down'); break; }
        case 'down': { const pk = d.pick; if (this.steer(d, pk.x, pk.y + 0.62, pk.z, dt, vmax * 0.7, 2.6) < 0.2) { this.go(d, 'grab'); d.v.multiplyScalar(0.2); } break; }
        case 'grab': this.steer(d, d.pick.x, d.pick.y + 0.6, d.pick.z, dt, 1);
          if (d.t > 0.22) {
            const types = this.halted ? [] : H.take(d, d.pick, this.lift);
            d.held = types.map(type => ({ type, mesh: H.tireMesh(type) })); d.lifted += types.length;
            if (types.length) H.sfx.clack && H.sfx.clack(H.att(d.p.x, d.p.z) * 0.6, true);
            d.tgt = new THREE.Vector3(d.p.x, d.cruise, d.p.z); this.go(d, 'up');
          } break;
        case 'hold': this.steer(d, d.p.x, d.cruise, d.p.z, dt, 2); if (d.t > 0.6) { d.t = 0; this.toDest(d); } break;
        case 'toDest': { const q = d.dest; this.steer(d, q.x, d.cruise, q.z, dt, vmax); if (Math.hypot(q.x - d.p.x, q.z - d.p.z) < 0.7) this.go(d, 'lowerD'); break; }
        case 'lowerD': { const q = d.dest; if (this.steer(d, q.x, q.y + 1.35, q.z, dt, vmax * 0.7, 2.6) < 0.25) { this.go(d, 'drop'); d.relT = 0.1; d.stuck = 0; } break; }
        case 'drop': {
          const q = d.dest; this.steer(d, q.x, q.y + 1.35, q.z, dt, 1);
          d.relT -= dt; if (d.relT > 0) break;
          if (!d.held.length) { d.cycles++; d.tgt = new THREE.Vector3(d.p.x, d.cruise, d.p.z); this.go(d, 'up'); break; }
          const h = d.held[d.held.length - 1], pos = h.mesh.position.clone();
          if (H.release(d, h.type, pos, q)) { d.held.pop(); H.freeMesh(h.mesh); d.delivered++; this.delivered++; d.relT = 0.08; d.stuck = 0; }
          else { d.relT = 0.15; d.stuck += 0.15; if (d.stuck > 0.9) { d.stuck = 0; const nd = H.dest(d, d.held.length); if (nd) { d.dest = nd; this.go(d, 'toDest'); } else this.go(d, 'hold'); } }
          break;
        }
        case 'climbHome': if (this.steer(d, d.p.x, d.cruise, d.p.z, dt, vmax * 0.5, 1.4) < 0.5) this.go(d, 'home'); break;
        case 'home': { const s = padSpot(d.i); this.steer(d, s.x, d.cruise, s.z, dt, vmax); if (Math.hypot(s.x - d.p.x, s.z - d.p.z) < 0.4) this.go(d, 'land');
          if (!this.halted && d.t > 1.2) { d.t = 0; const pk = H.pick(d), ds = pk && H.dest(d, this.lift); if (pk && ds) { d.pick = pk; this.go(d, 'toPick'); } } break; }
        case 'land': { const s = padSpot(d.i); if (this.steer(d, s.x, REST_Y, s.z, dt, 2.2, 1.2) < 0.03) { d.p.set(s.x, REST_Y, s.z); d.v.set(0, 0, 0); this.go(d, 'pad'); } break; }
      }
      this.pose(d, dt);
      if (d.state !== 'pad') hum += H.att(d.p.x, d.p.z);
    }
    this.hum = Math.min(1, hum * 0.45);
  }
  toDest(d) {
    const q = this.host.dest(d, d.held.length || 1);
    if (!q) { d.status = 'nodest'; this.go(d, 'hold'); return; }
    d.dest = q; d.status = 'ok'; this.go(d, 'toDest');
  }
  pose(d, dt) {
    const g = d.g, U = d.U, air = d.state !== 'pad';
    g.position.copy(d.p); g.rotation.order = 'YXZ'; g.rotation.set(0, d.yaw, 0);
    U.body.rotation.order = 'XZY'; U.body.rotation.set(d.roll, 0, -d.pitch);
    // a gentle hover bob in the air
    if (air) U.body.position.y = Math.sin(this.t * 2.3 + d.i) * 0.04; else U.body.position.y = 0;
    d.spin += dt * (air ? 55 : 0);
    for (const r of U.rotors) { r.r.rotation.y = d.spin * r.dir + (air ? Math.random() * 0.4 : 0); r.d.visible = air; r.b1.visible = r.b2.visible = !air || (Math.floor(this.t * 30) & 1) === 0; }
    const carrying = d.held.length > 0, blink = (Math.sin(this.t * (carrying ? 9 : 3) + d.i) > -0.2);
    U.ledMat.color.setHex(carrying ? 0xffa21a : 0x18ff6a); U.ledMat.emissive.setHex(carrying ? 0xffa21a : 0x18ff6a); U.ledMat.emissiveIntensity = blink ? 2.4 : 0.3;
    // the held tires hang flat under the grapple, one under the other
    if (carrying) { g.updateMatrixWorld(true);
      d.held.forEach((h, k) => { _a.set(0, -0.42 - k * 0.24, 0); U.body.localToWorld(_a); h.mesh.position.copy(_a); h.mesh.quaternion.setFromEuler(new THREE.Euler(d.roll * 0.6, d.yaw + k * 0.8, -d.pitch * 0.6, 'YXZ')); }); }
  }
}
