// "Un Milione di Gomme": all economy + progression data in ONE place.
// Imported by the game (browser, ES module) and by the simulator (node sim/economy.js).
// Costs in COSTS were calibrated with `node sim/economy.js --tune` and then frozen here.
import { braidLayout } from './braid.js';

export const VERSION = '1.0.4';
export const TOTAL_TIRES = 1000000;

/* ---------- tires ---------- */
// id 0..3 = sizes, 4 = gold (a 16" painted gold). value in euro paid when the tire lands in the vehicle.
export const TIRES = [
  { id: 0, key: 'r14', name: '14"', value: 1.0, p: 0.40, R: 0.29, ri: 0.185, w: 0.175 },
  { id: 1, key: 'r16', name: '16"', value: 1.5, p: 0.35, R: 0.315, ri: 0.205, w: 0.2 },
  { id: 2, key: 'r18', name: '18"', value: 2.0, p: 0.205, R: 0.34, ri: 0.228, w: 0.225 },
  { id: 3, key: 'scooter', name: 'Scooter', value: 0.6, p: 0.045, R: 0.2, ri: 0.12, w: 0.105, half: true },
  { id: 4, key: 'gold', name: "d'oro", value: 30, p: 0.013, R: 0.315, ri: 0.205, w: 0.2, gold: true },
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
  // v1.0.3 "Mani rapide" (save key stays 'grip'): lv = pause between two grabs, throw = pause between two throws; at the top level both are 0 = one tire per click, as fast as you click
  { id: 'grip', phase: 1, icon: '💪', name: 'Mani rapide', desc: 'Prendi le gomme dalla montagna e le lanci nel mezzo più in fretta. Al massimo livello è immediato: una gomma a ogni clic, alla velocità che vuoi.', unit: 's tra due prese', lv: [0.9, 0.55, 0.25, 0], throw: [0.4, 0.25, 0.12, 0] },
  // phase 2
  { id: 'cart', phase: 2, icon: 'cart', machine: true, name: 'Carrello portagomme', desc: 'Il carrello portagomme in tubolare d\'acciaio: le gomme impilate una sull\'altra. Parte da 4 gomme e arriva a 10.', unit: 'gomme', lv: [0, 4, 6, 8, 10] },
  // phase 3 (not in the first playable slice)
  { id: 'helper', phase: 3, icon: '👷', machine: true, name: 'Aiutanti', desc: 'Beppino e la sua squadra. Da solo porta le gomme a mano; dal secondo in poi si mettono in fila e se le passano facendole rotolare.', unit: 'aiutanti', lv: [0, 1, 2, 3, 4, 5], rate: 0.35 },
  { id: 'helperCart', phase: 3, icon: '👟', name: 'Ritmo della squadra', desc: 'Scarpe e guanti nuovi per gli aiutanti: camminano, rotolano e lanciano più svelti.', unit: 'x ritmo', lv: [1, 2.2] },
  // phase 4
  { id: 'belt', phase: 4, icon: '➰', machine: true, name: 'Nastri trasportatori', desc: 'Sblocca la costruzione: nastri dritti, curve e il caricatore che pesca dalla montagna. Ogni livello = un caricatore in più.', unit: 'caricatori', lv: [0, 1, 2, 3, 4], rate: 2.0 },
  { id: 'beltSpeed', phase: 4, icon: '⏩', name: 'Motori dei nastri', desc: 'Nastri e caricatori più veloci.', unit: 'x velocità', lv: [1, 1.5, 2.2] },
  // phase 5
  { id: 'arm', phase: 5, icon: '🦾', machine: true, name: 'Bracci meccanici', desc: 'Bracci idraulici arancioni da piazzare col blueprint ai piedi della montagna: pescano le gomme e le girano sul nastro, nel mezzo o nello stoccaggio. Ogni livello = un braccio in più.', unit: 'bracci', lv: [0, 1, 2, 3, 4], rate: 5 },
  { id: 'armSpeed', phase: 5, icon: '⚙️', name: 'Servomotori', desc: 'Pompe e servomotori nuovi: i bracci girano e afferrano più svelti.', unit: 'x velocità', lv: [1.6, 2.4] },
  { id: 'armGrab', phase: 5, icon: '🗜️', name: 'Pinza multipla', desc: 'Una pinza più lunga: ogni braccio infila più gomme a ogni presa.', unit: 'gomme a presa', lv: [2, 3, 5] },
  // phase 6
  { id: 'pulley', phase: 6, icon: '🧲', machine: true, name: 'Carrucola magnetica', desc: 'Due piloni d\'acciaio e un cavo teso sopra il piazzale: il carrello corre sul cavo e l\'elettromagnete solleva un grappolo di gomme grazie all\'acciaio che hanno dentro. Ogni livello = una linea in più.', unit: 'linee', lv: [0, 1, 2, 3, 4], rate: 10 },
  { id: 'magnet', phase: 6, icon: '🧲', name: 'Elettromagnete potenziato', desc: 'Bobina di rame più grossa: il magnete tira su più gomme a ogni presa.', unit: 'gomme a presa', lv: [12, 30, 60, 90] },
  { id: 'cableSpeed', phase: 6, icon: '⏩', name: 'Motore del carrello', desc: 'Un motore più spinto: il carrello corre sul cavo e il paranco cala più svelto.', unit: 'x velocità', lv: [1.5, 2.3] },
  { id: 'fascioni', phase: 6, icon: '⭕', machine: true, name: 'Macchina dei fascioni', desc: 'Due dischi d\'acciaio tagliano i fianchi delle gomme: restano i fascioni, che infili a mano uno dentro l\'altro (tutun tutun) in pile da 10 per il fornitore.', unit: '', lv: [0, 1] },
  { id: 'shredder', phase: 6, icon: '⚙️', machine: true, name: 'Trituratore', desc: 'Bialbero da piazzare col blueprint: macina le gomme in granulato di gomma, venduto a peso (più di quanto vale la gomma intera). Ogni livello = un trituratore in più.', unit: 'trituratori', lv: [0, 1, 2] },
  // phase 7
  { id: 'drones', phase: 7, icon: '🚁', machine: true, name: 'Flotta di droni', desc: 'Quadricotteri industriali che decollano dalla piazzola DRONI, pescano le gomme dalla montagna e le portano al mezzo, al trituratore o alla macchina dei fascioni. Ogni livello = 2 droni in più (fino a 16).', unit: 'droni', lv: [0, 2, 4, 6, 8, 10, 12, 14, 16], rate: 3 },
  { id: 'droneSpeed', phase: 7, icon: '🔋', name: 'Batterie dei droni', desc: 'Batterie e motori nuovi: i droni volano più svelti.', unit: 'x velocità', lv: [1.8, 2.6] },
  { id: 'droneLift', phase: 7, icon: '🪝', name: 'Gancio a grappolo', desc: 'Un gancio sotto la pancia più robusto: ogni drone porta una pila di 8 gomme alla volta invece di 4.', unit: 'gomme per volo', lv: [4, 8] },
  { id: 'spider', phase: 7, icon: '🕷️', machine: true, name: 'Braccio a ragno', desc: 'L\'evoluzione dei bracci: una torretta esagonale con quattro braccia arancioni che lavorano insieme e svuotano la montagna a ritmo sostenuto. Si piazza col blueprint (tasto 8). Ogni livello ne aggiunge un altro (fino a 4).', unit: 'ragni', lv: [0, 1, 2, 3, 4], rate: 26 },
  { id: 'spiderBoost', phase: 7, icon: '🔥', name: 'Ragno turbo', desc: 'Pompe idrauliche maggiorate: le quattro braccia vanno molto più svelte e prendono 4 gomme a presa.', unit: 'x velocità', lv: [1, 1.6, 2.2] },
  // vehicles + loading bays
  { id: 'vehicle', phase: 3, icon: '🚚', machine: true, name: 'Mezzi più grandi', desc: 'Furgone grande, poi il camion e infine il bilico: più gomme a viaggio e un bonus di consegna più grosso.', unit: '', lv: [0, 1, 2, 3] },
  { id: 'bays', phase: 4, icon: '🅿️', name: 'Piazzole di carico', desc: 'Una seconda piazzola accanto al mezzo: mentre il mezzo è via a scaricare, le gomme si accumulano lì e nessuna macchina resta ferma.', unit: 'piazzole', lv: [1, 2, 3, 4] },
  // v1.0.2: more money for every tire
  { id: 'trust', phase: 3, icon: '🤝', name: 'Cliente di fiducia', desc: 'Lo smaltitore ti conosce ormai: ti paga di più per ogni gomma che consegni, triturata o stoccata (e anche il bonus dei mezzi).', unit: 'x paga', lv: [1, 1.25, 1.5, 1.8, 2.2, 2.7, 3.5] },
];
export const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// The designed order of purchases (what a normal player buys, and roughly when, in minutes).
// The simulator buys in this order; `--tune` derives the costs from the target minute.
export const PLAN = [
  ['shoes', 1.7], ['gloves', 3.4], ['grip', 5.1], ['shoes', 6.8], ['grip', 8.5], ['cart', 10.8],
  ['shoes', 13.1], ['cart', 15.4], ['grip', 17.7], ['cart', 20], ['cart', 22.3], ['helper', 25.1],
  ['trust', 27.9], ['helper', 30.7], ['vehicle', 33.5], ['helper', 36.3], ['helperCart', 39.1], ['helper', 41.9],
  ['belt', 44.7], ['belt', 47.7], ['bays', 50.7], ['beltSpeed', 53.7], ['belt', 56.7], ['trust', 59.7],
  ['belt', 62.7], ['beltSpeed', 65.7], ['arm', 68.7], ['vehicle', 71.7], ['arm', 74.7], ['armSpeed', 77.7],
  ['arm', 80.7], ['armGrab', 83.7], ['arm', 86.7], ['bays', 89.7], ['armGrab', 92.7], ['pulley', 95.7],
  ['magnet', 98.7], ['fascioni', 101.7], ['pulley', 104.7], ['trust', 107.7], ['shredder', 110.7], ['cableSpeed', 113.7],
  ['pulley', 116.7], ['magnet', 119.7], ['vehicle', 122.7], ['pulley', 125.7], ['shredder', 128.7], ['drones', 133.7],
  ['drones', 138.7], ['droneLift', 143.7], ['drones', 148.7], ['spider', 153.7], ['droneSpeed', 158.7], ['drones', 163.7],
  ['spiderBoost', 168.7], ['bays', 173.7], ['spider', 178.7], ['drones', 183.7], ['magnet', 188.7], ['helper', 193.7],
  ['trust', 204.7], ['drones', 215.7], ['spider', 226.7], ['spiderBoost', 237.7], ['drones', 248.7], ['trust', 259.7],
  ['spider', 270.7], ['drones', 281.7], ['trust', 292.7],
];

// COSTS: frozen output of `node sim/economy.js --tune` (v1.0.2 rebalance: every upgrade is in the plan, ~5 h to the millionth tire).
export const COSTS = {"shoes":[10,25,70],"gloves":[15],"grip":[28,30,95],"cart":[55,85,90,95],"helper":[120,220,300,550,85000],"trust":[180,4000,18000,180000,280000,380000],"vehicle":[280,6000,30000],"helperCart":[350],"belt":[600,1500,4500,4500],"bays":[2000,15000,70000],"beltSpeed":[3000,5500],"arm":[6000,12000,14000,15000],"armSpeed":[12000],"armGrab":[12000,14000],"pulley":[16000,16000,22000,30000],"magnet":[16000,22000,80000],"fascioni":[16000],"shredder":[22000,35000],"cableSpeed":[22000],"drones":[55000,55000,60000,70000,75000,250000,280000,350000],"droneLift":[60000],"spider":[60000,75000,250000,300000],"droneSpeed":[70000],"spiderBoost":[70000,250000]};

// pause between two throws for a Mani rapide level (0 at the top level: throw at click speed)
export function throwGap(level = 0) { const t = UPG.grip.throw; return t[Math.max(0, Math.min(t.length - 1, level | 0))]; }
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
  const trip = 2 * PLAYER.walkDist / walk + carry * (grab + PLAYER.aimOverhead + throwGap(lv.grip));
  const manual = PLAYER.efficiency * carry / trip;
  // v1.0.2: machine rates measured in the real game (test calibration, 60 s runs with the machine well placed), tires/s
  const RATE = {
    helper: [0, 0.17, 0.38, 0.55, 0.78, 0.97],    // floor(n/2) rolling pairs + a hand carrier when n is odd (measured)
    helperCart: [1, 1.85],
    belt: 2.85, beltSpeed: [1, 1.4, 1.75],       // per intake (belt speed raises the line's capacity)
    arm: 0.83, armSpeed: [1, 1.4], armGrab: [1, 1.2, 1.45],
    pulley: [1.2, 2.5, 5.0, 7.0], cableSpeed: [1, 1.2], // per line, by magnet level
    drone: [0.53, 1.07], droneSpeed: [1, 1.3],   // per drone, by hook level
    spider: [2.55, 3.67, 4.6],                   // per spider, by turbo level (with fast belts)
  };
  const lvl = id => Math.min(lv[id], maxLevel(id));
  const auto =
    RATE.helper[lvl('helper')] * RATE.helperCart[lvl('helperCart')] +
    L('belt') * RATE.belt * RATE.beltSpeed[lvl('beltSpeed')] +
    L('arm') * RATE.arm * RATE.armSpeed[lvl('armSpeed')] * RATE.armGrab[lvl('armGrab')] +
    L('pulley') * RATE.pulley[lvl('magnet')] * RATE.cableSpeed[lvl('cableSpeed')] +
    L('drones') * RATE.drone[lvl('droneLift')] * RATE.droneSpeed[lvl('droneSpeed')] +
    L('spider') * RATE.spider[lvl('spiderBoost')];
  const veh = VEHICLES[L('vehicle')], bays = L('bays');
  const prod = manual + auto;
  // a vehicle away is lost loading time unless another bay covers it
  // production is shared between the bays; each bay loses `away` seconds per vehicle
  // v1.0.2: with a 2nd bay the tires pile up there while the vehicle is away: no loss as long as that buffer is big enough
  const vehCap = bays > 1 && prod * veh.away <= (bays - 1) * veh.cap ? Infinity : bays * veh.cap / (veh.cap / Math.max(prod / bays, 1e-9) + veh.away);
  const rate = Math.min(prod, vehCap);
  return { hands, cart, carry, walk, grab, manual, auto, prod, rate, veh, bays, vehLimited: vehCap < prod, pay: L('trust') };
}

// small milestones for the HUD banner + the timeline
export const MILESTONES = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000, 300000, 400000, 500000, 600000, 700000, 750000, 800000, 850000, 900000, 950000, 990000, 1000000];
