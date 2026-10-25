'use strict';
// Fun layer: floating background shapes, tap ripples and little celebrations.
// Pure decoration; everything here respects prefers-reduced-motion through CSS.

// a field of soft shapes drifting behind every screen
const FUN_SHAPES = [
  // [kind, left %, top %, size px, colour, drift seconds, delay]
  ['ball', 8, 12, 44, '#ff7a1a', 19, 0], ['star', 84, 8, 30, '#ffbf1f', 15, -4], ['ring', 72, 30, 54, '#7a5cff', 23, -9],
  ['tri', 14, 44, 34, '#ff3f7d', 17, -2], ['plus', 90, 52, 26, '#10b981', 13, -6], ['squig', 6, 72, 60, '#3466ff', 21, -11],
  ['dot', 60, 64, 18, '#ff3f7d', 11, -3], ['star', 34, 88, 24, '#7a5cff', 16, -8], ['ball', 80, 84, 38, '#3466ff', 24, -14],
  ['ring', 40, 20, 26, '#10b981', 18, -5], ['tri', 52, 46, 22, '#ffbf1f', 14, -10], ['plus', 24, 28, 20, '#ff7a1a', 12, -7],
];
const funShape = (k, c) => ({
  ball: `<svg viewBox="0 0 48 48"><ellipse cx="24" cy="24" rx="21" ry="13" transform="rotate(-35 24 24)" fill="${c}"/><g transform="rotate(-35 24 24)" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M16 24h16M19 21v6M23 21v6M27 21v6"/></g></svg>`,
  star: `<svg viewBox="0 0 48 48"><path d="M24 4l5.6 12.4L43 18l-10 9.4L35.6 41 24 34.3 12.4 41 15 27.4 5 18l13.4-1.6z" fill="${c}" stroke="${c}" stroke-width="3" stroke-linejoin="round"/></svg>`,
  ring: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="none" stroke="${c}" stroke-width="7"/></svg>`,
  tri: `<svg viewBox="0 0 48 48"><path d="M24 7l18 32H6z" fill="${c}" stroke="${c}" stroke-width="5" stroke-linejoin="round"/></svg>`,
  plus: `<svg viewBox="0 0 48 48"><path d="M24 8v32M8 24h32" stroke="${c}" stroke-width="9" stroke-linecap="round"/></svg>`,
  squig: `<svg viewBox="0 0 64 24"><path d="M4 12c6-10 10-10 14 0s8 10 14 0 8-10 14 0 8 10 14 0" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/></svg>`,
  dot: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="${c}"/></svg>`,
})[k];
function funLayer() {
  return `<div class="fun-bg" aria-hidden="true">${FUN_SHAPES.map(([k, x, y, s, c, d, dl], i) => `<i class="fs fs${i % 3}" style="left:${x}%;top:${y}%;width:${s}px;animation-duration:${d}s;animation-delay:${dl}s">${funShape(k, c)}</i>`).join('')}</div>`;
}

// tap ripple on every button and card
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn, .lrow, .feature, .cont, .opt, .offer, .call, .pc, .opp, .seg button, .tabbar button, .icon-btn, .chip');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect();
  const s = Math.max(r.width, r.height) * 1.6;
  const rp = document.createElement('span');
  rp.className = 'ripple';
  rp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
  b.classList.add('rp-host');
  b.appendChild(rp);
  setTimeout(() => rp.remove(), 600);
}, { passive: true });

// little burst of shapes from a point (used when you hit a big moment)
function burst(x, y, n) {
  const cols = ['#3466ff', '#7a5cff', '#ff3f7d', '#ffbf1f', '#10b981', '#ff7a1a'];
  const kinds = ['star', 'dot', 'tri', 'plus'];
  for (let i = 0; i < (n || 14); i++) {
    const p = document.createElement('i');
    p.className = 'burst';
    const a = (Math.PI * 2 * i) / (n || 14) + Math.random() * 0.4, dist = 60 + Math.random() * 70;
    p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist}px;--rot:${Math.random() * 540 - 270}deg`;
    p.innerHTML = funShape(kinds[i % kinds.length], cols[i % cols.length]);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}
// tab switches get a tiny pop of shapes from the tab you pressed
document.addEventListener('click', (e) => {
  const t = e.target.closest('.tabbar button');
  if (!t || t.classList.contains('on')) return;
  const r = t.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + 14, 8);
});
