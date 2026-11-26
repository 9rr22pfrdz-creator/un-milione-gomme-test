// "Un Milione di Gomme": all economy + progression data in ONE place.
// Imported by the game (browser, ES module) and by the simulator (node sim/economy.js).
// Costs in COSTS were calibrated with `node sim/economy.js --tune` and then frozen here.
import { braidLayout } from './braid.js';

export const VERSION = '0.1.0';
export const TOTAL_TIRES = 1000000;

/* ---------- tires ---------- */
// id 0..3 = sizes, 4 = gold (a 16" painted gold). value in euro paid when the tire lands in the vehicle.
export const TIRES = [
  { id: 0, key: 'r14', name: '14"', value: 1.0, p: 0.40, R: 0.29, ri: 0.185, w: 0.175 },
  { id: 1, key: 'r16', name: '16"', value: 1.5, p: 0.35, R: 0.315, ri: 0.205, w: 0.2 },
  { id: 2, key: 'r18', name: '18"', value: 2.0, p: 0.205, R: 0.34, ri: 0.228, w: 0.225 },
  { id: 3, key: 'scooter', name: 'Scooter', value: 0.6, p: 0.045, R: 0.2, ri: 0.12, w: 0.105, half: true },
  { id: 4, key: 'gold', name: "d'oro", value: 30, p: 0.004, R: 0.315, ri: 0.205, w: 0.2, gold: true },
];
export const GOLD_ID = 4, SCOOTER_ID = 3;
export const AVG_TIRE_VALUE = (() => {
  const base = TIRES.slice(0, 4).reduce((a, t) => a + t.value * t.p, 0);
  const g = TIRES[GOLD_ID].p; return base * (1 - g) + TIRES[GOLD_ID].value * g;
})();
// deterministic tire type from a 0..1 random
export function tireTypeFrom(r, rg) {
  if (rg < TIRES[GOLD_ID].p) return GOLD_ID;
  let acc = 0; for (let i = 0; i < 4; i++) { acc += TIRES[i].p; if (r < acc) return i; }
  return 0;
}

/* ---------- vehicles (capacity comes from the herringbone braid) ---------- */
export const VEHICLES = [
  // away = seconds from doors closed to the next empty vehicle parked and open (the fleet grows with the vehicle)
  { key: 'van', name: 'Furgone', cargo: { L: 3.0, W: 1.7, H: 1.75 }, away: 12, color: 0xf2f2ee },
  { key: 'bigvan', name: 'Furgone grande', cargo: { L: 4.2, W: 1.75, H: 1.9 }, away: 8, color: 0xdde6ee },
  { key: 'truck', name: 'Camion', cargo: { L: 7.2, W: 2.4, H: 2.4 }, away: 5, color: 0x2f6fd6 },
  { key: 'trailer', name: 'Bilico', cargo: { L: 13.4, W: 2.45, H: 2.7 }, away: 4, color: 0xc8322a },
];
for (const v of VEHICLES) { const l = braidLayout(v.cargo); v.cap = l.cap; v.bonus = Math.round(l.cap * 0.25); }

/* ---------- the player (manual phases) ---------- */
// Must match the yard in the game: throw spot behind the van <-> foot of the mountain.
export const PLAYER = {
  walkDist: 13,          // m, one way, throw spot -> reachable tires
  aimOverhead: 0.7,      // s per tire to find and click it
  throwInterval: 0.4,   // s between throws when you hold the button
  cartSpeedMul: 0.9,     // pushing the cart is a bit slower
  efficiency: 0.8,       // plausible play: looking around, detours, menus
  reach: 3.3,            // m from the camera
};

/* ---------- upgrades / machines ---------- */
// lv: effect per level (index = level). costs[k] = price to go from level k to k+1.
// phase: 1 Mano, 2 Carrello, 3 Aiutanti, 4 Nastri, 5 Bracci, 6 Carrucola-magnete, 7 Droni + Ragno
export const PHASES = [
  null,
  { n: 1, name: 'A mano', icon: '✋' },
  { n: 2, name: 'Il carrello', icon: 'cart' },
  { n: 3, name: 'Gli aiutanti', icon: '👷' },
  { n: 4, name: 'I nastri trasportatori', icon: '➰' },
  { n: 5, name: 'I bracci robot', icon: '🦾' },
  { n: 6, name: 'Carrucola col magnete', icon: '🧲' },
  { n: 7, name: 'Droni e braccio ragno', icon: '🕷️' },
];
export const UPGRADES = [
  // phase 1
  { id: 'shoes', phase: 1, icon: '👟', name: 'Scarpe antinfortunistiche', desc: 'Cammini più svelto tra la montagna e il furgone.', unit: 'm/s', lv: [3.2, 3.8, 4.4, 5.0] },
  { id: 'gloves', phase: 1, icon: '🧤', name: 'Guanti da gommista', desc: 'Con i guanti tieni due gomme alla volta, una per mano.', unit: 'gomme in mano', lv: [1, 2] },
  { id: 'grip', phase: 1, icon: '💪', name: 'Presa veloce', desc: 'Strappi le gomme dalla montagna più in fretta.', unit: 's per gomma', lv: [0.9, 0.65, 0.48, 0.36] },
  // phase 2
  { id: 'cart', phase: 2, icon: 'cart', machine: true, name: 'Carrello portagomme', desc: 'Il carrello portagomme in tubolare d\'acciaio: le gomme impilate una sull\'altra. Parte da 4 gomme e arriva a 10.', unit: 'gomme', lv: [0, 4, 6, 8, 10] },
  // phase 3 (not in the first playable slice)
  { id: 'helper', phase: 3, icon: '👷', machine: true, name: 'Aiutanti', desc: 'Beppino e la sua squadra. Da solo porta le gomme a mano; dal secondo in poi si mettono in fila e se le passano facendole rotolare.', unit: 'aiutanti', lv: [0, 1, 2, 3, 4, 5], rate: 0.35 },
  { id: 'helperCart', phase: 3, icon: '👟', name: 'Ritmo della squadra', desc: 'Scarpe e guanti nuovi per gli aiutanti: camminano, rotolano e lanciano più svelti.', unit: 'x ritmo', lv: [1, 2.2] },
  // phase 4
  { id: 'belt', phase: 4, icon: '➰', machine: true, name: 'Nastri trasportatori', desc: 'Sblocca la costruzione: nastri dritti, curve e il caricatore che pesca dalla montagna. Ogni livello = un caricatore in più.', unit: 'caricatori', lv: [0, 1, 2, 3, 4], rate: 2.0 },
  { id: 'beltSpeed', phase: 4, icon: '⏩', name: 'Motori dei nastri', desc: 'Nastri e caricatori più veloci.', unit: 'x velocità', lv: [1, 1.4, 1.8] },
  // phase 5
  { id: 'arm', phase: 5, icon: '🦾', machine: true, name: 'Bracci meccanici', desc: 'Bracci idraulici arancioni da piazzare col blueprint ai piedi della montagna: pescano le gomme e le girano sul nastro, nel mezzo o nello stoccaggio. Ogni livello = un braccio in più.', unit: 'bracci', lv: [0, 1, 2, 3, 4], rate: 5 },
  { id: 'armSpeed', phase: 5, icon: '⚙️', name: 'Servomotori', desc: 'Pompe e servomotori nuovi: i bracci girano e afferrano più svelti.', unit: 'x velocità', lv: [1, 1.5] },
  { id: 'armGrab', phase: 5, icon: '🗜️', name: 'Pinza multipla', desc: 'Una pinza più lunga: ogni braccio infila più gomme a ogni presa.', unit: 'gomme a presa', lv: [1, 2, 3] },
  // phase 6
  { id: 'pulley', phase: 6, icon: '🧲', machine: true, name: 'Carrucola col magnete', desc: 'Una gru a carrucola che solleva grappoli di gomme col magnete.', unit: 'carrucole', lv: [0, 1, 2, 3], rate: 10 },
  { id: 'magnet', phase: 6, icon: '🔋', name: 'Magnete potenziato', desc: 'Più gomme a ogni presa.', unit: 'x presa', lv: [1, 1.4, 1.8] },
  // phase 7
  { id: 'drones', phase: 7, icon: '🚁', machine: true, name: 'Squadriglie di droni', desc: 'Quattro droni per squadriglia, ognuno porta una gomma.', unit: 'squadriglie', lv: [0, 1, 2, 3, 4], rate: 6 },
  { id: 'droneSpeed', phase: 7, icon: '🔋', name: 'Batterie dei droni', desc: 'Droni più veloci.', unit: 'x velocità', lv: [1, 1.5] },
  { id: 'spider', phase: 7, icon: '🕷️', machine: true, name: 'Braccio ragno', desc: 'Il gigante finale: otto braccia che svuotano la montagna.', unit: '', lv: [0, 1], rate: 26 },
  { id: 'spiderBoost', phase: 7, icon: '🔥', name: 'Ragno turbo', desc: 'Il ragno va al doppio.', unit: 'x velocità', lv: [1, 1.6] },
  // vehicles + loading bays
  { id: 'vehicle', phase: 3, icon: '🚚', machine: true, name: 'Mezzi più grandi', desc: 'Furgone grande, poi il camion e infine il bilico: più gomme a viaggio e un bonus di consegna più grosso.', unit: '', lv: [0, 1, 2, 3] },
  { id: 'bays', phase: 4, icon: '🅿️', name: 'Piazzole di carico', desc: 'Un altro mezzo si carica mentre il primo è via.', unit: 'piazzole', lv: [1, 2, 3, 4] },
];
export const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// The designed order of purchases (what a normal player buys, and roughly when, in minutes).
// The simulator buys in this order; `--tune` derives the costs from the target minute.
export const PLAN = [
  ['shoes', 2.5], ['gloves', 5], ['grip', 8], ['shoes', 11.5], ['grip', 15],
  ['cart', 20], ['shoes', 25], ['cart', 30], ['grip', 36], ['cart', 42], ['cart', 50],
  ['helper', 56], ['helper', 62], ['vehicle', 68], ['helper', 74], ['helperCart', 80], ['helper', 86],
  ['belt', 92], ['belt', 98], ['bays', 104], ['beltSpeed', 110], ['belt', 116], ['belt', 122],
  ['arm', 129], ['vehicle', 136], ['arm', 142], ['beltSpeed', 148], ['arm', 154], ['armSpeed', 160],
  ['pulley', 166], ['arm', 172], ['bays', 178], ['magnet', 184], ['pulley', 191], ['magnet', 198],
  ['drones', 204], ['drones', 211], ['vehicle', 218], ['pulley', 225], ['droneSpeed', 232], ['drones', 238],
  ['spider', 244], ['bays', 256], ['drones', 268], ['helper', 282], ['spiderBoost', 296],
];

// COSTS: frozen output of `node sim/economy.js --tune` (rounded). One array per upgrade, per level.
export const COSTS = {"shoes":[15,60,120],"gloves":[20],"grip":[40,55,200],"cart":[85,160,220,280],"helper":[220,400,600,1200,200000],"helperCart":[750],"vehicle":[550,8000,45000],"belt":[1600,2200,4000,4500],"bays":[2800,25000,150000],"beltSpeed":[3500,12000],"arm":[6000,10000,14000,22000],"armSpeed":[16000],"pulley":[18000,30000,60000],"magnet":[28000,40000],"drones":[35000,45000,70000,160000],"droneSpeed":[60000],"spider":[75000],"spiderBoost":[180000]};

// extras outside the simulated plan (bonus upgrades, not needed to finish in 5-6 h)
COSTS.armGrab = [12000, 26000];

export function costOf(id, level) { const c = COSTS[id]; return c && level < c.length ? c[level] : null; }
export function maxLevel(id) { return UPG[id].lv.length - 1; }
export function defaultLevels() { const o = {}; for (const u of UPGRADES) o[u.id] = 0; return o; }
// Which phase the player is in (highest phase with a machine owned / started)
export function currentPhase(lv) {
  let p = 1;
  if (lv.cart > 0) p = 2; if (lv.helper > 0) p = 3; if (lv.belt > 0) p = 4; if (lv.arm > 0) p = 5; if (lv.pulley > 0) p = 6; if (lv.drones > 0 || lv.spider > 0) p = 7;
  return p;
}

/* ---------- derived stats (shared by game + sim) ---------- */
export function stats(lvIn) {
  const lv = Object.assign(defaultLevels(), lvIn || {});
  const L = id => UPG[id].lv[Math.min(lv[id], maxLevel(id))];
  const hands = L('gloves'), cart = L('cart');
  const walk = L('shoes') * (cart > 0 ? PLAYER.cartSpeedMul : 1);
  const grab = L('grip');
  const carry = hands + cart;
  const trip = 2 * PLAYER.walkDist / walk + carry * (grab + PLAYER.aimOverhead + PLAYER.throwInterval);
  const manual = PLAYER.efficiency * carry / trip;
  const auto =
    L('helper') * UPG.helper.rate * L('helperCart') +
    L('belt') * UPG.belt.rate * L('beltSpeed') +
    L('arm') * UPG.arm.rate * L('armSpeed') +
    L('pulley') * UPG.pulley.rate * L('magnet') +
    L('drones') * UPG.drones.rate * L('droneSpeed') +
    L('spider') * UPG.spider.rate * L('spiderBoost');
  const veh = VEHICLES[L('vehicle')], bays = L('bays');
  const prod = manual + auto;
  // a vehicle away is lost loading time unless another bay covers it
  // production is shared between the bays; each bay loses `away` seconds per vehicle
  const vehCap = bays * veh.cap / (veh.cap / Math.max(prod / bays, 1e-9) + veh.away);
  const rate = Math.min(prod, vehCap);
  return { hands, cart, carry, walk, grab, manual, auto, prod, rate, veh, bays, vehLimited: vehCap < prod };
}

// small milestones for the HUD banner + the timeline
export const MILESTONES = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000, 300000, 400000, 500000, 600000, 700000, 750000, 800000, 850000, 900000, 950000, 990000, 1000000];
