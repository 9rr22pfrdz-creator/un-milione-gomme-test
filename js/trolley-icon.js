// Inline SVG of the upright gommista tire hand-truck (carrello portagomme), used everywhere in the UI.
export function trolleySVG(size = 40, cls = 'trolley-ic') {
  const tire = (y) => `<rect x="25" y="${y}" width="32" height="7.4" rx="3.4" fill="#25282c" stroke="#0e0f11" stroke-width="1"/><rect x="28" y="${y + 2.9}" width="26" height="1.4" rx=".7" fill="#7d838a"/>`;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-label="carrello portagomme" role="img">
<path d="M18.5 54 L18.5 9" stroke="#174a9e" stroke-width="3.2" stroke-linecap="round"/>
${[46.5, 38.5, 30.5, 22.5].map(tire).join('')}
<path d="M22 55 L22 8.5" stroke="#2f7cf0" stroke-width="3.6" stroke-linecap="round"/>
<path d="M22 8.5 L12 3.6" stroke="#2f7cf0" stroke-width="3.4" stroke-linecap="round"/>
<path d="M14.6 4.9 L9.2 2.3" stroke="#111" stroke-width="5" stroke-linecap="round"/>
<path d="M22 20 L25 20 M22 44 L25 44" stroke="#2f7cf0" stroke-width="2.4" stroke-linecap="round"/>
<path d="M22 33.5 Q41 41 58.5 33" fill="none" stroke="#2f7cf0" stroke-width="2.8" stroke-linecap="round"/>
<path d="M22 55.5 Q40 61.5 58 53.5" fill="none" stroke="#2f7cf0" stroke-width="3.2" stroke-linecap="round"/>
<circle cx="19" cy="55" r="7.6" fill="#1b1d20" stroke="#000" stroke-width="1"/><circle cx="19" cy="55" r="3.4" fill="#c9ced4"/><circle cx="19" cy="55" r="1.2" fill="#555"/>
</svg>`;
}
