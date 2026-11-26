// Zona di stoccaggio (tire rack with 4 labelled bays) + Bacheca contratti (cork board on the office wall).
import * as THREE from 'three';
import { merge, M, box, cyl, cvs } from './gfx.js';
import { what } from './contracts.js';

export const RACK = { x0: 4.0, x1: 12.0, zBack: -13.95, zFront: -12.55, bays: 4, cap: 40 }; // front on a 2 m grid border: a belt can end right at it
export const RACK_LABELS = ['14"', '16"', '18"', 'SCOOTER'];
export const BOARD = { x: 14.93, y: 1.75, z: -12.7, w: 2.0, h: 1.3 }; // on the office west wall, facing -x

function label(text, w = 256, h = 96) {
  const [c, x] = cvs(w, h); x.fillStyle = '#f2c21a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#151515'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
  x.fillStyle = '#151515'; x.font = `900 ${text.length > 4 ? 40 : 58}px Arial Black, Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function buildRack(scene, { mats, tireGeo, rubber, T16, TIRES, colliders }) {
  const g = new THREE.Group(); scene.add(g);
  const blue = new THREE.MeshStandardMaterial({ color: 0x2556a8, roughness: 0.5, metalness: 0.4 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8661a, roughness: 0.5, metalness: 0.35 });
  const { x0, x1, zBack, zFront } = RACK, bw = (x1 - x0) / RACK.bays, H = 2.4, depth = zFront - zBack, zc = (zFront + zBack) / 2;
  const U = [], B = [], D = [];
  for (let i = 0; i <= RACK.bays; i++) { const x = x0 + i * bw; for (const z of [zBack + 0.05, zFront - 0.05]) U.push([box(0.09, H, 0.09), M(x, H / 2, z)], [box(0.22, 0.02, 0.22), M(x, 0.01, z)]); for (let y = 0.4; y < H; y += 0.5) U.push([box(0.04, 0.04, depth - 0.1), M(x, y, zc, 0.6, 0, 0)]); }
  for (const y of [0.12, 1.25, H - 0.05]) for (const z of [zBack + 0.05, zFront - 0.05]) B.push([box(x1 - x0, 0.1, 0.06), M((x0 + x1) / 2, y, z)]);
  for (const y of [0.12, 1.25]) D.push([box(x1 - x0 - 0.06, 0.03, depth - 0.12), M((x0 + x1) / 2, y + 0.06, zc)]);
  const add = (geo, mat) => { const m = new THREE.Mesh(merge(geo), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(U, blue); add(B, orange); add(D, mats.steel);
  // painted floor zone in front + labels above each bay
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.6, 2.2), new THREE.MeshBasicMaterial({ color: 0xf2c21a, transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  zone.rotation.x = -Math.PI / 2; zone.position.set((x0 + x1) / 2, 0.015, zFront + 1.1); g.add(zone);
  const edge = new THREE.Mesh(merge([[box(x1 - x0 + 0.6, 0.01, 0.1), M((x0 + x1) / 2, 0.02, zFront + 2.2)], [box(0.1, 0.01, 2.2), M(x0 - 0.3, 0.02, zFront + 1.1)], [box(0.1, 0.01, 2.2), M(x1 + 0.3, 0.02, zFront + 1.1)]]), new THREE.MeshBasicMaterial({ color: 0xf2c21a, transparent: true, opacity: 0.8, depthWrite: false }));
  g.add(edge);
  for (let i = 0; i < RACK.bays; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.38), new THREE.MeshStandardMaterial({ map: label(RACK_LABELS[i]), roughness: 0.6 })); s.position.set(x0 + (i + 0.5) * bw, H + 0.25, zFront - 0.02); g.add(s);
    const post = new THREE.Mesh(box(0.04, 0.3, 0.04), mats.steel); post.position.set(x0 + (i + 0.5) * bw, H + 0.02, zFront - 0.05); g.add(post); }
  const title = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), new THREE.MeshStandardMaterial({ map: label('ZONA DI STOCCAGGIO', 768, 112), roughness: 0.6 }));
  title.position.set((x0 + x1) / 2, H + 0.75, zFront - 0.02); g.add(title);
  colliders.push({ x0: x0 - 0.12, x1: x1 + 0.12, z0: zBack - 0.05, z1: zFront + 0.02 });
  // stored tires: lying flat, columns of 5, 2 across x 2 deep x 2 shelves per bay = 40
  const im = new THREE.InstancedMesh(tireGeo, rubber, RACK.bays * RACK.cap); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  function setCounts(counts) {
    let n = 0;
    for (let b = 0; b < RACK.bays; b++) {
      const t = TIRES[b], k = Math.min(RACK.cap, counts[b] | 0);
      for (let i = 0; i < k; i++) {
        const shelf = i < 20 ? 0 : 1, j = i % 20, col = j % 4, lev = Math.floor(j / 4);
        const cx = x0 + (b + 0.5) * bw + (col % 2 ? 0.42 : -0.42), cz = zc + (col < 2 ? -0.3 : 0.3);
        const y = (shelf ? 1.34 : 0.21) + lev * t.w * 1.02 + t.w / 2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 1.7) % 6.28); p.set(cx + Math.sin(i * 3.1) * 0.03, y, cz + Math.cos(i * 2.3) * 0.03); sc.set(t.R / T16.R, t.w / T16.w, t.R / T16.R);
        im.setMatrixAt(n++, m4.compose(p, q, sc));
      }
    }
    im.count = n; im.instanceMatrix.needsUpdate = true;
  }
  // where a stored tire goes (for the flight): the next free spot of bay b
  function slotPos(b, i, out = new THREE.Vector3()) { const t = TIRES[b], shelf = i < 20 ? 0 : 1, j = i % 20, col = j % 4, lev = Math.floor(j / 4); return out.set(x0 + (b + 0.5) * bw + (col % 2 ? 0.42 : -0.42), (shelf ? 1.34 : 0.21) + lev * t.w * 1.02 + t.w / 2, zc + (col < 2 ? -0.3 : 0.3)); }
  return { group: g, setCounts, slotPos, front: { x0, z0: zFront + 0.1, x1, z1: zFront + 0.1 } };
}
// distance from a point to the rack front edge (for belts / arms / the player)
export function rackDist(x, z) { const cx = Math.max(RACK.x0, Math.min(RACK.x1, x)); return Math.hypot(x - cx, z - Math.max(RACK.zFront, Math.min(z, RACK.zFront))); }

// ---- cork board with the contract notes (redrawn when the board changes) ----
export function buildBoard(scene, { mats, colliders }) {
  const g = new THREE.Group(); g.position.set(BOARD.x, BOARD.y, BOARD.z); g.rotation.y = -Math.PI / 2; scene.add(g);
  const [c, x] = cvs(1024, 680);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); face.position.z = 0.045; g.add(face);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });
  const F = [[box(BOARD.w + 0.14, 0.08, 0.09), M(0, BOARD.h / 2 + 0.03, 0.02)], [box(BOARD.w + 0.14, 0.08, 0.09), M(0, -BOARD.h / 2 - 0.03, 0.02)], [box(0.08, BOARD.h, 0.09), M(-BOARD.w / 2 - 0.03, 0, 0.02)], [box(0.08, BOARD.h, 0.09), M(BOARD.w / 2 + 0.03, 0, 0.02)], [box(BOARD.w, BOARD.h, 0.03), M(0, 0, 0.015)]];
  const fm = new THREE.Mesh(merge(F), wood); fm.castShadow = true; g.add(fm);
  // header plate + a little roof so it reads from far away
  const [hc, hx] = cvs(512, 96); hx.fillStyle = '#1e2226'; hx.fillRect(0, 0, 512, 96); hx.fillStyle = '#f2c21a'; hx.font = '900 46px Arial Black, Arial'; hx.textAlign = 'center'; hx.textBaseline = 'middle'; hx.fillText('BACHECA CONTRATTI', 256, 50);
  const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace;
  const head = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, 0.36), new THREE.MeshStandardMaterial({ map: ht, roughness: 0.5 })); head.position.set(0, BOARD.h / 2 + 0.3, 0.05); g.add(head);
  const roof = new THREE.Mesh(box(BOARD.w + 0.4, 0.05, 0.4), mats.steel); roof.position.set(0, BOARD.h / 2 + 0.55, 0.18); roof.rotation.x = 0.25; roof.castShadow = true; g.add(roof);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mats.headlight); lamp.position.set(0, BOARD.h / 2 + 0.47, 0.3); g.add(lamp);
  colliders.push({ x0: BOARD.x - 0.25, x1: BOARD.x + 0.05, z0: BOARD.z - BOARD.w / 2, z1: BOARD.z + BOARD.w / 2 });
  function draw(list, activeId, locked) {
    x.fillStyle = '#b98a55'; x.fillRect(0, 0, 1024, 680);
    for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '90,55,25' : '230,190,140'},${Math.random() * 0.35})`; x.fillRect(Math.random() * 1024, Math.random() * 680, 2 + Math.random() * 3, 2 + Math.random() * 3); }
    if (locked) { x.fillStyle = '#f4ecd8'; x.save(); x.translate(512, 340); x.rotate(-0.03); x.fillRect(-300, -110, 600, 220); x.fillStyle = '#2a2420'; x.font = '900 46px Arial'; x.textAlign = 'center'; x.fillText('PROSSIMAMENTE', 0, -20); x.font = '600 30px Arial'; x.fillText('Sblocca i nastri per i contratti', 0, 40); x.restore(); tex.needsUpdate = true; return; }
    list.slice(0, 4).forEach((ct, i) => {
      const cx = 140 + (i % 2) * 520 + 110, cy = 40 + Math.floor(i / 2) * 320 + 140, rot = ((i * 37) % 7 - 3) * 0.012;
      x.save(); x.translate(cx, cy); x.rotate(rot);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(-205, -125, 420, 270);
      x.fillStyle = ct.id === activeId ? '#fff6c8' : '#f6efdf'; x.fillRect(-215, -135, 420, 270);
      x.fillStyle = '#2a2420'; x.textAlign = 'left'; x.font = '900 34px Arial'; x.fillText(ct.client.slice(0, 22), -195, -80);
      x.font = '700 30px Arial'; x.fillText(what(ct), -195, -30);
      x.fillStyle = '#1f7a3a'; x.font = '900 40px Arial'; x.fillText(`+ € ${Math.round(ct.reward)}`, -195, 30);
      x.fillStyle = '#6a5d50'; x.font = '600 24px Arial'; x.fillText('Nessuna scadenza', -195, 80);
      if (ct.got) { x.fillStyle = '#ddd2bd'; x.fillRect(-195, 98, 380, 16); x.fillStyle = '#d0402b'; x.fillRect(-195, 98, 380 * ct.got / ct.need, 16); }
      if (ct.id === activeId) { x.strokeStyle = '#d0402b'; x.lineWidth = 6; x.strokeRect(-215, -135, 420, 270); x.fillStyle = '#d0402b'; x.font = '900 26px Arial'; x.fillText('IN CORSO', 70, -100); }
      x.fillStyle = '#d0402b'; x.beginPath(); x.arc(0, -125, 15, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(-5, -130, 5, 0, 7); x.fill();
      x.restore();
    });
    tex.needsUpdate = true;
  }
  return { group: g, draw, pos: new THREE.Vector3(BOARD.x, BOARD.y, BOARD.z) };
}
