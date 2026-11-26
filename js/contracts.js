// Bacheca contratti: optional jobs with NO deadline and no penalty. Pure logic (no THREE / DOM) so node can test it.
// A contract asks for N tires of one size (0 = 14", 1 = 16", 2 = 18", 3 = Scooter) or of any size (-1 = "miste").
// Every matching tire that goes into the vehicle or the storage rack counts while the contract is active.
// Gold tires are 16" painted gold: they count for 16" and for mixed contracts.
export const BOARD_SIZE = 4;
export const SIZE_NAMES = ['14"', '16"', '18"', 'Scooter'];
export const CLIENTS = [
  { name: 'Officina Rossi', size: 2, base: 30, note: 'Cerchi grandi per i SUV dei clienti' },
  { name: 'Moto Club Liguria', size: 3, base: 15, note: 'Copertoni per la gimkana della domenica' },
  { name: 'Gommista Bianchi', size: 1, base: 60, note: 'Carcasse da ricostruire' },
  { name: 'Riciclo Nord', size: -1, base: 120, note: 'Tutto fa granulato' },
  { name: 'Asfalti Ferraro', size: 0, base: 50, note: 'Gomma per il bitume modificato' },
  { name: 'Kart Club Sardegna', size: 0, base: 40, note: 'Barriere per la pista' },
  { name: 'Cantiere Navale Marras', size: 2, base: 36, note: 'Parabordi per il porto' },
  { name: 'Vivaio Fiori di Campo', size: 1, base: 45, note: 'Fioriere colorate' },
  { name: 'Parco Giochi Comunale', size: -1, base: 80, note: 'Altalene e percorsi' },
  { name: 'Scooter Service Sanna', size: 3, base: 20, note: 'Ricambi per i motorini' },
  { name: 'Azienda Agricola Conti', size: -1, base: 150, note: 'Pesi per i teli dell\'insilato' },
  { name: 'Pneus Export', size: 1, base: 90, note: 'Un container per il porto' },
];
// v8: special jobs once the machines are bought. kind 'fascioni' = N bundles of 10 nested fascioni, 'granulato' = N kg of granulate
export const SPECIAL = {
  fascioni: [
    { name: 'Pista Atletica Comunale', base: 3, note: 'Bordi morbidi per la pista' },
    { name: 'Maneggio Le Querce', base: 4, note: 'Paracolpi per i box dei cavalli' },
    { name: 'Vivaio Serre Sarde', base: 3, note: 'Vasi grandi per gli ulivi' },
    { name: 'Cantiere Edile Pinna', base: 5, note: 'Protezioni per i pilastri' },
  ],
  granulato: [
    { name: 'Asfalti Liguria', base: 400, note: 'Bitume gommato per la provinciale' },
    { name: 'Calcetto Sinergy', base: 600, note: 'Intaso per il campo sintetico' },
    { name: 'Parco Giochi Antitrauma', base: 300, note: 'Pavimentazione morbida' },
    { name: 'Pista Ciclabile Riviera', base: 500, note: 'Fondo drenante' },
  ],
};
export const KINDS = ['tires', 'fascioni', 'granulato'];
export const kindOf = c => (c && (c.kind === 'fascioni' || c.kind === 'granulato')) ? c.kind : 'tires';
// what the client wants, in words (board, pinned card)
export function what(c) { const k = kindOf(c); return k === 'fascioni' ? `${c.need} pil${c.need === 1 ? 'a' : 'e'} di fascioni` : k === 'granulato' ? `${c.need} kg di granulato` : `${c.need} gomme ${c.size < 0 ? 'miste' : SIZE_NAMES[c.size]}`; }
export function unit(c) { const k = kindOf(c); return k === 'fascioni' ? ' pile' : k === 'granulato' ? ' kg' : ''; }
const VALUE = [1.0, 1.5, 2.0, 2.2]; // reward value per tire (scooter tires are rare: they pay like an 18")
const AVG = 1.0 * 0.4 + 1.5 * 0.35 + 2.0 * 0.205 + 0.6 * 0.045;

// deterministic pseudo random from an integer seed
function rnd(seed) { let x = (seed * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }
export function matches(c, type) { if (!c || kindOf(c) !== 'tires') return false; if (c.size < 0) return type >= 0 && type <= 4; return type === c.size || (c.size === 1 && type === 4); }
export function title(c) { return `${c.client} · ${what(c)}`; }
// contract #seq at difficulty `done` (how many were completed before): bigger and richer as you go
// avoid = contracts already on the board: never the same client, and a size at most once if possible (variety)
export function makeContract(seq, done, avoid = [], unlock = null, force = null) {
  const kinds = []; if (unlock && unlock.fascioni) kinds.push('fascioni'); if (unlock && unlock.granulato) kinds.push('granulato');
  let kind = force;
  if (!kind && kinds.length) { const r = rnd(seq * 5 + 11); const fresh = kinds.filter(k => !avoid.some(o => kindOf(o) === k)); if (r < 0.22 * kinds.length) kind = (fresh.length ? fresh : kinds)[Math.floor(rnd(seq * 3 + 7) * (fresh.length || kinds.length))]; }
  if (kind === 'fascioni' || kind === 'granulato') return makeSpecial(seq, done, avoid, kind);
  let k = Math.floor(rnd(seq * 7 + 3) * CLIENTS.length);
  const bad = (cl, strict) => avoid.some(o => o.client === cl.name || (strict && o.size === cl.size));
  let i = 0; for (; i < CLIENTS.length && bad(CLIENTS[k], true); i++) k = (k + 1) % CLIENTS.length;
  if (i >= CLIENTS.length) for (let j = 0; j < CLIENTS.length && bad(CLIENTS[k], false); j++) k = (k + 1) % CLIENTS.length;
  const cl = CLIENTS[k], grow = 1 + done * 0.22, jit = 0.85 + rnd(seq * 13 + 1) * 0.35;
  const need = Math.max(5, Math.round(cl.base * grow * jit / 5) * 5);
  const val = cl.size < 0 ? AVG : VALUE[cl.size];
  const mult = 2.4 + Math.min(2, done * 0.08);
  const reward = Math.max(25, Math.round(need * val * mult / 5) * 5);
  return { id: seq, client: cl.name, note: cl.note, size: cl.size, need, got: 0, reward };
}
function makeSpecial(seq, done, avoid, kind) {
  const L = SPECIAL[kind]; let k = Math.floor(rnd(seq * 7 + 5) * L.length);
  for (let i = 0; i < L.length && avoid.some(o => o.client === L[k].name); i++) k = (k + 1) % L.length;
  const cl = L[k], grow = 1 + done * 0.15, jit = 0.85 + rnd(seq * 13 + 2) * 0.35, mult = 1 + Math.min(1, done * 0.04);
  if (kind === 'fascioni') { const need = Math.max(1, Math.round(cl.base * grow * jit)); return { id: seq, kind, client: cl.name, note: cl.note, size: -1, need, got: 0, reward: Math.round(need * 160 * mult / 5) * 5 }; }
  const need = Math.max(50, Math.round(cl.base * grow * jit / 50) * 50);
  return { id: seq, kind, client: cl.name, note: cl.note, size: -1, need, got: 0, reward: Math.round(need * 0.9 * mult / 5) * 5 };
}
export function defaultContracts() { return { list: [], active: null, done: 0, seq: 0, earned: 0, unlock: { fascioni: false, granulato: false } }; }
// a machine was just bought: make sure the board shows at least one job of that kind (replaces an untouched offer)
export function inject(cs, kind) {
  cs.unlock = cs.unlock || {}; cs.unlock[kind] = true;
  if (cs.list.some(c => kindOf(c) === kind)) return null;
  let i = cs.list.findIndex(c => c.id !== cs.active && !c.got && kindOf(c) === 'tires'); if (i < 0) i = cs.list.findIndex(c => c.id !== cs.active && !c.got); if (i < 0) i = cs.list.findIndex(c => c.id !== cs.active);
  const c = makeContract(++cs.seq, cs.done, cs.list.filter((_, j) => j !== i), cs.unlock, kind);
  if (i < 0) { if (cs.list.length < BOARD_SIZE) cs.list.push(c); else return null; } else cs.list[i] = c;
  return c;
}
// fascioni bundles / kg of granulate delivered: returns the completed contract or null
export function progressKind(cs, kind, n = 1) {
  const c = activeOf(cs); if (!c || kindOf(c) !== kind || kind === 'tires') return null;
  c.got = Math.min(c.need, c.got + n);
  if (c.got < c.need) return null;
  cs.list.splice(cs.list.indexOf(c), 1); cs.active = null; cs.done++; cs.earned += c.reward;
  fill(cs);
  return c;
}
// keep BOARD_SIZE offers on the board (different clients)
export function fill(cs) {
  while (cs.list.length < BOARD_SIZE) { const c = makeContract(++cs.seq, cs.done, cs.list, cs.unlock); cs.list.push(c); }
  return cs;
}
export function find(cs, id) { return cs.list.find(c => c.id === id) || null; }
export function activeOf(cs) { return cs.active == null ? null : find(cs, cs.active); }
// accept (or switch to) a contract: zero penalty, its progress is kept
export function accept(cs, id) { if (!find(cs, id)) return false; cs.active = id; return true; }
export function drop(cs) { cs.active = null; }
// a tire of `type` was delivered (vehicle or rack). Returns the completed contract (already removed + replaced) or null.
export function progress(cs, type, n = 1) {
  const c = activeOf(cs); if (!c || !matches(c, type)) return null;
  c.got = Math.min(c.need, c.got + n);
  if (c.got < c.need) return null;
  cs.list.splice(cs.list.indexOf(c), 1); cs.active = null; cs.done++; cs.earned += c.reward;
  fill(cs);
  return c;
}
// sanitize a saved board (v6 saves have none)
export function normalizeContracts(raw) {
  const d = defaultContracts();
  if (!raw || typeof raw !== 'object') return fill(d);
  d.done = Number.isInteger(raw.done) && raw.done >= 0 ? raw.done : 0;
  d.seq = Number.isInteger(raw.seq) && raw.seq >= 0 ? raw.seq : 0;
  d.earned = typeof raw.earned === 'number' && raw.earned >= 0 ? raw.earned : 0;
  if (raw.unlock && typeof raw.unlock === 'object') { d.unlock.fascioni = !!raw.unlock.fascioni; d.unlock.granulato = !!raw.unlock.granulato; }
  if (Array.isArray(raw.list)) for (const c of raw.list.slice(0, BOARD_SIZE)) {
    if (!c || !Number.isInteger(c.id) || typeof c.client !== 'string' || !Number.isInteger(c.size) || c.size < -1 || c.size > 3) continue;
    const need = Math.max(1, c.need | 0), got = Math.max(0, Math.min(need, c.got | 0)), reward = Math.max(0, Number(c.reward) || 0);
    if (d.list.some(o => o.id === c.id)) continue;
    const o = { id: c.id, client: c.client.slice(0, 60), note: typeof c.note === 'string' ? c.note.slice(0, 80) : '', size: c.size, need, got, reward };
    if (c.kind === 'fascioni' || c.kind === 'granulato') { o.kind = c.kind; o.size = -1; }
    d.list.push(o);
    d.seq = Math.max(d.seq, c.id);
  }
  d.active = Number.isInteger(raw.active) && d.list.some(c => c.id === raw.active) ? raw.active : null;
  return fill(d);
}
