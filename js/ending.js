// Il finale (design doc, beat for beat):
// 1. L'ultima gomma: at remaining === 1 every machine powers down; only the 1,000,000th tire is left, alone, highlighted.
// 2. Lancio a mano: you pick it up and throw it in yourself.
// 3. Festa: fanfare + applause, the helpers jump and cheer, Beppino walks over and offers his hand. "1.000.000 DI GOMME SMALTITE!"
// 4. Il piazzale vuoto, il silenzio.
// 5. BEEP... BEEP... a dump truck full of tires backs in, raises the bed, and exactly ONE tire rolls out to your feet.
// 6. The crew stares at the tire... then at you.
// 7. Fade to black: "Fine?" -> the run statistics, "Continua nel piazzale vuoto" / "Nuova partita".
import * as THREE from 'three';
import { merge, M, box, cyl } from './gfx.js';

const wrap = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = k => k * k * (3 - 2 * k);
const UP = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
function uprightQuat(out, dx, dz, ang) { _s.set(dz, 0, -dx).normalize(); _q.setFromUnitVectors(UP, _s); _q2.setFromAxisAngle(UP, ang); return out.copy(_q).multiply(_q2); }
export const T = { PARTY: 4.2, QUIET: 3.2, REV_SPEED: 3.4, REV_DIST: 20, RAISE: 2.3, PAUSE: 1.0, STARE_TIRE: 1.9, STARE_YOU: 2.6, FADE: 1.3, FINE: 2.8 };

/* ---------- the dump truck (camion ribaltabile), local +x = forward (cab), rear at x = -3.6 ---------- */
export function buildDumpTruck(tireGeo, tireMat) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xe8661a, roughness: 0.45, metalness: 0.3 });
  const bedM = new THREE.MeshStandardMaterial({ color: 0x8a8f93, roughness: 0.6, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f21, roughness: 0.7, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x24313a, roughness: 0.1, metalness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.3, metalness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 1.2 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff8a00, emissiveIntensity: 2 });
  const ch = [], cb = [], dk = [], gl = [];
  ch.push([box(7.1, 0.28, 0.9), M(-0.15, 0.9, 0)]);                                   // chassis rails
  dk.push([box(7.2, 0.18, 2.2), M(-0.2, 0.62, 0)], [box(0.3, 0.4, 2.3), M(3.75, 0.7, 0)], [box(0.24, 0.3, 2.1), M(-3.55, 0.75, 0)]); // mud guards / bumpers
  cb.push([box(1.7, 1.55, 2.3), M(2.85, 1.85, 0)], [box(1.8, 0.95, 2.36), M(2.9, 1.1, 0)], [box(0.5, 0.25, 2.2), M(2.2, 2.75, 0)]); // cab
  gl.push([box(0.06, 0.8, 2.0), M(3.72, 2.05, 0)], [box(1.0, 0.65, 2.32), M(2.85, 2.1, 0)]);
  dk.push([box(0.1, 0.5, 1.9), M(3.74, 1.15, 0)]); // grille
  for (const s of [1, -1]) dk.push([cyl(0.09, 0.09, 1.6, 8), M(1.85, 2.0, s * 1.05)]); // exhaust stacks
  const meshes = [[ch, dark], [cb, paint], [dk, dark], [gl, glass]];
  for (const [parts, m] of meshes) { const ms = new THREE.Mesh(merge(parts), m); ms.castShadow = true; ms.receiveShadow = true; g.add(ms); }
  // wheels
  const wheels = [];
  const wGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.42, 22); wGeo.rotateX(Math.PI / 2);
  const rGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.44, 12); rGeo.rotateX(Math.PI / 2);
  for (const [x, dual] of [[3.0, false], [-1.15, true], [-2.4, true]]) for (const s of [1, -1]) {
    const w = new THREE.Group(); w.position.set(x, 0.52, s * (dual ? 0.92 : 0.98)); g.add(w);
    const t = new THREE.Mesh(wGeo, rubber); t.castShadow = true; w.add(t); const r = new THREE.Mesh(rGeo, rim); w.add(r);
    if (dual) { const t2 = new THREE.Mesh(wGeo, rubber); t2.position.z = -s * 0.44; t2.castShadow = true; w.add(t2); }
    wheels.push(w);
  }
  // the dump bed, hinged at the rear (x = -3.45, y = 1.2)
  const hinge = new THREE.Group(); hinge.position.set(-3.45, 1.22, 0); g.add(hinge);
  const bd = [];
  bd.push([box(5.3, 0.12, 2.4), M(2.65, 0.06, 0)]);
  for (const s of [1, -1]) bd.push([box(5.3, 1.15, 0.1), M(2.65, 0.63, s * 1.15)]);
  bd.push([box(0.12, 1.4, 2.4), M(5.25, 0.75, 0)], [box(0.5, 0.12, 2.4), M(5.5, 1.4, 0)]); // headboard + cab guard
  bd.push([box(0.1, 1.05, 2.3), M(0.05, 0.6, 0)]); // tailgate
  for (let i = 0; i < 6; i++) bd.push([box(0.06, 1.15, 0.14), M(0.5 + i * 0.9, 0.63, 1.22)], [box(0.06, 1.15, 0.14), M(0.5 + i * 0.9, 0.63, -1.22)]); // ribs
  const bm = new THREE.Mesh(merge(bd), bedM); bm.castShadow = true; bm.receiveShadow = true; hinge.add(bm);
  // a full load of tires heaped in the bed (they stay stuck in there...)
  const load = new THREE.InstancedMesh(tireGeo, tireMat, 34); load.castShadow = true;
  const o = new THREE.Object3D(); let k = 0;
  for (let lay = 0; lay < 3; lay++) for (let i = 0; i < 6 && k < 34; i++) for (let j = 0; j < 2 && k < 34; j++) {
    if (lay === 2 && (i === 0 || i === 5)) continue;
    o.position.set(0.7 + i * 0.82 + (lay % 2) * 0.3, 0.32 + lay * 0.36, (j ? 0.52 : -0.52) + (lay % 2 ? 0.1 : 0)); o.rotation.set(0.25 * Math.sin(k * 3.1), k * 0.9, 0.3 * Math.cos(k * 1.7)); o.updateMatrix(); load.setMatrixAt(k++, o.matrix);
  }
  load.count = k; hinge.add(load);
  // hydraulic ram (barrel on the chassis, rod to the bed front)
  const ram = new THREE.Mesh(cyl(0.12, 0.12, 1, 10), dark), rod = new THREE.Mesh(cyl(0.07, 0.07, 1, 8), rim); g.add(ram, rod);
  // lights: reversing lights + rear reds + the roof beacon
  const rl = []; for (const s of [1, -1]) rl.push([box(0.06, 0.16, 0.26), M(-3.68, 0.95, s * 0.85)]);
  const rev = new THREE.Mesh(merge(rl), white); g.add(rev);
  const rr = []; for (const s of [1, -1]) rr.push([box(0.06, 0.12, 0.2), M(-3.68, 0.95, s * 0.55)]);
  g.add(new THREE.Mesh(merge(rr), red));
  const bc = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), amber); bc.position.set(2.6, 2.88, 0); g.add(bc);
  g.userData = { wheels, hinge, ram, rod, rev, beacon: amber };
  return g;
}
function poseRam(U, ang) {
  // barrel base on the chassis at x = -0.2 (truck frame), rod end on the bed at local (2.0, 0) of the hinge
  const hx = -3.45, hy = 1.22, ex = hx + Math.cos(ang) * 2.2, ey = hy + Math.sin(ang) * 2.2, bx = -1.0, by = 1.0;
  const dx = ex - bx, dy = ey - by, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - Math.PI / 2;
  U.ram.scale.set(1, Math.min(L, 1.1), 1); U.ram.position.set(bx + Math.cos(a + Math.PI / 2) * Math.min(L, 1.1) / 2, by + Math.sin(a + Math.PI / 2) * Math.min(L, 1.1) / 2, 0); U.ram.rotation.set(0, 0, a);
  U.rod.scale.set(1, L, 1); U.rod.position.set(bx + dx / 2, by + dy / 2, 0); U.rod.rotation.set(0, 0, a);
}

/* ---------- the people: pose helpers on the worker rig (see workers.js / helpers.js) ---------- */
function restPose(R) {
  const rest = R.rest;
  R.spine.rotation.set(0, 0, 0); R.hips.rotation.set(0, 0, 0); R.hips.position.set(0, rest.hipsY, 0);
  R.legs.forEach((l, i) => { l.hip.rotation.set(0, 0, i ? -0.04 : 0.04); l.knee.rotation.set(0, 0, 0); });
  R.arms.forEach((a, i) => { a.sh.rotation.copy(rest.arms[i].sh); a.el.rotation.copy(rest.arms[i].el); a.wr.rotation.copy(rest.arms[i].wr); });
}
function walkPose(R, ph) {
  const s = Math.sin(ph), c = Math.cos(ph);
  R.legs[0].hip.rotation.x = s * 0.5; R.legs[1].hip.rotation.x = -s * 0.5;
  R.legs[0].knee.rotation.x = Math.max(0, -c) * 0.75; R.legs[1].knee.rotation.x = Math.max(0, c) * 0.75;
  R.hips.position.y = R.rest.hipsY - 0.02 + Math.abs(c) * 0.025; R.spine.rotation.x = 0.06;
  R.arms.forEach((a, i) => { a.sh.rotation.x = (i ? s : -s) * 0.45; a.el.rotation.x = -0.25; });
}

// unhide, force a style flush, then add .show so the CSS transition always plays (no rAF: works while frames are throttled too)
function showNow(el) { el.classList.remove('hidden'); void el.offsetWidth; el.classList.add('show'); }
export class Ending {
  // host: { scene, sfx, P, people() -> [{g, x, z, yaw, beppino}], tireMesh(type), freeMesh(m), tireGeo, tireMat,
  //         blocked(x, z, pad) -> bool, center {x,z}, $ (id -> element), stats() -> {...}, onContinue(), onNewGame(), onStage(stage) }
  constructor(host) {
    this.host = host; this.stage = 'off'; this.t = 0; this.people = []; this.truck = null; this.tire = null; this.beam = null;
    this.log = []; this.handshake = false;
  }
  get on() { return this.stage !== 'off'; }
  go(stage) { this.stage = stage; this.t = 0; this.log.push(stage); this.host.onStage && this.host.onStage(stage); }
  // ---- 1. the last tire ----
  beginLast(pos) {
    if (this.stage !== 'off') return;
    this.go('last'); this.host.sfx.windDown();
    const $ = this.host.$; $('endhint').classList.remove('hidden');
    // a soft pulsing ring + a tall faint light column so it can't be missed from anywhere in the yard
    if (!pos) return; // already in your hands (or mid-air): no marker needed
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 48), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.05, pos.z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 26, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe7a8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    col.position.set(pos.x, 13, pos.z);
    this.beam = new THREE.Group(); this.beam.add(ring, col); this.beam.userData = { ring, col }; this.host.scene.add(this.beam);
  }
  dropBeam() { if (this.beam) { this.host.scene.remove(this.beam); this.beam = null; } }
  clearLast() { if (this.beam) { this.host.scene.remove(this.beam); this.beam = null; } this.host.$('endhint').classList.add('hidden'); }
  // ---- 3. the party (called by the game when the last tire is gone) ----
  party() {
    if (this.stage !== 'last') return;
    this.clearLast(); this.go('party');
    const H = this.host, $ = H.$; H.sfx.fanfare(); H.sfx.applause(4);
    $('endbanner').classList.remove('hidden'); showNow($('endbanner'));
    this.people = H.people().map((p, i) => ({ ...p, i, y: 0, headYaw: 0, headPitch: 0, spineYaw: 0, ph: Math.random() * 6, look: null }));
    const P = H.P, bep = this.people.find(p => p.beppino) || this.people[0];
    this.bep = bep;
    if (bep) { // never more than ~9 m away: he jogs in from the side
      const d = Math.hypot(bep.x - P.x, bep.z - P.z); if (d > 9) { const k = 9 / d; bep.x = P.x + (bep.x - P.x) * k; bep.z = P.z + (bep.z - P.z) * k; }
      bep.g.visible = true;
    }
    this.confetti();
  }
  confetti() {
    const N = 260, geo = new THREE.PlaneGeometry(0.07, 0.11), mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, N), cols = [0xe8661a, 0xe8b21c, 0x2f62b0, 0x3f7a3c, 0xffffff, 0xb3322a], c = new THREE.Color();
    const P = this.host.P; this.cf = { im, parts: [] };
    for (let i = 0; i < N; i++) { im.setColorAt(i, c.setHex(cols[i % cols.length])); this.cf.parts.push({ x: P.x + (Math.random() - 0.5) * 9, y: 4 + Math.random() * 5, z: P.z + (Math.random() - 0.5) * 9, vy: -0.6 - Math.random() * 0.8, r: Math.random() * 6, w: 2 + Math.random() * 5 }); }
    this.host.scene.add(im);
  }
  updateConfetti(dt) {
    if (!this.cf) return; const o = new THREE.Object3D(), im = this.cf.im; let alive = 0;
    this.cf.parts.forEach((p, i) => { p.y += p.vy * dt; p.r += p.w * dt; p.x += Math.sin(p.r * 0.7) * dt * 0.4; if (p.y > 0.02) alive++; o.position.set(p.x, Math.max(0.02, p.y), p.z); o.rotation.set(p.r, p.r * 0.6, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.instanceMatrix.needsUpdate = true; if (!alive && this.stage !== 'party') { this.host.scene.remove(im); this.cf = null; }
  }
  // the truck comes from a direction with nothing in the way (preferably the empty mountain)
  truckDir() {
    const H = this.host, P = H.P, base = Math.atan2(H.center.z - P.z, H.center.x - P.x);
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1, 2.6, -2.6, Math.PI]) {
      const a = base + off, dx = Math.cos(a), dz = Math.sin(a); let ok = true;
      for (let d = 2.2; d <= 6.5 + 7.5 + T.REV_DIST && ok; d += 0.8) for (const w of [-1.4, 0, 1.4]) if (H.blocked(P.x + dx * d - dz * w, P.z + dz * d + dx * w, 0)) { ok = false; break; }
      if (ok) return { x: dx, z: dz };
    }
    return { x: Math.cos(base), z: Math.sin(base) };
  }
  startTruck() {
    const H = this.host, P = H.P, dir = this.truckDir();
    if (!this.truck) { this.truck = buildDumpTruck(H.tireGeo, H.tireMat); H.scene.add(this.truck); }
    const tr = this.truck; tr.visible = true;
    const stopRear = { x: P.x + dir.x * 6.2, z: P.z + dir.z * 6.2 };
    this.tk = { dir, stop: { x: stopRear.x + dir.x * 3.6, z: stopRear.z + dir.z * 3.6 }, d: T.REV_DIST, beepT: 0, ang: 0, feet: { x: P.x + dir.x * 0.9, z: P.z + dir.z * 0.9 } };
    tr.rotation.set(0, Math.atan2(-dir.z, dir.x), 0); this.placeTruck();
    tr.userData.hinge.rotation.z = 0; poseRam(tr.userData, 0);
  }
  placeTruck() { const k = this.tk; this.truck.position.set(k.stop.x + k.dir.x * k.d, 0, k.stop.z + k.dir.z * k.d); }
  update(dt) {
    if (this.stage === 'off') return;
    this.t += dt; const H = this.host, P = H.P, $ = H.$, t = this.t;
    if (this.beam) { const k = 0.5 + 0.5 * Math.sin(performance.now() / 300); this.beam.userData.ring.material.opacity = 0.35 + k * 0.45; this.beam.userData.ring.scale.setScalar(1 + k * 0.15); }
    this.updateConfetti(dt);
    switch (this.stage) {
      case 'party': if (t > T.PARTY) { $('endbanner').classList.remove('show'); this.go('quiet'); } break;
      case 'quiet': if (t > T.QUIET) { this.go('truck'); this.startTruck(); } break;
      case 'truck': {
        const k = this.tk, tr = this.truck; k.beepT -= dt; if (k.beepT <= 0) { k.beepT = 0.9; H.sfx.reverseBeep(Math.hypot(tr.position.x - P.x, tr.position.z - P.z)); }
        const v = T.REV_SPEED * Math.min(1, 0.35 + k.d / 6); k.d = Math.max(0, k.d - v * dt); this.placeTruck();
        for (const w of tr.userData.wheels) w.rotation.z += v * dt / 0.52;
        tr.userData.rev.material.emissiveIntensity = (Math.sin(t * 7) > 0) ? 2.2 : 0.4;
        if (k.d <= 0) { this.go('dump'); H.sfx.airBrake && H.sfx.airBrake(7); H.sfx.hydraulic(T.RAISE, 7); }
        break;
      }
      case 'dump': {
        const k = this.tk, tr = this.truck, U = tr.userData;
        k.ang = ease(clamp(t / T.RAISE, 0, 1)) * 0.82; U.hinge.rotation.z = k.ang; poseRam(U, k.ang);
        if (t > T.RAISE + T.PAUSE && !this.tire) this.dropTire();
        if (this.tire) this.updateTire(dt);
        break;
      }
      case 'stare': if (t > T.STARE_TIRE + T.STARE_YOU) { this.go('fade'); $('endfade').classList.remove('hidden'); showNow($('endfade')); } break;
      case 'fade':
        if (t > T.FADE * 0.6 && $('endfine').classList.contains('hidden')) { $('endfine').classList.remove('hidden'); showNow($('endfine')); }
        if (t > T.FADE + T.FINE) { this.go('stats'); this.showStats(); }
        break;
    }
    if (this.truck && this.stage !== 'truck') { const b = this.truck.userData.beacon; b.emissiveIntensity = Math.sin(performance.now() / 120) > 0 ? 2.4 : 0.3; }
    if (this.stage === 'stare' || this.stage === 'fade') { if (this.tire && this.tire.phase !== 'done') this.updateTire(dt); }
    this.posePeople(dt);
  }
  // ---- 5. exactly one tire tumbles out of the raised bed and rolls to your feet ----
  dropTire() {
    const H = this.host, k = this.tk, tr = this.truck; tr.updateMatrixWorld(true);
    const from = new THREE.Vector3(0.25, 0.55, 0.2); tr.userData.hinge.localToWorld(from);
    const P = H.P; k.feet = { x: P.x + k.dir.x * 0.85, z: P.z + k.dir.z * 0.85 };
    const land = { x: from.x - k.dir.x * 0.9, z: from.z - k.dir.z * 0.9 };
    const mesh = H.tireMesh(1);
    this.tire = { mesh, phase: 'fall', t: 0, from, land, R: 0.315, ang: 0, dx: -k.dir.x, dz: -k.dir.z, dist: Math.hypot(k.feet.x - land.x, k.feet.z - land.z) };
    mesh.position.copy(from); H.sfx.whoosh && H.sfx.whoosh(0);
  }
  updateTire(dt) {
    const H = this.host, r = this.tire, m = r.mesh; r.t += dt;
    if (r.phase === 'fall') {
      const k = Math.min(1, r.t / 0.55), x = r.from.x + (r.land.x - r.from.x) * k, z = r.from.z + (r.land.z - r.from.z) * k, y = r.from.y + (r.R - r.from.y) * k * k + Math.sin(k * Math.PI) * 0.25;
      m.position.set(x, y, z); uprightQuat(m.quaternion, r.dx, r.dz, -r.t * 6);
      if (k >= 1) { r.phase = 'roll'; r.t = 0; H.sfx.thud && H.sfx.thud(1, 0, 1); H.sfx.roll && H.sfx.roll(1, 3.2, 0); r.dur = Math.max(2.4, r.dist / 1.4); }
    } else if (r.phase === 'roll') {
      const k = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - k, 2.2), d = r.dist * e;
      const x = r.land.x + r.dx * d, z = r.land.z + r.dz * d; r.ang = d / r.R;
      m.position.set(x, r.R, z); uprightQuat(m.quaternion, r.dx, r.dz, -r.ang); m.rotateZ(Math.sin(r.t * 8) * 0.05 * k);
      if (k >= 1) { r.phase = 'topple'; r.t = 0; r.q0 = m.quaternion.clone(); r.p0 = m.position.clone(); }
    } else if (r.phase === 'topple') {
      // a little wobble... and it settles flat on the ground at your feet
      const k = Math.min(1, r.t / 0.9), e = k * k;
      _q.setFromAxisAngle(_v.set(r.dx, 0, r.dz), 0); const flat = new THREE.Quaternion(); flat.setFromAxisAngle(UP, r.ang);
      m.quaternion.copy(r.q0).slerp(flat, e); m.position.set(r.p0.x, r.R + (0.1 - r.R) * e + Math.sin(k * Math.PI * 3) * 0.02 * (1 - k), r.p0.z);
      if (k >= 1) { r.phase = 'done'; H.sfx.thud && H.sfx.thud(1, 0, 0.8); if (this.stage === 'dump') this.go('stare'); }
    }
  }
  // ---- 3/6. what the people do ----
  posePeople(dt) {
    const P = this.host.P, st = this.stage, t = this.t;
    for (const p of this.people) {
      const R = p.g.userData.rig, U = p.g.userData; restPose(R); U.anim(performance.now() / 1000 + p.i);
      let look = { x: P.x, z: P.z }, pitch = 0, bodyTurn = false, y = 0;
      if (st === 'party') {
        if (p === this.bep) this.beppino(p, dt, R);
        else { // jump and cheer, arms up waving
          const ph = t * 7.5 + p.i * 1.3; y = Math.max(0, Math.sin(ph)) * 0.32;
          R.arms.forEach((a, i) => { a.sh.rotation.set(-2.7 + Math.sin(ph * 0.5 + i) * 0.35, 0, a.s * 0.35); a.el.rotation.set(-0.3, 0, 0); });
          R.legs.forEach(l => { l.knee.rotation.x = y > 0.02 ? 0.35 : 0.1; });
          bodyTurn = true;
        }
      } else if (st === 'quiet') {
        if (p === this.bep) this.beppino(p, dt, R); else bodyTurn = true;
      } else if (st === 'truck' || st === 'dump') {
        const tr = this.truck; look = { x: tr.position.x, z: tr.position.z }; bodyTurn = true;
        if (st === 'dump' && this.tire) look = { x: this.tire.mesh.position.x, z: this.tire.mesh.position.z };
      } else if (st === 'stare' || st === 'fade' || st === 'stats' || st === 'free') {
        bodyTurn = true;
        const tire = this.tire ? this.tire.mesh.position : P;
        if (st === 'stare' && t < T.STARE_TIRE) { look = { x: tire.x, z: tire.z }; pitch = 0.55; }
        else { look = { x: P.x, z: P.z }; pitch = 0; }
        if (st === 'stare' || st === 'fade') R.arms.forEach(a => { a.sh.rotation.set(0.12, 0, a.s * 0.42); a.el.rotation.set(-0.85, 0, a.s * -0.55); }); // hands on hips
      }
      const want = Math.atan2(-(look.z - p.z), look.x - p.x);
      if (bodyTurn) p.yaw += wrap(want - p.yaw) * Math.min(1, dt * 3.2);
      const rel = clamp(wrap(want - p.yaw), -1.2, 1.2);
      p.headYaw += (rel - p.headYaw) * Math.min(1, dt * 6); p.headPitch += (pitch - p.headPitch) * Math.min(1, dt * 5);
      p.y += (y - p.y) * Math.min(1, dt * 18);
      p.g.position.set(p.x, p.y, p.z); p.g.rotation.y = p.yaw; U.head.rotation.y = p.headYaw; U.head.rotation.x = p.headPitch;
    }
  }
  beppino(p, dt, R) {
    const P = this.host.P, dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz), want = Math.atan2(-dz, dx);
    if (d > 1.15) { // walks over to you
      const sp = 2.4; p.x += dx / d * Math.min(sp * dt, d - 1.15); p.z += dz / d * Math.min(sp * dt, d - 1.15);
      p.yaw += wrap(want - p.yaw) * Math.min(1, dt * 8); p.ph += dt * 7.5; walkPose(R, p.ph); p.hand = 0;
    } else { // ...and offers his hand: a firm handshake
      p.yaw += wrap(want - p.yaw) * Math.min(1, dt * 6); p.hand = Math.min(1, (p.hand || 0) + dt * 2.5); this.handshake = true;
      const h = ease(p.hand), shake = p.hand >= 1 ? Math.sin(performance.now() / 110) * 0.08 : 0;
      R.arms[1].sh.rotation.set(-1.25 * h + shake, 0, -0.05); R.arms[1].el.rotation.set(-0.3 * h, 0, 0); R.arms[1].wr.rotation.set(0, 0, 0);
      R.arms[0].sh.rotation.set(0.12, 0, R.arms[0].s * 0.42); R.arms[0].el.rotation.set(-0.85, 0, R.arms[0].s * -0.55);
    }
  }
  showStats() {
    const $ = this.host.$, s = this.host.stats();
    $('endstatlist').innerHTML = s.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
    $('endfine').classList.add('up'); $('endstats').classList.remove('hidden'); showNow($('endstats'));
  }
  // "Continua nel piazzale vuoto"
  continueFree() {
    const $ = this.host.$; this.go('free');
    $('endfade').classList.remove('show'); setTimeout(() => { $('endfade').classList.add('hidden'); $('endfine').classList.add('hidden'); $('endfine').classList.remove('show', 'up'); $('endstats').classList.add('hidden'); $('endstats').classList.remove('show'); }, 900);
    this.host.onContinue && this.host.onContinue();
  }
  // a reload after the finale: the empty yard, the dump truck parked with the bed down, the tire at your feet is gone
  restoreFree() {
    this.go('free');
  }
  state() { return { stage: this.stage, t: this.t, log: this.log.slice(), handshake: this.handshake, truck: this.truck ? { x: this.truck.position.x, z: this.truck.position.z, bed: this.truck.userData.hinge.rotation.z, d: this.tk && this.tk.d } : null, tire: this.tire ? { phase: this.tire.phase, x: this.tire.mesh.position.x, y: this.tire.mesh.position.y, z: this.tire.mesh.position.z } : null, bep: this.bep ? { x: this.bep.x, z: this.bep.z, hand: this.bep.hand || 0 } : null, people: this.people.length }; }
}
