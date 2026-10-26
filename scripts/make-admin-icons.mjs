/* global Buffer */
// One-off: draws the "Alfaiate Admin" home-screen icon (a green tile with a white A, drawn as paths so no font is needed) into public/. Run: node scripts/make-admin-icons.mjs
import sharp from 'sharp';

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#3d5a33"/>
  <path d="M256 112 L372 400 H328 L302 332 H210 L184 400 H140 Z M224 292 H288 L256 206 Z" fill="#fff" fill-rule="evenodd"/>
  <path d="M120 432 H392" stroke="#8baf7e" stroke-width="14" stroke-linecap="round" stroke-dasharray="26 22"/>
</svg>`;
for (const size of [180, 192, 512])
  await sharp(Buffer.from(svg(size))).png().toFile(`public/admin-icon-${size}.png`);
console.log('written: public/admin-icon-180.png, -192.png, -512.png');
