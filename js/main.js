// Un Milione di Gomme: first playable slice (phases 1-2: by hand, then the cart).
import * as THREE from 'three';
import * as C from './config.js';
import { Mountain, N, CELL, ORIGIN, GRAB_LAYERS, SHOW_BURIED, hash2 } from './mountain.js';
import { braidLayout, placeTire } from './braid.js';
import * as SV from './save.js';
import { Sfx } from './audio.js';
import * as G from './gfx.js';

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
const VEH = C.VEHICLES[0]; // the slice uses the van
const LAYOUT = braidLayout(VEH.cargo);
const VAN_X = 11.5, VAN_Z = 0.6, VAN_FAR = 58; // rear of the parked van; where it drives to

/* ---------------- quality ---------------- */
const autoQ = (isTouch || (navigator.hardwareConcurrency || 4) <= 2) ? 'bassa' : 'alta';
const QUALITY = S.settings.quality === 'auto' ? autoQ : S.settings.quality;
const QP = QUALITY === 'alta'
  ? { pr: Math.min(devicePixelRatio, 1.5), shadow: 2048, near: 11, high: 4.5, far: 2, aa: true, midShadow: true }
  : { pr: Math.min(devicePixelRatio, 1), shadow: 1024, near: 8, high: 3.2, far: 4, aa: false, midShadow: false };

/* ---------------- renderer / scene ---------------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QP.aa, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
let pixelRatio = QP.pr;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = 0xc9d3d8;
scene.fog = new THREE.Fog(FOG, 70, 260);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 520);
scene.add(camera);

// sky dome + environment for reflections
const skyTex = G.skyTexture();
const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
scene.add(sky);
{
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
  const sunBlob = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0 })); sunBlob.position.set(6, 6, 3); es.add(sunBlob);
  scene.environment = pm.fromScene(es, 0.04).texture; scene.environmentIntensity = 0.55;
}
const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6d5c47, 0.75); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
const SUN_OFF = new THREE.Vector3(6, 30, 34);
sun.castShadow = true; sun.shadow.mapSize.set(QP.shadow, QP.shadow);
const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 2; sc.far = 130;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTexture(), color: 0xfff3c8, fog: false, depthWrite: false, transparent: true }));
sunSprite.scale.set(70, 70, 1); scene.add(sunSprite);

const mats = G.makeMats();
const tm = G.tireMaterials();

/* ---------------- ground + yard ---------------- */
const gt = G.groundTexture();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: gt.map, bumpMap: gt.bump, bumpScale: 1.5, roughness: 0.95, color: 0xffffff }));
gt.map.repeat.set(52, 52); gt.bump.repeat.set(52, 52);
ground.rotation.x = -Math.PI / 2; ground.position.set(-25, 0, 0); ground.receiveShadow = true; scene.add(ground);
const road = new THREE.Mesh(new THREE.PlaneGeometry(64, 6.5), new THREE.MeshStandardMaterial({ map: G.asphaltTexture(), roughness: 0.85 }));
road.material.map.repeat.set(16, 2);
road.rotation.x = -Math.PI / 2; road.position.set(VAN_X + 30, 0.012, VAN_Z); road.receiveShadow = true; scene.add(road);
// yellow loading bay lines
{ const P = []; for (const s of [1, -1]) P.push([G.box(8, 0.01, 0.12), G.M(VAN_X + 3.2, 0.02, VAN_Z + s * 1.45)]); P.push([G.box(0.12, 0.01, 3), G.M(VAN_X - 0.6, 0.02, VAN_Z)]);
  const m = new THREE.Mesh(G.merge(P), mats.yellow); m.receiveShadow = true; scene.add(m); }

const colliders = []; // AABBs {x0,x1,z0,z1}
const FENCE = { x0: -98, x1: 36, z0: -58, z1: 48 };
function buildYard() {
  // chain-link fence with posts; gate gap on the road
  const ft = G.fenceTexture();
  const fm = new THREE.MeshStandardMaterial({ map: ft, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6 });
  const posts = [];
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2), fm.clone());
    m.material.map = ft.clone(); m.material.map.repeat.set(len / 1.2, 2); m.material.map.needsUpdate = true;
    m.position.set((x0 + x1) / 2, 1.1, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); scene.add(m);
    const n = Math.ceil(len / 3); for (let i = 0; i <= n; i++) { const k = i / n; posts.push([G.cyl(0.04, 0.04, 2.3, 6), G.M(G.lerp(x0, x1, k), 1.15, G.lerp(z0, z1, k))]); }
  };
  const F = FENCE;
  seg(F.x0, F.z0, F.x1, F.z0); seg(F.x0, F.z1, F.x1, F.z1); seg(F.x0, F.z0, F.x0, F.z1);
  seg(F.x1, F.z0, F.x1, VAN_Z - 4.2); seg(F.x1, VAN_Z + 4.2, F.x1, F.z1);
  const pm = new THREE.Mesh(G.merge(posts), mats.steel); pm.castShadow = true; scene.add(pm);
  // gate pillars
  for (const s of [1, -1]) { const p = new THREE.Mesh(G.box(0.5, 2.8, 0.5), new THREE.MeshStandardMaterial({ map: G.plasterTexture(), roughness: 0.9 })); p.position.set(F.x1, 1.4, VAN_Z + s * 4.4); p.castShadow = true; scene.add(p); }
  // the tire shop building (gommeria)
  const bx = 21, bz = -15, bw = 12, bd = 8, bh = 4.6;
  const plaster = new THREE.MeshStandardMaterial({ map: G.plasterTexture(), roughness: 0.92 });
  const body = new THREE.Mesh(G.box(bw, bh, bd), plaster); body.position.set(bx, bh / 2, bz); body.castShadow = body.receiveShadow = true; scene.add(body);
  const roof = new THREE.Mesh(G.box(bw + 0.8, 0.18, bd + 0.8), new THREE.MeshStandardMaterial({ map: G.corrugatedTexture(), roughness: 0.5, metalness: 0.6 })); roof.position.set(bx, bh + 0.09, bz); roof.castShadow = true; scene.add(roof);
  const shutter = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.4), new THREE.MeshStandardMaterial({ map: G.shutterTexture(), roughness: 0.5, metalness: 0.6 })); shutter.position.set(bx - 2.2, 1.7, bz + bd / 2 + 0.01); scene.add(shutter);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), mats.glass); win.position.set(bx + 3.2, 2.0, bz + bd / 2 + 0.01); scene.add(win);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.7 })); door.position.set(bx + 1.0, 1.1, bz + bd / 2 + 0.01); scene.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.3), new THREE.MeshStandardMaterial({ map: G.signTexture([{ t: 'GOMMERIA · SMALTIMENTO', y: 0.38, size: 92 }, { t: 'pneumatici usati', y: 0.75, size: 58 }]), roughness: 0.5 }));
  sign.position.set(bx, bh - 0.2, bz + bd / 2 + 0.06); scene.add(sign);
  colliders.push({ x0: bx - bw / 2 - 0.3, x1: bx + bw / 2 + 0.3, z0: bz - bd / 2 - 0.3, z1: bz + bd / 2 + 0.3 });
  // display rack of new tires by the door
  const rack = new THREE.Group(); const geoM = G.tireGeometry(T16, 'mid');
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(geoM, tm.rubber); t.position.set(bx + 4.6 - i * 0.24, 0.32, bz + bd / 2 + 0.5); t.rotation.z = Math.PI / 2; t.castShadow = true; rack.add(t); }
  scene.add(rack);
  // a red shipping container + pallets
  const cont = new THREE.Mesh(G.box(6.1, 2.6, 2.45), new THREE.MeshStandardMaterial({ map: G.corrugatedTexture(), color: 0xb8402e, roughness: 0.6, metalness: 0.4 }));
  cont.material.map.repeat.set(10, 1); cont.position.set(24, 1.3, 14); cont.rotation.y = 0.2; cont.castShadow = cont.receiveShadow = true; scene.add(cont);
  colliders.push({ x0: 20.6, x1: 27.4, z0: 12.2, z1: 15.8 });
  const pal = []; for (let i = 0; i < 4; i++) { pal.push([G.box(1.2, 0.14, 0.8), G.M(16 + i * 0.2, 0.07 + i * 0.15, 12, 0, i * 0.1, 0)]); }
  const palM = new THREE.Mesh(G.merge(pal), new THREE.MeshStandardMaterial({ color: 0xa47b4b, roughness: 0.9 })); palM.castShadow = true; scene.add(palM);
  colliders.push({ x0: 15.2, x1: 17.4, z0: 11.4, z1: 12.6 });
  // light poles
  for (const [x, z] of [[4, -9], [4, 10], [-30, 30], [-30, -38], [28, -4]]) {
    const p = new THREE.Mesh(G.merge([[G.cyl(0.08, 0.12, 7, 8), G.M(0, 3.5, 0)], [G.box(1.2, 0.08, 0.08), G.M(0.5, 7, 0)]]), mats.steel); p.position.set(x, 0, z); p.castShadow = true; scene.add(p);
    const l = new THREE.Mesh(G.box(0.5, 0.12, 0.3), mats.headlight); l.position.set(x + 1, 6.94, z); scene.add(l);
    colliders.push({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25 });
  }
  // trees outside the fence + distant hills
  const trunk = [], crown = [];
  G.srand(77);
  for (let i = 0; i < 70; i++) {
    let x, z; const side = i % 4;
    if (side === 0) { x = G.lerp(FENCE.x0, FENCE.x1, G.prand()); z = FENCE.z1 + 4 + G.prand() * 22; }
    else if (side === 1) { x = G.lerp(FENCE.x0, FENCE.x1, G.prand()); z = FENCE.z0 - 4 - G.prand() * 22; }
    else if (side === 2) { x = FENCE.x0 - 4 - G.prand() * 20; z = G.lerp(FENCE.z0, FENCE.z1, G.prand()); }
    else { x = FENCE.x1 + 6 + G.prand() * 25; z = G.lerp(FENCE.z0, FENCE.z1, G.prand()); if (Math.abs(z - VAN_Z) < 6) z += 14; }
    const h = 5 + G.prand() * 6, kind = G.prand();
    trunk.push([G.cyl(0.18, 0.28, h * 0.45, 6), G.M(x, h * 0.22, z)]);
    if (kind < 0.5) crown.push([new THREE.ConeGeometry(h * 0.28, h * 0.8, 8), G.M(x, h * 0.62, z)]);
    else crown.push([new THREE.IcosahedronGeometry(h * 0.3, 1), G.M(x, h * 0.6, z, 0, G.prand() * 3, 0, 1, 0.85, 1)]);
  }
  const tr = new THREE.Mesh(G.merge(trunk), new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.9 })); tr.castShadow = true; scene.add(tr);
  const cr = new THREE.Mesh(G.merge(crown), new THREE.MeshStandardMaterial({ color: 0x4f6b3a, roughness: 0.85, flatShading: true })); cr.castShadow = true; scene.add(cr);
  const hills = []; for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, r = 230 + G.prand() * 40; hills.push([new THREE.SphereGeometry(40 + G.prand() * 40, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), G.M(-25 + Math.cos(a) * r, -4, Math.sin(a) * r, 0, 0, 0, 1.6, 0.35 + G.prand() * 0.3, 1.2)]); }
  scene.add(new THREE.Mesh(G.merge(hills), new THREE.MeshStandardMaterial({ color: 0x7d8f6a, roughness: 1, flatShading: true })));
}
buildYard();

/* ---------------- workers (they watch you, unimpressed) ---------------- */
const workers = [[15.5, -9.4, 0xff7a12], [17.6, -10.2, 0x2f7bd6]].map(([x, z, col], i) => {
  const w = G.buildWorker(mats, col); w.position.set(x, 0, z); w.rotation.y = -1.2 - i * 0.4; scene.add(w);
  colliders.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 });
  return { g: w, shake: 0, next: 8 + i * 9 };
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
const mountainMesh = new THREE.Mesh(mGeo, new THREE.MeshStandardMaterial({ map: pt.map, bumpMap: pt.bump, bumpScale: 3, roughness: 0.85, color: 0xffffff, vertexColors: true }));
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
    cornerH[k] = h; pos[k * 3 + 1] = h;
    // the foot of the pile fades into the dusty gravel so the edge doesn't look cut out
    const f = G.clamp((h + 0.1) / 0.9, 0, 1), col = mGeo.attributes.color.array;
    col[k * 3] = G.lerp(3.6, 1, f); col[k * 3 + 1] = G.lerp(3.4, 1, f); col[k * 3 + 2] = G.lerp(3.0, 1, f);
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
const MAXH = 900, MAXM = 2600, MAXF = 4600;
function inst(geo, mat, max, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); scene.add(m); return m;
}
const IM = {
  high: inst(geoHigh, tm.rubber, MAXH, true), mid: inst(geoMid, tm.rubber, MAXM, QP.midShadow), far: inst(geoLow, tm.rubberLow, MAXF, false),
  ghigh: inst(geoHigh, tm.gold, 8, true), gmid: inst(geoMid, tm.gold, 8, true), gfar: inst(geoLow, tm.gold, 8, false),
};
let nearRecs = [], nearCenter = new THREE.Vector2(1e9, 1e9), farCenter = new THREE.Vector2(1e9, 1e9), nearDirty = true, farDirty = true;
const _m4 = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _sc = new THREE.Vector3(), _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0);
// world transform of the tire at stack position `index` in cell c, layer L from the top (0 = top)
function tireXform(c, index, L, type, outPos, outQuat) {
  const h1 = hash2(c, index * 1.7 + 0.3), h2 = hash2(index * 2.3 + 1, c * 0.77), h3 = hash2(c * 1.3 + index, 5.1), h4 = hash2(c + index * 0.31, 9.7);
  const cc = mountain.cellCenter(c), t = C.TIRES[type];
  const px = cc.x + (h1 - 0.5) * 0.72, pz = cc.z + (h2 - 0.5) * 0.72;
  const steep = h4 < 0.16 && L < 2, tilt = steep ? 0.9 + h3 * 0.55 : h3 * 0.5;
  meshNormal(px, pz, _v1);
  _q1.setFromUnitVectors(UP, _v1); _q2.setFromAxisAngle(UP, h1 * 6.283); _q3.setFromAxisAngle(AX, tilt);
  outQuat.copy(_q1).multiply(_q2).multiply(_q3);
  const lift = L === 0 ? t.w * 0.22 + Math.sin(tilt) * t.R * 0.6 : L === 1 ? -0.035 + Math.sin(tilt) * t.R * 0.45 : -t.R * 0.5;
  outPos.set(px, meshH(px, pz) + lift, pz);
  return t;
}
function tint(c, index, L, type) { const k = type === C.GOLD_ID ? 1 : (0.82 + hash2(index * 0.13, c * 0.29) * 0.36) * (L === 2 ? 0.7 : 1); return _col.setRGB(k, k * 0.985, k * 0.97); }
function setInst(m, i, pos, quat, t) { _sc.set(t.R / T16.R, t.w / T16.w, t.R / T16.R); _m4.compose(pos, quat, _sc); m.setMatrixAt(i, _m4); }
function rebuildNear() {
  const px = P.x, pz = P.z, R = QP.near, RH = QP.high;
  nearRecs = []; const cnt = { high: 0, mid: 0, ghigh: 0, gmid: 0 };
  const ci = Math.floor((px - ORIGIN.x) / CELL), cj = Math.floor((pz - ORIGIN.z) / CELL), r = Math.ceil(R / CELL);
  for (let j = Math.max(0, cj - r); j <= Math.min(N - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(N - 1, ci + r); i++) {
    const c = j * N + i, n = mountain.count[c]; if (!n) continue;
    const cx = ORIGIN.x + (i + 0.5) * CELL, cz = ORIGIN.z + (j + 0.5) * CELL, d = Math.hypot(cx - px, cz - pz);
    if (d > R) continue;
    for (let L = 0; L < GRAB_LAYERS + SHOW_BURIED; L++) {
      const index = n - 1 - L; if (index < 0) break;
      const type = mountain.typeAt(c, index), pos = new THREE.Vector3(), quat = new THREE.Quaternion();
      const t = tireXform(c, index, L, type, pos, quat);
      const gold = type === C.GOLD_ID, lod = d < RH ? 'high' : 'mid', key = (gold ? 'g' : '') + lod, m = IM[key];
      const id = cnt[key]; if (id >= m.instanceMatrix.count) continue;
      cnt[key]++;
      setInst(m, id, pos, quat, t); m.setColorAt(id, tint(c, index, L, type));
      nearRecs.push({ c, index, L, type, pos, quat, r: t.R * (L === 2 ? 0.6 : 0.92), free: L < GRAB_LAYERS, m, id, base: _col.clone() });
    }
  }
  for (const k in cnt) { IM[k].count = cnt[k]; IM[k].instanceMatrix.needsUpdate = true; IM[k].instanceColor.needsUpdate = true; }
  nearCenter.set(px, pz); nearDirty = false; hover = null;
}
function rebuildFar() {
  const px = P.x, pz = P.z, R = QP.near - 0.5; let n = 0, ng = 0; const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
  for (let c = 0; c < N * N; c++) {
    const k = mountain.count[c]; if (!k) continue;
    const i = c % N, j = (c / N) | 0;
    if (QP.far === 2 && ((i + j) & 1)) continue;
    if (QP.far === 4 && ((i & 1) || (j & 1))) continue;
    const cx = ORIGIN.x + (i + 0.5) * CELL, cz = ORIGIN.z + (j + 0.5) * CELL;
    if (Math.hypot(cx - px, cz - pz) <= R + 0.71) { if (Math.hypot(cx - px, cz - pz) <= QP.near) continue; }
    const type = mountain.typeAt(c, k - 1), t = tireXform(c, k - 1, 0, type, pos, quat);
    if (type === C.GOLD_ID) { if (ng < 8) { setInst(IM.gfar, ng, pos, quat, t); IM.gfar.setColorAt(ng, _col.setRGB(1, 1, 1)); ng++; } continue; }
    if (n >= MAXF) break;
    setInst(IM.far, n, pos, quat, t); IM.far.setColorAt(n, tint(c, k - 1, 0, type)); n++;
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
const van = G.buildVan(VEH, mats, tm.rubber);
scene.add(van);
const FL = van.userData.fl;
const cargoIM = new THREE.InstancedMesh(geoHigh, tm.rubber, LAYOUT.cap * 2); cargoIM.count = 0; cargoIM.castShadow = true; cargoIM.receiveShadow = true; cargoIM.frustumCulled = false;
const cargoGold = new THREE.InstancedMesh(geoHigh, tm.gold, 8); cargoGold.count = 0; cargoGold.frustumCulled = false; cargoGold.castShadow = true;
van.add(cargoIM, cargoGold);
const V = { state: 'loading', t: 0, x: VAN_X, doors: 1, pend: [] }; // pend: placements in flight
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
    if (type === C.GOLD_ID) { setInst(cargoGold, g++, pos, quat, t); } else { setInst(cargoIM, n, pos, quat, t); cargoIM.setColorAt(n, _col.setRGB(0.9 + hash2(si, sub) * 0.2, 0.9 + hash2(si, sub) * 0.2, 0.9 + hash2(si, sub) * 0.2)); n++; }
  }));
  cargoIM.count = n; cargoGold.count = g; cargoIM.instanceMatrix.needsUpdate = true; if (cargoIM.instanceColor) cargoIM.instanceColor.needsUpdate = true; cargoGold.instanceMatrix.needsUpdate = true;
}
function virtFill() { const f = S.van.fill.map(s => s.slice()); for (const p of V.pend) { if (p.sub) f[p.slot].push(p.type); else f[p.slot] = [p.type]; } return f; }
function vanFillCount() { return S.van.fill.length; }
function vanReady() { return V.state === 'loading'; }
function vanRearWorld(out = new THREE.Vector3()) { return out.set(van.position.x, 0, VAN_Z); }

/* ---------------- cart + hands ---------------- */
const cart = G.buildCart(mats, tm.rubber); cart.visible = false; scene.add(cart);
const cartTires = [];
for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(geoMid, tm.rubber); m.castShadow = true; m.visible = false; cart.add(m); cartTires.push(m); }
const cartGoldMat = tm.gold;
function cartSlotLocal(i, type, out = new THREE.Vector3()) {
  const t = C.TIRES[type], col = i % 2, lvl = Math.floor(i / 2);
  return out.set(0.02, cart.userData.bedY + 0.11 + lvl * 0.205, col ? -0.33 : 0.33);
}
function refreshCart() {
  cart.visible = st.cart > 0;
  cartTires.forEach((m, i) => {
    const type = S.cart[i];
    if (type == null) { m.visible = false; return; }
    const t = C.TIRES[type]; m.visible = true; m.material = type === C.GOLD_ID ? cartGoldMat : tm.rubber;
    cartSlotLocal(i, type, m.position); m.rotation.set(0, hash2(i, 2) * 6, (hash2(i, 5) - 0.5) * 0.08); m.scale.set(t.R / T16.R, t.w / T16.w, t.R / T16.R);
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
function capacity() { return st.hands + st.cart; }
function carried() { return S.hands.length + S.cart.length + reservedCart + reservedHands; }
function carriedNow() { return S.hands.length + S.cart.length; }

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
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1300);
}
function updateHUD() {
  $('money').textContent = money(S.money);
  $('left').textContent = fmt.format(remaining);
  $('leftbar').style.width = (100 * (1 - remaining / C.TOTAL_TIRES)).toFixed(3) + '%';
  $('cleared').textContent = fmt.format(Math.floor(S.stats.cleared));
  const vf = vanFillCount();
  $('vfill').textContent = V.state === 'loading' ? `${vf}/${LAYOUT.cap}` : (V.state === 'away' || V.state === 'leaving' ? 'in viaggio…' : V.state === 'arriving' ? 'in arrivo…' : `${vf}/${LAYOUT.cap}`);
  $('vbar').style.width = (100 * vf / LAYOUT.cap) + '%';
  $('hands').textContent = `${S.hands.length}/${st.hands}`;
  $('cartchip').classList.toggle('hidden', st.cart === 0);
  $('cartn').textContent = `${S.cart.length}/${st.cart}`;
  const nextAff = C.UPGRADES.some(u => u.phase <= 2 && canBuy(u.id));
  $('shopbtn').classList.toggle('pulse', nextAff);
}
const TUT = [
  () => isTouch ? 'Tocca una gomma della montagna per prenderla' : 'Mira una gomma della montagna e clicca per prenderla',
  () => isTouch ? 'Portala dietro al furgone e tocca per lanciarla dentro' : 'Portala dietro al furgone e clicca per lanciarla dentro',
  () => isTouch ? 'Riempi il furgone fila dopo fila. Coi soldi apri il 🛒 Negozio' : 'Riempi il furgone fila dopo fila. Coi soldi apri il negozio con B',
];
function updateTut() { const el = $('hint'); if (S.tut < TUT.length) { el.textContent = TUT[S.tut](); el.classList.remove('hidden'); } else el.classList.add('hidden'); }

/* ---------------- shop ---------------- */
const REQ = { cart: lv => lv.gloves >= 1 && lv.shoes >= 1 };
function canBuy(id) { const lv = S.lv[id], c = C.costOf(id, lv); return c != null && S.money >= c && (!REQ[id] || REQ[id](S.lv)); }
function fmtVal(u, v) { if (u.id === 'cart') return v ? `${v} gomme` : 'nessuno'; if (u.id === 'gloves') return v + (v > 1 ? ' gomme' : ' gomma'); return String(v).replace('.', ',') + ' ' + u.unit; }
function buy(id) {
  const u = C.UPG[id], lv = S.lv[id], c = C.costOf(id, lv);
  if (c == null || S.money < c || (REQ[id] && !REQ[id](S.lv)) || u.phase > 2) return false;
  S.money -= c; S.lv[id]++; st = C.stats(S.lv); sfx.buy();
  if (id === 'cart' && S.lv.cart === 1) { banner('Fase 2: il carrello', 'Le gomme che prendi finiscono nel carrello. Al furgone clicca per lanciarle.'); }
  else banner(u.name, `${fmtVal(u, u.lv[S.lv[id]])}`);
  if (S.tut === 2) S.tut = 3;
  refreshCart(); refreshHands(); renderShop(); updateHUD(); saveNow();
  return true;
}
function renderShop() {
  const list = $('shoplist'); list.innerHTML = '';
  $('shopmoney').textContent = money(S.money);
  for (const ph of [1, 2]) {
    const h = document.createElement('div'); h.className = 'phase'; h.textContent = `Fase ${ph}: ${C.PHASES[ph].name}`; list.appendChild(h);
    for (const u of C.UPGRADES.filter(x => x.phase === ph)) {
      const lv = S.lv[u.id], max = C.maxLevel(u.id), cost = C.costOf(u.id, lv), locked = REQ[u.id] && !REQ[u.id](S.lv);
      const el = document.createElement('div'); el.className = 'card' + (lv >= max || cost == null ? ' maxed' : '') + (locked ? ' locked' : '');
      const icon = u.icon === 'cart' ? '🛒' : u.icon;
      const dots = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const now = fmtVal(u, u.lv[lv]), next = lv < max ? fmtVal(u, u.lv[lv + 1]) : null;
      el.innerHTML = `<div class="ic">${icon}</div><div class="tx"><b>${u.name}</b><span>${u.desc}</span><span class="eff">${next ? `${now} → <b>${next}</b>` : `${now} · al massimo`}</span><div class="dots">${dots}</div>${locked ? '<span class="req">Prima compra guanti e scarpe</span>' : ''}</div>`;
      const btn = document.createElement('button'); btn.className = 'buy';
      if (lv >= max || cost == null) { btn.textContent = 'MAX'; btn.disabled = true; }
      else { btn.textContent = money(cost); btn.disabled = !canBuy(u.id); }
      btn.onclick = (e) => { e.stopPropagation(); buy(u.id); };
      el.appendChild(btn); list.appendChild(el);
    }
  }
  const nx = document.createElement('div'); nx.className = 'phase soon'; nx.innerHTML = `Fase 3: ${C.PHASES[3].name} <small>arriva nella prossima versione</small>`; list.appendChild(nx);
  const tease = document.createElement('div'); tease.className = 'card locked'; tease.innerHTML = `<div class="ic">👷</div><div class="tx"><b>Aiutanti</b><span>Operai che portano le gomme al furgone da soli. Poi nastri, bracci robot, carrucola col magnete, droni e il braccio ragno.</span></div>`; list.appendChild(tease);
}
let shopOpen = false;
function openShop() { if (!playing) return; shopOpen = true; renderShop(); $('shop').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }
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
  return dx < 0.8 && dx > -7.5 && Math.abs(dz) < 4.5;
}
function tryGrab(rec) {
  if (!rec) return false;
  if (rec._t > C.PLAYER.reach) { toast('Troppo lontana: avvicinati'); return true; }
  if (!rec.free) { toast(rec.type === C.GOLD_ID ? 'La gomma d\'oro è sepolta: togli prima le gomme sopra!' : 'È sepolta: togli prima le gomme sopra'); sfx.buried(); P.shake = 0.18; return true; }
  if (grabBusy > 0) return true;
  if (carried() >= capacity()) { toast(st.cart ? 'Carrello pieno: vai al furgone' : 'Hai le mani piene: porta le gomme al furgone'); sfx.nope(); return true; }
  const type = mountain.take(rec.c, rec.index); if (type == null) return false;
  remaining--; grabBusy = st.grab; nearDirty = true; farDirty = true;
  const slid = mountain.lastSlide || 0;
  updateCorners(mountain.dirty); mountain.dirty.clear();
  sfx.grab(type === 3 ? 0 : type, 0);
  if (slid > 0) { sfx.slide(slid); dust(rec.pos, 10); toast('Frana! Sono scese altre gomme', 1400); } else dust(rec.pos, 3);
  const toCart = st.cart > 0 && S.cart.length < st.cart;
  const slotI = toCart ? S.cart.length + reservedCart : S.hands.length + reservedHands;
  if (toCart) reservedCart++; else reservedHands++;
  const from = rec.pos.clone(), q0 = rec.quat.clone();
  const target = toCart ? (o) => { cart.updateMatrixWorld(); return cart.localToWorld(cartSlotLocal(slotI, type, o)); } : (o) => { camera.updateMatrixWorld(); return handGroup.localToWorld(o.copy(handSlots[Math.min(slotI, 1)])); };
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
  if (S.hands.length) { fromHand = true; const i = S.hands.length - 1; type = S.hands[i]; handTires[i].getWorldPosition(srcPos); handTires[i].getWorldQuaternion(srcQ); }
  else if (S.cart.length) { const i = S.cart.length - 1; type = S.cart[i]; cartTires[i].getWorldPosition(srcPos); cartTires[i].getWorldQuaternion(srcQ); }
  else return false;
  const place = placeTire(virtFill(), LAYOUT.cap, !!C.TIRES[type].half);
  if (!place) return false;
  if (fromHand) { S.hands.pop(); refreshHands(); } else { S.cart.pop(); refreshCart(); }
  const p = { slot: place.slot, sub: place.sub, type }; V.pend.push(p);
  throwCD = C.PLAYER.throwInterval;
  const lp = new THREE.Vector3(), lq = new THREE.Quaternion(); slotLocal(place.slot, place.sub, type, lp, lq);
  const wq = new THREE.Quaternion();
  sfx.whoosh(0);
  startFlight({ kind: 'throw', p, type, from: srcPos, q0: srcQ, to: (o) => van.localToWorld(o.copy(lp)), q1: () => wq.copy(van.quaternion).multiply(lq), dur: 0.62, arc: 1.15, spin: 1,
    done: () => {
      V.pend.splice(V.pend.indexOf(p), 1);
      if (p.sub) S.van.fill[p.slot].push(type); else S.van.fill[p.slot] = [type];
      rebuildCargo();
      const val = C.TIRES[type].value; S.money += val; S.stats.earned += val; S.stats.cleared++; S.stats.thrown++; S.stats.bySize[type]++;
      if (type === C.GOLD_ID) S.stats.gold++;
      const s = LAYOUT.slots[p.slot]; sfx.clink(type === 3 ? 0 : type, s.row / LAYOUT.rows, 0);
      pop(van.localToWorld(lp.clone()), '+' + money(val), type === C.GOLD_ID ? 'gold' : '');
      if (S.tut === 1) { S.tut = 2; updateTut(); }
      checkMilestones(); updateHUD();
      if (S.van.fill.length >= LAYOUT.cap && !S.van.fill.some(f => f.length === 1 && f[0] === 3 && false) && V.pend.length === 0) vanFull();
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
  banner('Furgone pieno!', `+${money(bonus)} di consegna · torna tra poco`); sfx.coin(true);
  V.state = 'closing'; V.t = 0; saveNow();
}
function doAction(ndc) {
  const rec = pickAt(ndc || lastAimNDC);
  if (rec && rec._t <= C.PLAYER.reach + 1.5) { if (tryGrab(rec)) return; }
  if (inThrowZone()) { if (!tryThrow() && !carried()) toast('Non hai gomme: vai a prenderle alla montagna'); return; }
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
  const away = Math.max(1, VEH.away - 3.4 - 4.2);
  switch (V.state) {
    case 'closing': V.doors = Math.max(0, 1 - V.t / 0.9); if (V.t >= 0.9) { sfx.doors(); V.state = 'leaving'; V.t = 0; } break;
    case 'leaving': { const k = Math.min(1, V.t / 3.4); van.position.x = VAN_X + (VAN_FAR - VAN_X) * k * k; if (k >= 1) { V.state = 'away'; V.t = 0; van.visible = false; S.van.fill = []; S.van.trips++; rebuildCargo(); } break; }
    case 'away': if (V.t >= away) { V.state = 'arriving'; V.t = 0; van.visible = true; sfx.horn(); } break;
    case 'arriving': { const k = Math.min(1, V.t / 4.2), e = 1 - Math.pow(1 - k, 2.4); van.position.x = VAN_FAR + (VAN_X - VAN_FAR) * e; if (Math.floor(V.t / 0.6) !== Math.floor((V.t - dt) / 0.6) && k < 0.95) sfx.beep(); if (k >= 1) { V.state = 'opening'; V.t = 0; } break; }
    case 'opening': V.doors = Math.min(1, V.t / 1.0); if (V.t >= 1.0) { V.state = 'loading'; V.t = 0; } break;
  }
  G.poseDoors(van, V.doors);
  const moving = V.state === 'leaving' || V.state === 'arriving';
  const d = Math.hypot(P.x - van.position.x - 2, P.z - VAN_Z);
  sfx.setEngine(van.visible, moving ? 0.8 : 0.1, d);
  // spin the wheels while driving
  if (moving) for (const w of van.userData.wheels) w.rotation.y += dt * (V.state === 'leaving' ? 1 : -1) * 6;
}

/* ---------------- movement + collisions ---------------- */
function blocked(x, z) {
  if (x < FENCE.x0 + 0.5 || x > FENCE.x1 - 0.5 || z < FENCE.z0 + 0.5 || z > FENCE.z1 - 0.5) { if (!(x > FENCE.x1 - 0.6 && Math.abs(z - VAN_Z) < 3.8 && x < FENCE.x1 + 0.1)) return true; }
  if (meshH(x, z) > 0.55) return true;
  for (const b of colliders) if (x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3) return true;
  if (van.visible) { const vx = van.position.x, W = VEH.cargo.W / 2 + 0.25; if (x > vx - 0.35 && x < vx + VEH.cargo.L + 2.0 && Math.abs(z - VAN_Z) < W + 0.25) return true; }
  if (st.cart > 0) { const fx = x - Math.sin(P.yaw) * 1.6, fz = z - Math.cos(P.yaw) * 1.6; if (meshH(fx, fz) > 1.0) return true; if (van.visible && fx > van.position.x - 0.1 && Math.abs(fz - VAN_Z) < VEH.cargo.W / 2 + 0.2) return true; }
  return false;
}
function updatePlayer(dt) {
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
  if (!blocked(nx, P.z)) P.x = nx; else P.vx = 0;
  if (!blocked(P.x, nz)) P.z = nz; else P.vz = 0;
  const moving = Math.hypot(P.vx, P.vz);
  if (moving > 0.4) { P.bob += dt * moving * 2.4; P.stepT += dt * moving; if (P.stepT > 1.45) { P.stepT = 0; sfx.step(); } }
  const ground = Math.min(0.5, meshH(P.x, P.z));
  P.shake = Math.max(0, P.shake - dt);
  camera.position.set(P.x, P.eye + ground + Math.sin(P.bob) * 0.035 * Math.min(1, moving / 3), P.z);
  camera.rotation.set(P.pitch + (P.shake ? Math.sin(P.shake * 90) * 0.01 : 0), P.yaw, 0, 'YXZ');
  // cart follows in front of the player
  if (st.cart > 0) { cart.position.set(P.x - sy * 1.05, 0, P.z - cy * 1.05); cart.rotation.y = P.yaw + Math.PI / 2; }
  // hands sway
  handGroup.position.set(Math.sin(P.bob * 0.5) * 0.01, Math.abs(Math.cos(P.bob * 0.5)) * 0.012, 0);
}

/* ---------------- input ---------------- */
let playing = false;
function lockPointer() { if (!isTouch && playing && !shopOpen && !settingsOpen) canvas.requestPointerLock?.(); }
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!playing) return;
  if (e.code === 'KeyB' || e.code === 'Tab') { e.preventDefault(); shopOpen ? closeShop() : openShop(); }
  if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); actionHeld = true; doAction(); }
  if (e.code === 'KeyM') { sfx.muted = !sfx.muted; sfx.setVolume(S.settings.volume); toast(sfx.muted ? 'Audio spento' : 'Audio acceso'); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE' || e.code === 'Space') actionHeld = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; actionHeld = false; });
canvas.addEventListener('mousedown', e => {
  if (isTouch || !playing) return;
  if (!document.pointerLockElement) { lockPointer(); return; }
  if (e.button === 0) { actionHeld = true; doAction(); }
});
addEventListener('mouseup', () => { actionHeld = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  const s = 0.0022 * S.settings.sens;
  P.yaw -= e.movementX * s; P.pitch -= e.movementY * s * (S.settings.invertY ? -1 : 1);
  P.pitch = G.clamp(P.pitch, -1.35, 1.2);
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  $('pause').classList.toggle('hidden', locked || !playing || shopOpen || settingsOpen || isTouch);
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
    if (o && o.moved < 14 && performance.now() - o.t0 < 400 && playing && !shopOpen) {
      const ndc = new THREE.Vector2(t.clientX / innerWidth * 2 - 1, -(t.clientY / innerHeight) * 2 + 1); doAction(ndc);
    }
  }
};
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
const throwBtn = $('throwbtn');
throwBtn.addEventListener('touchstart', e => { e.preventDefault(); actionHeld = true; tryThrow(); });
throwBtn.addEventListener('touchend', e => { e.preventDefault(); actionHeld = false; });
throwBtn.addEventListener('mousedown', () => { actionHeld = true; tryThrow(); });

/* ---------------- menus ---------------- */
let settingsOpen = false;
function start() {
  sfx.init(); playing = true; $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  lockPointer(); updateTut(); updateHUD();
}
$('play').onclick = start;
$('shopbtn').onclick = (e) => { e.stopPropagation(); openShop(); };
$('shopclose').onclick = closeShop;
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
  }
  s.van.fill = s.van.fill.filter(Boolean);
  return SV.save(localStorage, s);
}
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

/* ---------------- resize ---------------- */
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

/* ---------------- loop ---------------- */
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, adaptT = 0;
let frameN = 0;
function frame(now) { frameN++;
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  step(dt);
  renderer.render(scene, camera);
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; adapt(); }
}
function adapt() { // dynamic resolution for old laptops
  if (!playing || TEST) return; adaptT++;
  if (fps < 32 && pixelRatio > 0.65) { pixelRatio = Math.max(0.65, pixelRatio - 0.1); renderer.setPixelRatio(pixelRatio); }
  else if (fps > 57 && pixelRatio < QP.pr && adaptT % 5 === 0) { pixelRatio = Math.min(QP.pr, pixelRatio + 0.1); renderer.setPixelRatio(pixelRatio); }
}
function step(dt) {
  if (playing && !shopOpen && !settingsOpen) { updatePlayer(dt); S.stats.playTime += dt; }
  else { camera.position.set(P.x, P.eye, P.z); camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ'); }
  if (nearDirty || Math.hypot(P.x - nearCenter.x, P.z - nearCenter.y) > 0.8) rebuildNear();
  if (farDirty && Math.hypot(P.x - farCenter.x, P.z - farCenter.y) > 0.01 || Math.hypot(P.x - farCenter.x, P.z - farCenter.y) > 3) rebuildFar();
  updateVan(dt); updateFlights(dt); updateDust(dt);
  grabBusy = Math.max(0, grabBusy - dt); throwCD = Math.max(0, throwCD - dt);
  // hover highlight + crosshair label (desktop aims at the centre)
  if (playing && !isTouch) {
    const rec = pickAt(lastAimNDC);
    if (hover !== rec) {
      if (hover && hover.m) { hover.m.setColorAt(hover.id, hover.base); hover.m.instanceColor.needsUpdate = true; }
      hover = rec;
      if (rec) { rec.m.setColorAt(rec.id, _col.copy(rec.base).multiplyScalar(rec.free ? (rec._t <= C.PLAYER.reach ? 2.4 : 1.4) : 1.25)); rec.m.instanceColor.needsUpdate = true; }
    }
    const lab = $('aimlabel'), ch = $('cross');
    let text = '', cls = '';
    if (rec && rec._t <= C.PLAYER.reach + 1.5) {
      const t = C.TIRES[rec.type];
      if (!rec.free) { text = rec.type === C.GOLD_ID ? 'Gomma d\'oro · sepolta' : 'Sepolta'; cls = 'bad'; }
      else if (rec._t > C.PLAYER.reach) { text = 'Avvicinati'; cls = 'far'; }
      else { text = rec.type === C.GOLD_ID ? 'Gomma d\'oro!' : `Prendi ${t.name}`; cls = rec.type === C.GOLD_ID ? 'gold' : 'ok'; }
    } else if (inThrowZone() && carriedNow()) { text = 'Lancia nel furgone'; cls = 'throw'; }
    lab.textContent = text; lab.className = cls; ch.className = cls;
  }
  if (isTouch) throwBtn.classList.toggle('hidden', !(playing && inThrowZone() && carriedNow()));
  // held button = keep working (throw cadence / grab the next tire under the crosshair)
  if (actionHeld && playing && !shopOpen) {
    if (inThrowZone() && carriedNow() && throwCD <= 0) tryThrow();
    else if (!isTouch && grabBusy <= 0) { const r = pickAt(lastAimNDC); if (r && r.free && r._t <= C.PLAYER.reach && carried() < capacity()) tryGrab(r); }
  }
  // workers watch you
  for (const w of workers) {
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
refreshCart(); refreshHands(); rebuildCargo();
if (S.van.fill.length >= LAYOUT.cap) { V.state = 'closing'; V.t = 0; }
van.position.set(VAN_X, 0, VAN_Z);
updatePlayer(0); rebuildNear(); rebuildFar(); updateHUD();
if (loadedFrom !== 'new') $('play').textContent = 'CONTINUA';
requestAnimationFrame(frame);

if (TEST) {
  window.__game = {
    S, C, mountain, LAYOUT, V, get st() { return st; }, get fps() { return fps; }, get remaining() { return remaining; }, get nearRecs() { return nearRecs; },
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
    meshH, blocked,
    keys, P,
  };
}

if ('serviceWorker' in navigator && !Q.has('nosw') && !TEST && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
