// Un Milione di Gomme: by hand, the trolley, helpers, conveyor belts + robotic arms you build yourself, bigger trucks,
// the storage rack and the no-deadline contracts board.
import * as THREE from 'three';
import * as C from './config.js';
import { Mountain, N, CELL, ORIGIN, GRAB_LAYERS, SHOW_BURIED, hash2 } from './mountain.js';
import { braidLayout, placeTire } from './braid.js';
import * as SV from './save.js';
import { Sfx } from './audio.js';
import * as G from './gfx.js';
import { buildWorker } from './workers.js';
import { trolleySVG } from './trolley-icon.js';
import * as YD from './yard.js';
import { Crew } from './helpers.js';
import { BeltWorld } from './belts3d.js';
import * as BL from './beltlogic.js';
import { ArmWorld, ARM_COST, ARM_REACH } from './arms.js';
import { buildTruck } from './trucks.js';
import { buildRack, buildBoard, RACK, BOARD, rackDist } from './depot.js';
import * as CT from './contracts.js';
import { BELT_Y } from './belts3d.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || Q.has('touch');
document.body.classList.toggle('touch', isTouch);

/* ---------------- state ---------------- */
let { state: S, from: loadedFrom } = SV.load(localStorage);
if (Q.has('fresh')) S = SV.defaultState();
const mountain = new Mountain();
if (S.mountain.length) mountain.applyDiff(S.mountain);
if (S.gold) mountain.gold = { ...S.gold };
let remaining = mountain.total();
const sfx = new Sfx(); sfx.setVolume(S.settings.volume);
const T16 = C.TIRES[1];
let st = C.stats(S.lv);
const VEH_MAX = 3; // furgone, furgone grande, camion, bilico
let VEH = C.VEHICLES[S.vehicle || 0];
let LAYOUT = braidLayout(VEH.cargo);
const VAN_X = 11.5, VAN_Z = 0.6, VAN_FAR = 58; // rear of the parked van; where it drives to
const THROW_ZONE = { near: 0.9, far: 2.1, half: 1.05 }; // metres behind the rear opening, half width

/* ---------------- quality ---------------- */
const autoQ = (isTouch || (navigator.hardwareConcurrency || 4) <= 2) ? 'bassa' : 'alta';
const QUALITY = S.settings.quality === 'auto' ? autoQ : S.settings.quality;
const QP = QUALITY === 'alta'
  ? { pr: Math.min(devicePixelRatio, 1.5), shadow: 2048, near: 11, high: 4.5, dense: 40, aa: true, midShadow: true }
  : { pr: Math.min(devicePixelRatio, 1), shadow: 1024, near: 8, high: 3.2, dense: 22, aa: false, midShadow: false };

/* ---------------- renderer / scene ---------------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QP.aa, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
let pixelRatio = QP.pr;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = 0xd8c9ad; // warm dusty haze
scene.fog = new THREE.Fog(FOG, 55, 250);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 520);
scene.add(camera);

// sky dome + environment for reflections
const skyTex = YD.warmSkyTexture();
const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
scene.add(sky);
{
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
  const sunBlob = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b8 })); sunBlob.position.set(5.2, 4.3, 5.4); es.add(sunBlob);
  scene.environment = pm.fromScene(es, 0.04).texture; scene.environmentIntensity = 0.4;
}
// golden late-afternoon sun, ~30° up, raking diagonal shadows; warm ground bounce in the shade
const hemi = new THREE.HemisphereLight(0x94b0cf, 0x7a6852, 0.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd8a8, 3.7);
const SUN_OFF = new THREE.Vector3(0.6, 0.5, 0.62).normalize().multiplyScalar(48);
sun.castShadow = true; sun.shadow.mapSize.set(QP.shadow, QP.shadow);
const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 2; sc.far = 140;
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.5;
scene.add(sun, sun.target);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTexture(), color: 0xffe0a8, fog: false, depthWrite: false, transparent: true }));
sunSprite.scale.set(110, 110, 1); scene.add(sunSprite);

const mats = G.makeMats();
const tm = G.tireMaterials();

/* ---------------- ground + yard ---------------- */
const gt = YD.yardGroundTextures();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: gt.map, bumpMap: gt.bump, bumpScale: 1.2, roughnessMap: gt.rough, roughness: 1, color: 0xffffff }));
ground.rotation.x = -Math.PI / 2; ground.position.set(-25, 0, 0); ground.receiveShadow = true; scene.add(ground);
const road = new THREE.Mesh(new THREE.PlaneGeometry(64, 8.2), new THREE.MeshStandardMaterial({ map: YD.bayAsphaltTexture(), transparent: true, depthWrite: false, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -1 }));
road.material.map.repeat.set(9, 1);
{ // feather all four edges of the bay so it melts into the concrete (alphaMap has its own 1x1 transform)
  const [c, x] = G.cvs(256, 64); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 64);
  const g = x.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.03, 'rgba(0,0,0,0)'); g.addColorStop(0.97, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(0,0,0,${Math.random()})`; x.beginPath(); x.arc(Math.random() * 10, Math.random() * 64, 1 + Math.random() * 3, 0, 7); x.fill(); }
  road.material.alphaMap = new THREE.CanvasTexture(c);
}
road.rotation.x = -Math.PI / 2; road.position.set(VAN_X + 30, 0.012, VAN_Z); road.receiveShadow = true; scene.add(road);
// yellow loading bay lines
{ const P = []; for (const s of [1, -1]) P.push([G.box(18.4, 0.01, 0.12), G.M(VAN_X + 8.6, 0.02, VAN_Z + s * 1.45)]); P.push([G.box(0.12, 0.01, 3), G.M(VAN_X - 0.6, 0.02, VAN_Z)]);
  const pm = new THREE.MeshStandardMaterial({ map: YD.scuffedPaintTexture(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 });
  const m = new THREE.Mesh(G.merge(P), pm); m.receiveShadow = true; m.renderOrder = 1; scene.add(m); }
// worn tire tracks from the mountain foot to the van bay + rubber debris ringing the pile
{
  const tr = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 26), new THREE.MeshStandardMaterial({ map: YD.tracksTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  tr.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + 0.04); tr.position.set(-3, 0.008, VAN_Z - 0.2); tr.receiveShadow = true; scene.add(tr);
  const [c, x] = G.cvs(512, 512); const g = x.createRadialGradient(256, 256, 120, 256, 256, 256); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const am = new THREE.CanvasTexture(c);
  const dt0 = YD.debrisTexture().clone(); dt0.wrapS = dt0.wrapT = THREE.RepeatWrapping; dt0.repeat.set(16, 16); dt0.needsUpdate = true;
  const deb = new THREE.Mesh(new THREE.CircleGeometry(52, 48), new THREE.MeshStandardMaterial({ map: dt0, alphaMap: am, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  deb.rotation.x = -Math.PI / 2; deb.position.set(-42, 0.006, -4); deb.receiveShadow = true; scene.add(deb);
}

const zoneMat = (() => {
  const [c, x] = G.cvs(256, 192); x.clearRect(0, 0, 256, 192);
  x.fillStyle = 'rgba(80,230,120,0.22)'; x.fillRect(8, 8, 240, 176);
  x.strokeStyle = 'rgba(120,255,150,0.95)'; x.lineWidth = 8; x.setLineDash([22, 14]); x.strokeRect(8, 8, 240, 176);
  x.setLineDash([]); x.fillStyle = 'rgba(200,255,210,0.9)'; x.font = '900 30px Arial Black, Arial'; x.textAlign = 'center'; x.fillText('LANCIA', 128, 82); x.fillText('DA QUI', 128, 124);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
})();
const zoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(THROW_ZONE.far - THROW_ZONE.near, THROW_ZONE.half * 2), zoneMat);
zoneMesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); zoneMesh.position.set(VAN_X - (THROW_ZONE.near + THROW_ZONE.far) / 2, 0.06, VAN_Z); zoneMesh.renderOrder = 2; scene.add(zoneMesh);
const colliders = []; // AABBs {x0,x1,z0,z1}
const FENCE = { x0: -98, x1: 36, z0: -58, z1: 48 };
function buildYard() { YD.buildYardV4(scene, { mats, tm, colliders, FENCE, VAN_X, VAN_Z, T16, tireGeometry: G.tireGeometry, low: QUALITY !== 'alta' }); }
buildYard();

/* ---------------- workers (they watch you, unimpressed) ---------------- */
const WORKER_LOOKS = [
  { name: 'Beppino', suit: 0xe8661a, cap: 0xe8661a, shirt: 0xf1efe8, skin: 0xd7a07a, hair: 0x3a2a1e, mustache: true, beard: false, belly: 1.16, height: 0.97, pose: 'hips' },
  { name: 'Ottavio', suit: 0x2f62b0, cap: 0x1f2a36, shirt: 0x9a9fa6, skin: 0xc58b62, hair: 0x5c5650, mustache: false, beard: true, belly: 1.0, height: 1.04, pose: 'coffee' },
];
const workers = [[15.5, -9.4], [17.6, -10.2]].map(([x, z], i) => {
  const w = buildWorker(WORKER_LOOKS[i]); w.position.set(x, 0, z); w.rotation.y = -1.2 - i * 0.4; scene.add(w);
  const col = { x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 }; colliders.push(col);
  return { g: w, shake: 0, next: 8 + i * 9, col, col0: { ...col } };
});

/* ---------------- the mountain: heightfield bulk + instanced surface tires ---------------- */
const NV = N + 1;
const cornerH = new Float32Array(NV * NV);
const pt = G.pileTexture();
pt.map.repeat.set(1, 1);
const mGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(NV * NV * 3), uv = new Float32Array(NV * NV * 2), idx = new Uint32Array(N * N * 6);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) { const k = j * NV + i; pos[k * 3] = ORIGIN.x + i * CELL; pos[k * 3 + 2] = ORIGIN.z + j * CELL; uv[k * 2] = i * CELL / 2.6; uv[k * 2 + 1] = j * CELL / 2.6; }
  let o = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * NV + i, b = a + 1, c = a + NV, d = c + 1; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
  mGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NV * NV * 3).fill(1), 3));
  mGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); mGeo.setIndex(new THREE.BufferAttribute(idx, 1));
}
const mountainMesh = new THREE.Mesh(mGeo, new THREE.MeshStandardMaterial({ map: pt.map, bumpMap: pt.bump, bumpScale: 2, roughness: 0.9, color: 0x8a8a8a, vertexColors: true }));
mountainMesh.castShadow = true; mountainMesh.receiveShadow = true; scene.add(mountainMesh);
function cellH(i, j) { return (i < 0 || j < 0 || i >= N || j >= N) ? 0 : mountain.count[j * N + i] * mountain.H_UNIT; }
function updateCorners(cells) {
  const pos = mGeo.attributes.position.array, touched = new Set();
  if (cells === 'all') { for (let k = 0; k < NV * NV; k++) touched.add(k); }
  else for (const c of cells) { const i = c % N, j = (c / N) | 0; touched.add(j * NV + i); touched.add(j * NV + i + 1); touched.add((j + 1) * NV + i); touched.add((j + 1) * NV + i + 1); }
  for (const k of touched) {
    const i = k % NV, j = (k / NV) | 0;
    const a = cellH(i - 1, j - 1), b = cellH(i, j - 1), c = cellH(i - 1, j), d = cellH(i, j);
    const h = (a + b + c + d) === 0 ? -0.35 : (a + b + c + d) / 4;
    cornerH[k] = h; pos[k * 3 + 1] = h > 0 ? h - 0.3 : h; // the dark core sits under all 6 visible tire layers
    // the foot of the pile fades into the dusty gravel so the edge doesn't look cut out
    const f = G.clamp((h + 0.1) / 0.9, 0, 1), col = mGeo.attributes.color.array;
    col[k * 3] = G.lerp(2.6, 1, f); col[k * 3 + 1] = G.lerp(2.35, 1, f); col[k * 3 + 2] = G.lerp(2.0, 1, f);
  }
  mGeo.attributes.color.needsUpdate = true;
  mGeo.attributes.position.needsUpdate = true; mGeo.computeVertexNormals(); mGeo.computeBoundingSphere();
}
updateCorners('all');
function meshH(x, z) {
  const fx = (x - ORIGIN.x) / CELL, fz = (z - ORIGIN.z) / CELL, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= N || j >= N) return 0;
  const tx = fx - i, tz = fz - j, h = (a, b) => cornerH[b * NV + a];
  return Math.max(0, (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz);
}
const _n = new THREE.Vector3();
function meshNormal(x, z, out = _n) { const e = 0.35; return out.set(meshH(x - e, z) - meshH(x + e, z), 2 * e, meshH(x, z - e) - meshH(x, z + e)).normalize(); }

const geoHigh = G.tireGeometry(T16, 'high'), geoMid = G.tireGeometry(T16, 'mid'), geoLow = G.tireGeometry(T16, 'low');
const MAXH = 900, MAXM = 3200, MAXF = 9000;
function inst(geo, mat, max, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); scene.add(m); return m;
}
const IM = {
  high: inst(geoHigh, tm.rubber, MAXH, true), mid: inst(geoMid, tm.rubber, MAXM, QP.midShadow), far: inst(geoLow, tm.rubberLow, MAXF, false),
  deep: inst(geoMid, tm.rubber, 2600, false), deepL: inst(geoLow, tm.rubber, 4200, false), ghigh: inst(geoHigh, tm.gold, 32, true), gmid: inst(geoMid, tm.gold, 48, true), gfar: inst(geoLow, tm.goldFar, 96, false),
};
let nearRecs = [], nearCenter = new THREE.Vector2(1e9, 1e9), farCenter = new THREE.Vector2(1e9, 1e9), nearDirty = true, farDirty = true;
const _m4 = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _sc = new THREE.Vector3(), _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0);
// world transform of the tire at stack position `index` in cell c, layer L from the top (0 = top)
const QUAD = [[-1, -1], [1, 1], [1, -1], [-1, 1]];
function tireXform(c, index, L, type, outPos, outQuat) {
  const h1 = hash2(c, index * 1.7 + 0.3), h2 = hash2(index * 2.3 + 1, c * 0.77), h3 = hash2(c * 1.3 + index, 5.1), h4 = hash2(c + index * 0.31, 9.7);
  const cc = mountain.cellCenter(c), t = C.TIRES[type];
  // consecutive tires of a stack fill the four quarters of the cell (+ jitter): every layer covers the gaps of the one above
  const q = QUAD[(index + c) & 3], px = cc.x + q[0] * 0.25 + (h1 - 0.5) * 0.38, pz = cc.z + q[1] * 0.25 + (h2 - 0.5) * 0.38;
  const steep = h4 < 0.27 && L < 2, tilt = steep ? 0.85 + h3 * 0.65 : h3 * (L >= 2 ? 0.9 : 0.6);
  meshNormal(px, pz, _v1);
  _q1.setFromUnitVectors(UP, _v1); _q2.setFromAxisAngle(UP, h1 * 6.283); _q3.setFromAxisAngle(AX, tilt);
  outQuat.copy(_q1).multiply(_q2).multiply(_q3);
  const lift = L === 0 ? t.w * 0.22 + Math.sin(tilt) * t.R * 0.6 : L === 1 ? -0.035 + Math.sin(tilt) * t.R * 0.45 : -0.06 - (L - 2) * 0.055 + Math.sin(tilt) * t.R * 0.3;
  outPos.set(px, meshH(px, pz) + lift, pz);
  return t;
}
function tint(c, index, L, type) { const k = type === C.GOLD_ID ? 1 : (0.95 + hash2(index * 0.13, c * 0.29) * 0.45) * (L >= 2 ? 0.86 - (L - 2) * 0.07 : 1); return _col.setRGB(k, k * 0.985, k * 0.97); }
function setInst(m, i, pos, quat, t, k = 1) { _sc.set(k * t.R / T16.R, k * t.w / T16.w, k * t.R / T16.R); _m4.compose(pos, quat, _sc); m.setMatrixAt(i, _m4); }
function rebuildNear() {
  const px = P.x, pz = P.z, R = QP.near, RH = QP.high;
  nearRecs = []; const cnt = { high: 0, mid: 0, deep: 0, deepL: 0, ghigh: 0, gmid: 0 };
  const ci = Math.floor((px - ORIGIN.x) / CELL), cj = Math.floor((pz - ORIGIN.z) / CELL), r = Math.ceil(R / CELL);
  for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
    const c = j * N + i, n = mountain.count[c]; if (!n) continue;
    const cx = ORIGIN.x + (i + 0.5) * CELL, cz = ORIGIN.z + (j + 0.5) * CELL, d = Math.hypot(cx - px, cz - pz);
    if (d > R) continue;
    for (let L = 0; L < GRAB_LAYERS + SHOW_BURIED; L++) {
      const index = n - 1 - L; if (index < 0) break;
      const type = mountain.typeAt(c, index), pos = new THREE.Vector3(), quat = new THREE.Quaternion();
      const t = tireXform(c, index, L, type, pos, quat);
      const gold = type === C.GOLD_ID, lod = d < RH ? 'high' : 'mid', key = !gold && L >= 2 ? (d < 6.5 ? 'deep' : 'deepL') : (gold ? 'g' : '') + lod, m = IM[key];
      const id = cnt[key]; if (id >= m.instanceMatrix.count) continue;
      cnt[key]++;
      setInst(m, id, pos, quat, t); m.setColorAt(id, tint(c, index, L, type));
      nearRecs.push({ c, index, L, type, pos, quat, r: t.R * (L >= 2 ? 0.6 : 0.92), free: L < GRAB_LAYERS, m, id, base: _col.clone() });
    }
  }
  for (const k in cnt) { IM[k].count = cnt[k]; IM[k].instanceMatrix.needsUpdate = true; IM[k].instanceColor.needsUpdate = true; }
  nearCenter.set(px, pz); nearDirty = false; hover = null;
}
function rebuildFar() {
  // every cell outside the near ring shows real low-poly tires: 2 layers up to QP.dense metres, then 1
  const px = P.x, pz = P.z; let n = 0, ng = 0; const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  for (let c = 0; c < N * N; c++) {
    const k = mountain.count[c]; if (!k) continue;
    const i = c % N, j = (c / N) | 0;
    const cx = ORIGIN.x + (i + 0.5) * CELL, cz = ORIGIN.z + (j + 0.5) * CELL, d = Math.hypot(cx - px, cz - pz);
    if (d <= QP.near) continue;
    const layers = Math.min(k, d < QP.dense ? 2 : 1);
    for (let L = 0; L < layers; L++) {
      const index = k - 1 - L, type = mountain.typeAt(c, index), t = tireXform(c, index, L, type, pos, quat);
      const big = 1 + Math.min(0.35, Math.max(0, d - QP.near) * 0.012); // far tires slightly larger so they still read as tires
      if (type === C.GOLD_ID) { if (ng < 96) { setInst(IM.gfar, ng, pos, quat, t, big * 1.15); IM.gfar.setColorAt(ng, _col.setRGB(1, 1, 1)); ng++; } continue; }
      if (n >= MAXF) break;
      setInst(IM.far, n, pos, quat, t, big); const tc = tint(c, index, L, type); IM.far.setColorAt(n, tc.multiplyScalar(1.02)); n++;
    }
  }
  IM.far.count = n; IM.gfar.count = ng;
  for (const m of [IM.far, IM.gfar]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  farCenter.set(px, pz); farDirty = false;
}

/* ---------------- player ---------------- */
const P = { x: S.player.x, z: S.player.z, yaw: S.player.yaw, pitch: S.player.pitch, eye: 1.65, bob: 0, stepT: 0, vx: 0, vz: 0, shake: 0 };
const keys = {};
const joy = { x: 0, y: 0, active: false };

/* ---------------- the van ---------------- */
let van = null, FL = 0.72;
// the braid: one instanced mesh per vehicle (high-detail tires in the vans, mid LOD for the 350 / 840 of camion + bilico)
let cargoIM = null;
const cargoGold = new THREE.InstancedMesh(geoHigh, tm.gold, 32); cargoGold.count = 0; cargoGold.frustumCulled = false; cargoGold.castShadow = true;
function makeCargoIM(cap) {
  if (cargoIM) { cargoIM.removeFromParent(); cargoIM.dispose(); }
  cargoIM = new THREE.InstancedMesh(cap > 120 ? geoMid : geoHigh, tm.rubber, cap * 2); cargoIM.count = 0; cargoIM.castShadow = true; cargoIM.receiveShadow = true; cargoIM.frustumCulled = false;
  cargoIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2 * 3), 3);
}
const vanLamp = new THREE.PointLight(0xfff0d6, 3.2, 5.5, 1.6);
const vanFill = new THREE.PointLight(0xdfe8ff, 2.2, 6, 1.6);
const V = { state: 'loading', t: 0, x: VAN_X, doors: 1, pend: [] }; // pend: placements in flight
// swap the vehicle at the bay (furgone -> furgone grande): new body, braid layout and capacity
function setVehicle(tier) {
  const pos = van ? van.position.clone() : new THREE.Vector3(VAN_X, 0, VAN_Z), vis = van ? van.visible : true;
  if (van) { van.remove(cargoGold, vanLamp, vanFill); scene.remove(van); van.traverse(o => { if (o.geometry && o.geometry !== geoHigh && o.geometry !== geoMid && o !== cargoIM) o.geometry.dispose(); }); }
  VEH = C.VEHICLES[tier]; LAYOUT = braidLayout(VEH.cargo); S.vehicle = tier;
  van = tier <= 1 ? G.buildVan(VEH, mats, tm.rubber) : buildTruck(VEH, mats, tm.rubber);
  if (tier <= 1) { van.userData.len = VEH.cargo.L + 2.05; van.userData.halfW = VEH.cargo.W / 2 + 0.1; van.userData.deep = 0; }
  van.position.copy(pos); van.visible = vis; scene.add(van); FL = van.userData.fl;
  makeCargoIM(LAYOUT.cap);
  van.add(cargoIM, cargoGold, vanLamp, vanFill);
  vanLamp.position.set(VEH.cargo.L * 0.45, FL + VEH.cargo.H - 0.15, 0); vanFill.position.set(-1.2, FL + 1.1, 0);
  vanLamp.distance = Math.max(5.5, VEH.cargo.L * 0.9); vanLamp.intensity = tier >= 2 ? 6 : 3.2;
  if (S.van.fill.length > LAYOUT.cap) S.van.fill.length = LAYOUT.cap;
  G.poseDoors(van, V.doors); rebuildCargo();
}
function targetTier() { return Math.min(S.lv.vehicle, VEH_MAX); }
setVehicle(Math.min(S.vehicle || 0, VEH_MAX));
function slotLocal(slotIdx, sub, type, outPos, outQuat) {
  const s = LAYOUT.slots[slotIdx], t = C.TIRES[type];
  const spin = hash2(slotIdx, sub + 3.3) * 6.283;
  _q1.setFromAxisAngle(AX, s.rx); _q2.setFromAxisAngle(UP, spin);
  outQuat.copy(_q1).multiply(_q2);
  const off = t.half ? (sub ? -0.16 : 0.16) : 0;
  // small settle so it doesn't look like a perfect grid
  const jy = (hash2(slotIdx, 7.7) - 0.5) * 0.02, jz = (hash2(slotIdx, 1.9) - 0.5) * 0.02;
  outPos.set(s.x + off, FL + s.y + jy - (C.TIRES[2].R - t.R) * 0.5, s.z + jz);
  return t;
}
function rebuildCargo() {
  let n = 0, g = 0; const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  S.van.fill.forEach((slot, si) => slot.forEach((type, sub) => {
    const t = slotLocal(si, sub, type, pos, quat);
    if (type === C.GOLD_ID) { setInst(cargoGold, g++, pos, quat, t); } else { setInst(cargoIM, n, pos, quat, t); { const k = 1.35 + hash2(si, sub) * 0.35; cargoIM.setColorAt(n, _col.setRGB(k, k, k * 0.98)); } n++; }
  }));
  cargoIM.count = n; cargoGold.count = g; cargoIM.instanceMatrix.needsUpdate = true; if (cargoIM.instanceColor) cargoIM.instanceColor.needsUpdate = true; cargoGold.instanceMatrix.needsUpdate = true;
}
function virtFill() { const f = S.van.fill.map(s => s.slice()); for (const p of V.pend) { if (p.sub) f[p.slot].push(p.type); else f[p.slot] = [p.type]; } return f; }
function vanFillCount() { return S.van.fill.length; }
function vanDist() { return Math.hypot(P.x - van.position.x - 2, P.z - VAN_Z); }
function vanReady() { return V.state === 'loading'; }
function vanRearWorld(out = new THREE.Vector3()) { return out.set(van.position.x, 0, VAN_Z); }

/* ---------------- cart + hands ---------------- */
const cart = new THREE.Group(); cart.visible = false; scene.add(cart);
let trolley = null; const cartTires = [];
for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(geoMid, tm.rubber); m.castShadow = true; m.visible = false; cartTires.push(m); }
const cartPose = { side: 0 };
function cartRig() { return trolley.userData.rig; }
function ensureTrolley() {
  const cap = Math.max(4, st.cart || 4);
  if (trolley && trolley.userData.cap === cap) return;
  if (trolley) { cart.remove(trolley); trolley.traverse(o => { if (o.geometry && !cartTires.includes(o)) o.geometry.dispose(); }); }
  trolley = G.buildCart(mats, tm.rubber, cap); cart.add(trolley);
  for (const m of cartTires) trolley.userData.rig.add(m);
}
ensureTrolley(); $('cartic').innerHTML = trolleySVG(26);
const cartGoldMat = tm.gold;
function cartSlotLocal(i, type, out = new THREE.Vector3()) { return trolley.userData.slot(i, C.TIRES[type].w, out); }
function refreshCart() {
  cart.visible = st.cart > 0; ensureTrolley();
  cartTires.forEach((m, i) => {
    const type = S.cart[i];
    if (type == null) { m.visible = false; return; }
    const t = C.TIRES[type]; m.visible = true; m.material = type === C.GOLD_ID ? cartGoldMat : tm.rubber;
    cartSlotLocal(i, type, m.position); m.rotation.set((hash2(i, 7) - 0.5) * 0.05, hash2(i, 2) * 6, (hash2(i, 5) - 0.5) * 0.05); m.scale.set(t.R / T16.R, t.w / T16.w, t.R / T16.R);
  });
}
const handGroup = new THREE.Group(); camera.add(handGroup);
const handSlots = [new THREE.Vector3(0.36, -0.36, -0.78), new THREE.Vector3(-0.36, -0.36, -0.78)];
const handTires = handSlots.map(p => { const m = new THREE.Mesh(geoHigh, tm.rubber); m.position.copy(p); m.visible = false; handGroup.add(m); return m; });
const gloveMat = new THREE.MeshStandardMaterial({ color: 0xe8c33a, roughness: 0.8 });
const handMeshes = handSlots.map((p, i) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), mats.skin); m.position.set(p.x * 0.78, p.y - 0.06, p.z + 0.05); m.rotation.z = i ? -0.9 : 0.9; m.visible = false; handGroup.add(m); return m; });
function refreshHands() {
  handTires.forEach((m, i) => {
    const type = S.hands[i]; if (type == null) { m.visible = false; handMeshes[i].visible = false; return; }
    const t = C.TIRES[type]; m.visible = true; m.material = type === C.GOLD_ID ? tm.gold : tm.rubber;
    m.scale.set(t.R / T16.R, t.w / T16.w, t.R / T16.R); m.rotation.set(0.25, 0, i ? -1.25 : 1.25);
    handMeshes[i].visible = true; handMeshes[i].material = S.lv.gloves > 0 ? gloveMat : mats.skin;
  });
}
// holding the trolley = both hands on its handles: tires go only onto the trolley. Parked trolley = free hands.
function holding() { return st.cart > 0 && S.cartHeld; }
function capacity() { return holding() ? st.cart : st.hands; }
function carried() { return holding() ? S.cart.length + reservedCart : S.hands.length + reservedHands; }
function carriedNow() { return holding() ? S.cart.length : S.hands.length; }

/* ---------------- flying tires (grab + throw) ---------------- */
const flyPool = [];
const flights = [];
function flyMesh(type) { let m = flyPool.pop(); if (!m) { m = new THREE.Mesh(geoHigh, tm.rubber); m.castShadow = true; } m.material = type === C.GOLD_ID ? tm.gold : tm.rubber; const t = C.TIRES[type]; m.scale.set(t.R / T16.R, t.w / T16.w, t.R / T16.R); scene.add(m); return m; }
function startFlight(o) { o.t = 0; o.mesh = flyMesh(o.type); o.mesh.position.copy(o.from); o.mesh.quaternion.copy(o.q0); flights.push(o); return o; }
const _fp = new THREE.Vector3();
function updateFlights(dt) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i]; f.t += dt; const k = Math.min(1, f.t / f.dur);
    const to = typeof f.to === 'function' ? f.to(_fp) : f.to;
    const e = f.ease === 'out' ? 1 - Math.pow(1 - k, 2.2) : k;
    f.mesh.position.lerpVectors(f.from, to, e); f.mesh.position.y += Math.sin(Math.PI * k) * f.arc;
    const q1 = typeof f.q1 === 'function' ? f.q1() : f.q1;
    f.mesh.quaternion.slerpQuaternions(f.q0, q1, Math.min(1, e * 1.1));
    if (f.spin) { _q1.setFromAxisAngle(AX, f.spin * (1 - e) * 6.283); f.mesh.quaternion.multiply(_q1); }
    if (k >= 1) { scene.remove(f.mesh); flyPool.push(f.mesh); flights.splice(i, 1); f.done && f.done(); }
  }
}

/* ---------------- automation: tires taken from the mountain by helpers and intakes ---------------- */
let autoFlushT = 0, farT = 0, farPending = false;
function autoFind(x, z, R = 3) {
  const ci = Math.floor((x - ORIGIN.x) / CELL), cj = Math.floor((z - ORIGIN.z) / CELL), r = Math.ceil(R / CELL);
  let best = -1, bd = 1e9;
  for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
    const c = j * N + i; if (!mountain.count[c]) continue;
    const cx = ORIGIN.x + (i + 0.5) * CELL, cz = ORIGIN.z + (j + 0.5) * CELL, d = Math.hypot(cx - x, cz - z) - mountain.count[c] * 0.0004; // a bit of preference for the fuller cells
    if (d <= R && d < bd) { bd = d; best = c; }
  }
  return best;
}
function autoTake(x, z, R = 3) {
  const best = autoFind(x, z, R);
  if (best < 0) return null;
  const index = mountain.count[best] - 1, type = mountain.typeAt(best, index), pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  tireXform(best, index, 0, type, pos, quat);
  if (mountain.take(best, index) == null) return null;
  remaining--; return { type, pos, quat };
}
// where the top tire nearest to (x, z) is, without taking it (the arms aim there first)
function autoPeek(x, z, R = 3) {
  const best = autoFind(x, z, R); if (best < 0) return null;
  const index = mountain.count[best] - 1, type = mountain.typeAt(best, index), pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  tireXform(best, index, 0, type, pos, quat); return pos;
}
// batch the mountain updates from automation: corners every 0.25 s, the far LOD at most every 2 s
function flushMountain(dt, force = false) {
  autoFlushT -= dt; farT -= dt;
  if (mountain.dirty.size && (autoFlushT <= 0 || force)) {
    let near = false; for (const c of mountain.dirty) { const cc = mountain.cellCenter(c); if (Math.hypot(cc.x - P.x, cc.z - P.z) < QP.near + 2) { near = true; break; } }
    updateCorners(mountain.dirty); mountain.dirty.clear(); if (near) nearDirty = true; farPending = true; autoFlushT = 0.25;
  }
  if (farPending && (farT <= 0 || force)) { rebuildFar(); farPending = false; farT = 2; }
}
// where the crew works: F = just off the foot of the mountain, B = beside the van's rear bay, dir = toward the pile
const MOUNTAIN_C = { x: -42, z: -4 };
function crewStations() {
  const B = { x: VAN_X - 1.7, z: VAN_Z - 2.1 };
  let dx = MOUNTAIN_C.x - B.x, dz = MOUNTAIN_C.z - B.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
  let F = { x: B.x + dx * 8, z: B.z + dz * 8 };
  for (let d = 2; d < 70; d += 0.25) { const x = B.x + dx * d, z = B.z + dz * d; if (meshH(x, z) > 0.12) { F = { x: x - dx * 0.8, z: z - dz * 0.8 }; break; } }
  return { F, B, dir: { x: dx, z: dz }, rear: { x: VAN_X - 0.1, z: VAN_Z } };
}
function att(x, z) { const d = Math.hypot(x - P.x, z - P.z); return Math.max(0, Math.min(1, 1 / (1 + Math.max(0, d - 2) * 0.2))); }
const crew = new Crew({
  scene, buildWorker, TIRES: C.TIRES, sfx, att,
  tireMesh: (type) => flyMesh(type), freeMesh: (m) => { scene.remove(m); flyPool.push(m); },
  stations: crewStations, take: (x, z, R) => autoTake(x, z, R),
  canAccept: (n) => vanCanAccept(n),
  launch: (type, pos, quat) => launchToVan(type, pos, quat, { auto: true, dur: 0.5, arc: 0.55, spin: 0.4 }),
  player: () => P,
  spawn: (i) => i === 0 ? { x: 15.5, z: -9.4 } : i === 1 ? { x: 17.6, z: -10.2 } : { x: 16 + i * 0.7, z: -8.2 - i * 0.6 },
});
function syncCrew() {
  const n = C.UPG.helper.lv[S.lv.helper], spd = C.UPG.helperCart.lv[S.lv.helperCart];
  if (crew.n !== n || crew.speed !== spd) crew.setCount(n, spd);
  // the two idle workers by the office ARE Beppino and Ottavio: once hired they leave their spot
  workers.forEach((w, i) => { const hired = n > i; w.g.visible = !hired; w.col.x0 = hired ? 1e9 : w.col0.x0; w.col.x1 = hired ? 1e9 : w.col0.x1; });
}

/* ---------------- conveyor belts + build mode ---------------- */
const belts = new BeltWorld({ scene, tireGeo: geoMid, rubber: tm.rubber, gold: tm.gold, T16, TIRES: C.TIRES, GOLD_ID: C.GOLD_ID });
belts.load(S.belts);
const beltRear = { x: VAN_X - 0.2, z: VAN_Z };
function beltSpeed() { return BL.BASE_SPEED * C.UPG.beltSpeed.lv[S.lv.beltSpeed]; }
function intakeMax() { return C.UPG.belt.lv[S.lv.belt]; }
function updateBelts(dt) {
  if (!belts.pieces.length) return;
  const sp = beltSpeed(), interval = BL.TIRE_GAP / sp;
  for (const p of belts.pieces) {
    if (p.type !== 'intake') continue;
    p.t = (p.t || 0) - dt; p.feeding = false;
    if (p.hopper.length && belts.logic.startFree(p)) { p.tires.push({ type: p.hopper.shift(), s: 0, spin: Math.random() * 6.28 }); }
    if (p.t <= 0 && p.hopper.length + (p.inbound || 0) < 2 && intakeIndex(p) < intakeMax()) {
      const b = BL.backPoint(p), got = autoTake(b.x, b.z, BL.INTAKE_REACH);
      p.t = interval;
      if (got) {
        p.feeding = true; p.inbound = (p.inbound || 0) + 1; const top = BL.cellCenter(p.gx, p.gz), d = BL.DIRS[p.rot];
        startFlight({ kind: 'intake', type: got.type, from: got.pos, q0: got.quat, to: new THREE.Vector3(top.x - d[0] * 0.25, 1.55, top.z - d[1] * 0.25), q1: new THREE.Quaternion(), dur: 0.55, arc: 0.9, ease: 'out',
          done: () => { p.inbound--; if (belts.pieces.includes(p)) p.hopper.push(got.type); else { const v = C.TIRES[got.type].value; S.money += v; S.stats.earned += v; S.stats.cleared++; } } }); // intake dismantled mid-air: sold, never lost
        if (Math.random() < 0.5) sfx.grab(Math.min(2, got.type), 0, att(b.x, b.z) * 0.6);
      } else p.empty = true;
    }
    if (p.hopper.length || p.inbound) p.feeding = true;
  }
  belts.update(dt, sp, beltSinks, (tr, p) => {
    const e = BL.endPoint(p); const from = new THREE.Vector3(e.x, 0.75, e.z);
    if (BL.sinkIndex(p, beltSinks) === 1) return storeTire(tr.type, from, { auto: true });
    return launchToVan(tr.type, from, new THREE.Quaternion(), { auto: true, dur: 0.42, arc: 0.45, spin: 0.3 });
  });
}
/* ---------------- zona di stoccaggio + bacheca contratti ---------------- */
const rack = buildRack(scene, { mats, tireGeo: geoMid, rubber: tm.rubber, T16, TIRES: C.TIRES, colliders });
const board = buildBoard(scene, { mats, colliders });
const beltSinks = [beltRear, rack.front];
const storePend = [0, 0, 0, 0];
function contractsUnlocked() { return S.lv.belt >= 1; }
function bayOf(type) { return type === C.GOLD_ID ? 1 : type; }
function rackRoom(type) { const b = bayOf(type); return RACK.cap - S.storage[b] - storePend[b]; }
function rackFree() { let n = 0; for (let b = 0; b < 4; b++) n += RACK.cap - S.storage[b] - storePend[b]; return n; }
// a tire into the rack: flies onto the next free spot of its bay, pays its value, counts for the active contract
function storeTire(type, from, o = {}) {
  if (!contractsUnlocked() || rackRoom(type) <= 0) return false;
  const b = bayOf(type), idx = S.storage[b] + storePend[b]; storePend[b]++;
  const to = rack.slotPos(b, Math.min(RACK.cap - 1, idx));
  const q1 = new THREE.Quaternion();
  startFlight({ kind: 'store', bay: b, type, from: from.clone(), q0: new THREE.Quaternion(), to, q1, dur: o.auto ? 0.45 : 0.5, arc: o.auto ? 0.5 : 0.6, spin: 0.3, ease: 'line',
    done: () => {
      storePend[b]--; S.storage[b] = Math.min(RACK.cap, S.storage[b] + 1); rack.setCounts(S.storage);
      const val = C.TIRES[type].value; S.money += val; S.stats.earned += val; S.stats.cleared++; S.stats.bySize[type]++; S.stats.stored = (S.stats.stored || 0) + 1;
      if (o.auto) S.stats.auto = (S.stats.auto || 0) + 1; else S.stats.thrown++;
      sfx.thud(1, 0, o.auto ? att(to.x, to.z) * 0.6 : 0.8);
      if (!o.auto || popT <= 0) { pop(to.clone(), '+' + money(val), o.auto ? 'soft' : ''); popT = 0.18; }
      contractTick(type, true); checkMilestones(); updateHUD();
    } });
  return true;
}
function inRackZone() { return contractsUnlocked() && P.x > RACK.x0 - 0.4 && P.x < RACK.x1 + 0.4 && P.z > RACK.zFront && P.z < RACK.zFront + 2.3; }
function tryStore() {
  if (!inRackZone() || throwCD > 0) return false;
  let type, fromHand = false, src = new THREE.Vector3();
  if (!holding() && S.hands.length) { fromHand = true; const i = S.hands.length - 1; type = S.hands[i]; handTires[i].getWorldPosition(src); }
  else if (holding() && S.cart.length) { const i = S.cart.length - 1; type = S.cart[i]; cartTires[i].getWorldPosition(src); }
  else return false;
  if (rackRoom(type) <= 0) { toast(`Lo scaffale ${['14"', '16"', '18"', 'Scooter'][bayOf(type)]} è pieno`); sfx.nope(); return true; }
  if (fromHand) { S.hands.pop(); refreshHands(); } else { S.cart.pop(); refreshCart(); }
  throwCD = C.PLAYER.throwInterval; sfx.whoosh(0); storeTire(type, src, {}); return true;
}
// ---- contracts ----
CT.fill(S.contracts);
let pinnedDone = 0, ctOpen = false;
function contractTick(type, fromRack = false) {
  if (!contractsUnlocked()) return;
  const act = CT.activeOf(S.contracts);
  if (!act || !CT.matches(act, type)) return;
  // a tire loaded into the vehicle for the client is also shown set aside in the rack (it fills while you work)
  if (!fromRack) { const b = bayOf(type); if (S.storage[b] + storePend[b] < RACK.cap) { S.storage[b]++; rack.setCounts(S.storage); } }
  const done = CT.progress(S.contracts, type);
  if (done) completeContract(done); else updatePinned();
}
function completeContract(c) {
  S.money += c.reward; S.stats.earned += c.reward;
  // the client picks up the tires: they leave the rack
  let left = c.need; const bays = c.size < 0 ? [0, 1, 2, 3] : [c.size];
  for (const b of bays) { const k = Math.min(left, S.storage[b]); S.storage[b] -= k; left -= k; if (left <= 0) break; }
  rack.setCounts(S.storage);
  sfx.chime(); banner('Contratto completato!', `${c.client}: +${money(c.reward)} · sulla bacheca c'è un nuovo lavoro`); popHUD('+' + money(c.reward), 'big gold');
  pinnedDone = 2.6; lastDone = c; updatePinned(); board.draw(S.contracts.list, S.contracts.active, false); if (ctOpen) renderContracts(); saveNow();
}
let lastDone = null;
function updatePinned() {
  const el = $('pinned'), act = CT.activeOf(S.contracts), c = pinnedDone > 0 ? lastDone : act;
  if (!playing || !contractsUnlocked() || !c) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden'); el.classList.toggle('done', pinnedDone > 0);
  $('pintitle').textContent = c.client;
  $('pinsub').textContent = `${c.need} gomme ${c.size < 0 ? 'miste' : CT.SIZE_NAMES[c.size]}`;
  const got = pinnedDone > 0 ? c.need : c.got;
  $('pinbar').style.width = (100 * got / c.need).toFixed(1) + '%';
  $('pinnum').textContent = `${got} / ${c.need}`;
  $('pinreward').textContent = pinnedDone > 0 ? `Pagato +${money(c.reward)}` : `+${money(c.reward)} alla consegna`;
}
function renderContracts() {
  const box = $('ctlist'); box.innerHTML = '';
  const cs = S.contracts;
  $('ctdone').textContent = cs.done ? `${cs.done} completat${cs.done > 1 ? 'i' : 'o'} · ${money(cs.earned)} guadagnati` : 'Nessuna scadenza, nessuna penale: prendine uno quando vuoi.';
  cs.list.forEach((c, i) => {
    const el = document.createElement('div'); el.className = 'note' + (c.id === cs.active ? ' on' : ''); el.style.setProperty('--r', (((i * 37) % 7) - 3) * 0.6 + 'deg');
    el.innerHTML = `<i class="pin"></i><b>${c.client}</b><span class="what">${c.need} gomme ${c.size < 0 ? 'miste' : CT.SIZE_NAMES[c.size]}</span><span class="nt">${c.note}</span><span class="rw">+${money(c.reward)}</span><span class="nodl">⏱ Nessuna scadenza</span>${c.got ? `<div class="pb"><i style="width:${100 * c.got / c.need}%"></i></div><span class="pg">${c.got} / ${c.need}</span>` : ''}`;
    const btn = document.createElement('button'); btn.className = 'acc';
    if (c.id === cs.active) { btn.textContent = 'In corso · lascia'; btn.onclick = (e) => { e.stopPropagation(); CT.drop(cs); sfx.paper(); renderContracts(); updatePinned(); board.draw(cs.list, cs.active, false); saveNow(); }; }
    else { btn.textContent = cs.active == null ? 'Accetta' : 'Passa a questo'; btn.onclick = (e) => { e.stopPropagation(); acceptContract(c.id); }; }
    el.appendChild(btn); box.appendChild(el);
  });
}
function acceptContract(id) {
  if (!CT.accept(S.contracts, id)) return false;
  sfx.paper(); sfx.click(); renderContracts(); updatePinned(); board.draw(S.contracts.list, S.contracts.active, false); saveNow(); return true;
}
function openContracts() {
  if (!playing) return false;
  if (!contractsUnlocked()) { toast('La bacheca si sblocca coi nastri trasportatori'); return false; }
  if (build.on) exitBuild(); if (shopOpen) closeShop();
  ctOpen = true; renderContracts(); $('contracts').classList.remove('hidden'); sfx.paper(); if (document.pointerLockElement) document.exitPointerLock(); return true;
}
function closeContracts() { ctOpen = false; $('contracts').classList.add('hidden'); lockPointer(); }
function nearBoard() {
  const bx = BOARD.x - 0.3, bz = BOARD.z, dx = bx - P.x, dz = bz - P.z, d = Math.hypot(dx, dz); if (d > 3.2) return false;
  return (-Math.sin(P.yaw) * dx - Math.cos(P.yaw) * dz) / d > 0.45;
}

/* ---------------- bracci meccanici ---------------- */
function armMax() { return C.UPG.arm.lv[S.lv.arm]; }
const arms = new ArmWorld({
  scene, sfx, att,
  tireMesh: (type) => flyMesh(type), freeMesh: (m) => { scene.remove(m); flyPool.push(m); },
  source: (a) => { const p = autoPeek(a.x, a.z, ARM_REACH); return p && Math.hypot(p.x - a.x, p.z - a.z) <= ARM_REACH + 0.5 ? p : null; },
  take: (a, at, n) => { const out = []; for (let i = 0; i < n; i++) { const g = autoTake(at.x, at.z, 1.6); if (!g) break; out.push(g.type); } if (out.length) sfx.grab(Math.min(2, out[0]), 0, att(a.x, a.z) * 0.5); return out; },
  dest: (a, n) => armDest(a, n),
  release: (a, type, pos, d) => armRelease(a, type, pos, d),
});
const _pp = {};
function armDest(a, n) {
  // 1) a belt piece in reach with a free gap (or an intake hopper with room)
  let best = null, bd = 1e9;
  for (const p of belts.pieces) {
    const c = BL.cellCenter(p.gx, p.gz), d = Math.hypot(c.x - a.x, c.z - a.z); if (d > ARM_REACH + 0.2 || d >= bd) continue;
    if (p.type === 'intake') { if (p.hopper.length + (p.inbound || 0) < 3) { bd = d; const dd = BL.DIRS[p.rot]; best = { kind: 'hopper', p, x: c.x - dd[0] * 0.25, y: 1.7, z: c.z - dd[1] * 0.25 }; } continue; }
    for (const k of [0.5, 0.2, 0.8]) { const sv = p.len * k; if (!p.tires.some(t => Math.abs(t.s - sv) < BL.TIRE_GAP)) { BL.pathPoint(p, sv, _pp); bd = d; best = { kind: 'belt', p, s: sv, x: _pp.x, y: BELT_Y + 0.12, z: _pp.z }; break; } }
  }
  if (best) return best;
  // 2) straight into the vehicle when the arm stands at the tailgate
  const vx = VAN_X + 0.35; if (Math.hypot(vx - a.x, VAN_Z - a.z) <= ARM_REACH + 0.4 && vanCanAccept(n)) return { kind: 'van', x: vx, y: FL + 0.7, z: VAN_Z };
  // 3) the storage rack
  if (contractsUnlocked() && rackDist(a.x, a.z) <= ARM_REACH && rackFree() >= n) return { kind: 'rack', x: Math.max(RACK.x0 + 0.4, Math.min(RACK.x1 - 0.4, a.x)), y: 1.2, z: RACK.zFront + 0.25 };
  return null;
}
function armRelease(a, type, pos, d) {
  if (!d) return false;
  if (d.kind === 'belt' || d.kind === 'hopper') {
    if (!belts.pieces.includes(d.p)) return false;
    if (d.kind === 'hopper') { if (d.p.hopper.length >= 3) return false; d.p.hopper.push(type); return true; }
    return belts.logic.insertAt(d.p, d.s, { type, s: 0, spin: Math.random() * 6.28 });
  }
  if (d.kind === 'van') return launchToVan(type, pos, new THREE.Quaternion(), { auto: true, dur: 0.3, arc: 0.15, spin: 0.2 });
  if (d.kind === 'rack') return storeTire(type, pos, { auto: true });
  return false;
}
function syncArms() { arms.speed = C.UPG.armSpeed.lv[S.lv.armSpeed]; arms.grab = C.UPG.armGrab.lv[S.lv.armGrab]; }
arms.load(S.arms); syncArms();
// pieces left where the yard changed (the new rack, a longer vehicle at the bay): dismantled with a full refund, never lost
function vehicleBay(tier = VEH_MAX) { const v = C.VEHICLES[tier], len = v.cargo.L + (tier >= 3 ? 3.6 : tier >= 2 ? 2.8 : 2.1), hw = v.cargo.W / 2 + 0.2; return { x0: VAN_X - 0.15, x1: VAN_X + len, z0: VAN_Z - hw, z1: VAN_Z + hw }; }
const overlap = (a, b, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;
function evictPieces() {
  const bay = vehicleBay(Math.max(S.vehicle, S.lv.vehicle)); let refund = 0, n = 0;
  for (const p of belts.pieces.slice()) { const f = BeltWorld.footprint(p.type, p.gx, p.gz, p.rot); if (overlap(f, bay) || colliders.some(c => overlap(f, c))) { refund += BL.PIECES[p.type].cost; for (const t of p.tires.concat(p.hopper.map(type => ({ type })))) refund += C.TIRES[t.type].value; belts.remove(p); n++; } }
  for (const a of arms.list.slice()) { const f = ArmWorld.footprint(a.gx, a.gz); if (overlap(f, bay) || colliders.some(c => overlap(f, c))) { refund += ARM_COST; for (const t of arms.remove(a)) refund += C.TIRES[t].value; n++; } }
  if (n) { S.money += refund; S.belts = belts.logic.serialize(); S.arms = arms.serialize(); toast(`${n} pezz${n > 1 ? 'i' : 'o'} nel posto del mezzo o dello scaffale: smontat${n > 1 ? 'i' : 'o'}, +${money(refund)}`, 3500); }
  return n;
}
function intakeIndex(p) { let k = 0; for (const q of belts.pieces) { if (q === p) return k; if (q.type === 'intake') k++; } return k; }
const build = { on: false, piece: 'straight', rot: 0, gx: 0, gz: 0, aim: false, valid: false, reason: '', del: null };
const PINFO = { ...BL.PIECES, arm: { key: '5', name: 'Braccio meccanico', short: 'Braccio', cost: ARM_COST } };
function buildOrder() { return S.lv.arm >= 1 ? [...BL.PIECE_ORDER, 'arm'] : BL.PIECE_ORDER; }
function buildUnlocked() { return S.lv.belt >= 1; }
function enterBuild() {
  if (!buildUnlocked() || !playing) return;
  build.on = true; actionHeld = false; document.body.classList.add('building'); $('buildbar').classList.remove('hidden'); renderBuildBar(); sfx.click();
}
function exitBuild() { build.on = false; document.body.classList.remove('building'); $('buildbar').classList.add('hidden'); belts.showPreview(null); arms.showPreview(null); updateHUD(); }
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
function updateBuildAim() {
  camera.updateMatrixWorld(); ray.setFromCamera(lastAimNDC, camera);
  build.aim = false; build.del = null; arms.showPreview(null);
  if (!ray.ray.intersectPlane(_plane, _hit)) { belts.showPreview(null); return; }
  const d = Math.hypot(_hit.x - P.x, _hit.z - P.z); if (d > 11) { belts.showPreview(null); return; }
  const c = BL.worldToCell(_hit.x, _hit.z); build.gx = c.gx; build.gz = c.gz; build.aim = true;
  const ex = belts.logic.at(c.gx, c.gz) || arms.at(c.gx, c.gz);
  if (ex) { build.del = ex; build.valid = false; build.reason = 'del'; if (ex.type === 'arm') { belts.showPreview(null); belts.grid.visible = true; arms.showPreview(ex.gx, ex.gz, ex.rot, 'del'); } else belts.showPreview(ex.type, ex.gx, ex.gz, ex.rot, 'del'); return; }
  const r = placeCheck(build.piece, c.gx, c.gz, build.rot); build.valid = r === ''; build.reason = r;
  if (build.piece === 'arm') { belts.showPreview(null); const cc = BL.cellCenter(c.gx, c.gz); belts.grid.visible = true; belts.grid.position.set(cc.x, 0.03, cc.z); arms.showPreview(c.gx, c.gz, build.rot, build.valid ? 'ok' : 'bad'); }
  else belts.showPreview(build.piece, c.gx, c.gz, build.rot, build.valid ? 'ok' : 'bad');
}
function mountainNear(x, z, R) {
  const ci = Math.floor((x - ORIGIN.x) / CELL), cj = Math.floor((z - ORIGIN.z) / CELL), r = Math.ceil(R);
  for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) { if (i < 0 || j < 0 || i >= N || j >= N) continue; const c = j * N + i; if (mountain.count[c] && Math.hypot(ORIGIN.x + i + 0.5 - x, ORIGIN.z + j + 0.5 - z) <= R) return true; }
  return false;
}
function placeCheck(type, gx, gz, rot) {
  const f = type === 'arm' ? ArmWorld.footprint(gx, gz) : BeltWorld.footprint(type, gx, gz, rot), cc = BL.cellCenter(gx, gz);
  if (f.x0 < FENCE.x0 + 1 || f.x1 > FENCE.x1 - 1 || f.z0 < FENCE.z0 + 1 || f.z1 > FENCE.z1 - 1) return 'Fuori dal piazzale';
  for (const b of colliders) if (f.x0 < b.x1 + 0.1 && f.x1 > b.x0 - 0.1 && f.z0 < b.z1 + 0.1 && f.z1 > b.z0 - 0.1) return 'C\'è qualcosa in mezzo';
  if (overlap(f, vehicleBay(VEH_MAX))) return 'Qui parcheggiano i mezzi (fino al bilico)';
  if (arms.list.some(a => overlap(f, ArmWorld.footprint(a.gx, a.gz), 0.05))) return 'C\'è un braccio meccanico';
  if (type === 'arm' && belts.pieces.some(p => overlap(f, BeltWorld.footprint(p.type, p.gx, p.gz, p.rot), 0.05))) return 'C\'è un nastro: mettilo nella casella accanto';
  if (P.x > f.x0 - 0.3 && P.x < f.x1 + 0.3 && P.z > f.z0 - 0.3 && P.z < f.z1 + 0.3) return 'Ci sei in mezzo tu: fai un passo indietro';
  if (st.cart > 0 && !S.cartHeld && S.cartPos && S.cartPos.x > f.x0 - 0.4 && S.cartPos.x < f.x1 + 0.4 && S.cartPos.z > f.z0 - 0.4 && S.cartPos.z < f.z1 + 0.4) return 'C\'è il carrello posato';
  const hs = [[cc.x, cc.z], [f.x0 + 0.1, f.z0 + 0.1], [f.x1 - 0.1, f.z0 + 0.1], [f.x0 + 0.1, f.z1 - 0.1], [f.x1 - 0.1, f.z1 - 0.1]].map(([x, z]) => meshH(x, z));
  if (type === 'arm') {
    if (Math.max(...hs) > 0.6) return 'Troppo dentro la montagna: mettilo ai piedi del mucchio';
    if (!mountainNear(cc.x, cc.z, ARM_REACH - 0.3)) return 'Troppo lontano dalla montagna: il braccio deve arrivare al mucchio';
    if (arms.count() >= armMax()) return `${armMax() === 1 ? 'Massimo 1 braccio' : `Massimo ${armMax()} bracci`}: compra un altro livello di Bracci meccanici`;
  } else if (type === 'intake') {
    if (hs[0] > 0.6) return 'Troppo dentro la montagna: mettilo ai piedi del mucchio';
    const b = BL.backPoint({ type, gx, gz, rot }); let near = false;
    const ci = Math.floor((b.x - ORIGIN.x) / CELL), cj = Math.floor((b.z - ORIGIN.z) / CELL), r = Math.ceil(BL.INTAKE_REACH);
    for (let j = cj - r; j <= cj + r && !near; j++) for (let i = ci - r; i <= ci + r; i++) { if (i < 0 || j < 0 || i >= N || j >= N) continue; const c = j * N + i; if (mountain.count[c] && Math.hypot(ORIGIN.x + i + 0.5 - b.x, ORIGIN.z + j + 0.5 - b.z) <= BL.INTAKE_REACH) { near = true; break; } }
    if (!near) return 'Troppo lontano dalla montagna: il retro deve toccare il mucchio';
    if (belts.logic.count('intake') >= intakeMax()) return `Massimo ${intakeMax()} caricator${intakeMax() > 1 ? 'i' : 'e'}: compra un altro livello di Nastri`;
  } else if (Math.max(...hs) > 0.1) return 'Sulla montagna non si costruisce';
  if (S.money < PINFO[type].cost) return `Ti mancano ${money(PINFO[type].cost - S.money)}`;
  return '';
}
function placePiece() {
  if (!build.on || !build.aim || build.del) return false;
  const r = placeCheck(build.piece, build.gx, build.gz, build.rot);
  if (r) { toast(r, 1600); sfx.nope(); return false; }
  const cost = PINFO[build.piece].cost; S.money -= cost;
  if (build.piece === 'arm') { arms.add(build.gx, build.gz, build.rot); S.arms = arms.serialize(); }
  else { belts.add(build.piece, build.gx, build.gz, build.rot); S.belts = belts.logic.serialize(); }
  sfx.clunk(); dust(new THREE.Vector3(BL.cellCenter(build.gx, build.gz).x, 0.2, BL.cellCenter(build.gx, build.gz).z), 6);
  // nice touch: after a straight, the next piece keeps the direction of the line
  renderBuildBar(); updateHUD(); saveNow(); return true;
}
function dismantle(p = build.del) {
  if (!p) return false;
  if (p.type === 'arm') {
    const types = arms.remove(p); let v = 0; for (const t of types) { v += C.TIRES[t].value; S.stats.cleared++; } S.money += ARM_COST + v; S.stats.earned += v; S.arms = arms.serialize();
    sfx.unclunk(); toast(`Smontato: +${money(ARM_COST)}${types.length ? ` (+${types.length} gomm${types.length > 1 ? 'e' : 'a'} vendute)` : ''}`, 1400);
    renderBuildBar(); updateHUD(); saveNow(); return true;
  }
  const cost = BL.PIECES[p.type].cost; S.money += cost;
  const lost = p.tires.length + p.hopper.length; for (const t of p.tires.concat(p.hopper.map(type => ({ type })))) { S.money += C.TIRES[t.type].value; S.stats.cleared++; S.stats.earned += C.TIRES[t.type].value; } // tires on it: sold on the spot, never lost
  belts.remove(p); S.belts = belts.logic.serialize();
  sfx.unclunk(); toast(`Smontato: +${money(cost)}${lost ? ` (+${lost} gomm${lost > 1 ? 'e' : 'a'} vendute)` : ''}`, 1400);
  renderBuildBar(); updateHUD(); saveNow(); return true;
}
function setPiece(k) { build.piece = k; renderBuildBar(); sfx.click(); }
function rotatePiece() { build.rot = (build.rot + 1) % 4; sfx.click(); }
const PIECE_SVG = {
  straight: '<svg viewBox="0 0 40 40"><rect x="4" y="12" width="32" height="16" rx="2" fill="#24262a" stroke="#c9ced3" stroke-width="2"/><path d="M11 15l5 5-5 5M21 15l5 5-5 5" stroke="#fff" stroke-width="2.6" fill="none"/></svg>',
  curveR: '<svg viewBox="0 0 40 40"><path d="M4 12h8a16 16 0 0 1 16 16v8H12v-8a0 0 0 0 0 0 0H4z" fill="#24262a"/><path d="M4 12h6a20 20 0 0 1 20 20v4M4 28h2a8 8 0 0 1 8 8" stroke="#c9ced3" stroke-width="2" fill="none"/><path d="M10 18l5 3-3 5" stroke="#fff" stroke-width="2.4" fill="none"/></svg>',
  curveL: '<svg viewBox="0 0 40 40" style="transform:scaleY(-1)"><path d="M4 12h8a16 16 0 0 1 16 16v8H12v-8a0 0 0 0 0 0 0H4z" fill="#24262a"/><path d="M4 12h6a20 20 0 0 1 20 20v4M4 28h2a8 8 0 0 1 8 8" stroke="#c9ced3" stroke-width="2" fill="none"/><path d="M10 18l5 3-3 5" stroke="#fff" stroke-width="2.4" fill="none"/></svg>',
  arm: '<svg viewBox="0 0 40 40"><rect x="6" y="31" width="14" height="6" fill="#33383d" stroke="#c9ced3" stroke-width="1.2"/><path d="M13 31V26l9-12 10 4" stroke="#e86a12" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="26" r="2.6" fill="#141516"/><circle cx="22" cy="14" r="2.4" fill="#141516"/><path d="M32 18v6M29 25l3 4 3-4" stroke="#c9ced3" stroke-width="2" fill="none"/></svg>',
  intake: '<svg viewBox="0 0 40 40"><path d="M4 8h18l-4 12H8z" fill="#e2a91e" stroke="#1a1a1a" stroke-width="1.5"/><rect x="14" y="20" width="22" height="10" rx="2" fill="#24262a" stroke="#c9ced3" stroke-width="2"/><path d="M22 22l4 3-4 3M29 22l4 3-4 3" stroke="#fff" stroke-width="2" fill="none"/><circle cx="7" cy="30" r="5" fill="none" stroke="#c9ced3" stroke-width="2"/></svg>',
};
function renderBuildBar() {
  const box = $('bpieces'); box.innerHTML = '';
  if (!buildOrder().includes(build.piece)) build.piece = 'straight';
  for (const k of buildOrder()) {
    const P0 = PINFO[k], b = document.createElement('button'); b.className = 'piece' + (build.piece === k ? ' on' : '') + (S.money < P0.cost ? ' poor' : '') + (k === 'arm' ? ' armp' : '');
    const extra = k === 'intake' ? ` · ${belts.logic.count('intake')}/${intakeMax()}` : k === 'arm' ? ` · ${arms.count()}/${armMax()}` : '';
    b.innerHTML = `<kbd class="k">${P0.key}</kbd><span class="pi">${PIECE_SVG[k]}</span><b>${P0.short}</b><i>${money(P0.cost)}${extra}</i>`;
    b.onclick = (e) => { e.stopPropagation(); setPiece(k); }; box.appendChild(b);
  }
}

/* ---------------- HUD ---------------- */
const fmt = new Intl.NumberFormat('it-IT');
const money = x => '€ ' + (x < 1000 ? x.toFixed(2).replace('.', ',') : fmt.format(Math.floor(x)));
let toastT = 0;
function toast(msg, ms = 2200) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); toastT = ms / 1000; }
let bannerQ = [], bannerT = 0;
function banner(title, sub = '') { bannerQ.push([title, sub]); }
function pop(worldPos, text, cls = '') {
  const v = worldPos.clone().project(camera); if (v.z > 1) return;
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1500);
}
function popHUD(text, cls = 'big') { // floats up from just under the money readout
  const r = $('money').getBoundingClientRect(), el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = (r.right - 50) + 'px'; el.style.top = (r.bottom + 40) + 'px'; $('pops').appendChild(el); setTimeout(() => el.remove(), 1500);
}
function updateHUD() {
  $('money').textContent = money(S.money);
  $('left').textContent = fmt.format(remaining);
  $('leftbar').style.width = (100 * (1 - remaining / C.TOTAL_TIRES)).toFixed(3) + '%';
  $('cleared').textContent = fmt.format(Math.floor(S.stats.cleared));
  const vf = vanFillCount();
  $('vfill').textContent = V.state === 'loading' ? `${vf}/${LAYOUT.cap}` : (V.state === 'away' || V.state === 'leaving' ? 'in viaggio…' : V.state === 'arriving' ? 'in arrivo…' : `${vf}/${LAYOUT.cap}`);
  $('vbar').style.width = (100 * vf / LAYOUT.cap) + '%'; $('vname').textContent = VEH.name.toUpperCase();
  $('hands').textContent = `${S.hands.length}/${st.hands}`;
  $('cartchip').classList.toggle('hidden', st.cart === 0);
  $('cartn').textContent = `${S.cart.length}/${st.cart}` + (st.cart && !S.cartHeld ? ' · posato' : '');
  $('handchip').classList.toggle('dim', holding()); $('cartchip').classList.toggle('on', holding()); $('cartchip').classList.toggle('dim', !holding());
  $('parkbtn').classList.toggle('hidden', !holding());
  const nextAff = [...SOLD].some(id => canBuy(id));
  $('buildbtn').classList.toggle('hidden', !buildUnlocked() || build.on);
  $('ctbtn').classList.toggle('hidden', !contractsUnlocked() || build.on);
  $('shopbtn').classList.toggle('pulse', nextAff);
}
const TUT = [
  () => isTouch ? 'Tocca una gomma della montagna per prenderla' : 'Mira una gomma della montagna e clicca per prenderla',
  () => isTouch ? 'Portala dietro al furgone e tocca per lanciarla dentro' : 'Portala dietro al furgone e clicca per lanciarla dentro',
  () => isTouch ? 'Riempi il furgone fila dopo fila. Coi soldi apri il 🏪 Negozio' : 'Riempi il furgone fila dopo fila. Coi soldi apri il negozio con B',
];
function updateTut() { const el = $('hint'); if (S.tut < TUT.length) { el.textContent = TUT[S.tut](); el.classList.remove('hidden'); } else el.classList.add('hidden'); }

/* ---------------- shop ---------------- */
const REQ = {
  cart: [lv => lv.gloves >= 1 && lv.shoes >= 1, 'Prima compra guanti e scarpe'],
  helper: [lv => lv.cart >= 1, 'Prima compra il carrello'],
  helperCart: [lv => lv.helper >= 1, 'Prima assumi Beppino'],
  vehicle: [lv => lv.vehicle === 0 ? lv.cart >= 1 : lv.vehicle === 1 ? lv.belt >= 1 : lv.arm >= 1, lv => lv.vehicle === 0 ? 'Prima compra il carrello' : lv.vehicle === 1 ? 'Prima sblocca i nastri' : 'Prima compra un braccio meccanico'],
  belt: [lv => lv.helper >= 1, 'Prima assumi Beppino'],
  beltSpeed: [lv => lv.belt >= 1, 'Prima sblocca i nastri'],
  arm: [lv => lv.belt >= 1, 'Prima sblocca i nastri'],
  armSpeed: [lv => lv.arm >= 1, 'Prima compra un braccio meccanico'],
  armGrab: [lv => lv.arm >= 1, 'Prima compra un braccio meccanico'],
};
const reqMsg = id => { const m = REQ[id][1]; return typeof m === 'function' ? m(S.lv) : m; };
const VEH_DESC = ['', 'Cassone più lungo e più alto: 96 gomme a viaggio.', 'Camion con cassone da 7 metri e ruote gemellate: 350 gomme a viaggio e un bonus bello grosso.', 'Il bilico: motrice e semirimorchio da 13 metri e mezzo. 840 gomme a viaggio.'];
// what this build sells: phases 1-3 (the rest of the shop arrives with the next versions)
function shopSections() { const v4 = S.lv.vehicle >= 1; return [[1, 'A mano', ['shoes', 'gloves', 'grip']], [2, 'Il carrello', ['cart']], [3, 'Aiutanti e nastri', ['helper', 'helperCart', ...(v4 ? [] : ['vehicle']), 'belt', 'beltSpeed']], [4, 'Bracci meccanici, camion e bilico', ['arm', 'armSpeed', 'armGrab', ...(v4 ? ['vehicle'] : [])]]]; }
const SOLD = new Set(shopSections().flatMap(x => x[2]).concat(['vehicle']));
const MAXV = { vehicle: VEH_MAX };
function maxLv(id) { return Math.min(C.maxLevel(id), MAXV[id] ?? 99); }
function locked(id) { return REQ[id] && !REQ[id][0](S.lv); }
function canBuy(id) { const lv = S.lv[id], c = C.costOf(id, lv); return SOLD.has(id) && lv < maxLv(id) && c != null && S.money >= c && !locked(id); }
function fmtVal(u, v) {
  if (u.id === 'cart') return v ? `${v} gomme` : 'nessuno'; if (u.id === 'gloves') return v + (v > 1 ? ' gomme' : ' gomma');
  if (u.id === 'helper') return v ? `${v} aiutant${v > 1 ? 'i' : 'e'}` : 'nessuno';
  if (u.id === 'belt') return v ? `${v} caricator${v > 1 ? 'i' : 'e'}` : 'bloccati';
  if (u.id === 'vehicle') { const k = C.VEHICLES[v]; return `${k.name} · ${k.cap} gomme`; }
  if (u.id === 'arm') return v ? `${v} bracci${v === 1 ? 'o' : ''}`.replace('braccii', 'braccio').replace('bracciio', 'braccio') : 'nessuno';
  if (u.id === 'armGrab') return `${v} gomm${v > 1 ? 'e' : 'a'} a presa`;
  return String(v).replace('.', ',') + ' ' + u.unit;
}
const HELPER_NAMES = ['Beppino', 'Ottavio', 'Gino', 'Salvo', 'Tonino'];
function buy(id) {
  const u = C.UPG[id], lv = S.lv[id], c = C.costOf(id, lv);
  if (!canBuy(id)) return false;
  S.money -= c; S.lv[id]++; st = C.stats(S.lv); sfx.buy();
  if (id === 'cart' && S.lv.cart === 1) { S.cartHeld = true; while (S.hands.length && S.cart.length < st.cart) S.cart.push(S.hands.shift()); if (S.hands.length) { S.cartHeld = false; parkSpot(true); } banner('Fase 2: il carrello', isTouch ? 'Le gomme vanno sul carrello. Tocca «Posa carrello» per lasciarlo giù.' : 'Le gomme vanno sul carrello. Premi Q per posarlo, E per riprenderlo.'); }
  else if (id === 'helper') { const n = C.UPG.helper.lv[S.lv.helper], nm = HELPER_NAMES[n - 1] || 'Un aiutante';
    banner(n === 1 ? 'Fase 3: arriva Beppino!' : `${nm} si unisce alla squadra`, n === 1 ? 'Porta le gomme al furgone da solo. Col secondo aiutante se le passano rotolando.' : 'In fila dalla montagna al furgone: se le passano facendole rotolare. Non metterti in mezzo…'); }
  else if (id === 'belt') banner(S.lv.belt === 1 ? 'Fase 3: nastri trasportatori' : 'Un caricatore in più', isTouch ? 'Tocca «Costruisci» e piazza i pezzi: caricatore ai piedi della montagna, nastro fino al furgone.' : 'Premi C per costruire: caricatore ai piedi della montagna, nastro fino al furgone.');
  else if (id === 'arm') banner(S.lv.arm === 1 ? 'Fase 4: bracci meccanici!' : 'Un braccio in più', isTouch ? 'Tocca «Costruisci», scegli il braccio e piazzalo ai piedi della montagna, accanto a un nastro.' : 'Premi C, tasto 5: piazza il braccio ai piedi della montagna, accanto a un nastro.');
  else if (id === 'vehicle') { banner(`${C.VEHICLES[S.lv.vehicle].name}!`, `${C.VEHICLES[S.lv.vehicle].cap} gomme a viaggio. ${V.state === 'loading' && !S.van.fill.length && !V.pend.length ? 'Sta arrivando adesso.' : 'Arriva al prossimo giro.'}`);
    if (V.state === 'loading' && !S.van.fill.length && !V.pend.length) { V.state = 'closing'; V.t = 0; } }
  if (id === 'belt' && S.lv.belt === 1) { banner('Nuovo: bacheca contratti', isTouch ? 'Lavori facoltativi senza scadenza: tocca 📋 Contratti.' : 'Lavori facoltativi senza scadenza: premi K o vai alla bacheca sul muro dell\'officina.'); board.draw(S.contracts.list, S.contracts.active, false); }
  else banner(u.name, `${fmtVal(u, u.lv[S.lv[id]])}`);
  if (S.tut === 2) S.tut = 3;
  syncCrew(); syncArms(); refreshCart(); refreshHands(); renderShop(); renderBuildBar(); updateHUD(); saveNow();
  return true;
}
function renderShop() {
  const list = $('shoplist'); list.innerHTML = '';
  $('shopmoney').textContent = money(S.money);
  for (const [ph, name, ids] of shopSections()) {
    const h = document.createElement('div'); h.className = 'phase'; h.textContent = `Fase ${ph}: ${name}`; list.appendChild(h);
    for (const id of ids) {
      const u = C.UPG[id], lv = S.lv[u.id], max = maxLv(u.id), cost = C.costOf(u.id, lv), lk = locked(u.id);
      const el = document.createElement('div'); el.className = 'card' + (lv >= max || cost == null ? ' maxed' : '') + (lk ? ' locked' : ''); el.dataset.id = id;
      const icon = u.icon === 'cart' ? trolleySVG(44) : u.icon;
      const nm = id === 'vehicle' ? C.VEHICLES[Math.min(VEH_MAX, lv + 1)].name : u.name, ds = id === 'vehicle' ? VEH_DESC[Math.min(VEH_MAX, lv + 1)] : u.desc;
      const dots = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const now = fmtVal(u, u.lv[lv]), next = lv < max ? fmtVal(u, u.lv[lv + 1]) : null;
      el.innerHTML = `<div class="ic">${icon}</div><div class="tx"><b>${nm}</b><span>${ds}</span><span class="eff">${next ? `${now} → <b>${next}</b>` : `${now} · al massimo`}</span><div class="dots">${dots}</div>${lk ? `<span class="req">${reqMsg(u.id)}</span>` : ''}</div>`;
      const btn = document.createElement('button'); btn.className = 'buy';
      if (lv >= max || cost == null) { btn.textContent = 'MAX'; btn.disabled = true; }
      else { btn.textContent = money(cost); btn.disabled = !canBuy(u.id); }
      btn.onclick = (e) => { e.stopPropagation(); buy(u.id); };
      el.appendChild(btn); list.appendChild(el);
    }
  }
  const nx = document.createElement('div'); nx.className = 'phase soon'; nx.innerHTML = `Fase 5: ${C.PHASES[6].name} <small>arriva nella prossima versione</small>`; list.appendChild(nx);
  const tease = document.createElement('div'); tease.className = 'card locked'; tease.innerHTML = `<div class="ic">🧲</div><div class="tx"><b>Carrucola, fascioni e trituratore</b><span>Poi i droni, il braccio ragno e il finale.</span></div>`; list.appendChild(tease);
}
let shopOpen = false;
function openShop() { if (!playing) return; if (build.on) exitBuild(); if (ctOpen) closeContracts(); shopOpen = true; renderShop(); $('shop').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }
function closeShop() { shopOpen = false; $('shop').classList.add('hidden'); lockPointer(); }

/* ---------------- actions ---------------- */
const ray = new THREE.Raycaster();
let hover = null, grabBusy = 0, throwCD = 0, actionHeld = false, lastAimNDC = new THREE.Vector2(0, 0);
function pickAt(ndc) {
  camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction; let best = null, bt = 1e9;
  for (const r of nearRecs) {
    const ox = r.pos.x - o.x, oy = r.pos.y - o.y, oz = r.pos.z - o.z;
    const tca = ox * d.x + oy * d.y + oz * d.z; if (tca < 0) continue;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca; if (d2 > r.r * r.r) continue;
    const t = tca - Math.sqrt(r.r * r.r - d2);
    // prefer free tires over a buried one right behind them
    const score = t + (r.free ? 0 : 0.25);
    if (score < bt) { bt = score; best = r; best._t = t; }
  }
  return best;
}
function inThrowZone() {
  if (!vanReady()) return false;
  const dx = P.x - van.position.x, dz = P.z - VAN_Z;
  return dx <= -THROW_ZONE.near + 0.35 && dx >= -THROW_ZONE.far && Math.abs(dz) <= THROW_ZONE.half;
}
function nearVanButOut() { if (!vanReady()) return false; const dx = P.x - van.position.x, dz = P.z - VAN_Z; return !inThrowZone() && dx > -7 && dx < 1 && Math.abs(dz) < 5; }
function tryGrab(rec) {
  if (!rec) return false;
  if (rec._t > C.PLAYER.reach) { toast('Troppo lontana: avvicinati'); return true; }
  if (!rec.free) { toast(rec.type === C.GOLD_ID ? 'La gomma d\'oro è sepolta: togli prima le gomme sopra!' : 'È sepolta: togli prima le gomme sopra'); sfx.buried(); P.shake = 0.18; return true; }
  if (grabBusy > 0) return true;
  if (carried() >= capacity()) { toast(holding() ? 'Carrello pieno! Vai al furgone' : 'Hai le mani piene: porta le gomme al furgone'); sfx.nope(); return true; }
  const type = mountain.take(rec.c, rec.index); if (type == null) return false;
  remaining--; grabBusy = st.grab; nearDirty = true; farDirty = true;
  const slid = mountain.lastSlide || 0;
  updateCorners(mountain.dirty); mountain.dirty.clear();
  sfx.grab(type === 3 ? 0 : type, 0);
  if (slid > 0) { sfx.slide(slid); dust(rec.pos, 10); toast('Frana! Sono scese altre gomme', 1400); } else dust(rec.pos, 3);
  const toCart = holding();
  const slotI = toCart ? S.cart.length + reservedCart : S.hands.length + reservedHands;
  if (toCart) reservedCart++; else reservedHands++;
  const from = rec.pos.clone(), q0 = rec.quat.clone();
  const target = toCart ? (o) => { cart.updateMatrixWorld(true); return cartRig().localToWorld(cartSlotLocal(slotI, type, o)); } : (o) => { camera.updateMatrixWorld(); return handGroup.localToWorld(o.copy(handSlots[Math.min(slotI, 1)])); };
  const tq = new THREE.Quaternion();
  startFlight({ kind: 'grab', toCart, type, from, q0, to: target, q1: () => (toCart ? tq.setFromEuler(new THREE.Euler(0, P.yaw, 0)) : tq.copy(camera.quaternion).multiply(_q3.setFromEuler(new THREE.Euler(0.25, 0, slotI ? -1.25 : 1.25)))), dur: Math.max(0.22, st.grab * 0.8), arc: 0.35, ease: 'out',
    done: () => {
      if (toCart) { reservedCart--; S.cart.push(type); refreshCart(); sfx.thud(S.cart.length); } else { reservedHands--; S.hands.push(type); refreshHands(); }
      if (type === C.GOLD_ID) { banner('Gomma d\'oro!', `Vale ${money(C.TIRES[C.GOLD_ID].value)} nel furgone`); sfx.milestone(); }
      if (S.tut === 0) { S.tut = 1; updateTut(); }
      updateHUD();
    } });
  return true;
}
let reservedCart = 0, reservedHands = 0;
function tryThrow() {
  if (!inThrowZone() || throwCD > 0) return false;
  let type, fromHand = false, srcPos = new THREE.Vector3(), srcQ = new THREE.Quaternion();
  if (!holding() && S.hands.length) { fromHand = true; const i = S.hands.length - 1; type = S.hands[i]; handTires[i].getWorldPosition(srcPos); handTires[i].getWorldQuaternion(srcQ); }
  else if (holding() && S.cart.length) { const i = S.cart.length - 1; type = S.cart[i]; cartTires[i].getWorldPosition(srcPos); cartTires[i].getWorldQuaternion(srcQ); }
  else return false;
  if (!vanHasRoom(type)) return false;
  if (fromHand) { S.hands.pop(); refreshHands(); } else { S.cart.pop(); refreshCart(); }
  throwCD = C.PLAYER.throwInterval;
  sfx.whoosh(0);
  launchToVan(type, srcPos, srcQ, {});
  return true;
}
function vanHasRoom(type) { return vanReady() && !!placeTire(virtFill(), LAYOUT.cap, !!C.TIRES[type].half); }
// room for n more tires (counting the ones already flying in)
function vanCanAccept(n) { return vanReady() && S.van.fill.length + V.pend.length + n <= LAYOUT.cap; }
// any tire into the braid: the player's throws, Beppino & co., the end of a belt. o.auto = soft bling, no tutorial step
let popT = 0;
function launchToVan(type, from, q0, o = {}) {
  if (!vanReady()) return false;
  const place = placeTire(virtFill(), LAYOUT.cap, !!C.TIRES[type].half);
  if (!place) return false;
  const p = { slot: place.slot, sub: place.sub, type }; V.pend.push(p);
  const lp = new THREE.Vector3(), lq = new THREE.Quaternion(); slotLocal(place.slot, place.sub, type, lp, lq);
  const wq = new THREE.Quaternion();
  startFlight({ kind: 'throw', p, type, from: from.clone(), q0: q0.clone(), to: (v) => van.localToWorld(v.copy(lp)), q1: () => wq.copy(van.quaternion).multiply(lq), dur: o.dur || 0.34, arc: o.arc ?? 0.28, spin: o.spin ?? 0.6, ease: 'line',
    done: () => {
      V.pend.splice(V.pend.indexOf(p), 1);
      if (p.sub && S.van.fill[p.slot]) S.van.fill[p.slot].push(type); else S.van.fill[p.slot] = [type];
      rebuildCargo();
      const val = C.TIRES[type].value; S.money += val; S.stats.earned += val; S.stats.cleared++; S.stats.bySize[type]++;
      if (o.auto) S.stats.auto = (S.stats.auto || 0) + 1; else S.stats.thrown++;
      if (type === C.GOLD_ID) S.stats.gold++;
      contractTick(type);
      const s = LAYOUT.slots[p.slot], gold = type === C.GOLD_ID;
      if (o.auto) { const d = Math.hypot(P.x - van.position.x, P.z - VAN_Z); sfx.clink(type === 3 ? 0 : type, s.row / LAYOUT.rows, 0, gold, Math.max(0.12, 0.5 / (1 + Math.max(0, d - 4) * 0.12))); if (popT <= 0 || gold) { pop(van.localToWorld(lp.clone()), '+' + money(val), gold ? 'gold' : 'soft'); popT = 0.18; } }
      else { sfx.clink(type === 3 ? 0 : type, s.row / LAYOUT.rows, 0, gold); pop(van.localToWorld(lp.clone()), '+' + money(val), gold ? 'gold' : ''); if (S.tut === 1) { S.tut = 2; updateTut(); } }
      checkMilestones(); updateHUD();
      if (S.van.fill.length >= LAYOUT.cap && V.pend.length === 0) vanFull();
    } });
  return true;
}
function checkMilestones() {
  while (S.milestones < C.MILESTONES.length && S.stats.cleared >= C.MILESTONES[S.milestones]) {
    const n = C.MILESTONES[S.milestones++]; banner(`${fmt.format(n)} gomme smaltite!`, `Ne mancano ${fmt.format(C.TOTAL_TIRES - n)}`); sfx.milestone();
  }
}
function vanFull() {
  if (V.state !== 'loading') return;
  const bonus = VEH.bonus; S.money += bonus; S.stats.earned += bonus; S.stats.vans++;
  banner('Furgone pieno!', `+${money(bonus)} di consegna · torna tra poco`); sfx.coin(true); popHUD('+' + money(bonus));
  V.state = 'closing'; V.t = 0; saveNow();
}
function doAction(ndc) {
  if (aimingAtCart()) { pickCart(); return; }
  if (contractsUnlocked() && nearBoard()) { openContracts(); return; }
  if (inRackZone() && carriedNow()) { tryStore(); return; }
  const rec = pickAt(ndc || lastAimNDC);
  if (rec && rec._t <= C.PLAYER.reach + 1.5) { if (tryGrab(rec)) return; }
  if (inThrowZone()) { if (!tryThrow() && !carried()) toast('Non hai gomme: vai a prenderle alla montagna'); return; }
  if (carriedNow() && nearVanButOut()) { toast('Avvicinati al furgone: entra nel riquadro verde'); return; }
  if (rec) { tryGrab(rec); return; }
  if (carried() && !vanReady()) toast('Il furgone sta arrivando, aspetta un attimo');
}

/* ---------------- dust particles ---------------- */
const dustMat = new THREE.SpriteMaterial({ map: G.glowTexture(), color: 0x9c8f7c, transparent: true, depthWrite: false, opacity: 0.5 });
const dusts = [];
function dust(p, n) { for (let i = 0; i < n; i++) { const s = new THREE.Sprite(dustMat.clone()); s.position.copy(p).add(new THREE.Vector3(G.rand(-0.3, 0.3), G.rand(0, 0.3), G.rand(-0.3, 0.3))); s.scale.setScalar(0.4); scene.add(s); dusts.push({ s, t: 0, v: new THREE.Vector3(G.rand(-0.4, 0.4), G.rand(0.3, 0.9), G.rand(-0.4, 0.4)) }); } }
function updateDust(dt) { for (let i = dusts.length - 1; i >= 0; i--) { const d = dusts[i]; d.t += dt; d.s.position.addScaledVector(d.v, dt); d.s.scale.setScalar(0.4 + d.t * 1.6); d.s.material.opacity = Math.max(0, 0.45 * (1 - d.t / 1.2)); if (d.t > 1.2) { scene.remove(d.s); d.s.material.dispose(); dusts.splice(i, 1); } } }

/* ---------------- van state machine ---------------- */
function updateVan(dt) {
  V.t += dt;
  const away = Math.max(1, VEH.away - 3.4 - 4.2 - 1.1);
  switch (V.state) {
    case 'closing': V.doors = Math.max(0, 1 - V.t / 0.9); if (V.t >= 0.9) { sfx.doors(); V.state = 'starting'; V.t = 0; sfx.engineStart(vanDist(), van.userData.deep || 0); } break;
    case 'starting': if (V.t >= 1.1 + (van.userData.deep || 0) * 0.5) { V.state = 'leaving'; V.t = 0; V.engine = true; } break;
    case 'leaving': { const k = Math.min(1, V.t / 3.4); van.position.x = VAN_X + (VAN_FAR - VAN_X) * k * k; if (k >= 1) { V.state = 'away'; V.t = 0; van.visible = false; V.engine = false; S.van.fill = []; S.van.trips++; rebuildCargo(); updateHUD(); } break; }
    case 'away': if (S.vehicle !== targetTier()) { setVehicle(targetTier()); van.visible = false; evictPieces(); updateHUD(); } if (V.t >= away) { V.state = 'arriving'; V.t = 0; van.visible = true; V.engine = true; sfx.horn(); } break;
    case 'arriving': { const k = Math.min(1, V.t / 4.2), e = 1 - Math.pow(1 - k, 2.4); van.position.x = VAN_FAR + (VAN_X - VAN_FAR) * e; if (Math.floor(V.t / 0.6) !== Math.floor((V.t - dt) / 0.6) && k < 0.95) sfx.beep(); if (k >= 1) { V.state = 'opening'; V.t = 0; V.engine = false; sfx.engineStop(vanDist(), van.userData.deep || 0); } break; }
    case 'opening': V.doors = Math.min(1, V.t / 1.0); if (V.t >= 1.0) { V.state = 'loading'; V.t = 0; updateHUD(); } break;
  }
  G.poseDoors(van, V.doors);
  const moving = V.state === 'leaving' || V.state === 'arriving';
  sfx.setEngine(!!V.engine && van.visible, V.state === 'leaving' ? 0.8 : 0.45, vanDist(), van.userData.deep || 0);
  // spin the wheels while driving
  if (moving) for (const w of van.userData.wheels) w.rotation.y += dt * (V.state === 'leaving' ? 1 : -1) * 6;
}

/* ---------------- movement + collisions ---------------- */
function blocked(x, z, solidOnly = false) {
  if (x < FENCE.x0 + 0.5 || x > FENCE.x1 - 0.5 || z < FENCE.z0 + 0.5 || z > FENCE.z1 - 0.5) { if (!(x > FENCE.x1 - 0.6 && Math.abs(z - VAN_Z) < 3.8 && x < FENCE.x1 + 0.1)) return true; }
  if (meshH(x, z) > 0.55) return true;
  for (const b of colliders) if (x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3) return true;
  if (van.visible) { const vx = van.position.x, U = van.userData; if (x > vx - 0.35 && x < vx + U.len + 0.1 && Math.abs(z - VAN_Z) < U.halfW + 0.4) return true; }
  if (st.cart > 0 && !S.cartHeld && S.cartPos && Math.hypot(x - S.cartPos.x, z - S.cartPos.z) < 0.6) return true;
  if (belts.hit(x, z, 0.28)) return true;
  if (arms.hit(x, z, 0.3)) return true;
  if (!solidOnly && holding() && cartPose.side < 0.5) { const D = (cartPose.D || 1.4) + 0.3, fx = x - Math.sin(P.yaw) * D, fz = z - Math.cos(P.yaw) * D; if (meshH(fx, fz) > 1.0) return true; }
  return false;
}
// the helpers are solid, but never trap you: you can always step away from one
function crewBump(x, z) { for (const h of crew.list) { const d1 = Math.hypot(x - h.x, z - h.z); if (d1 < 0.5 && d1 < Math.hypot(P.x - h.x, P.z - h.z)) return true; } return false; }
// anti-stuck: if you ever end up inside something solid (the van parking on top of you, a belt, the trolley, a
// container, a bad save...), slide out to the nearest free spot. The search starts toward -x, i.e. behind the van
// (the throw zone), so an arriving van nudges you back out of the bay. dt = 0: snap there at once (load/spawn).
function unstick(dt) {
  if (!blocked(P.x, P.z, true)) return false;
  let best = null;
  for (let r = 0.2; r <= 7 && !best; r += 0.2) for (let k = 0; k < 24; k++) {
    const a = Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
    if (!blocked(x, z, true)) { best = { x, z }; break; }
  }
  if (!best) return false;
  const k = dt > 0 ? Math.min(1, dt * 12) : 1;
  P.x += (best.x - P.x) * k; P.z += (best.z - P.z) * k; P.vx = P.vz = 0;
  if (k < 1 && Math.hypot(best.x - P.x, best.z - P.z) < 0.03) { P.x = best.x; P.z = best.z; }
  unstuck++; return true;
}
let unstuck = 0;
function updatePlayer(dt) {
  unstick(dt);
  let fx = 0, fz = 0;
  if (keys.KeyW || keys.ArrowUp) fz += 1; if (keys.KeyS || keys.ArrowDown) fz -= 1;
  if (keys.KeyA || keys.ArrowLeft) fx -= 1; if (keys.KeyD || keys.ArrowRight) fx += 1;
  if (joy.active) { fx += joy.x; fz += -joy.y; }
  const len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
  const sp = st.walk * (keys.ShiftLeft ? 1.25 : 1);
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  const tvx = (-sy * fz + cy * fx) * sp, tvz = (-cy * fz - sy * fx) * sp;
  const a = 1 - Math.exp(-dt * 10); P.vx += (tvx - P.vx) * a; P.vz += (tvz - P.vz) * a;
  const nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
  if (!blocked(nx, P.z) && !crewBump(nx, P.z)) P.x = nx; else P.vx = 0;
  if (!blocked(P.x, nz) && !crewBump(P.x, nz)) P.z = nz; else P.vz = 0;
  const moving = Math.hypot(P.vx, P.vz);
  if (moving > 0.4) { P.bob += dt * moving * 2.4; P.stepT += dt * moving; if (P.stepT > 1.45) { P.stepT = 0; sfx.step(); } }
  const ground = Math.min(0.5, meshH(P.x, P.z));
  P.shake = Math.max(0, P.shake - dt);
  camera.position.set(P.x, P.eye + ground + Math.sin(P.bob) * 0.035 * Math.min(1, moving / 3), P.z);
  camera.rotation.set(P.pitch + (P.shake ? Math.sin(P.shake * 90) * 0.01 : 0), P.yaw, 0, 'YXZ');
  // cart follows in front of the player
  if (st.cart > 0) { if (S.cartHeld) updateTrolley(dt, sy, cy, moving); else poseParked(); }
  // hands sway
  handGroup.position.set(Math.sin(P.bob * 0.5) * 0.01, Math.abs(Math.cos(P.bob * 0.5)) * 0.012, 0);
}

// pushing: tilted back, wheels ahead and a bit to the right, handles just below the view.
// at the van: parked upright beside you on the right, so you can step right up to the tailgate and throw.
function updateTrolley(dt, sy, cy, moving) {
  const U = trolley.userData, nearVan = van.visible && P.x > van.position.x - 6.5 && P.x < van.position.x + 0.6 && Math.abs(P.z - VAN_Z) < 3.4;
  cartPose.side += ((nearVan ? 1 : 0) - cartPose.side) * (1 - Math.exp(-dt * 5));
  const k = cartPose.side, ease = k * k * (3 - 2 * k);
  const tiltPush = Math.min(0.8, Math.acos(Math.min(0.9, 0.95 / U.handleLen))), tilt = tiltPush + (0.1 - tiltPush) * ease;
  const reach = U.handleLen * Math.sin(tiltPush), D = 0.5 + reach; cartPose.D = D;
  const fwd = D + (-0.35 - D) * ease, right = 0.82 + (0.95 - 0.82) * ease;
  cart.position.set(P.x - sy * fwd + cy * right, 0, P.z - cy * fwd - sy * right);
  cart.rotation.y = P.yaw + Math.PI / 2;
  U.rig.rotation.z = tilt; U.rig.position.y = U.wheelR;
  U.rig.rotation.x = Math.sin(P.bob * 0.5) * 0.012 * Math.min(1, moving / 2);
}

// ---- park / pick up the trolley ----
function poseParked() {
  const U = trolley.userData, c = S.cartPos;
  cart.position.set(c.x, 0, c.z); cart.rotation.y = c.rot + Math.PI / 2;
  U.rig.rotation.set(0, 0, 0.09); U.rig.position.y = U.wheelR; // standing upright, leaning a touch on its frame
}
// find a free spot in front of the player (inside the fence, off the mountain, away from van/office/props)
function parkSpot(force = false) {
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  for (const d of [1.25, 1.0, 1.6, 0.85]) for (const side of [0, 0.6, -0.6, 1.0, -1.0]) {
    const x = P.x - sy * d + cy * side, z = P.z - cy * d - sy * side;
    if (x < FENCE.x0 + 1 || x > FENCE.x1 - 1 || z < FENCE.z0 + 1 || z > FENCE.z1 - 1) continue;
    if (meshH(x, z) > 0.05 || blockedStatic(x, z, 0.45)) continue;
    S.cartPos = { x, z, rot: P.yaw }; return true;
  }
  if (force) { S.cartPos = { x: P.x - cy * 0.8, z: P.z + sy * 0.8, rot: P.yaw }; return true; }
  return false;
}
function blockedStatic(x, z, pad) {
  for (const b of colliders) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
  if (van.visible) { const vx = van.position.x, U = van.userData; if (x > vx - 0.9 && x < vx + U.len + 0.4 && Math.abs(z - VAN_Z) < U.halfW + 0.6) return true; }
  if (arms.hit(x, z, pad)) return true;
  if (Math.hypot(x - P.x, z - P.z) < 0.55) return true;
  if (belts.hit(x, z, pad)) return true;
  return false;
}
function parkCart() {
  if (!holding() || reservedCart > 0) return false;
  if (!parkSpot()) { toast('Qui non c\'è spazio per posare il carrello'); sfx.nope(); return false; }
  S.cartHeld = false; sfx.thud(1); refreshCart(); updateHUD(); saveNow();
  toast(isTouch ? 'Carrello posato · tocca «Prendi carrello» per riprenderlo' : 'Carrello posato · guardalo e premi E per riprenderlo', 2200);
  return true;
}
function cartDist() { return (st.cart > 0 && !S.cartHeld && S.cartPos) ? Math.hypot(P.x - S.cartPos.x, P.z - S.cartPos.z) : Infinity; }
function aimingAtCart() {
  const d = cartDist(); if (d > 3.1) return false;
  if (isTouch) return false; // on touch: the «Prendi carrello» button
  const dx = S.cartPos.x - P.x, dz = S.cartPos.z - P.z, yaw = Math.atan2(-dx, -dz);
  let a = Math.abs(((yaw - P.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  const pitchTo = Math.atan2(0.75 - P.eye, d); // aim at the middle of the trolley
  return a < Math.max(0.22, Math.atan2(0.5, d)) && Math.abs(P.pitch - pitchTo) < 0.55;
}
function pickCart() {
  if (st.cart === 0 || S.cartHeld || cartDist() > 3.1 || reservedHands > 0) return false;
  if (S.hands.length > st.cart - S.cart.length) { toast('Posa o carica prima le gomme in mano: sul carrello non c\'è posto'); sfx.nope(); return false; }
  while (S.hands.length) S.cart.push(S.hands.shift()); // what you carried goes onto the stack
  S.cartHeld = true; cartPose.side = 0; sfx.thud(S.cart.length); refreshHands(); refreshCart(); updateHUD(); saveNow();
  return true;
}

/* ---------------- input ---------------- */
let playing = false;
function lockPointer() { if (!isTouch && playing && !shopOpen && !settingsOpen && !ctOpen) canvas.requestPointerLock?.(); }
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!playing) return;
  if (build.on) {
    if (e.code === 'KeyC' || e.code === 'Escape') { e.preventDefault(); exitBuild(); return; }
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code); if (i >= 0 && buildOrder()[i]) { setPiece(buildOrder()[i]); return; }
    if (e.code === 'KeyR') { rotatePiece(); return; }
    if (e.code === 'KeyX' || e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); dismantle(); return; }
    if (e.code === 'KeyB' || e.code === 'Tab') { e.preventDefault(); exitBuild(); openShop(); }
    if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); placePiece(); }
    return;
  }
  if (ctOpen) { if (!e.repeat && (e.code === 'KeyK' || e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); closeContracts(); } return; }
  if (e.code === 'KeyK') { e.preventDefault(); openContracts(); return; }
  if (e.code === 'KeyC') { e.preventDefault(); if (buildUnlocked()) enterBuild(); else toast('Prima sblocca i nastri trasportatori nel negozio'); }
  if (e.code === 'KeyB' || e.code === 'Tab') { e.preventDefault(); shopOpen ? closeShop() : openShop(); }
  if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); actionHeld = true; doAction(); }
  if (e.code === 'KeyQ') { e.preventDefault(); if (holding()) parkCart(); else if (cartDist() < 3.1) pickCart(); }
  if (e.code === 'KeyM') { sfx.muted = !sfx.muted; sfx.setVolume(S.settings.volume); toast(sfx.muted ? 'Audio spento' : 'Audio acceso'); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE' || e.code === 'Space') actionHeld = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; actionHeld = false; });
canvas.addEventListener('mousedown', e => {
  if (isTouch || !playing) return;
  if (!document.pointerLockElement) { lockPointer(); return; }
  if (build.on) { if (e.button === 0) placePiece(); else if (e.button === 2) dismantle(); return; }
  if (e.button === 0) { actionHeld = true; doAction(); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mouseup', () => { actionHeld = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  const s = 0.0022 * S.settings.sens;
  P.yaw -= e.movementX * s; P.pitch -= e.movementY * s * (S.settings.invertY ? -1 : 1);
  P.pitch = G.clamp(P.pitch, -1.35, 1.2);
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  $('pause').classList.toggle('hidden', locked || !playing || shopOpen || settingsOpen || ctOpen || isTouch);
});
// touch: left joystick, drag to look, tap to act on the exact tire
const touches = new Map();
canvas.addEventListener('touchstart', e => {
  e.preventDefault(); sfx.init();
  for (const t of e.changedTouches) {
    const left = t.clientX < innerWidth * 0.38 && t.clientY > innerHeight * 0.35;
    if (left && !joy.active) { joy.active = true; joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = joy.y = 0; const j = $('joy'); j.style.left = t.clientX + 'px'; j.style.top = t.clientY + 'px'; j.classList.add('on'); }
    else touches.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now(), moved: 0 });
  }
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (joy.active && t.identifier === joy.id) { const dx = t.clientX - joy.ox, dy = t.clientY - joy.oy, m = 55, l = Math.hypot(dx, dy), k = l > m ? m / l : 1; joy.x = dx * k / m; joy.y = dy * k / m; $('knob').style.transform = `translate(${dx * k}px,${dy * k}px)`; continue; }
    const o = touches.get(t.identifier); if (!o) continue;
    const dx = t.clientX - o.x, dy = t.clientY - o.y; o.x = t.clientX; o.y = t.clientY; o.moved += Math.abs(dx) + Math.abs(dy);
    const s = 0.005 * S.settings.sens; P.yaw -= dx * s; P.pitch = G.clamp(P.pitch - dy * s * (S.settings.invertY ? -1 : 1), -1.35, 1.2);
  }
}, { passive: false });
const endTouch = e => {
  for (const t of e.changedTouches) {
    if (joy.active && t.identifier === joy.id) { joy.active = false; joy.x = joy.y = 0; $('joy').classList.remove('on'); $('knob').style.transform = ''; continue; }
    const o = touches.get(t.identifier); touches.delete(t.identifier);
    if (o && o.moved < 14 && performance.now() - o.t0 < 400 && playing && !shopOpen && !ctOpen) {
      const ndc = new THREE.Vector2(t.clientX / innerWidth * 2 - 1, -(t.clientY / innerHeight) * 2 + 1); if (build.on) placePiece(); else doAction(ndc);
    }
  }
};
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
const throwBtn = $('throwbtn');
throwBtn.addEventListener('touchstart', e => { e.preventDefault(); actionHeld = true; if (!tryThrow()) tryStore(); });
throwBtn.addEventListener('touchend', e => { e.preventDefault(); actionHeld = false; });
throwBtn.addEventListener('mousedown', () => { actionHeld = true; tryThrow(); });

/* ---------------- menus ---------------- */
let settingsOpen = false;
function start() {
  sfx.init(); playing = true; $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  lockPointer(); updateTut(); updateHUD(); updatePinned();
}
$('play').onclick = start;
$('shopbtn').onclick = (e) => { e.stopPropagation(); openShop(); };
$('parkbtn').onclick = (e) => { e.stopPropagation(); parkCart(); };
$('pickbtn').onclick = (e) => { e.stopPropagation(); if (!pickCart() && cartDist() > 3.1) toast('Avvicinati al carrello'); };
$('shopclose').onclick = closeShop;
$('buildbtn').onclick = (e) => { e.stopPropagation(); enterBuild(); };
$('brot').onclick = (e) => { e.stopPropagation(); rotatePiece(); };
$('bplace').onclick = (e) => { e.stopPropagation(); placePiece(); };
$('bdel').onclick = (e) => { e.stopPropagation(); if (!dismantle()) toast('Mira un pezzo per smontarlo', 1400); };
$('bexit').onclick = (e) => { e.stopPropagation(); exitBuild(); };
$('ctbtn').onclick = (e) => { e.stopPropagation(); openContracts(); };
$('ctclose').onclick = (e) => { e.stopPropagation(); closeContracts(); };
$('contracts').addEventListener('click', e => { if (e.target.id === 'contracts') closeContracts(); });
$('pinned').onclick = (e) => { e.stopPropagation(); openContracts(); };
$('shop').addEventListener('click', e => { if (e.target.id === 'shop') closeShop(); });
$('resume').onclick = () => lockPointer();
function openSettings() { settingsOpen = true; $('settings').classList.remove('hidden'); $('pause').classList.add('hidden'); if (document.pointerLockElement) document.exitPointerLock();
  $('vol').value = S.settings.volume; $('sens').value = S.settings.sens; $('inv').checked = S.settings.invertY; $('qual').value = S.settings.quality; }
function closeSettings() { settingsOpen = false; $('settings').classList.add('hidden'); $('confirmnew').classList.add('hidden'); lockPointer(); }
$('setbtn').onclick = (e) => { e.stopPropagation(); openSettings(); };
$('pausesettings').onclick = openSettings;
$('setclose').onclick = closeSettings;
$('vol').oninput = e => { S.settings.volume = +e.target.value; sfx.setVolume(S.settings.volume); };
$('sens').oninput = e => { S.settings.sens = +e.target.value; };
$('inv').onchange = e => { S.settings.invertY = e.target.checked; };
$('qual').onchange = e => { S.settings.quality = e.target.value; saveNow(); location.reload(); };
$('newgame').onclick = () => $('confirmnew').classList.remove('hidden');
$('newno').onclick = () => $('confirmnew').classList.add('hidden');
$('newyes').onclick = () => { blockSave = true; SV.wipe(localStorage); location.reload(); };

/* ---------------- save ---------------- */
let blockSave = false, saveT = 0;
function saveNow() {
  if (blockSave) return false;
  S.mountain = mountain.diff(); S.gold = { ...mountain.gold };
  S.player = { x: P.x, z: P.z, yaw: P.yaw, pitch: P.pitch };
  // tires in flight are saved where they were heading (no tire is ever lost)
  const s = JSON.parse(JSON.stringify(S));
  for (const f of flights) {
    if (f.kind === 'grab') (f.toCart ? s.cart : s.hands).push(f.type);
    else if (f.kind === 'throw') { if (f.p.sub && s.van.fill[f.p.slot]) s.van.fill[f.p.slot].push(f.type); else s.van.fill[f.p.slot] = [f.type]; s.money += C.TIRES[f.type].value; s.stats.cleared++; }
    else if (f.kind === 'store') { s.storage[f.bay] = Math.min(RACK.cap, s.storage[f.bay] + 1); s.money += C.TIRES[f.type].value; s.stats.cleared++; s.stats.earned += C.TIRES[f.type].value; }
  }
  // automation in transit (belts, hoppers, intake flights, the helpers' hands, rolling tires): seconds from the van, saved as delivered
  const transit = crew.transit().concat(arms.transit()); for (const p of belts.pieces) { for (const t of p.tires) transit.push(t.type); for (const t of p.hopper) transit.push(t); }
  for (const f of flights) if (f.kind === 'intake') transit.push(f.type);
  for (const t of transit) { s.money += C.TIRES[t].value; s.stats.cleared++; s.stats.earned += C.TIRES[t].value; }
  s.van.fill = s.van.fill.filter(Boolean);
  s.belts = belts.logic.serialize(); s.arms = arms.serialize();
  return SV.save(localStorage, s);
}
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

/* ---------------- resize ---------------- */
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

/* ---------------- loop ---------------- */
let workerT = 0;
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, adaptT = 0;
let frameN = 0;
function frame(now) { frameN++;
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  step(TEST && window.__freeze ? 0 : dt); // tests can freeze game time for a screenshot
  renderer.render(scene, camera);
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; adapt(); }
}
function adapt() { // dynamic resolution for old laptops
  if (!playing || TEST) return; adaptT++;
  if (fps < 32 && pixelRatio > 0.65) { pixelRatio = Math.max(0.65, pixelRatio - 0.1); renderer.setPixelRatio(pixelRatio); }
  else if (fps > 57 && pixelRatio < QP.pr && adaptT % 5 === 0) { pixelRatio = Math.min(QP.pr, pixelRatio + 0.1); renderer.setPixelRatio(pixelRatio); }
}
function step(dt) {
  if (playing && !shopOpen && !settingsOpen && !ctOpen) { updatePlayer(dt); S.stats.playTime += dt; }
  else { camera.position.set(P.x, P.eye, P.z); camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ'); }
  if (nearDirty || Math.hypot(P.x - nearCenter.x, P.z - nearCenter.y) > 0.8) rebuildNear();
  if (farDirty && Math.hypot(P.x - farCenter.x, P.z - farCenter.y) > 0.01 || Math.hypot(P.x - farCenter.x, P.z - farCenter.y) > 3) rebuildFar();
  updateVan(dt); updateFlights(dt); updateDust(dt);
  crew.update(dt); updateBelts(dt); arms.update(dt); flushMountain(dt); popT -= dt;
  if (pinnedDone > 0) { pinnedDone -= dt; if (pinnedDone <= 0) updatePinned(); }
  grabBusy = Math.max(0, grabBusy - dt); throwCD = Math.max(0, throwCD - dt);
  // hover highlight + crosshair label (desktop aims at the centre)
  if (playing && build.on) {
    if (hover && hover.m) { hover.m.setColorAt(hover.id, hover.base); hover.m.instanceColor.needsUpdate = true; hover = null; }
    updateBuildAim();
    let text = '', cls = '';
    if (!build.aim) text = 'Guarda il piazzale per piazzare';
    else if (build.del) { text = `${isTouch ? '' : '[X] / Tasto destro · '}Smonta ${PINFO[build.del.type].name} (+${money(PINFO[build.del.type].cost)})`; cls = 'far'; }
    else if (build.valid) { text = `${isTouch ? '' : 'Clic · '}Piazza ${PINFO[build.piece].name} · ${money(PINFO[build.piece].cost)}`; cls = 'ok'; }
    else { text = build.reason; cls = 'bad'; }
    $('aimlabel').textContent = text; $('aimlabel').className = cls; $('cross').className = cls; $('binfo').textContent = text; $('binfo').className = cls;
  } else if (playing && !isTouch) {
    const rec = pickAt(lastAimNDC);
    if (hover !== rec) {
      if (hover && hover.m) { hover.m.setColorAt(hover.id, hover.base); hover.m.instanceColor.needsUpdate = true; }
      hover = rec;
      if (rec) { rec.m.setColorAt(rec.id, _col.copy(rec.base).multiplyScalar(rec.free ? (rec._t <= C.PLAYER.reach ? 2.4 : 1.4) : 1.25)); rec.m.instanceColor.needsUpdate = true; }
    }
    const lab = $('aimlabel'), ch = $('cross');
    let text = '', cls = '';
    if (aimingAtCart()) { text = isTouch ? 'Prendi carrello' : '[E] / Clic · Prendi carrello'; cls = 'ok'; }
    else if (contractsUnlocked() && nearBoard()) { text = '[E] / Clic · Bacheca contratti'; cls = 'ok'; }
    else if (inRackZone() && carriedNow()) { const t = holding() ? S.cart[S.cart.length - 1] : S.hands[S.hands.length - 1]; text = rackRoom(t) > 0 ? `Metti nello scaffale ${['14"', '16"', '18"', 'Scooter'][bayOf(t)]}` : 'Scaffale pieno'; cls = rackRoom(t) > 0 ? 'throw' : 'bad'; }
    else if (rec && rec._t <= C.PLAYER.reach + 1.5) {
      const t = C.TIRES[rec.type];
      if (!rec.free) { text = rec.type === C.GOLD_ID ? 'Gomma d\'oro · sepolta' : 'Sepolta'; cls = 'bad'; }
      else if (rec._t > C.PLAYER.reach) { text = 'Avvicinati'; cls = 'far'; }
      else if (carried() >= capacity()) { text = holding() ? 'Carrello pieno! Vai al furgone' : 'Mani piene: vai al furgone'; cls = 'bad'; }
      else { text = rec.type === C.GOLD_ID ? 'Gomma d\'oro!' : `Prendi ${t.name}`; cls = rec.type === C.GOLD_ID ? 'gold' : 'ok'; }
    } else if (inThrowZone() && carriedNow()) { text = 'Lancia nel furgone'; cls = 'throw'; }
    else if (carriedNow() && nearVanButOut()) { text = 'Avvicinati al furgone'; cls = 'far'; }
    lab.textContent = text; lab.className = cls; ch.className = cls;
  }
  $('pickbtn').classList.toggle('hidden', !(playing && cartDist() < 3.1));
  if (isTouch) throwBtn.classList.toggle('hidden', !(playing && (inThrowZone() || inRackZone()) && carriedNow()));
  zoneMesh.visible = vanReady();
  zoneMat.opacity = carriedNow() ? (inThrowZone() ? 1 : 0.75 + Math.sin(performance.now() / 260) * 0.25) : 0.45;
  $('zonehint').classList.toggle('hidden', !(playing && carriedNow() && nearVanButOut()));
  // held button = keep working (throw cadence / grab the next tire under the crosshair)
  if (actionHeld && playing && !shopOpen && !build.on && !ctOpen) {
    if (inThrowZone() && carriedNow() && throwCD <= 0) tryThrow();
    else if (inRackZone() && carriedNow() && throwCD <= 0) tryStore();
    else if (!isTouch && grabBusy <= 0) { const r = pickAt(lastAimNDC); if (r && r.free && r._t <= C.PLAYER.reach && carried() < capacity()) tryGrab(r); }
  }
  // workers watch you
  workerT += dt;
  for (const w of workers) {
    if (!w.g.visible) continue;
    w.g.userData.anim(workerT);
    const hd = w.g.userData.head, dx = P.x - w.g.position.x, dz = P.z - w.g.position.z;
    const target = Math.atan2(-dz, dx) - w.g.rotation.y; let a = ((target + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; a = G.clamp(a, -1.3, 1.3);
    w.next -= dt; if (w.next <= 0) { w.shake = 1.4; w.next = 14 + Math.random() * 16; }
    w.shake = Math.max(0, w.shake - dt);
    hd.rotation.y += (a + (w.shake ? Math.sin(w.shake * 14) * 0.35 : 0) - hd.rotation.y) * Math.min(1, dt * 4);
  }
  // sun + shadow follow the player
  sun.position.set(P.x + SUN_OFF.x, SUN_OFF.y, P.z + SUN_OFF.z); sun.target.position.set(P.x, 0, P.z);
  sunSprite.position.set(P.x + SUN_OFF.x * 8, SUN_OFF.y * 8, P.z + SUN_OFF.z * 8);
  sky.position.set(P.x, 0, P.z);
  // banners + toast
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('show'); }
  else if (bannerQ.length) { const [t, s] = bannerQ.shift(); $('banner').innerHTML = `<b>${t}</b>${s ? `<span>${s}</span>` : ''}`; $('banner').classList.add('show'); bannerT = 2.8; }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  saveT += dt; if (saveT > 4 && playing) { saveT = 0; saveNow(); }
  if (playing) { $('money').textContent = money(S.money); }
}

/* ---------------- boot ---------------- */
st = C.stats(S.lv);
if (st.cart > 0 && S.cartHeld && S.hands.length) { S.cartHeld = false; parkSpot(true); } // old save with tires in both
refreshCart(); refreshHands(); rebuildCargo();
if (S.van.fill.length >= LAYOUT.cap) { V.state = 'closing'; V.t = 0; }
syncCrew(); evictPieces(); renderBuildBar(); rack.setCounts(S.storage); board.draw(S.contracts.list, S.contracts.active, !contractsUnlocked());
updatePlayer(0); rebuildNear(); rebuildFar(); updateHUD();
if (loadedFrom !== 'new') $('play').textContent = 'CONTINUA';
requestAnimationFrame(frame);

if (TEST) {
  window.__game = {
    S, C, mountain, get LAYOUT() { return LAYOUT; }, get VEH() { return VEH; }, get van() { return van; }, V, hemi, sun, scene, get st() { return st; }, get fps() { return fps; }, get remaining() { return remaining; }, get nearRecs() { return nearRecs; },
    start, saveNow, buy, openShop, closeShop, step, renderer, camera,
    advance(sec) { for (let t = 0; t < sec; t += 0.05) step(0.05); },
    info() { return { tris: renderer.info.render.triangles, calls: renderer.info.render.calls, near: nearRecs.length, far: IM.far.count, high: IM.high.count, mid: IM.mid.count }; },
    block() { blockSave = true; },
    teleport(x, z, yaw = P.yaw, pitch = P.pitch) { P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch; P.vx = P.vz = 0; updatePlayer(0); rebuildNear(); },
    lookAt(x, y, z) { const dx = x - P.x, dz = z - P.z, dy = y - (P.eye + Math.min(0.5, meshH(P.x, P.z))); P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); updatePlayer(0); },
    free() { return nearRecs.filter(r => r.free).map(r => ({ c: r.c, index: r.index, type: r.type, x: r.pos.x, y: r.pos.y, z: r.pos.z })); },
    buried() { return nearRecs.filter(r => !r.free).map(r => ({ c: r.c, index: r.index, type: r.type, x: r.pos.x, y: r.pos.y, z: r.pos.z })); },
    pickCenter() { const r = pickAt(new THREE.Vector2(0, 0)); return r ? { c: r.c, index: r.index, free: r.free, type: r.type, t: r._t } : null; },
    click() { doAction(new THREE.Vector2(0, 0)); },
    throwOne() { return tryThrow(); },
    inZone: inThrowZone,
    carried, capacity, vanCount: vanFillCount, cargoCount: () => cargoIM.count + cargoGold.count,
    flights: () => flights.length, flightInfo: () => flights.map(f => ({ t: f.t, dur: f.dur, kind: f.kind })), frames: () => frameN, setMoney(m) { S.money = m; updateHUD(); },
    meshH, blocked, refreshCart, refreshHands, parkCart, pickCart, aimingAtCart, holding, cartDist,
    keys, P,
    // v6
    crew, belts, BL, build, syncCrew, enterBuild, exitBuild, placePiece, dismantle, setPiece, rotatePiece, placeCheck, crewStations, vanCanAccept,
    crewState: () => crew.state(), autoTake, refreshMountain() { flushMountain(0, true); rebuildNear(); },
    // place a piece directly (tests): same checks + cost as the build mode
    placeAt(type, gx, gz, rot) { build.on = true; build.piece = type; build.rot = rot; build.gx = gx; build.gz = gz; build.aim = true; build.del = belts.logic.at(gx, gz); const ok = placePiece(); return ok; },
    beltTires: () => belts.logic.tireCount(),
    get unstuck() { return unstuck; }, unstick,
    // v7
    arms, armDest, CT, rack, board, RACK, BOARD, storeTire, tryStore, inRackZone, nearBoard, openContracts, closeContracts, acceptContract, contractsUnlocked, updatePinned, evictPieces, vehicleBay,
    fillVan(n) { S.van.fill = Array.from({ length: Math.min(n, LAYOUT.cap) }, (_, i) => [hash2(i, 3) < 0.03 ? 3 : Math.floor(hash2(i, 9) * 3)]); rebuildCargo(); },
    get ctOpen() { return ctOpen; }, get FL() { return FL; }, setVehicleNow(t) { setVehicle(t); evictPieces(); updateHUD(); },
    clearBanners() { bannerQ.length = 0; bannerT = 0; $('banner').classList.remove('show'); toastT = 0; $('toast').classList.remove('show'); },
  };
}

if ('serviceWorker' in navigator && !Q.has('nosw') && !TEST && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
