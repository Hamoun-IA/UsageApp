#!/usr/bin/env node
'use strict';

// Derives the 4 tray icon variants from build/icon.png.
//   - tray-normal.png       (16×16, plain downsample)
//   - tray-normal@2x.png    (32×32, plain downsample)
//   - tray-critical.png     (16×16, with red dot bottom-right)
//   - tray-critical@2x.png  (32×32, with red dot bottom-right)
//
// Run after replacing build/icon.png with a new master icon. Output files
// are checked in; this script doesn't run at build time.

const fs = require('node:fs');
const path = require('node:path');

const buildDir = path.join(__dirname, '..', 'build');
const sourceIconPath = path.join(buildDir, 'icon.png');

const DOT_R = 220, DOT_G = 38, DOT_B = 38, DOT_A = 255; // #dc2626

async function main() {
  if (!fs.existsSync(sourceIconPath)) {
    console.error(`Missing source icon at ${sourceIconPath}. Drop a 256×256+ PNG there.`);
    process.exit(1);
  }

  const { Jimp } = await import('jimp');
  const source = await Jimp.read(sourceIconPath);
  console.log(`Source: ${source.bitmap.width}×${source.bitmap.height}`);

  const dotColor = ((DOT_R << 24) | (DOT_G << 16) | (DOT_B << 8) | DOT_A) >>> 0;

  const targets = [
    { name: 'tray-normal.png',      size: 16, withDot: false },
    { name: 'tray-normal@2x.png',   size: 32, withDot: false },
    { name: 'tray-critical.png',    size: 16, withDot: true  },
    { name: 'tray-critical@2x.png', size: 32, withDot: true  },
  ];

  for (const t of targets) {
    const img = source.clone().resize({ w: t.size, h: t.size });

    if (t.withDot) {
      const dotSize = Math.max(3, Math.floor(t.size * 0.4));
      const dotX = t.size - dotSize - 1;
      const dotY = t.size - dotSize - 1;
      for (let y = dotY; y < dotY + dotSize; y++) {
        for (let x = dotX; x < dotX + dotSize; x++) {
          img.setPixelColor(dotColor, x, y);
        }
      }
    }

    const outPath = path.join(buildDir, t.name);
    await img.write(outPath);
    const buf = fs.readFileSync(outPath);
    console.log(`Wrote ${outPath} (${buf.length} bytes)`);
  }
}

main().catch((e) => { console.error('Failed:', e); process.exit(1); });
