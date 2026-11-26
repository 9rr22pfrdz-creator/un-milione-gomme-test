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
const VALUE = [1.0, 1.5, 2.0, 2.2]; // reward value per tire (scooter tires are rare: they pay like an 18")
const AVG = 1.0 * 0.4 + 1.5 * 0.35 + 2.0 * 0.205 + 0.6 * 0.045;

// deterministic pseudo random from an integer seed
function rnd(seed) { let x = (seed * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }
export function matches(c, type) { if (!c) return false; if (c.size < 0) return type >= 0 && type <= 4; return type === c.size || (c.size === 1 && type === 4); }
export function title(c) { return `${c.client} · ${c.need} gomme ${c.size < 0 ? 'miste' : SIZE_NAMES[c.size]}`; }
// contract #seq at difficulty `done` (how many were completed before): bigger and richer as you go
// avoid = contracts already on the board: never the same client, and a size at most once if possible (variety)
export function makeContract(seq, done, avoid = []) {
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
export function defaultContracts() { return { list: [], active: null, done: 0, seq: 0, earned: 0 }; }
// keep BOARD_SIZE offers on the board (different clients)
export function fill(cs) {
  while (cs.list.length < BOARD_SIZE) { const c = makeContract(++cs.seq, cs.done, cs.list); cs.list.push(c); }
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
  if (Array.isArray(raw.list)) for (const c of raw.list.slice(0, BOARD_SIZE)) {
    if (!c || !Number.isInteger(c.id) || typeof c.client !== 'string' || !Number.isInteger(c.size) || c.size < -1 || c.size > 3) continue;
    const need = Math.max(1, c.need | 0), got = Math.max(0, Math.min(need, c.got | 0)), reward = Math.max(0, Number(c.reward) || 0);
    if (d.list.some(o => o.id === c.id)) continue;
    d.list.push({ id: c.id, client: c.client.slice(0, 60), note: typeof c.note === 'string' ? c.note.slice(0, 80) : '', size: c.size, need, got, reward });
    d.seq = Math.max(d.seq, c.id);
  }
  d.active = Number.isInteger(raw.active) && d.list.some(c => c.id === raw.active) ? raw.active : null;
  return fill(d);
}
