// Fase 3: Beppino & the helpers.
// 1 helper  = walks to the foot of the mountain, picks up two tires, carries them to the van and throws them in.
// 2+ helpers = a chain from the mountain to the van: the tire is rolled along the concrete from one to the next,
//              stopped with the foot and lifted, rolled again; the last one throws it into the braid.
// Stand in their way and they stop and stare at you. Step aside: half a second more, a sigh, back to work.
import * as THREE from 'three';

export const CREW_LOOKS = [
  { name: 'Beppino', suit: 0xe8661a, cap: 0xe8661a, shirt: 0xf1efe8, skin: 0xd7a07a, hair: 0x3a2a1e, mustache: true, beard: false, belly: 1.16, height: 0.97, pose: 'relaxed' },
  { name: 'Ottavio', suit: 0x2f62b0, cap: 0x1f2a36, shirt: 0x9a9fa6, skin: 0xc58b62, hair: 0x5c5650, mustache: false, beard: true, belly: 1.0, height: 1.04, pose: 'relaxed' },
  { name: 'Gino', suit: 0x3f7a3c, cap: 0x2a2c2e, shirt: 0xe9e4d8, skin: 0xe0b08a, hair: 0x9a9690, mustache: true, beard: false, belly: 1.08, height: 0.95, pose: 'relaxed' },
  { name: 'Salvo', suit: 0xb3322a, cap: 0xf0efe9, shirt: 0x30343a, skin: 0xb98058, hair: 0x1d1814, mustache: false, beard: false, belly: 0.96, height: 1.02, pose: 'relaxed' },
  { name: 'Tonino', suit: 0x56606e, cap: 0xe8661a, shirt: 0xf3f0e8, skin: 0xd09a72, hair: 0x2c2420, mustache: true, beard: true, belly: 1.2, height: 0.99, pose: 'relaxed' },
];
const wrap = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const UPV = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _a = new THREE.Vector3();
function segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9; const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1); return { d: Math.hypot(px - ax - dx * t, pz - az - dz * t), t }; }
// upright tire (axis horizontal) facing along `yaw`, rolled by `ang`
function uprightQuat(out, dirx, dirz, ang) { _a.set(dirz, 0, -dirx).normalize(); _q.setFromUnitVectors(UPV, _a); _q2.setFromAxisAngle(UPV, ang); return out.copy(_q).multiply(_q2); }

export class Crew {
  // ctx: { scene, buildWorker, tireMesh(type), freeMesh(m), TIRES, stations() -> {F,B,dir}, take(x,z,R) -> {type,pos,quat}|null,
  //        canAccept(n), launch(type,pos,quat) -> bool, player() -> {x,z}, sfx, att(x,z) -> 0..1, spawn(i) -> {x,z} }
  constructor(ctx) { this.ctx = ctx; this.list = []; this.rolls = []; this.stare = false; this.stareHold = 0; this.blocking = false; this.delivered = 0; this.sighs = 0; this.pickT = 0; this.stT = 0; this.t = 0; this.speed = 1; this.st = null; }
  get n() { return this.list.length; }
  get mode() { return this.n >= 2 ? 'relay' : this.n === 1 ? 'walk' : 'none'; }
  setCount(n, speed = 1) {
    this.speed = speed;
    while (this.list.length < n) {
      const i = this.list.length, look = CREW_LOOKS[i % CREW_LOOKS.length], g = this.ctx.buildWorker(look), p = this.ctx.spawn(i);
      g.position.set(p.x, 0, p.z); g.rotation.y = Math.PI; this.ctx.scene.add(g);
      this.list.push({ i, look, g, U: g.userData, x: p.x, z: p.z, yaw: Math.PI, carry: [], queue: [], act: null, actT: 0, actD: 0, walkPh: Math.random() * 6, moving: 0, headYaw: 0, spineYaw: 0, phase: 'toPile', done: false });
    }
    while (this.list.length > n) { const h = this.list.pop(); this.ctx.scene.remove(h.g); for (const c of h.carry.concat(h.queue)) this.ctx.freeMesh(c.mesh); }
    this.stT = 0; this.layout();
  }
  // work rhythm (helperCart upgrade): faster feet and hands
  get mul() { return 1 + (this.speed - 1) * 0.6; }
  layout() {
    const s = this.ctx.stations(); this.st = s; const n = this.n;
    this.list.forEach((h, i) => {
      if (n === 1) h.station = null;
      else { const k = i / (n - 1); h.station = { x: s.F.x + (s.B.x - s.F.x) * k, z: s.F.z + (s.B.z - s.F.z) * k }; }
    });
  }
  inPipe() { let k = this.rolls.length; for (const h of this.list) k += h.carry.length + h.queue.length; return k; }
  // world position of the helper's hands (where a carried tire sits)
  handPos(h, out, k = 0) { const fx = Math.cos(h.yaw), fz = -Math.sin(h.yaw); return out.set(h.x + fx * 0.42, 1.0 * h.look.height + k * 0.24, h.z + fz * 0.42); }
  // is the player standing in their way?
  checkBlock() {
    const p = this.ctx.player();
    if (this.n >= 2) {
      for (let i = 0; i < this.n - 1; i++) { const a = this.list[i], b = this.list[i + 1], r = segDist(p.x, p.z, a.x, a.z, b.x, b.z); if (r.d < 0.75 && r.t > 0.04 && r.t < 0.96) return true; }
      return false;
    }
    if (this.n === 1) { const h = this.list[0]; if (!h.moving) return Math.hypot(p.x - h.x, p.z - h.z) < 0.9; const fx = Math.cos(h.yaw), fz = -Math.sin(h.yaw); return segDist(p.x, p.z, h.x, h.z, h.x + fx * 1.7, h.z + fz * 1.7).d < 0.7; }
    return false;
  }
  update(dt) {
    if (!this.n) return;
    this.t += dt; this.stT -= dt; if (this.stT <= 0) { this.layout(); this.stT = 3; }
    this.blocking = this.checkBlock();
    if (this.blocking) { if (!this.stare) this.stare = true; this.stareHold = 0.5; }
    else if (this.stare) { this.stareHold -= dt; if (this.stareHold <= 0) { this.stare = false; this.sighs++; const h = this.list[0]; this.ctx.sfx.sigh(this.ctx.att(h.x, h.z)); } }
    if (!this.stare) { if (this.n === 1) this.walker(this.list[0], dt); else this.relay(dt); this.updateRolls(dt); }
    for (const h of this.list) { this.pose(h, dt); this.placeCarry(h); }
  }
  // ---------- movement ----------
  moveTo(h, tx, tz, dt, speed) {
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { h.moving = 0; return true; }
    const sp = Math.min(d, speed * dt); h.x += dx / d * sp; h.z += dz / d * sp; h.moving = speed;
    this.turn(h, Math.atan2(-dz, dx), dt, 7); return false;
  }
  turn(h, target, dt, rate = 6) { h.yaw += wrap(target - h.yaw) * Math.min(1, dt * rate); }
  start(h, act, dur) { h.act = act; h.actT = 0; h.actD = dur; h.fired = false; }
  // ---------- 1 helper: carry two at a time ----------
  walker(h, dt) {
    const s = this.st, spd = 2.3 * (1 + (this.speed - 1) * 0.45);
    if (h.act) { this.tickAct(h, dt); return; }
    if (h.phase === 'toPile') {
      if (this.moveTo(h, s.F.x, s.F.z, dt, spd)) {
        this.turn(h, Math.atan2(-s.dir.z, s.dir.x), dt, 8);
        if (h.carry.length < 2 && this.ctx.canAccept(h.carry.length + 1)) this.start(h, 'pick', 0.55 / this.mul);
        else if (h.carry.length) h.phase = 'toVan';
      }
    } else {
      if (this.moveTo(h, s.B.x, s.B.z, dt, spd)) {
        this.turn(h, Math.atan2(-(s.rear.z - h.z), s.rear.x - h.x), dt, 8);
        if (h.carry.length) { if (this.ctx.canAccept(1)) this.start(h, 'throw', 0.42 / this.mul); }
        else h.phase = 'toPile';
      }
    }
  }
  // ---------- 2+ helpers: rolling relay ----------
  relay(dt) {
    const n = this.n, rate = n * 0.35 * this.speed; this.pickT -= dt;
    for (let i = 0; i < n; i++) {
      const h = this.list[i];
      if (h.act) { this.tickAct(h, dt); continue; }
      if (h.station && !this.moveTo(h, h.station.x, h.station.z, dt, 2.6 * this.mul)) continue;
      const nx = i < n - 1 ? this.list[i + 1] : null, s = this.st;
      if (h.carry.length) {
        if (nx) { this.turn(h, Math.atan2(-(nx.z - h.z), nx.x - h.x), dt); if (nx.queue.length + this.rollsTo(nx) < 2) this.start(h, 'push', Math.min(0.42, 0.5 / rate + 0.1) / this.mul); }
        else { this.turn(h, Math.atan2(-(s.rear.z - h.z), s.rear.x - h.x), dt); if (this.ctx.canAccept(1)) this.start(h, 'throw', 0.4 / this.mul); }
      } else if (h.queue.length) { const q = h.queue[0]; this.turn(h, Math.atan2(-(q.z - h.z), q.x - h.x), dt); this.start(h, 'catch', Math.min(0.5, 0.6 / rate + 0.12) / this.mul); }
      else if (i === 0) { this.turn(h, Math.atan2(-s.dir.z, s.dir.x), dt); if (this.pickT <= 0 && this.ctx.canAccept(this.inPipe() + 1)) { this.start(h, 'pick', Math.min(0.55, 0.8 / rate) / this.mul); this.pickT = 1 / rate; } }
      else { const pv = this.list[i - 1]; this.turn(h, Math.atan2(-(pv.z - h.z), pv.x - h.x), dt, 3); }
    }
  }
  rollsTo(h) { let k = 0; for (const r of this.rolls) if (r.to === h) k++; return k; }
  tickAct(h, dt) {
    h.actT += dt; const k = h.actT / h.actD;
    if (!h.fired && k >= (h.act === 'pick' ? 0.55 : h.act === 'catch' ? 0.6 : 0.45)) { h.fired = true; this.fire(h); }
    if (k >= 1) { h.act = null; if (h.cancel) h.cancel = false; }
  }
  fire(h) {
    const C = this.ctx, s = this.st;
    if (h.act === 'pick') {
      const got = C.take(s.F.x + s.dir.x * 1.1, s.F.z + s.dir.z * 1.1, 3.2);
      if (!got) { this.idleReason = 'montagna'; return; }
      const m = C.tireMesh(got.type); m.position.copy(got.pos); h.carry.push({ type: got.type, mesh: m, lift: 0 });
      C.sfx.grab && C.sfx.grab(got.type === 3 ? 0 : Math.min(2, got.type), 0, C.att(h.x, h.z));
    } else if (h.act === 'push') {
      const c = h.carry.pop(); if (!c) return; const nx = this.list[h.i + 1];
      const fx = h.x + Math.cos(h.yaw) * 0.55, fz = h.z - Math.sin(h.yaw) * 0.55;
      const dx = nx.x - fx, dz = nx.z - fz, d = Math.hypot(dx, dz), stop = Math.max(0, d - 0.6);
      const tx = fx + dx / d * stop, tz = fz + dz / d * stop, sp = 4.2 * this.mul;
      this.rolls.push({ type: c.type, mesh: c.mesh, fx, fz, tx, tz, dirx: dx / d, dirz: dz / d, d: stop, t: 0, dur: Math.max(0.3, stop / sp), to: nx, ang: 0 });
      C.sfx.roll(C.att(fx, fz), Math.max(0.4, stop / sp) + 0.2);
    } else if (h.act === 'catch') {
      const q = h.queue.shift(); if (!q) return; h.carry.push({ type: q.type, mesh: q.mesh, lift: 0, from: q.mesh.position.clone(), fromT: 0 });
      C.sfx.kick(C.att(h.x, h.z));
    } else if (h.act === 'throw') {
      const c = h.carry[h.carry.length - 1]; if (!c) return;
      const pos = c.mesh.position.clone(), quat = c.mesh.quaternion.clone();
      if (C.launch(c.type, pos, quat)) { h.carry.pop(); C.freeMesh(c.mesh); this.delivered++; }
    }
  }
  updateRolls(dt) {
    for (let i = this.rolls.length - 1; i >= 0; i--) {
      const r = this.rolls[i]; r.t += dt; const k = Math.min(1, r.t / r.dur), e = k < 0.75 ? k / 0.75 * 0.85 : 0.85 + (1 - Math.pow(1 - (k - 0.75) / 0.25, 2)) * 0.15; // slows down at the end
      const R = this.ctx.TIRES[r.type].R, x = r.fx + (r.tx - r.fx) * e, z = r.fz + (r.tz - r.fz) * e;
      r.ang = r.d * e / R; const wob = Math.sin(r.t * 9) * 0.04 * (k > 0.8 ? (k - 0.8) * 5 : 0.2);
      r.mesh.position.set(x, R, z); uprightQuat(r.mesh.quaternion, r.dirx, r.dirz, -r.ang); r.mesh.rotateZ(wob);
      if (k >= 1) { this.rolls.splice(i, 1); r.to.queue.push({ type: r.type, mesh: r.mesh, x, z }); }
    }
  }
  // tires in the hands follow the body; one being caught hops up from the foot first
  placeCarry(h) {
    h.carry.forEach((c, j) => {
      const target = this.handPos(h, _hp, j);
      if (c.from) { c.fromT += 1 / 60; const k = Math.min(1, h.act === 'catch' ? (h.actT / h.actD - 0.6) / 0.4 : 1); const kk = Math.max(0, k); c.mesh.position.lerpVectors(c.from, target, kk); c.mesh.position.y += Math.sin(kk * Math.PI) * 0.35; if (kk >= 1) c.from = null; }
      else c.mesh.position.copy(target);
      uprightQuat(c.mesh.quaternion, Math.cos(h.yaw), -Math.sin(h.yaw), 0);
      if (h.act === 'pick' && !c.from && j === h.carry.length - 1) { const k = h.actT / h.actD; c.mesh.position.y = 0.4 + (target.y - 0.4) * Math.max(0, (k - 0.55) / 0.45); }
    });
  }
  // ---------- body animation ----------
  pose(h, dt) {
    const U = h.U, R = U.rig, rest = R.rest, g = h.g;
    g.position.set(h.x, 0, h.z); g.rotation.y = h.yaw;
    // reset to rest
    R.spine.rotation.set(0, 0, 0); R.hips.rotation.set(0, 0, 0); R.hips.position.set(0, rest.hipsY, 0);
    R.legs.forEach((l, i) => { l.hip.rotation.set(0, 0, i ? -0.04 : 0.04); l.knee.rotation.set(0, 0, 0); });
    R.arms.forEach((a, i) => { a.sh.rotation.copy(rest.arms[i].sh); a.el.rotation.copy(rest.arms[i].el); a.wr.rotation.copy(rest.arms[i].wr); });
    const t = this.t, carrying = h.carry.length > 0, k = h.act ? Math.min(1, h.actT / h.actD) : 0, sk = Math.sin(k * Math.PI);
    const armsHold = () => R.arms.forEach(a => { a.sh.rotation.set(-0.85, 0, a.s * 0.32); a.el.rotation.set(-0.55, 0, 0); });
    let lookYaw = 0;
    if (this.stare) {
      U.anim(t);
      R.arms.forEach(a => { a.sh.rotation.set(0.12, 0, a.s * 0.42); a.el.rotation.set(-0.85, 0, a.s * -0.55); a.wr.rotation.set(0.1, 0, 0); }); // hands on hips
      if (carrying) armsHold();
      const p = this.ctx.player(), rel = wrap(Math.atan2(-(p.z - h.z), p.x - h.x) - h.yaw);
      if (Math.abs(rel) > 1.25) this.turn(h, Math.atan2(-(p.z - h.z), p.x - h.x), dt, 2.2); // turn the feet too if needed
      lookYaw = rel;
    } else if (h.moving && !h.act) {
      h.walkPh += dt * h.moving * 3.3; const s = Math.sin(h.walkPh), c = Math.cos(h.walkPh);
      R.legs[0].hip.rotation.x = s * 0.5; R.legs[1].hip.rotation.x = -s * 0.5;
      R.legs[0].knee.rotation.x = Math.max(0, -c) * 0.75; R.legs[1].knee.rotation.x = Math.max(0, c) * 0.75;
      R.hips.position.y = rest.hipsY - 0.02 + Math.abs(c) * 0.025; R.spine.rotation.x = 0.06;
      if (carrying) armsHold(); else R.arms.forEach((a, i) => { a.sh.rotation.x = (i ? s : -s) * 0.45; a.el.rotation.x = -0.25; });
    } else if (h.act === 'pick') {
      R.spine.rotation.x = sk * 0.95; R.hips.position.y = rest.hipsY - sk * 0.12;
      R.legs.forEach(l => { l.hip.rotation.x = -sk * 0.45; l.knee.rotation.x = sk * 0.8; });
      R.arms.forEach(a => { a.sh.rotation.set(-sk * 1.3, 0, a.s * 0.25); a.el.rotation.set(-0.2, 0, 0); });
    } else if (h.act === 'push') {
      R.spine.rotation.x = 0.2 + sk * 0.55; R.hips.position.y = rest.hipsY - sk * 0.08;
      R.legs[0].hip.rotation.x = -sk * 0.45; R.legs[0].knee.rotation.x = sk * 0.5; R.legs[1].hip.rotation.x = sk * 0.2;
      const sw = -0.5 - k * 1.0; R.arms[1].sh.rotation.set(sw, 0, -0.15); R.arms[1].el.rotation.set(-0.15, 0, 0);
      R.arms[0].sh.rotation.set(-0.3 - sk * 0.4, 0, 0.3);
      if (carrying) armsHold();
    } else if (h.act === 'catch') {
      // stop it with the sole, flick it up like a football, catch it
      const lift = Math.sin(Math.min(1, k / 0.75) * Math.PI);
      R.legs[1].hip.rotation.x = -lift * 0.85; R.legs[1].knee.rotation.x = lift * 0.95; R.legs[0].knee.rotation.x = lift * 0.15;
      R.spine.rotation.x = 0.12 + lift * 0.15; R.arms.forEach(a => { a.sh.rotation.set(-0.3 - k * 0.6, 0, a.s * 0.35); a.el.rotation.set(-0.4 - k * 0.3, 0, 0); });
      lookYaw = 0;
    } else if (h.act === 'throw') {
      const sw = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
      R.spine.rotation.x = -0.15 + k * 0.45; R.arms.forEach(a => { a.sh.rotation.set(0.3 - (k < 0.45 ? 0 : (k - 0.45) / 0.55) * 2.2 - sw * 0.2, 0, a.s * 0.3); a.el.rotation.set(-0.5, 0, 0); });
      R.legs[0].hip.rotation.x = -0.25 * sw; R.legs[1].hip.rotation.x = 0.2 * sw;
    } else {
      U.anim(t); if (carrying) armsHold();
      // waiting for the next tire: glance up the line
      if (this.n >= 2 && h.i > 0) { const pv = this.list[h.i - 1]; lookYaw = wrap(Math.atan2(-(pv.z - h.z), pv.x - h.x) - h.yaw) * 0.6; }
    }
    const spineT = clamp(lookYaw * 0.35, -0.5, 0.5), headT = clamp(lookYaw - spineT, -1.15, 1.15);
    const a = Math.min(1, dt * (this.stare ? 9 : 4)); h.spineYaw += (spineT - h.spineYaw) * a; h.headYaw += (headT - h.headYaw) * a;
    R.spine.rotation.y = h.spineYaw; U.head.rotation.y = h.headYaw; U.head.rotation.x = this.stare ? -0.05 : 0;
  }
  // what's in transit (for the save: these tires count as delivered, they are seconds from the van)
  transit() { const out = []; for (const r of this.rolls) out.push(r.type); for (const h of this.list) for (const c of h.carry.concat(h.queue)) out.push(c.type); return out; }
  state() { return { n: this.n, mode: this.mode, stare: this.stare, blocking: this.blocking, delivered: this.delivered, rolls: this.rolls.length, sighs: this.sighs, pipe: this.inPipe(), pos: this.list.map(h => ({ x: h.x, z: h.z, act: h.act, carry: h.carry.length, q: h.queue.length, head: h.headYaw })) }; }
}
const _hp = new THREE.Vector3();
