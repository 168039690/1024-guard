import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';

const shield = `
  <path d="M256 92 L392 140 V246 C392 330 334 390 256 420 C178 390 120 330 120 246 V140 Z"
        fill="#f2b33d" fill-opacity="0.14" stroke="#f2b33d" stroke-width="22" stroke-linejoin="round"/>
  <circle cx="256" cy="232" r="34" fill="#f2b33d"/>
  <path d="M240 250 H272 L282 330 H230 Z" fill="#f2b33d"/>`;

const svg = (rounded) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
  `<rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="#0a0e13"/>${shield}</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', svg(true));

const targets = [
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
];

for (const [name, size, rounded] of targets) {
  const png = new Resvg(svg(rounded), { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`public/icons/${name}`, png);
}
console.log('icons written');
