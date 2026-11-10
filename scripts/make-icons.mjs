// Sinh icon PWA từ một SVG (nền tối #0E0B08, mặt trời + ngôi nhà cam #E8833A như mockup).
// Chạy: node scripts/make-icons.mjs   -> public/icons/*.png
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const OUT = path.resolve('public/icons')
mkdirSync(OUT, { recursive: true })

/** `scale` thu nhỏ phần hình về giữa ảnh: 1 cho icon thường, ~0.62 cho maskable (vùng an toàn 80% đường kính). */
const svg = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="halo" cx="256" cy="256" r="230" gradientUnits="userSpaceOnUse">
      <stop offset="0.35" stop-color="#E8833A" stop-opacity="0.35"/>
      <stop offset="0.65" stop-color="#E8833A" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#E8833A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="#0E0B08"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="230" fill="url(#halo)"/>
    <circle cx="256" cy="256" r="150" fill="#E8833A" fill-opacity="0.2"/>
    <path d="M256 128 L384 238 V372 a14 14 0 0 1 -14 14 H142 a14 14 0 0 1 -14 -14 V238 Z" fill="#E8833A" stroke="#E8833A" stroke-width="20" stroke-linejoin="round"/>
    <rect x="224" y="288" width="64" height="98" rx="10" fill="#0E0B08"/>
  </g>
</svg>`

const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.66],
  ['apple-touch-icon.png', 180, 1],
]
for (const [name, size, scale] of targets) {
  await sharp(Buffer.from(svg(scale))).resize(size, size).png().toFile(path.join(OUT, name))
  console.log('ghi', name)
}
