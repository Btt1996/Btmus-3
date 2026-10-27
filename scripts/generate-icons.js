import fs from 'fs';
import zlib from 'zlib';

function createPng(width, height, drawFn) {
  // RGBA buffer
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc >>> 0, 8 + len);
  return chunk;
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ 0xffffffff;
}

function brandIconRenderer(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;
  const cx = 0.5;
  const cy = 0.5;
  const dx = nx - cx;
  const dy = ny - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background deep dark gradient with rounded corners
  const cornerRadius = 0.22;
  const inBox = (Math.abs(dx) <= 0.5 - cornerRadius) || (Math.abs(dy) <= 0.5 - cornerRadius) ||
    Math.hypot(Math.max(0, Math.abs(dx) - (0.5 - cornerRadius)), Math.max(0, Math.abs(dy) - (0.5 - cornerRadius))) <= cornerRadius;

  if (!inBox) {
    return [0, 0, 0, 0];
  }

  // Base background: dark charcoal to deep violet
  let r = Math.floor(18 + nx * 10);
  let g = Math.floor(18 + ny * 15);
  let b = Math.floor(28 + (nx + ny) * 25);

  // Vinyl ring highlight
  if (Math.abs(dist - 0.38) < 0.008 || Math.abs(dist - 0.28) < 0.005) {
    r += 30; g += 30; b += 50;
  }

  // Central music note icon (double beamed note)
  // Left head around (0.35, 0.65)
  const dHead1 = Math.hypot((nx - 0.35) * 1.3, (ny - 0.65));
  // Right head around (0.65, 0.58)
  const dHead2 = Math.hypot((nx - 0.65) * 1.3, (ny - 0.58));
  // Left stem x around 0.40, y between 0.32 and 0.65
  const onStem1 = Math.abs(nx - 0.40) < 0.035 && ny >= 0.32 && ny <= 0.65;
  // Right stem x around 0.70, y between 0.26 and 0.58
  const onStem2 = Math.abs(nx - 0.70) < 0.035 && ny >= 0.26 && ny <= 0.58;
  // Beam connecting tops
  const beamY = 0.32 - (nx - 0.40) * 0.2;
  const onBeam = Math.abs(ny - beamY) < 0.045 && nx >= 0.38 && nx <= 0.72;

  if (dHead1 < 0.08 || dHead2 < 0.08 || onStem1 || onStem2 || onBeam) {
    // Vibrant gradient: purple to indigo to pink
    const grad = (nx + (1 - ny)) * 0.5;
    r = Math.floor(139 + grad * 100);
    g = Math.floor(92 + (1 - grad) * 50);
    b = Math.floor(246 - grad * 30);
  }

  return [Math.min(255, r), Math.min(255, g), Math.min(255, b), 255];
}

fs.mkdirSync('./public', { recursive: true });
fs.writeFileSync('./public/pwa-192x192.png', createPng(192, 192, brandIconRenderer));
fs.writeFileSync('./public/pwa-512x512.png', createPng(512, 512, brandIconRenderer));
fs.writeFileSync('./public/pwa-maskable-512x512.png', createPng(512, 512, (x, y, w, h) => {
  // Maskable icon with safe zone
  const p = brandIconRenderer(x, y, w, h);
  // Fill background solid so corners don't get transparent
  if (p[3] === 0) return [15, 15, 22, 255];
  return p;
}));
fs.writeFileSync('./public/apple-touch-icon.png', createPng(180, 180, brandIconRenderer));
console.log('Successfully generated all PWA icons!');
