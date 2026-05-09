#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const FG = [229, 231, 235, 255];   // #e5e7eb
const DOT = [220, 38, 38, 255];     // #dc2626

function makeIcon({ size, withDot }) {
  const png = new PNG({ width: size, height: size });

  const margin = Math.max(1, Math.floor(size * 0.15));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) * 4;
      const inside = x >= margin && x < size - margin && y >= margin && y < size - margin;
      if (inside) {
        png.data[i]     = FG[0];
        png.data[i + 1] = FG[1];
        png.data[i + 2] = FG[2];
        png.data[i + 3] = FG[3];
      } else {
        png.data[i + 3] = 0;
      }
    }
  }

  const channelTop = margin + Math.floor(size * 0.2);
  const channelBottom = size - margin - Math.floor(size * 0.2);
  const channelInner = Math.max(1, Math.floor(size * 0.15));

  for (let y = channelTop; y < channelBottom; y++) {
    for (let x = margin + channelInner; x < size - margin - channelInner; x++) {
      const i = (size * y + x) * 4;
      png.data[i + 3] = 0;
    }
  }

  if (withDot) {
    const dotSize = Math.max(3, Math.floor(size * 0.4));
    const dotX = size - dotSize - 1;
    const dotY = size - dotSize - 1;
    for (let y = dotY; y < dotY + dotSize; y++) {
      for (let x = dotX; x < dotX + dotSize; x++) {
        const i = (size * y + x) * 4;
        png.data[i]     = DOT[0];
        png.data[i + 1] = DOT[1];
        png.data[i + 2] = DOT[2];
        png.data[i + 3] = DOT[3];
      }
    }
  }

  return PNG.sync.write(png);
}

const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

const targets = [
  { name: 'tray-normal.png',     size: 16,  withDot: false },
  { name: 'tray-normal@2x.png',  size: 32,  withDot: false },
  { name: 'tray-critical.png',   size: 16,  withDot: true  },
  { name: 'tray-critical@2x.png',size: 32,  withDot: true  },
  // App icon used by electron-builder (Windows .exe / NSIS installer / portable).
  // 256×256 is the size electron-builder expects when no .ico is provided.
  { name: 'icon.png',            size: 256, withDot: false },
];

for (const t of targets) {
  const buf = makeIcon({ size: t.size, withDot: t.withDot });
  const p = path.join(buildDir, t.name);
  fs.writeFileSync(p, buf);
  console.log(`Wrote ${p} (${buf.length} bytes)`);
}
