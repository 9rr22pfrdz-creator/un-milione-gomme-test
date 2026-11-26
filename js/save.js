// Save/load with a stable key + backup. Pure: storage is injected (localStorage in the browser).
// No offline progress: nothing is ever computed from the time spent away.
import { defaultLevels, UPGRADES, maxLevel, stats } from './config.js';

export const SAVE_KEY = 'umdg-save';
export const BACKUP_KEY = 'umdg-save-bak';
export const SAVE_VERSION = 1;
export const BELT_TYPES = ['straight', 'curveR', 'curveL', 'intake'];

export function defaultState() {
  return {
    v: SAVE_VERSION,
    money: 0,
    lv: defaultLevels(),
    mountain: [],             // sparse diff [cell, count, ...] against the generated mountain
    gold: null,               // planted gold tire {cell, index, taken}
    hands: [],                // tire type ids held in the hands
    cart: [],                 // tire type ids stacked on the trolley (stay on it when it is parked)
    cartHeld: true,           // trolley in your hands (pushing) or parked somewhere in the yard
    cartPos: null,            // where it is parked: {x, z, rot}
    van: { fill: [], trips: 0 }, // fill: per slot [type] or [3,3] for two scooter tires
    vehicle: 0,               // tier of the vehicle at the bay (the upgrade lv.vehicle swaps it in on the next trip)
    belts: [],                // placed conveyor pieces [{type, gx, gz, rot}] (helpers = lv.helper / lv.helperCart)
    player: { x: 3, z: 0.5, yaw: Math.PI / 2, pitch: -0.12 },
    stats: { cleared: 0, earned: 0, thrown: 0, auto: 0, vans: 0, gold: 0, playTime: 0, bySize: [0, 0, 0, 0, 0] },
    milestones: 0,            // how many MILESTONES already celebrated
    tut: 0,                   // tutorial step
    settings: { volume: 0.8, quality: 'auto', sens: 1, invertY: false },
    created: 0,
    saved: 0,
  };
}

const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
const num = (x, d) => (typeof x === 'number' && Number.isFinite(x)) ? x : d;
const tireArr = (a, max) => Array.isArray(a) ? a.filter(t => Number.isInteger(t) && t >= 0 && t <= 4).slice(0, max) : [];

// Merge a parsed save with defaults: every missing / broken field gets its default.
export function normalize(raw) {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const s = d;
  s.money = Math.max(0, num(raw.money, 0));
  if (isObj(raw.lv)) for (const u of UPGRADES) { const v = raw.lv[u.id]; if (Number.isInteger(v)) s.lv[u.id] = Math.max(0, Math.min(maxLevel(u.id), v)); }
  if (Array.isArray(raw.mountain)) s.mountain = raw.mountain.filter(Number.isInteger);
  if (isObj(raw.gold) && Number.isInteger(raw.gold.cell) && Number.isInteger(raw.gold.index)) s.gold = { cell: raw.gold.cell, index: raw.gold.index, taken: !!raw.gold.taken };
  s.hands = tireArr(raw.hands, 2);
  s.cart = tireArr(raw.cart, 10);
  // v4 saves have no cartHeld: the trolley was always in your hands
  s.cartHeld = typeof raw.cartHeld === 'boolean' ? raw.cartHeld : true;
  if (isObj(raw.cartPos) && [raw.cartPos.x, raw.cartPos.z].every(v => typeof v === 'number' && Number.isFinite(v))) s.cartPos = { x: raw.cartPos.x, z: raw.cartPos.z, rot: num(raw.cartPos.rot, 0) };
  if (!s.cartHeld && !s.cartPos) s.cartHeld = true; // parked but nowhere: give it back
  // never trolley + hand tires at once (v4 allowed it): move what fits onto the trolley; the game parks it if some are left
  const cap = stats(s.lv).cart;
  if (cap > 0 && s.cartHeld) while (s.hands.length && s.cart.length < cap) s.cart.push(s.hands.shift());
  if (isObj(raw.van)) {
    if (Array.isArray(raw.van.fill)) s.van.fill = raw.van.fill.filter(f => Array.isArray(f) && f.length >= 1 && f.length <= 2).map(f => tireArr(f, 2)).filter(f => f.length);
    s.van.trips = Math.max(0, num(raw.van.trips, 0) | 0);
  }
  // v6: vehicle at the bay (never above the bought tier) + placed belts (valid types, integer cells, one piece per cell)
  s.vehicle = Number.isInteger(raw.vehicle) ? Math.max(0, Math.min(raw.vehicle, s.lv.vehicle)) : s.lv.vehicle;
  if (Array.isArray(raw.belts)) {
    const seen = new Set();
    for (const b of raw.belts) {
      if (!isObj(b) || !BELT_TYPES.includes(b.type) || !Number.isInteger(b.gx) || !Number.isInteger(b.gz) || Math.abs(b.gx) > 200 || Math.abs(b.gz) > 200) continue;
      const k = b.gx + ',' + b.gz; if (seen.has(k)) continue; seen.add(k);
      s.belts.push({ type: b.type, gx: b.gx, gz: b.gz, rot: Number.isInteger(b.rot) ? ((b.rot % 4) + 4) % 4 : 0 });
      if (s.belts.length >= 400) break;
    }
  }
  if (isObj(raw.player)) for (const k of ['x', 'z', 'yaw', 'pitch']) s.player[k] = num(raw.player[k], d.player[k]);
  if (isObj(raw.stats)) {
    for (const k of Object.keys(d.stats)) if (k !== 'bySize') s.stats[k] = Math.max(0, num(raw.stats[k], 0));
    if (Array.isArray(raw.stats.bySize)) s.stats.bySize = d.stats.bySize.map((z, i) => Math.max(0, num(raw.stats.bySize[i], 0)));
  }
  s.milestones = Math.max(0, num(raw.milestones, 0) | 0);
  s.tut = Math.max(0, num(raw.tut, 0) | 0);
  if (isObj(raw.settings)) {
    s.settings.volume = Math.min(1, Math.max(0, num(raw.settings.volume, d.settings.volume)));
    if (['auto', 'alta', 'bassa'].includes(raw.settings.quality)) s.settings.quality = raw.settings.quality;
    s.settings.sens = Math.min(3, Math.max(0.2, num(raw.settings.sens, 1)));
    s.settings.invertY = !!raw.settings.invertY;
  }
  s.created = num(raw.created, 0); s.saved = num(raw.saved, 0);
  return s;
}

function tryParse(str) { if (!str) return null; try { const o = JSON.parse(str); return isObj(o) ? o : null; } catch { return null; } }

// Load: main key first, backup if main is missing/corrupt. Returns {state, from}.
export function load(storage) {
  let raw = null, from = 'new';
  try { raw = tryParse(storage.getItem(SAVE_KEY)); if (raw) from = 'main'; } catch { }
  if (!raw) { try { raw = tryParse(storage.getItem(BACKUP_KEY)); if (raw) from = 'backup'; } catch { } }
  return { state: normalize(raw), from };
}

// Save: the previous good main becomes the backup, then the new main is written.
export function save(storage, state, now = Date.now()) {
  state.saved = now; if (!state.created) state.created = now;
  const str = JSON.stringify(state);
  try {
    const prev = storage.getItem(SAVE_KEY);
    if (prev && tryParse(prev)) storage.setItem(BACKUP_KEY, prev);
    storage.setItem(SAVE_KEY, str);
    return true;
  } catch { return false; }
}

export function wipe(storage) { try { storage.removeItem(SAVE_KEY); storage.removeItem(BACKUP_KEY); } catch { } }
