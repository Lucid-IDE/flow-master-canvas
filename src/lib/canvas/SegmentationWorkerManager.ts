/**
 * SegmentationWorkerManager
 *
 * Manages the Web Worker for off-main-thread flood fill.
 * Provides a promise-based API with automatic cancellation.
 *
 * Dual-resolution flow:
 *   1. requestProxyPreview() - instant low-res result (<5ms)
 *   2. requestFullFill() - pixel-perfect result (runs in parallel)
 *   3. On mouse move, cancels in-flight requests automatically
 */

type FillResult = {
  mask: Uint8ClampedArray;
  bounds: { x: number; y: number; width: number; height: number };
  pixelCount: number;
  processingTime: number;
};

type ProxyFillResult = FillResult & {
  proxyWidth: number;
  proxyHeight: number;
  originalWidth: number;
  originalHeight: number;
};

type PendingRequest = {
  id: string;
  resolve: (result: FillResult | ProxyFillResult) => void;
  reject: (err: Error) => void;
};

// Proxy scale thresholds: images above these sizes get downscaled
const PROXY_THRESHOLD = 512 * 512; // pixels
const PROXY_MAX_DIM = 512; // max proxy dimension

let _idCounter = 0;

export class SegmentationWorkerManager {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private lastRequestId: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    try {
      this.worker = new Worker(
        new URL('../../workers/segmentation.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        const id = msg.id;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);

        if (msg.type === 'fill-result') {
          pending.resolve({
            mask: new Uint8ClampedArray(msg.maskBuffer),
            bounds: msg.bounds,
            pixelCount: msg.pixelCount,
            processingTime: msg.processingTime,
          });
        } else if (msg.type === 'proxy-fill-result') {
          pending.resolve({
            mask: new Uint8ClampedArray(msg.maskBuffer),
            bounds: msg.bounds,
            pixelCount: msg.pixelCount,
            processingTime: msg.processingTime,
            proxyWidth: msg.proxyWidth,
            proxyHeight: msg.proxyHeight,
            originalWidth: msg.originalWidth,
            originalHeight: msg.originalHeight,
          } as ProxyFillResult);
        }
      };

      this.worker.onerror = (err) => {
        console.error('Segmentation worker error:', err);
        // Reject all pending
        for (const [, pending] of this.pending) {
          pending.reject(new Error('Worker error'));
        }
        this.pending.clear();
      };
    } catch (err) {
      console.warn('Web Worker not available, will fallback to main thread:', err);
      this.worker = null;
    }
  }

  get isAvailable(): boolean {
    return this.worker !== null;
  }

  /**
   * Cancel all pending requests and any in-flight computation.
   */
  cancelAll(): void {
    if (this.lastRequestId && this.worker) {
      this.worker.postMessage({ type: 'cancel', id: this.lastRequestId });
    }
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Cancelled'));
    }
    this.pending.clear();
    this.lastRequestId = null;
  }

  /**
   * Full-resolution flood fill in the worker.
   */
  requestFill(
    imageData: ImageData,
    seedX: number,
    seedY: number,
    tolerance: number,
    connectivity: 4 | 8 = 4,
  ): Promise<FillResult> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      // Cancel previous
      this.cancelAll();

      const id = `fill-${++_idCounter}`;
      this.lastRequestId = id;
      this.pending.set(id, { id, resolve, reject });

      // Copy buffer to transfer
      const buffer = imageData.data.buffer.slice(0);
      this.worker.postMessage(
        {
          type: 'fill',
          id,
          imageBuffer: buffer,
          width: imageData.width,
          height: imageData.height,
          seedX,
          seedY,
          tolerance,
          connectivity,
        },
        [buffer],
      );
    });
  }

  /**
   * Low-resolution proxy fill for instant preview.
   * Returns a mask at proxy resolution that should be upscaled on the main thread.
   */
  requestProxyPreview(
    imageData: ImageData,
    seedX: number,
    seedY: number,
    tolerance: number,
    connectivity: 4 | 8 = 4,
  ): Promise<ProxyFillResult> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      // Cancel previous
      this.cancelAll();

      const id = `proxy-${++_idCounter}`;
      this.lastRequestId = id;
      this.pending.set(id, { id, resolve: resolve as any, reject });

      // Calculate proxy scale
      const totalPixels = imageData.width * imageData.height;
      let proxyScale = 1;
      if (totalPixels > PROXY_THRESHOLD) {
        const maxDim = Math.max(imageData.width, imageData.height);
        proxyScale = Math.min(1, PROXY_MAX_DIM / maxDim);
      }

      const buffer = imageData.data.buffer.slice(0);
      this.worker.postMessage(
        {
          type: 'proxy-fill',
          id,
          imageBuffer: buffer,
          width: imageData.width,
          height: imageData.height,
          seedX,
          seedY,
          tolerance,
          connectivity,
          proxyScale,
        },
        [buffer],
      );
    });
  }

  /**
   * Dual-resolution preview: proxy first, then full.
   * Calls onProxy immediately with low-res result, then onFull with final result.
   */
  async requestDualPreview(
    imageData: ImageData,
    seedX: number,
    seedY: number,
    tolerance: number,
    connectivity: 4 | 8,
    onProxy: (mask: Uint8ClampedArray, proxyW: number, proxyH: number, fullW: number, fullH: number) => void,
    onFull: (mask: Uint8ClampedArray) => void,
  ): Promise<void> {
    // For small images, skip proxy and go straight to full
    const totalPixels = imageData.width * imageData.height;
    if (totalPixels <= PROXY_THRESHOLD) {
      try {
        const result = await this.requestFill(imageData, seedX, seedY, tolerance, connectivity);
        onFull(result.mask);
      } catch {
        // Cancelled or error, ignore
      }
      return;
    }

    // Step 1: Proxy fill
    try {
      const proxyResult = await this.requestProxyPreview(
        imageData, seedX, seedY, tolerance, connectivity,
      ) as ProxyFillResult;

      // Deliver proxy result immediately
      onProxy(
        proxyResult.mask,
        proxyResult.proxyWidth,
        proxyResult.proxyHeight,
        proxyResult.originalWidth,
        proxyResult.originalHeight,
      );

      // Step 2: Full fill (re-send the original imageData)
      const fullResult = await this.requestFill(
        imageData, seedX, seedY, tolerance, connectivity,
      );
      onFull(fullResult.mask);
    } catch {
      // Cancelled or error, ignore
    }
  }

  destroy(): void {
    this.cancelAll();
    this.worker?.terminate();
    this.worker = null;
  }
}

// Upscale a proxy mask to full resolution (for immediate display)
export function upscaleProxyMask(
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

// Singleton instance
export const segmentationWorker = new SegmentationWorkerManager();
