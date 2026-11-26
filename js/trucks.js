// Camion (rigid box truck, 350 tires) and Bilico (tractor + box semi-trailer, 840 tires).
// Same local frame + userData as the van: x = 0 at the rear opening, +x toward the cab, z lateral, y up; cargo floor at fl.
// Every wheel top stays BELOW the cargo floor (no wheel ever shows inside the box).
import * as THREE from 'three';
import { merge, M, box, cyl, wheelGeo, signTexture, poseDoors } from './gfx.js';

function cabProfile(x0, cl, y0, yTop, nose) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0); s.lineTo(x0 + cl, y0); s.lineTo(x0 + cl + nose, y0 + 0.35); s.lineTo(x0 + cl + nose * 0.6, yTop - 0.35);
  s.quadraticCurveTo(x0 + cl + nose * 0.2, yTop, x0 + cl - 0.35, yTop); s.lineTo(x0, yTop); s.lineTo(x0, y0);
  return s;
}
export function buildTruck(veh, mats, tireMat) {
  const trailer = veh.key === 'trailer';
  const g = new THREE.Group();
  const { L, W, H } = veh.cargo, fl = trailer ? 1.32 : 1.16, t = 0.05, Wo = W + 2 * t, top = fl + H;
  const cabPaint = new THREE.MeshStandardMaterial({ color: veh.color, roughness: 0.28, metalness: 0.4 });
  const boxPaint = new THREE.MeshStandardMaterial({ color: trailer ? 0xeef0f0 : 0xd9dde1, roughness: 0.36, metalness: 0.45 });
  const P = { box: [], cab: [], black: [], glass: [], ply: [], chrome: [], red: [], amber: [], head: [], plastic: [], stripe: [] };
  // ---- cargo box ----
  P.ply.push([box(L, 0.03, W), M(L / 2, fl - 0.015, 0)]);
  for (const s of [1, -1]) P.box.push([box(L, H + t, t), M(L / 2, fl + H / 2, s * (W / 2 + t / 2))]);
  P.box.push([box(L + 0.02, t, Wo), M(L / 2, top + t / 2, 0)], [box(t, H, W), M(L + t / 2, fl + H / 2, 0)]);
  P.ply.push([box(L - 0.02, H - 0.06, 0.012), M(L / 2, fl + H / 2, W / 2 - 0.006)], [box(L - 0.02, H - 0.06, 0.012), M(L / 2, fl + H / 2, -W / 2 + 0.006)], [box(0.012, H - 0.04, W - 0.02), M(L - 0.006, fl + H / 2, 0)]);
  P.box.push([box(L, 0.012, W), M(L / 2, top - 0.006, 0)]);
  for (const s of [1, -1]) for (const hy of [0.35, 0.7]) P.chrome.push([box(L - 0.1, 0.03, 0.02), M(L / 2, fl + H * hy, s * (W / 2 - 0.02))]);
  // outside: vertical ribs, top + bottom rails, a coloured band
  for (let x = 0.45; x < L - 0.2; x += 0.62) for (const s of [1, -1]) P.box.push([box(0.05, H - 0.04, 0.025), M(x, fl + H / 2, s * (Wo / 2 + 0.012))]);
  for (const s of [1, -1]) { P.chrome.push([box(L + 0.04, 0.1, 0.05), M(L / 2, fl - 0.04, s * (Wo / 2 + 0.02))], [box(L + 0.04, 0.08, 0.05), M(L / 2, top - 0.02, s * (Wo / 2 + 0.02))]); P.stripe.push([box(L - 0.1, 0.16, 0.012), M(L / 2, fl + 0.32, s * (Wo / 2 + 0.03))]); }
  // rear frame (posts, header, sill), underride bar, lights
  for (const s of [1, -1]) P.chrome.push([box(0.1, H + 0.08, 0.12), M(0.02, fl + H / 2, s * (W / 2 + 0.03))]);
  P.chrome.push([box(0.1, 0.12, Wo + 0.06), M(0.02, top + 0.02, 0)]);
  P.black.push([box(0.14, 0.1, Wo + 0.04), M(0.0, fl - 0.05, 0)]);
  P.black.push([box(0.12, 0.14, Wo - 0.1), M(-0.08, 0.5, 0)]); for (const s of [1, -1]) P.black.push([box(0.08, fl - 0.55, 0.08), M(0.02, 0.5 + (fl - 0.55) / 2, s * (Wo / 2 - 0.35))]);
  for (const s of [1, -1]) { P.red.push([box(0.04, 0.12, 0.34), M(-0.12, 0.5, s * (Wo / 2 - 0.3))]); P.amber.push([box(0.042, 0.1, 0.1), M(-0.122, 0.5, s * (Wo / 2 - 0.08))]); P.red.push([box(0.035, 0.36, 0.1), M(-0.02, fl + H * 0.15, s * (Wo / 2 - 0.0))]); }
  for (const s of [1, -1]) P.amber.push([box(0.04, 0.05, 0.05), M(-0.02, top - 0.05, s * (Wo / 2 - 0.08))]);
  // under the floor: chassis rails + crossmembers
  const railEnd = trailer ? L : L + 2.6;
  for (const s of [1, -1]) P.black.push([box(railEnd, 0.24, 0.16), M(railEnd / 2, fl - 0.2, s * 0.5)]);
  for (let x = 0.6; x < L; x += 1.1) P.black.push([box(0.08, 0.1, W - 0.1), M(x, fl - 0.08, 0)]);
  // ---- wheels: tops below fl - 0.1 ----
  const wheels = [], wr = trailer ? 0.48 : 0.5, ww = trailer ? 0.34 : 0.28, wheel = wheelGeo(wr, ww, wr * 0.6), wz = Wo / 2 - 0.2;
  const addWheel = (wx, z) => { const tm = new THREE.Mesh(wheel.tire, tireMat); tm.position.set(wx, wr, z); tm.rotation.x = Math.PI / 2; tm.castShadow = true; g.add(tm); wheels.push(tm); const rm = new THREE.Mesh(wheel.rim, mats.steel); rm.position.copy(tm.position); rm.rotation.x = Math.PI / 2; g.add(rm); wheels.push(rm); };
  const axle = (wx, dual) => { for (const s of [1, -1]) { addWheel(wx, s * wz); if (dual) addWheel(wx, s * (wz - ww - 0.03)); } P.black.push([cyl(0.07, 0.07, Wo - 0.4, 8), M(wx, wr, 0, Math.PI / 2)]); };
  const mudguard = (x0, x1) => { for (const s of [1, -1]) { P.black.push([box(x1 - x0, 0.03, ww * 2 + 0.1), M((x0 + x1) / 2, wr * 2 + 0.06, s * (wz - ww / 2))]); P.black.push([box(0.02, 0.5, ww * 2), M(x0 - 0.02, wr * 2 - 0.2, s * (wz - ww / 2))]); } };
  // the cab (shared by camion + tractor)
  const buildCab = (x0, cl, yTop) => {
    const y0 = 0.62, nose = 0.08;
    const geo = new THREE.ExtrudeGeometry(cabProfile(x0, cl, y0, yTop, nose), { depth: Wo - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 6 });
    geo.translate(0, 0, -(Wo - 0.12) / 2); P.cab.push([geo, null]);
    const fx = x0 + cl + nose * 0.55 + 0.07;
    P.glass.push([box(0.02, 0.92, Wo - 0.34), M(fx, yTop - 0.82, 0, 0, 0, -0.05)]);
    for (const s of [1, -1]) { P.glass.push([box(0.9, 0.75, 0.02), M(x0 + cl - 0.62, yTop - 0.78, s * (Wo / 2 + 0.006))]); P.black.push([box(0.02, 1.5, 0.012), M(x0 + cl - 1.15, yTop - 1.2, s * (Wo / 2 + 0.008))]); }
    P.plastic.push([box(0.05, 0.62, Wo - 0.5), M(x0 + cl + 0.1, 1.28, 0)]);
    for (let y = 1.04; y < 1.56; y += 0.09) P.chrome.push([box(0.02, 0.025, Wo - 0.56), M(x0 + cl + 0.13, y, 0)]);
    P.black.push([box(0.24, 0.34, Wo + 0.04), M(x0 + cl + 0.1, 0.72, 0)]);
    for (const s of [1, -1]) { P.head.push([box(0.06, 0.14, 0.34), M(x0 + cl + 0.2, 0.78, s * (Wo / 2 - 0.3))]); P.amber.push([box(0.05, 0.08, 0.12), M(x0 + cl + 0.2, 0.78, s * (Wo / 2 - 0.07))]); }
    for (const s of [1, -1]) { P.black.push([box(0.05, 0.05, 0.42), M(x0 + cl - 0.1, yTop - 0.45, s * (Wo / 2 + 0.2))], [box(0.07, 0.42, 0.14), M(x0 + cl - 0.05, yTop - 0.7, s * (Wo / 2 + 0.42))]); } // mirrors
    for (const s of [1, -1]) for (const sy of [0.45, 0.8]) P.black.push([box(0.4, 0.04, 0.24), M(x0 + cl - 0.75, sy, s * (Wo / 2 - 0.05))]); // steps
    P.black.push([box(0.3, 0.08, Wo - 0.2), M(x0 + cl - 0.05, yTop + 0.04, 0)]); // sun visor
    for (const s of [1, -1]) P.amber.push([box(0.14, 0.1, 0.14), M(x0 + 0.6, yTop + 0.1, s * 0.5)]); // roof beacons
    // wind deflector up to the box height
    if (top - yTop > 0.2) { const d = new THREE.Shape(); d.moveTo(x0 - 0.02, yTop); d.lineTo(x0 + 1.5, yTop); d.quadraticCurveTo(x0 + 0.5, yTop + 0.15, x0 - 0.02, top + 0.02); d.lineTo(x0 - 0.02, yTop); const dg = new THREE.ExtrudeGeometry(d, { depth: Wo - 0.2, bevelEnabled: false }); dg.translate(0, 0, -(Wo - 0.2) / 2); P.cab.push([dg, null]); }
  };
  let len;
  if (!trailer) {
    // rigid truck: cab-over at the front, tandem rear axle with dual wheels
    const x0 = L + t + 0.18, cl = 2.25, yTop = top - 0.55;
    buildCab(x0, cl, yTop);
    axle(1.9, true); axle(3.2, true); axle(x0 + cl - 0.75, false);
    mudguard(1.3, 3.8); for (const s of [1, -1]) P.black.push([box(0.95, 0.03, ww + 0.1), M(x0 + cl - 0.75, wr * 2 + 0.06, s * wz)]);
    for (const s of [1, -1]) { P.chrome.push([box(L - 4.6, 0.06, 0.04), M(4.0 + (L - 4.6) / 2 - 0.1, 0.72, s * (Wo / 2 - 0.05))], [box(L - 4.6, 0.06, 0.04), M(4.0 + (L - 4.6) / 2 - 0.1, 0.5, s * (Wo / 2 - 0.05))]); } // side guards
    P.chrome.push([cyl(0.26, 0.26, 1.0, 16), M(L - 0.4, 0.78, -(Wo / 2 - 0.35), 0, 0, Math.PI / 2)]); // fuel tank
    P.black.push([box(0.5, 0.45, 0.4), M(L - 0.5, 0.82, Wo / 2 - 0.35)]); // battery box
    len = x0 + cl + 0.3;
  } else {
    // semi-trailer: triaxle at the rear, landing legs, kingpin; the tractor sits under the front overhang
    axle(2.4, false); axle(3.75, false); axle(5.1, false); mudguard(1.85, 5.65);
    for (const s of [1, -1]) { P.chrome.push([box(L - 9.6, 0.08, 0.04), M(6.0 + (L - 9.6) / 2, 0.85, s * (Wo / 2 - 0.04))], [box(L - 9.6, 0.08, 0.04), M(6.0 + (L - 9.6) / 2, 0.55, s * (Wo / 2 - 0.04))]); }
    for (const s of [1, -1]) { P.black.push([box(0.12, fl - 0.35, 0.12), M(L - 3.3, 0.18 + (fl - 0.35) / 2, s * 0.9)], [box(0.36, 0.06, 0.3), M(L - 3.3, 0.18, s * 0.9)]); }
    P.black.push([box(0.06, 0.06, 1.8), M(L - 3.3, 0.8, 0)]);
    // tractor
    const tx0 = L - 3.0, cx0 = L + 0.95, cl = 2.3, yTop = 3.45;
    for (const s of [1, -1]) P.black.push([box(cx0 + cl - tx0, 0.26, 0.14), M((tx0 + cx0 + cl) / 2, 0.92, s * 0.48)]);
    P.black.push([box(1.0, 0.1, 1.4), M(L - 1.05, 1.16, 0)], [cyl(0.42, 0.42, 0.06, 18), M(L - 1.05, 1.22, 0)]); // fifth wheel
    axle(L - 1.95, true); axle(L - 0.62, true); mudguard(L - 2.6, L + 0.05);
    for (const s of [1, -1]) { P.chrome.push([cyl(0.28, 0.28, 1.1, 18), M(L + 0.4, 0.72, s * (Wo / 2 - 0.36), 0, 0, Math.PI / 2)]); P.black.push([box(0.12, 0.12, 0.6), M(L + 0.4, 0.72, s * (Wo / 2 - 0.36))]); }
    for (const s of [1, -1]) P.chrome.push([cyl(0.07, 0.07, 2.8, 12), M(cx0 + 0.06, 1.9, s * (Wo / 2 - 0.12))], [cyl(0.075, 0.075, 0.18, 12), M(cx0 + 0.06, 3.38, s * (Wo / 2 - 0.12))]); // exhaust stacks
    for (let i = 0; i < 3; i++) P.black.push([cyl(0.02, 0.02, 0.95, 6), M(L + 0.45, 1.65 + i * 0.07, -0.25 + i * 0.25, 0, 0, Math.PI / 2 - 0.4)]); // air lines
    buildCab(cx0, cl, yTop); axle(cx0 + cl - 0.75, false);
    for (const s of [1, -1]) P.black.push([box(0.95, 0.03, ww + 0.1), M(cx0 + cl - 0.75, wr * 2 + 0.06, s * wz)]);
    len = cx0 + cl + 0.3;
  }
  // plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshStandardMaterial({ map: signTexture([{ t: trailer ? 'XA 840 GM' : 'GM 350 TR', y: 0.52, size: 150 }], '#f4f4f4', '#1a2a6a', 512, 112), roughness: 0.4 }));
  plate.position.set(-0.15, 0.68, 0); plate.rotation.y = -Math.PI / 2; g.add(plate);
  const stripeMat = new THREE.MeshStandardMaterial({ color: trailer ? 0xc8322a : 0x2f6fd6, roughness: 0.4, metalness: 0.2 });
  const matFor = { box: boxPaint, cab: cabPaint, black: mats.black, glass: mats.glass, ply: mats.ply, chrome: mats.chrome, red: mats.redLight, amber: mats.amber, head: mats.headlight, plastic: mats.plastic, stripe: stripeMat };
  for (const k in P) if (P[k].length) { const m = new THREE.Mesh(merge(P[k]), matFor[k]); m.castShadow = k !== 'glass'; m.receiveShadow = true; g.add(m); }
  // company decal on both sides of the box
  const logoMat = new THREE.MeshStandardMaterial({ map: signTexture([{ t: 'UN MILIONE', y: 0.36, size: 110 }, { t: 'DI GOMME', y: 0.74, size: 92 }], 'rgba(0,0,0,0)', trailer ? '#a3221b' : '#1d3f8a', 1024, 300), transparent: true, roughness: 0.4 });
  for (const s of [1, -1]) { const lg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(6.5, L * 0.55), Math.min(6.5, L * 0.55) * 0.29), logoMat); lg.position.set(L * 0.5, fl + H * 0.6, s * (Wo / 2 + 0.03)); if (s < 0) lg.rotation.y = Math.PI; g.add(lg); }
  // barn doors on the rear frame, swinging outward
  const doors = [], dw = Wo / 2;
  for (const s of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(-0.05, fl + H / 2, s * (Wo / 2 + 0.04)); g.add(pivot);
    const leaf = new THREE.Group(); leaf.position.set(0, 0, -s * dw / 2); pivot.add(leaf);
    const outer = new THREE.Mesh(box(0.05, H + 0.02, dw - 0.015), boxPaint); outer.castShadow = true; leaf.add(outer);
    const inn = new THREE.Mesh(box(0.01, H - 0.08, dw - 0.07), mats.ply); inn.position.x = 0.03; leaf.add(inn);
    for (const k of [-0.3, 0.3]) { const bar = new THREE.Mesh(cyl(0.022, 0.022, H - 0.1, 8), mats.chrome); bar.position.set(-0.05, 0, k * dw); leaf.add(bar); }
    const handle = new THREE.Mesh(box(0.04, 0.04, 0.22), mats.chrome); handle.position.set(-0.06, -0.15, -s * (dw / 2 - 0.12)); leaf.add(handle);
    doors.push({ pivot, sign: s });
  }
  g.userData = { doors, fl, cargo: veh.cargo, wheels, len, halfW: Wo / 2 + 0.05, deep: trailer ? 1 : 0.6 };
  poseDoors(g, 1);
  return g;
}
