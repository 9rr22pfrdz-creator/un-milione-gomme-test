// Fase 5 pure logic (no THREE / DOM, node-testable): carrucola magnetica, macchina dei fascioni, trituratore.
export const PULLEY = { COST: 2500, MIN: 5, MAX: 28, JIB: 1.9, H: 6.4, CABLE_Y: 6.2, PICK_R: 2.4, DROP_R: 3.2 };
export const FASC = { STACK: 10, BUNDLE_PAY: 60, READY_MAX: 10, PALLET: 6, CUT_T: 1.1, RACK_PULL_T: 1.5 };
export const SHRED = { COST: 3000, KG: [6, 8, 10, 3, 8], PRICE: 0.4, CHEW_T: 0.85, QUEUE: 6, SACK: 250 };

const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
const int = (x, lo, hi, d = lo) => Number.isInteger(x) ? Math.max(lo, Math.min(hi, x)) : d;
const cellOk = c => isObj(c) && Number.isInteger(c.gx) && Number.isInteger(c.gz) && Math.abs(c.gx) <= 200 && Math.abs(c.gz) <= 200;

// ---- fascioni: cut tires waiting (ready), the stack being nested on the table (0..9), bundles made, bundles on the pallet ----
export function defaultFascioni() { return { ready: 0, stack: 0, bundles: 0, pallet: 0, cut: 0 }; }
// one click at the table: nest one cut fascione into the stack ("tutun tutun"). 10 = a bundle
export function nest(f) {
  if (f.ready <= 0) return { ok: false, bundle: false, n: f.stack };
  f.ready--; f.stack++;
  if (f.stack < FASC.STACK) return { ok: true, bundle: false, n: f.stack };
  f.stack = 0; f.bundles++; f.pallet = f.pallet >= FASC.PALLET ? 1 : f.pallet + 1; // a full pallet is collected by the supplier
  return { ok: true, bundle: true, n: FASC.STACK };
}
export function normalizeFascioni(raw) {
  const d = defaultFascioni(); if (!isObj(raw)) return d;
  d.ready = int(raw.ready, 0, FASC.READY_MAX + 4, 0); d.stack = int(raw.stack, 0, FASC.STACK - 1, 0);
  d.bundles = int(raw.bundles, 0, 1e9, 0); d.pallet = int(raw.pallet, 0, FASC.PALLET, 0); d.cut = int(raw.cut, 0, 1e9, 0);
  return d;
}

// ---- trituratore: kg of granulate per tire (14" 16" 18" scooter gold) sold by weight ----
export const shredKg = type => SHRED.KG[type] ?? 8;
export const shredValue = type => +(shredKg(type) * SHRED.PRICE).toFixed(2);
export function defaultGranulate() { return { kg: 0, sacks: 0 }; }
export function normalizeGranulate(raw) { const d = defaultGranulate(); if (!isObj(raw)) return d; d.kg = Math.max(0, Number.isFinite(raw.kg) ? raw.kg : 0); d.sacks = int(raw.sacks, 0, 1e9, 0); return d; }

// ---- saved structures ----
export function lineLen(a, b, grid = 2) { return Math.hypot((b.gx - a.gx) * grid, (b.gz - a.gz) * grid); }
// pulley lines [{a:{gx,gz}, b:{gx,gz}, pick:'a'|'b'}]: valid cells, a sane cable length, never more than bought, no shared cell
export function normalizePulleys(raw, max, taken = new Set()) {
  const out = []; if (!Array.isArray(raw)) return out;
  for (const l of raw) {
    if (out.length >= max) break;
    if (!isObj(l) || !cellOk(l.a) || !cellOk(l.b)) continue;
    const L = lineLen(l.a, l.b); if (L < PULLEY.MIN - 0.01 || L > PULLEY.MAX + 0.01) continue;
    const ka = l.a.gx + ',' + l.a.gz, kb = l.b.gx + ',' + l.b.gz; if (taken.has(ka) || taken.has(kb) || ka === kb) continue;
    taken.add(ka); taken.add(kb);
    out.push({ a: { gx: l.a.gx, gz: l.a.gz }, b: { gx: l.b.gx, gz: l.b.gz }, pick: l.pick === 'b' ? 'b' : 'a' });
  }
  return out;
}
export function normalizeShredders(raw, max, taken = new Set()) {
  const out = []; if (!Array.isArray(raw)) return out;
  for (const s of raw) {
    if (out.length >= max) break;
    if (!cellOk(s)) continue;
    const k = s.gx + ',' + s.gz; if (taken.has(k)) continue; taken.add(k);
    out.push({ gx: s.gx, gz: s.gz, rot: Number.isInteger(s.rot) ? ((s.rot % 4) + 4) % 4 : 0, kg: Math.max(0, Number.isFinite(s.kg) ? s.kg : 0) });
  }
  return out;
}
