// Generates the PWA icons from the logo in public/images. Run: npm run brand
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { path } from './lib/common';

const ICONS = path('public/icons');
mkdirSync(ICONS, { recursive: true });
const PINK = '#FF62B5';
const source = path('public/images/LB_full.svg');

async function icon(file: string, size: number, inner: number) {
  const art = await sharp(source, { density: 300 }).resize({ width: Math.round(size * inner), height: Math.round(size * inner), fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: PINK } }).composite([{ input: art, gravity: 'center' }]).png().toFile(`${ICONS}/${file}`);
}

await icon('icon-192.png', 192, 0.94);
await icon('icon-512.png', 512, 0.94);
await icon('icon-maskable-512.png', 512, 0.72);
await icon('apple-touch-icon.png', 180, 0.94);
console.log('Icons built.');
