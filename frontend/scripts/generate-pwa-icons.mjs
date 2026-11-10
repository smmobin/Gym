/**
 * Rasterize brand mark into PWA / touch icons.
 * Maskable = full-bleed gradient (no rounded plate) so Android masks cleanly.
 * "any" icons also full-bleed; OS applies its own squircle/circle.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'images', 'brand')

/** Geometric G paths from logo-mark.svg, in a 256×256 design space. */
const G_PATHS = `
  <g
    fill="none"
    stroke="#042428"
    stroke-width="28"
    stroke-linecap="round"
    stroke-linejoin="round"
    transform="translate(128 128) scale(SCALE) translate(-128 -128)"
  >
    <path d="M178 90 A 56 56 0 1 0 178 166"/>
    <path d="M124 128 H186"/>
    <path d="M186 128 V162"/>
  </g>
`

/**
 * @param {{ size: number, gScale: number, roundedUi?: boolean }} opts
 * roundedUi: website mark plate (rx); never for maskable / launcher icons.
 */
function brandSvg({ size, gScale, roundedUi = false }) {
  const rx = roundedUi ? Math.round(size * (56 / 256)) : 0
  const g = G_PATHS.replace('SCALE', String(gScale))
  // Map 256 design space → size via viewBox scale on a nested group.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="ocean" x1="28" y1="20" x2="228" y2="236" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3EC7C2"/>
      <stop offset="0.55" stop-color="#2AA8C4"/>
      <stop offset="1" stop-color="#1F8FBF"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="${rx}" fill="url(#ocean)"/>
  ${g}
</svg>`
}

async function writePng(relName, svg) {
  const abs = path.join(outDir, relName)
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  writeFileSync(abs, png)
  return abs
}

async function main() {
  // Launcher "any": full-bleed square, G a bit larger (OS may not crop as hard).
  await writePng('pwa-192.png', brandSvg({ size: 192, gScale: 0.92 }))
  await writePng('pwa-512.png', brandSvg({ size: 512, gScale: 0.92 }))
  // Maskable: full-bleed + G inside ~80% safe zone (scale down).
  await writePng('pwa-maskable-512.png', brandSvg({ size: 512, gScale: 0.72 }))
  // iOS home screen prefers opaque full-bleed.
  await writePng('apple-touch-icon.png', brandSvg({ size: 180, gScale: 0.88 }))
  // Keep logo-mark.png as rounded plate for favicon / general use.
  await writePng('logo-mark.png', brandSvg({ size: 512, gScale: 1, roundedUi: true }))

  console.log('Wrote PWA + touch icons to', outDir)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
