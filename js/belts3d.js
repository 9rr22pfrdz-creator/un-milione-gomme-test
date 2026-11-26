// Conveyor belts in 3D: shared geometries/materials per piece type, scrolling >>> chevrons, pooled instanced tires,
// blueprint preview (glowing blue / red) and a 2 m grid decal for build mode.
import * as THREE from 'three';
import { merge, M, box, cyl, cvs } from './gfx.js';
import { Belts, PIECES, pathPoint, cellCenter, GRID } from './beltlogic.js';

const BELT_Y = 0.62, HALF_W = 0.43;
function chevronTexture() {
  const [c, x] = cvs(128, 64); x.fillStyle = '#1b1c1f'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 700; i++) { const g = 20 + Math.random() * 30 | 0; x.fillStyle = `rgba(${g},${g},${g + 2},0.6)`; x.fillRect(Math.random() * 128, Math.random() * 64, 1.5, 1.5); }
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 0, 128, 5); x.fillRect(0, 59, 128, 5);
  x.strokeStyle = 'rgba(244,246,248,0.97)'; x.lineWidth = 11; x.lineCap = 'square'; x.lineJoin = 'miter';
  for (const ox of [28, 92]) { x.beginPath(); x.moveTo(ox - 12, 14); x.lineTo(ox + 10, 32); x.lineTo(ox - 12, 50); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function grimeTexture(base) {
  const [c, x] = cvs(128, 128); x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1600; i++) { const a = Math.random() * 0.18; x.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,240,220,${a * 0.5})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(90,60,30,${0.05 + Math.random() * 0.12})`; x.beginPath(); x.ellipse(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 14, 2 + Math.random() * 6, Math.random() * 3, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function hazardTexture() {
  const [c, x] = cvs(128, 32); x.fillStyle = '#e2a91e'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#1a1a1a';
  for (let i = -32; i < 160; i += 32) { x.beginPath(); x.moveTo(i, 32); x.lineTo(i + 16, 32); x.lineTo(i + 32, 0); x.lineTo(i + 16, 0); x.fill(); }
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`; x.fillRect(Math.random() * 128, Math.random() * 32, 2, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// a horizontal band (belt surface) or vertical wall (curved rail) along an arc around `corner`, in the rot-0 local frame
function arcStrip(corner, d, e, r0, r1, y0, y1, uScale, segs = 14) {
  const pos = [], uv = [], nor = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const th = i / segs * Math.PI / 2, cs = Math.cos(th), sn = Math.sin(th), vx = -e[0] * cs + d[0] * sn, vz = -e[1] * cs + d[1] * sn;
    for (const [r, y, v] of [[r0, y0, 0], [r1, y1, 1]]) { pos.push(corner[0] + vx * r, y, corner[1] + vz * r); uv.push(th * uScale, v); if (y0 === y1) nor.push(0, 1, 0); else nor.push(vx, 0, vz); }
  }
  for (let i = 0; i < segs; i++) { const a = i * 2, b = a + 1, c = a + 2, dd = a + 3; idx.push(a, b, c, b, dd, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g.toNonIndexed();
}
function planeXZ(w, d, cx, cz, y, uRep) { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(cx, y, cz); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * uRep); return g; }

function buildGeos() {
  const G = {};
  const legs = (pts) => { const P = []; for (const [x, z] of pts) { P.push([box(0.07, BELT_Y - 0.06, 0.07), M(x, (BELT_Y - 0.06) / 2, z)], [box(0.16, 0.02, 0.16), M(x, 0.01, z)]); } return P; };
  // straight: rot-0 frame, path along +x from -1 to +1
  {
    const steel = [], yel = [];
    for (const s of [1, -1]) { steel.push([box(2.0, 0.13, 0.05), M(0, BELT_Y - 0.025, s * (HALF_W + 0.04))]); yel.push([box(2.0, 0.03, 0.055), M(0, BELT_Y + 0.05, s * (HALF_W + 0.04))]); }
    steel.push([box(1.98, 0.07, HALF_W * 2), M(0, BELT_Y - 0.06, 0)]);
    for (const x of [-0.97, 0.97]) steel.push([cyl(0.055, 0.055, HALF_W * 2 + 0.02, 10), M(x, BELT_Y - 0.035, 0, Math.PI / 2)]);
    steel.push(...legs([[-0.75, 0.42], [-0.75, -0.42], [0.75, 0.42], [0.75, -0.42]]));
    for (const x of [-0.75, 0.75]) steel.push([box(0.05, 0.05, 0.84), M(x, 0.22, 0)]);
    G.straight = { steel: merge(steel), yellow: merge(yel), belt: planeXZ(1.96, HALF_W * 2, 0, 0, BELT_Y, 4) };
  }
  // curves: entry heading +x at (-1,0); exit +z (right) or -z (left)
  for (const [key, sgn] of [['curveR', 1], ['curveL', -1]]) {
    const d = [1, 0], e = [0, sgn], corner = [-1, sgn * 1];
    const steel = [], yel = [];
    for (const r of [1 - HALF_W - 0.04, 1 + HALF_W + 0.04]) { steel.push([arcStrip(corner, d, e, r, r, BELT_Y - 0.09, BELT_Y + 0.04, 1), null]); yel.push([arcStrip(corner, d, e, r, r, BELT_Y + 0.035, BELT_Y + 0.065, 1), null]); }
    steel.push([arcStrip(corner, d, e, 1 - HALF_W, 1 + HALF_W, BELT_Y - 0.07, BELT_Y - 0.07, 1), null]);
    const lp = []; for (const th of [0.25, 0.8, 1.35]) for (const r of [1 - 0.4, 1 + 0.4]) lp.push([corner[0] + r * (-e[0] * Math.cos(th) + d[0] * Math.sin(th)), corner[1] + r * (-e[1] * Math.cos(th) + d[1] * Math.sin(th))]);
    steel.push(...legs(lp));
    G[key] = { steel: merge(steel), yellow: merge(yel), belt: arcStrip(corner, d, e, 1 - HALF_W, 1 + HALF_W, BELT_Y, BELT_Y, 2) };
  }
  // intake: hopper + scoop wheel at the back (-x, facing the mountain), short belt from centre to +x edge
  {
    const steel = [], yel = [], haz = [];
    for (const s of [1, -1]) { steel.push([box(1.0, 0.13, 0.05), M(0.5, BELT_Y - 0.025, s * (HALF_W + 0.04))]); yel.push([box(1.0, 0.03, 0.055), M(0.5, BELT_Y + 0.05, s * (HALF_W + 0.04))]); }
    steel.push([box(1.0, 0.07, HALF_W * 2), M(0.5, BELT_Y - 0.06, 0)]);
    steel.push(...legs([[0.75, 0.42], [0.75, -0.42], [-0.62, 0.55], [-0.62, -0.55], [0.1, 0.55], [0.1, -0.55]]));
    // hopper frame + funnel
    steel.push([box(1.25, 0.08, 1.25), M(-0.25, 1.0, 0)]);
    const funnel = new THREE.CylinderGeometry(0.88, 0.42, 0.62, 4, 1, true); funnel.rotateY(Math.PI / 4); yel.push([funnel, M(-0.25, 1.36, 0)]);
    const funnelIn = new THREE.CylinderGeometry(0.86, 0.4, 0.6, 4, 1, true); funnelIn.rotateY(Math.PI / 4); funnelIn.scale(-1, 1, 1); steel.push([funnelIn, M(-0.25, 1.36, 0)]);
    haz.push([box(1.27, 0.12, 1.27), M(-0.25, 0.9, 0)]);
    // chute from the hopper down onto the belt
    steel.push([box(0.7, 0.05, 0.8), M(0.15, 0.82, 0, 0, 0, -0.45)]);
    // motor box + axle for the scoop wheel
    yel.push([box(0.32, 0.3, 0.26), M(-0.55, 0.62, 0.66)]); steel.push([cyl(0.04, 0.04, 1.5, 8), M(-1.0, 0.7, 0, Math.PI / 2)]);
    for (const s of [1, -1]) steel.push([box(0.08, 0.7, 0.08), M(-1.0, 0.35, s * 0.72)]);
    G.intake = { steel: merge(steel), yellow: merge(yel), hazard: merge(haz), belt: planeXZ(0.98, HALF_W * 2, 0.5, 0, BELT_Y, 2) };
    // scoop wheel (spins while feeding): hub + 6 paddles
    const pw = [[cyl(0.12, 0.12, 1.2, 10), M(0, 0, 0, Math.PI / 2)]];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; pw.push([box(0.06, 0.42, 1.1), M(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0, 0, 0, a + Math.PI / 2)]); }
    G.scoop = merge(pw);
  }
  return G;
}

export class BeltWorld {
  constructor({ scene, tireGeo, rubber, gold, T16, TIRES, GOLD_ID }) {
    this.scene = scene; this.T16 = T16; this.TIRES = TIRES; this.GOLD_ID = GOLD_ID;
    this.logic = new Belts(); this.meshes = new Map();
    this.geo = buildGeos();
    this.chev = chevronTexture();
    this.mat = {
      steel: new THREE.MeshStandardMaterial({ map: grimeTexture('#4d545b'), color: 0xffffff, roughness: 0.55, metalness: 0.55 }),
      yellow: new THREE.MeshStandardMaterial({ map: grimeTexture('#d9a21f'), roughness: 0.6, metalness: 0.2 }),
      hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 }),
      belt: new THREE.MeshStandardMaterial({ map: this.chev, roughness: 0.82, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }),
    };
    this.mat.hazard.map.repeat.set(4, 1);
    const bp = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.bpMat = { ok: bp(0x46b4ff, 0.42), bad: bp(0xff3b30, 0.42), del: bp(0xff8a1e, 0.5) };
    this.bpEdge = { ok: new THREE.LineBasicMaterial({ color: 0xb8e6ff, transparent: true, opacity: 0.95, fog: false }), bad: new THREE.LineBasicMaterial({ color: 0xffb0aa, transparent: true, opacity: 0.95, fog: false }), del: new THREE.LineBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0.95, fog: false }) };
    this.preview = {}; this.previewEdges = {};
    for (const k of Object.keys(PIECES)) {
      const g = new THREE.Group(), parts = [this.geo[k].steel, this.geo[k].yellow, this.geo[k].belt].concat(this.geo[k].hazard ? [this.geo[k].hazard] : []);
      const meshes = parts.map(p => new THREE.Mesh(p, this.bpMat.ok)); meshes.forEach(m => { m.renderOrder = 5; g.add(m); });
      const edges = parts.map(p => new THREE.LineSegments(new THREE.EdgesGeometry(p, 35), this.bpEdge.ok)); edges.forEach(e => { e.renderOrder = 6; g.add(e); });
      g.userData = { meshes, edges }; g.visible = false; scene.add(g); this.preview[k] = g;
    }
    // grid decal: 10x10 m, lines on the 2 m cell borders, fading out from the centre
    { const [c, x] = cvs(320, 320); x.clearRect(0, 0, 320, 320); x.strokeStyle = 'rgba(120,200,255,0.9)'; x.lineWidth = 3; for (let i = 0; i <= 5; i++) { const p = i * 64; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 320); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(320, p); x.stroke(); }
      x.globalCompositeOperation = 'destination-in'; const gr = x.createRadialGradient(160, 160, 30, 160, 160, 160); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 320, 320);
      const t = new THREE.CanvasTexture(c); this.grid = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      this.grid.rotation.x = -Math.PI / 2; this.grid.visible = false; this.grid.renderOrder = 4; scene.add(this.grid); }
    // pooled tires riding the belts
    const im = (mat, n) => { const m = new THREE.InstancedMesh(tireGeo, mat, n); m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
    this.tiresIM = im(rubber, 400); this.goldIM = im(gold, 24);
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._pt = {};
  }
  makeMesh(p) {
    const g = new THREE.Group(), G = this.geo[p.type];
    for (const [geo, mat] of [[G.steel, this.mat.steel], [G.yellow, this.mat.yellow], [G.belt, this.mat.belt]].concat(G.hazard ? [[G.hazard, this.mat.hazard]] : [])) { const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== this.mat.belt; m.receiveShadow = true; g.add(m); }
    if (p.type === 'intake') { const s = new THREE.Mesh(this.geo.scoop, this.mat.steel); s.position.set(-1.0, 0.7, 0); s.castShadow = true; g.add(s); g.userData.scoop = s; }
    const c = cellCenter(p.gx, p.gz); g.position.set(c.x, 0, c.z); g.rotation.y = -p.rot * Math.PI / 2;
    this.scene.add(g); this.meshes.set(p, g); return g;
  }
  add(type, gx, gz, rot) { const p = this.logic.add(type, gx, gz, rot); if (p) { const g = this.makeMesh(p); g.scale.setScalar(0.01); p.pop = 0; } return p; }
  remove(p) { const g = this.meshes.get(p); if (g) { this.scene.remove(g); this.meshes.delete(p); } return this.logic.remove(p); }
  load(list) { for (const g of this.meshes.values()) this.scene.remove(g); this.meshes.clear(); this.logic.load(list); for (const p of this.logic.pieces) this.makeMesh(p); }
  get pieces() { return this.logic.pieces; }
  // footprint (world AABB) of a piece in a cell
  static footprint(type, gx, gz, rot) { const c = cellCenter(gx, gz); if (type === 'straight') { const a = rot % 2 === 0; return { x0: c.x - (a ? 1.0 : 0.52), x1: c.x + (a ? 1.0 : 0.52), z0: c.z - (a ? 0.52 : 1.0), z1: c.z + (a ? 0.52 : 1.0) }; } const h = type === 'intake' ? 0.95 : 0.9; return { x0: c.x - h, x1: c.x + h, z0: c.z - h, z1: c.z + h }; }
  hit(x, z, pad = 0) { for (const p of this.logic.pieces) { const f = BeltWorld.footprint(p.type, p.gx, p.gz, p.rot); if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad) return p; } return null; }
  showPreview(type, gx, gz, rot, state) {
    for (const k in this.preview) this.preview[k].visible = false;
    if (!type) { this.grid.visible = false; return; }
    const g = this.preview[type], c = cellCenter(gx, gz); g.visible = true; g.position.set(c.x, 0.004, c.z); g.rotation.y = -rot * Math.PI / 2;
    const pulse = 0.34 + Math.sin(performance.now() / 180) * 0.08; const mm = this.bpMat[state]; mm.opacity = pulse + (state === 'del' ? 0.1 : 0);
    g.userData.meshes.forEach(m => m.material = mm); g.userData.edges.forEach(e => e.material = this.bpEdge[state]);
    this.grid.visible = true; this.grid.position.set(c.x, 0.03, c.z);
  }
  // dt, belt speed (m/s), van rear point, canSink(tire, piece) -> bool
  update(dt, speed, rear, canSink) {
    this.chev.offset.x -= speed * dt / 0.5;
    this.logic.step(dt, speed, rear, canSink);
    let n = 0, ng = 0; const pt = this._pt;
    for (const p of this.logic.pieces) {
      const g = this.meshes.get(p);
      if (g && p.pop != null) { p.pop = Math.min(1, p.pop + dt * 5); const k = p.pop, s = 1 + Math.sin(k * Math.PI) * 0.12; g.scale.setScalar(k >= 1 ? 1 : Math.max(0.01, k) * s); g.position.y = (1 - k) * 0.4; if (k >= 1) { p.pop = null; g.position.y = 0; g.scale.setScalar(1); } }
      if (g && g.userData.scoop) g.userData.scoop.rotation.z -= dt * (p.feeding ? 4 : 0.4);
      for (const t of p.tires) {
        pathPoint(p, t.s, pt); const T = this.TIRES[t.type];
        this._p.set(pt.x, BELT_Y + T.w / 2 + 0.005, pt.z); this._q.setFromAxisAngle(UPY, Math.atan2(-pt.hz, pt.hx) + (t.spin || 0));
        this._s.set(T.R / this.T16.R, T.w / this.T16.w, T.R / this.T16.R); this._m.compose(this._p, this._q, this._s);
        if (t.type === this.GOLD_ID) { if (ng < 24) this.goldIM.setMatrixAt(ng++, this._m); } else if (n < 400) this.tiresIM.setMatrixAt(n++, this._m);
      }
    }
    this.tiresIM.count = n; this.goldIM.count = ng; this.tiresIM.instanceMatrix.needsUpdate = true; this.goldIM.instanceMatrix.needsUpdate = true;
  }
  worldOf(p, s) { const pt = pathPoint(p, s, {}); return new THREE.Vector3(pt.x, BELT_Y + 0.12, pt.z); }
}
const UPY = new THREE.Vector3(0, 1, 0);
export { BELT_Y, GRID };
