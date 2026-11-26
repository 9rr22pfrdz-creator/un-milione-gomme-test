// Stylized low-poly tire-shop workers with a simple joint rig, a face, and an idle animation.
// Built facing +z inside an inner group turned so the whole character faces +x (the yard convention).
import * as THREE from 'three';
import { cvs } from './gfx.js';

const std = (color, rough = 0.75, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
function logoTex(text, bg, fg) {
  const [c, x] = cvs(256, 128); x.fillStyle = bg; x.beginPath(); x.roundRect(6, 6, 244, 116, 22); x.fill();
  x.strokeStyle = fg; x.lineWidth = 8; x.beginPath(); x.arc(64, 64, 34, 0, 7); x.stroke(); x.beginPath(); x.arc(64, 64, 15, 0, 7); x.stroke();
  x.fillStyle = fg; x.font = '900 46px Arial Black, Arial'; x.textBaseline = 'middle'; x.fillText(text, 108, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; }
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);
const sph = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);

// look: { suit, shirt, skin, hair, cap, beard, mustache, belly, height, pose: 'hips' | 'coffee' | 'crossed' }
export function buildWorker(look = {}) {
  const L = Object.assign({ suit: 0xe8661a, shirt: 0xf2f2ee, skin: 0xd9a37e, hair: 0x3b2a1e, cap: 0xe8661a, beard: false, mustache: true, belly: 1.12, height: 1, pose: 'hips', logo: 'UMG' }, look);
  const M = {
    suit: std(L.suit, 0.82), shirt: std(L.shirt, 0.85), skin: std(L.skin, 0.62), hair: std(L.hair, 0.9),
    cap: std(L.cap, 0.7), boots: std(0x3a2a1c, 0.75), sole: std(0x1b1714, 0.9), glove: std(0x2e3338, 0.65),
    stripe: std(0xdfe6ea, 0.35, { emissive: 0x2a2f33, metalness: 0.2 }), belt: std(0x2a201a, 0.6), buckle: std(0xc9ccd0, 0.3, { metalness: 0.9 }),
    eyeW: std(0xf7f4ee, 0.3), eye: std(0x2a1d14, 0.2), mouth: std(0x7a3b30, 0.6),
  };
  const root = new THREE.Group(), inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; inner.scale.setScalar(L.height); root.add(inner);
  const hips = new THREE.Group(); hips.position.y = 0.95; inner.add(hips);
  // ---- legs: thigh -> knee -> shin -> boot ----
  const legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, 0, 0); hips.add(hip);
    mesh(cap(0.078, 0.34), M.suit, 0, -0.22, 0, hip);
    mesh(new THREE.TorusGeometry(0.083, 0.012, 6, 18), M.stripe, 0, -0.3, 0, hip).rotation.x = Math.PI / 2;
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    mesh(sph(0.075), M.suit, 0, 0, 0.005, knee);
    mesh(cap(0.068, 0.34), M.suit, 0, -0.22, 0, knee);
    mesh(new THREE.TorusGeometry(0.073, 0.012, 6, 18), M.stripe, 0, -0.26, 0, knee).rotation.x = Math.PI / 2;
    const ankle = new THREE.Group(); ankle.position.y = -0.45; knee.add(ankle);
    const boot = mesh(new THREE.CapsuleGeometry(0.06, 0.16, 6, 12), M.boots, 0, -0.02, 0.05, ankle); boot.rotation.x = Math.PI / 2; boot.scale.set(1.25, 1, 0.9);
    mesh(new THREE.BoxGeometry(0.15, 0.03, 0.3), M.sole, 0, -0.07, 0.05, ankle);
    mesh(cap(0.07, 0.06), M.boots, 0, 0.05, 0, ankle);
    legs.push({ hip, knee });
  }
  // ---- torso ----
  const spine = new THREE.Group(); spine.position.y = 0.02; hips.add(spine);
  const chest = new THREE.Group(); chest.position.y = 0.0; spine.add(chest);
  const prof = [[0.0, 0.0], [0.17, 0.0], [0.19 * L.belly, 0.12], [0.2 * L.belly, 0.24], [0.205, 0.38], [0.215, 0.5], [0.19, 0.58], [0.1, 0.63], [0.0, 0.64]].map(p => new THREE.Vector2(p[0], p[1]));
  const torso = mesh(new THREE.LatheGeometry(prof, 22), M.shirt, 0, -0.04, 0, chest); torso.scale.set(1.05, 1, 0.78);
  // overalls bib + trousers top (slightly bigger shell over the lower torso)
  const bibProf = [[0.0, 0.0], [0.178, 0.0], [0.197 * L.belly, 0.12], [0.207 * L.belly, 0.24], [0.205, 0.33], [0.0, 0.34]].map(p => new THREE.Vector2(p[0], p[1]));
  const bib = mesh(new THREE.LatheGeometry(bibProf, 22), M.suit, 0, -0.045, 0, chest); bib.scale.set(1.06, 1, 0.8);
  const bibFront = mesh(new THREE.BoxGeometry(0.22, 0.2, 0.03), M.suit, 0, 0.36, 0.15, chest); bibFront.rotation.x = -0.12;
  for (const s of [1, -1]) { const st = mesh(new THREE.BoxGeometry(0.045, 0.34, 0.025), M.suit, s * 0.09, 0.42, 0.0, chest); st.scale.z = 7.4; st.position.z = 0.0; st.scale.z = 1; const strapF = mesh(new THREE.BoxGeometry(0.045, 0.2, 0.02), M.suit, s * 0.095, 0.5, 0.14, chest); strapF.rotation.x = -0.35; const strapB = mesh(new THREE.BoxGeometry(0.045, 0.3, 0.02), M.suit, s * 0.095, 0.45, -0.15, chest); strapB.rotation.x = 0.25; mesh(sph(0.016, 10, 8), M.buckle, s * 0.09, 0.44, 0.162, chest); st.visible = false; }
  mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), M.suit, 0, 0.34, 0.172, chest).rotation.x = -0.12; // chest pocket
  for (const s of [1, -1]) mesh(new THREE.BoxGeometry(0.1, 0.11, 0.02), M.suit, s * 0.12, 0.08, 0.16 * L.belly, chest); // side pockets
  const stripe = mesh(new THREE.TorusGeometry(0.205 * L.belly, 0.016, 6, 28), M.stripe, 0, 0.17, 0, chest); stripe.rotation.x = Math.PI / 2; stripe.scale.set(1.06, 0.8, 1);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.075), new THREE.MeshStandardMaterial({ map: logoTex(L.logo, '#ffffff', '#1d3f8a'), roughness: 0.6 }));
  logo.position.set(0, 0.36, 0.188); logo.rotation.x = -0.12; chest.add(logo);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), logo.material); back.position.set(0, 0.42, -0.165); back.rotation.y = Math.PI; chest.add(back);
  const belt = mesh(new THREE.TorusGeometry(0.188 * L.belly * 0.95, 0.022, 6, 26), M.belt, 0, -0.01, 0, chest); belt.rotation.x = Math.PI / 2; belt.scale.set(1.08, 0.8, 1);
  mesh(new THREE.BoxGeometry(0.06, 0.045, 0.02), M.buckle, 0, -0.01, 0.15 * L.belly, chest);
  // ---- neck + head ----
  const neck = new THREE.Group(); neck.position.y = 0.6; chest.add(neck);
  mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 14), M.skin, 0, 0.03, 0, neck);
  const head = new THREE.Group(); head.position.y = 0.17; neck.add(head);
  const skull = mesh(sph(0.115, 24, 18), M.skin, 0, 0, 0, head); skull.scale.set(0.95, 1.1, 1.0);
  const jaw = mesh(sph(0.095, 20, 12), M.skin, 0, -0.055, 0.02, head); jaw.scale.set(0.98, 0.8, 0.98);
  for (const s of [1, -1]) { const ear = mesh(sph(0.028, 10, 8), M.skin, s * 0.108, 0, -0.005, head); ear.scale.set(0.5, 1, 0.8); }
  for (const s of [1, -1]) {
    const w = mesh(sph(0.02, 12, 10), M.eyeW, s * 0.04, -0.008, 0.104, head); w.scale.set(1, 0.8, 0.55);
    mesh(sph(0.0105, 10, 8), M.eye, s * 0.04, -0.009, 0.1135, head);
    const brow = mesh(new THREE.BoxGeometry(0.045, 0.011, 0.012), M.hair, s * 0.043, 0.019, 0.112, head); brow.rotation.z = s * -0.2; // a bit grumpy
  }
  const nose = mesh(sph(0.024, 12, 10), M.skin, 0, -0.036, 0.116, head); nose.scale.set(0.85, 1.1, 1);
  mesh(new THREE.BoxGeometry(0.04, 0.006, 0.01), M.mouth, 0, -0.084, 0.104, head);
  if (L.mustache) { const m = mesh(new THREE.CapsuleGeometry(0.012, 0.055, 4, 8), M.hair, 0, -0.064, 0.111, head); m.rotation.z = Math.PI / 2; m.scale.set(1, 1, 0.8); }
  if (L.beard) { const b = mesh(sph(0.098, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), M.hair, 0, -0.04, 0.012, head); b.scale.set(1.0, 1.02, 1.04); mesh(new THREE.CapsuleGeometry(0.012, 0.05, 4, 8), M.hair, 0, -0.064, 0.112, head).rotation.z = Math.PI / 2; }
  const hairBack = mesh(sph(0.112, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), M.hair, 0, -0.005, -0.012, head); hairBack.scale.set(1.0, 1.08, 1.02);
  const capTop = mesh(sph(0.118, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.cap, 0, 0.05, -0.004, head); capTop.scale.set(1, 0.8, 1.04);
  const visor = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20, 1, false, -Math.PI / 2.4, Math.PI / 1.2), M.cap, 0, 0.052, 0.062, head); visor.scale.set(1, 1, 1.15); visor.rotation.x = 0.14;
  mesh(sph(0.014, 8, 6), M.cap, 0, 0.142, -0.004, head);
  const band = mesh(new THREE.CylinderGeometry(0.119, 0.119, 0.016, 22, 1, true), M.cap, 0, 0.056, -0.004, head); band.scale.set(1, 1, 1.04);
  // ---- arms: shoulder -> elbow -> wrist (gloved hand) ----
  const arms = [];
  for (const s of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.215, 0.52, 0); chest.add(sh);
    mesh(sph(0.074, 16, 12), M.shirt, 0, 0, 0, sh);
    mesh(cap(0.058, 0.2), M.shirt, 0, -0.14, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    mesh(sph(0.054, 14, 10), M.skin, 0, 0, 0, el);
    mesh(cap(0.048, 0.18), M.skin, 0, -0.12, 0, el);
    const wr = new THREE.Group(); wr.position.y = -0.25; el.add(wr);
    mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.06, 12), M.glove, 0, 0.0, 0, wr);
    const palm = mesh(sph(0.052, 14, 10), M.glove, 0, -0.055, 0.005, wr); palm.scale.set(0.8, 1.05, 0.55);
    const thumb = mesh(cap(0.017, 0.035), M.glove, s * -0.035, -0.04, 0.03, wr); thumb.rotation.z = s * 0.6;
    arms.push({ sh, el, wr, s });
  }
  // ---- poses ----
  const [la, ra] = arms; // la = character's left (+x), ra = right (-x)
  const setArm = (a, sx, sz, ex, ez = 0, wx = 0) => { a.sh.rotation.set(sx, 0, a.s * sz); a.el.rotation.set(ex, 0, a.s * ez); a.wr.rotation.set(wx, 0, 0); };
  if (L.pose === 'hips') { setArm(la, 0.12, 0.42, -0.85, -0.55, 0.1); setArm(ra, 0.12, 0.42, -0.85, -0.55, 0.1); }
  else if (L.pose === 'coffee') {
    setArm(la, -0.15, 0.12, -0.15); setArm(ra, -0.35, 0.18, -1.9, 0.25, 0.3);
    const cup = new THREE.Group(); ra.wr.add(cup); cup.position.set(0.0, -0.08, 0.05);
    mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.08, 14), std(0xf4f1ea, 0.4), 0, 0, 0, cup);
    mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.012, 14), std(0x8a4b22, 0.5), 0, 0.04, 0, cup);
  } else { setArm(la, 0.06, 0.1, -0.28, 0.04, 0.15); setArm(ra, -0.04, 0.12, -0.42, 0.06, 0.2); } // relaxed, hanging
  legs[0].hip.rotation.z = 0.04; legs[1].hip.rotation.z = -0.04;
  const base = { hipsY: hips.position.y, t0: Math.random() * 10 };
  // idle: breathing, weight shift from foot to foot every few seconds
  const armRest = arms.map(a => ({ sx: a.sh.rotation.x, ex: a.el.rotation.x }));
  function anim(t) {
    const tt = t + base.t0, br = Math.sin(tt * 1.6);
    chest.scale.set(1 + br * 0.012, 1 + br * 0.01, 1 + br * 0.018);
    const shift = Math.sin(tt * 0.35) > 0 ? 1 : -1, sm = Math.sin(tt * 0.35);
    const w = Math.max(-1, Math.min(1, sm * 3)) * 0.03;
    hips.position.x = w; hips.rotation.z = -w * 1.2; spine.rotation.z = w * 1.8;
    legs[0].hip.rotation.z = 0.04 - w * 1.2; legs[1].hip.rotation.z = -0.04 - w * 1.2;
    legs[shift > 0 ? 1 : 0].knee.rotation.x = 0.12 * Math.abs(Math.max(-1, Math.min(1, sm * 3)));
    legs[shift > 0 ? 0 : 1].knee.rotation.x = 0.0;
    arms.forEach((a, i) => { if (L.pose === 'coffee' && i === 1) return; const sw = Math.sin(tt * 1.6 + i) * 0.025; a.sh.rotation.x = armRest[i].sx + sw; a.el.rotation.x = armRest[i].ex - sw * 0.6; });
    hips.position.y = base.hipsY - Math.abs(w) * 0.15 + br * 0.002;
  }
  root.userData = { head, anim };
  anim(0);
  return root;
}
