/**
 * Segmentation Web Worker
 *
 * Runs ALL flood fill computation off the main thread.
 * Supports dual-resolution preview:
 *   1. Low-res proxy fill (~1-5ms) for instant visual feedback
 *   2. Full-res fill for pixel-perfect results
 *
 * Uses Transferable ArrayBuffers for zero-copy message passing.
 */

// ── Message types ────────────────────────────────────────
interface FillRequest {
  type: 'fill';
  id: string;
  imageBuffer: ArrayBuffer;
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  tolerance: number;
  connectivity: 4 | 8;
}

interface ProxyFillRequest {
  type: 'proxy-fill';
  id: string;
  imageBuffer: ArrayBuffer;
  width: number;
  height: number;
  seedX: number;
  seedY: number;
  tolerance: number;
  connectivity: 4 | 8;
  proxyScale: number; // e.g., 0.25 means 1/4 resolution
}

interface CancelRequest {
  type: 'cancel';
  id: string;
}

type WorkerRequest = FillRequest | ProxyFillRequest | CancelRequest;

interface FillResponse {
  type: 'fill-result';
  id: string;
  maskBuffer: ArrayBuffer;
  bounds: { x: number; y: number; width: number; height: number };
  pixelCount: number;
  processingTime: number;
}

interface ProxyFillResponse {
  type: 'proxy-fill-result';
  id: string;
  maskBuffer: ArrayBuffer; // low-res mask
  proxyWidth: number;
  proxyHeight: number;
  originalWidth: number;
  originalHeight: number;
  bounds: { x: number; y: number; width: number; height: number };
  pixelCount: number;
  processingTime: number;
}

type WorkerResponse = FillResponse | ProxyFillResponse;

// ── Active request tracking for cancellation ─────────────
let activeRequestId: string | null = null;

// ── Core flood fill (scanline, very fast) ────────────────
function scanlineFill(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  connectivity: 4 | 8,
): { mask: Uint8ClampedArray; bounds: { x: number; y: number; width: number; height: number }; pixelCount: number } {
  const mask = new Uint8ClampedArray(w * h);
  const totalPixels = w * h;

  if (seedX < 0 || seedX >= w || seedY < 0 || seedY >= h) {
    return { mask, bounds: { x: 0, y: 0, width: 0, height: 0 }, pixelCount: 0 };
  }

  const seedIdx = (seedY * w + seedX) * 4;
  const sr = data[seedIdx];
  const sg = data[seedIdx + 1];
  const sb = data[seedIdx + 2];
  const sa = data[seedIdx + 3];
  const tolSq = tolerance * tolerance;

  let minX = seedX, maxX = seedX, minY = seedY, maxY = seedY;
  let pixelCount = 0;

  // Inline color distance
  const matches = (idx: number): boolean => {
    const off = idx * 4;
    const dr = data[off] - sr;
    const dg = data[off + 1] - sg;
    const db = data[off + 2] - sb;
    const da = data[off + 3] - sa;
    return (dr * dr + dg * dg + db * db + da * da) <= tolSq;
  };

  // Scanline stack
  const stack: [number, number, number, number][] = []; // [x1, x2, y, dy]
  
  // Initial scanline
  let lx = seedX;
  while (lx > 0 && matches(seedY * w + lx - 1)) lx--;
  let rx = seedX;
  while (rx < w - 1 && matches(seedY * w + rx + 1)) rx++;

  for (let x = lx; x <= rx; x++) {
    const idx = seedY * w + x;
    mask[idx] = 255;
    pixelCount++;
  }
  if (lx < minX) minX = lx;
  if (rx > maxX) maxX = rx;

  if (seedY > 0) stack.push([lx, rx, seedY, -1]);
  if (seedY < h - 1) stack.push([lx, rx, seedY, 1]);

  while (stack.length > 0) {
    const [x1, x2, py, dy] = stack.pop()!;
    const y = py + dy;
    if (y < 0 || y >= h) continue;

    let x = x1;
    while (x <= x2) {
      // Skip already visited or non-matching
      const idx = y * w + x;
      if (mask[idx] || !matches(idx)) {
        x++;
        continue;
      }

      // Found start of new span
      let sl = x;
      while (sl > 0 && !mask[y * w + sl - 1] && matches(y * w + sl - 1)) sl--;
      let sr2 = x;
      while (sr2 < w - 1 && !mask[y * w + sr2 + 1] && matches(y * w + sr2 + 1)) sr2++;

      // Fill span
      for (let fx = sl; fx <= sr2; fx++) {
        mask[y * w + fx] = 255;
        pixelCount++;
      }

      if (sl < minX) minX = sl;
      if (sr2 > maxX) maxX = sr2;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // Push children
      if (y + dy >= 0 && y + dy < h) stack.push([sl, sr2, y, dy]);
      // Also scan opposite direction for overhangs
      if (sl < x1 && y - dy >= 0 && y - dy < h) stack.push([sl, x1 - 1, y, -dy]);
      if (sr2 > x2 && y - dy >= 0 && y - dy < h) stack.push([x2 + 1, sr2, y, -dy]);

      x = sr2 + 1;
    }

    // 8-connectivity: also check diagonal neighbors
    if (connectivity === 8) {
      // Check pixels just outside the parent span's x range
      for (const checkX of [x1 - 1, x2 + 1]) {
        if (checkX >= 0 && checkX < w) {
          const idx = y * w + checkX;
          if (!mask[idx] && matches(idx)) {
            let sl = checkX;
            while (sl > 0 && !mask[y * w + sl - 1] && matches(y * w + sl - 1)) sl--;
            let sr2 = checkX;
            while (sr2 < w - 1 && !mask[y * w + sr2 + 1] && matches(y * w + sr2 + 1)) sr2++;

            for (let fx = sl; fx <= sr2; fx++) {
              mask[y * w + fx] = 255;
              pixelCount++;
            }

            if (sl < minX) minX = sl;
            if (sr2 > maxX) maxX = sr2;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            if (y + dy >= 0 && y + dy < h) stack.push([sl, sr2, y, dy]);
            if (y - dy >= 0 && y - dy < h) stack.push([sl, sr2, y, -dy]);
          }
        }
      }
    }
  }

  return {
    mask,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    pixelCount,
  };
}

// ── Downscale image for proxy fill ───────────────────────
function downscaleImageData(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  scale: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const out = new Uint8ClampedArray(nw * nh * 4);

  const xRatio = w / nw;
  const yRatio = h / nh;

  for (let y = 0; y < nh; y++) {
    const sy = Math.floor(y * yRatio);
    for (let x = 0; x < nw; x++) {
      const sx = Math.floor(x * xRatio);
      const si = (sy * w + sx) * 4;
      const di = (y * nw + x) * 4;
      out[di]     = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }

  return { data: out, width: nw, height: nh };
}

// ── Upscale mask from proxy resolution to full resolution ──
function upscaleMask(
  mask: Uint8ClampedArray,
  proxyW: number,
  proxyH: number,
  fullW: number,
  fullH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(fullW * fullH);
  const xRatio = proxyW / fullW;
  const yRatio = proxyH / fullH;

  for (let y = 0; y < fullH; y++) {
    const sy = Math.min(proxyH - 1, Math.floor(y * yRatio));
    for (let x = 0; x < fullW; x++) {
      const sx = Math.min(proxyW - 1, Math.floor(x * xRatio));
      out[y * fullW + x] = mask[sy * proxyW + sx];
    }
  }

  return out;
}

// ── Message handler ──────────────────────────────────────
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    if (activeRequestId === msg.id) {
      activeRequestId = null;
    }
    return;
  }

  if (msg.type === 'fill') {
    activeRequestId = msg.id;
    const start = performance.now();

    const data = new Uint8ClampedArray(msg.imageBuffer);
    const result = scanlineFill(
      data, msg.width, msg.height,
      msg.seedX, msg.seedY,
      msg.tolerance, msg.connectivity,
    );

    // Check if cancelled
    if (activeRequestId !== msg.id) return;

    const elapsed = performance.now() - start;
    const maskBuffer = result.mask.buffer;

    const response: FillResponse = {
      type: 'fill-result',
      id: msg.id,
      maskBuffer,
      bounds: result.bounds,
      pixelCount: result.pixelCount,
      processingTime: elapsed,
    };

    // Transfer the buffer (zero-copy)
    (self as any).postMessage(response, [maskBuffer]);
    activeRequestId = null;
  }

  if (msg.type === 'proxy-fill') {
    activeRequestId = msg.id;
    const start = performance.now();

    const fullData = new Uint8ClampedArray(msg.imageBuffer);
    const scale = msg.proxyScale;

    // Downscale
    const proxy = downscaleImageData(fullData, msg.width, msg.height, scale);

    // Map seed to proxy coordinates
    const proxySeedX = Math.min(proxy.width - 1, Math.round(msg.seedX * scale));
    const proxySeedY = Math.min(proxy.height - 1, Math.round(msg.seedY * scale));

    // Run fill on proxy
    const result = scanlineFill(
      proxy.data, proxy.width, proxy.height,
      proxySeedX, proxySeedY,
      msg.tolerance, msg.connectivity,
    );

    if (activeRequestId !== msg.id) return;

    const elapsed = performance.now() - start;
    const maskBuffer = result.mask.buffer;

    const response: ProxyFillResponse = {
      type: 'proxy-fill-result',
      id: msg.id,
      maskBuffer,
      proxyWidth: proxy.width,
      proxyHeight: proxy.height,
      originalWidth: msg.width,
      originalHeight: msg.height,
      bounds: {
        x: Math.floor(result.bounds.x / scale),
        y: Math.floor(result.bounds.y / scale),
        width: Math.ceil(result.bounds.width / scale),
        height: Math.ceil(result.bounds.height / scale),
      },
      pixelCount: result.pixelCount,
      processingTime: elapsed,
    };

    (self as any).postMessage(response, [maskBuffer]);
    activeRequestId = null;
  }
};
