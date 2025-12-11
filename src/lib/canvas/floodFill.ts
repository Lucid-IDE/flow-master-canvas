import { Point, Rectangle, RGBA } from './types';
import { getPixelColor, colorsAreSimilar } from './imageUtils';
import { SegmentEngine, SegmentSettings, Connectivity } from './segmentTypes';

/**
 * Multi-Engine Flood Fill System
 * 
 * Supports multiple algorithms for testing performance:
 * - V6 Wave: Ring BFS with organic expansion
 * - V5 Instant: Complete fill in one go
 * - V4 Scanline: Optimized scanline algorithm
 * - V3 Queue: Standard BFS
 * - V2 Recursive: Simple recursive (stack limited)
 */

export interface FloodFillResult {
  mask: Uint8ClampedArray;
  bounds: Rectangle;
  pixels: number[];
  ringCount: number;
  processingTime: number;
}

export interface FloodFillOptions {
  tolerance: number;
  connectivity: Connectivity;
  timeBudget?: number;
  expansionRate?: number; // rings per frame for V6
}

// ============================================
// V5 INSTANT FILL - Complete in one blocking call
// ============================================
export function instantFloodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
  connectivity: Connectivity = 4
): FloodFillResult {
  const startTime = performance.now();
  const { width, height } = imageData;
  
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return {
      mask: new Uint8ClampedArray(width * height),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      pixels: [],
      ringCount: 0,
      processingTime: 0,
    };
  }
  
  const totalPixels = width * height;
  const mask = new Uint8ClampedArray(totalPixels);
  const visited = new Uint8Array(totalPixels);
  const seedColor = getPixelColor(imageData, startX, startY);
  const pixels: number[] = [];
  
  // Use typed array as queue for speed
  const queue = new Int32Array(totalPixels);
  let queueStart = 0;
  let queueEnd = 0;
  
  const seedIndex = startY * width + startX;
  queue[queueEnd++] = seedIndex;
  visited[seedIndex] = 1;
  
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  
  // Precompute neighbor offsets
  const neighborOffsets = connectivity === 8
    ? [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]
    : [-width, -1, 1, width];
  
  while (queueStart < queueEnd) {
    const index = queue[queueStart++];
    const x = index % width;
    const y = (index / width) | 0;
    
    const color = getPixelColor(imageData, x, y);
    
    if (colorsAreSimilar(color, seedColor, tolerance)) {
      mask[index] = 255;
      pixels.push(index);
      
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      
      // Add neighbors
      for (let i = 0; i < neighborOffsets.length; i++) {
        const nIndex = index + neighborOffsets[i];
        const nx = nIndex % width;
        const ny = (nIndex / width) | 0;
        
        // Bounds check + not visited
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[nIndex]) {
          visited[nIndex] = 1;
          queue[queueEnd++] = nIndex;
        }
      }
    }
  }
  
  return {
    mask,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    pixels,
    ringCount: 1,
    processingTime: performance.now() - startTime,
  };
}

// ============================================
// V4 SCANLINE - Optimized horizontal scanning
// ============================================
export function scanlineFloodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
  connectivity: Connectivity = 4
): FloodFillResult {
  const startTime = performance.now();
  const { width, height } = imageData;
  
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return {
      mask: new Uint8ClampedArray(width * height),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      pixels: [],
      ringCount: 0,
      processingTime: 0,
    };
  }
  
  const totalPixels = width * height;
  const mask = new Uint8ClampedArray(totalPixels);
  const visited = new Uint8Array(totalPixels);
  const seedColor = getPixelColor(imageData, startX, startY);
  const pixels: number[] = [];
  
  // Stack-based scanline [x1, x2, y, dy]
  const stack: number[][] = [[startX, startX, startY, 1], [startX, startX, startY - 1, -1]];
  
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  
  const matchesColor = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = y * width + x;
    if (visited[idx]) return false;
    const color = getPixelColor(imageData, x, y);
    return colorsAreSimilar(color, seedColor, tolerance);
  };
  
  while (stack.length > 0) {
    const [x1, x2, y, dy] = stack.pop()!;
    
    if (y < 0 || y >= height) continue;
    
    let x = x1;
    
    // Extend left
    while (x >= 0 && matchesColor(x, y)) {
      const idx = y * width + x;
      visited[idx] = 1;
      mask[idx] = 255;
      pixels.push(idx);
      
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      
      x--;
    }
    
    const lx = x + 1;
    
    // Extend right from x1
    x = x1 + 1;
    while (x < width && matchesColor(x, y)) {
      const idx = y * width + x;
      visited[idx] = 1;
      mask[idx] = 255;
      pixels.push(idx);
      
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      
      x++;
    }
    
    const rx = x - 1;
    
    // Scan above and below
    for (const [scanY, scanDy] of [[y + dy, dy], [y - dy, -dy]]) {
      if (scanY < 0 || scanY >= height) continue;
      
      let scanX = lx;
      while (scanX <= rx) {
        // Find start of run
        while (scanX <= rx && !matchesColor(scanX, scanY)) {
          scanX++;
        }
        
        if (scanX > rx) break;
        
        const runStart = scanX;
        
        // Find end of run
        while (scanX <= rx && matchesColor(scanX, scanY)) {
          scanX++;
        }
        
        stack.push([runStart, scanX - 1, scanY, scanDy]);
      }
    }
  }
  
  return {
    mask,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    pixels,
    ringCount: 1,
    processingTime: performance.now() - startTime,
  };
}

// ============================================
// V3 QUEUE BFS - Standard queue-based
// ============================================
export function queueFloodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
  connectivity: Connectivity = 4
): FloodFillResult {
  // Same as instant but with standard array (for comparison)
  const startTime = performance.now();
  const { width, height } = imageData;
  
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return {
      mask: new Uint8ClampedArray(width * height),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      pixels: [],
      ringCount: 0,
      processingTime: 0,
    };
  }
  
  const mask = new Uint8ClampedArray(width * height);
  const visited = new Uint8Array(width * height);
  const seedColor = getPixelColor(imageData, startX, startY);
  const pixels: number[] = [];
  
  const queue: number[] = [startY * width + startX];
  visited[queue[0]] = 1;
  
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  let ringCount = 0;
  
  const neighbors = connectivity === 8
    ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
    : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  
  let currentLevel = queue.length;
  let idx = 0;
  
  while (idx < queue.length) {
    if (idx >= currentLevel) {
      ringCount++;
      currentLevel = queue.length;
    }
    
    const index = queue[idx++];
    const x = index % width;
    const y = (index / width) | 0;
    
    const color = getPixelColor(imageData, x, y);
    
    if (colorsAreSimilar(color, seedColor, tolerance)) {
      mask[index] = 255;
      pixels.push(index);
      
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIndex = ny * width + nx;
          if (!visited[nIndex]) {
            visited[nIndex] = 1;
            queue.push(nIndex);
          }
        }
      }
    }
  }
  
  return {
    mask,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    pixels,
    ringCount,
    processingTime: performance.now() - startTime,
  };
}

// ============================================
// V6 WAVE - Ring BFS with time budget (for preview)
// ============================================
export class WaveFloodFill {
  private width = 0;
  private height = 0;
  private imageData: ImageData | null = null;
  private tolerance = 32;
  private connectivity: Connectivity = 4;
  private expansionRate = 5;
  
  private mask: Uint8ClampedArray | null = null;
  private visited: Uint8Array | null = null;
  private queue: Int32Array | null = null;
  private queueStart = 0;
  private queueEnd = 0;
  private seedColor: RGBA | null = null;
  
  private minX = 0;
  private maxX = 0;
  private minY = 0;
  private maxY = 0;
  private acceptedCount = 0;
  private ringNumber = 0;
  private complete = false;
  
  initialize(
    imageData: ImageData,
    seedPoint: Point,
    tolerance: number,
    connectivity: Connectivity = 4,
    expansionRate = 5
  ): boolean {
    this.imageData = imageData;
    this.width = imageData.width;
    this.height = imageData.height;
    this.tolerance = tolerance;
    this.connectivity = connectivity;
    this.expansionRate = expansionRate;
    
    const seedX = Math.floor(seedPoint.x);
    const seedY = Math.floor(seedPoint.y);
    
    if (seedX < 0 || seedX >= this.width || seedY < 0 || seedY >= this.height) {
      return false;
    }
    
    const totalPixels = this.width * this.height;
    this.mask = new Uint8ClampedArray(totalPixels);
    this.visited = new Uint8Array(totalPixels);
    this.queue = new Int32Array(totalPixels);
    
    const seedIndex = seedY * this.width + seedX;
    this.queue[0] = seedIndex;
    this.queueStart = 0;
    this.queueEnd = 1;
    this.visited[seedIndex] = 1;
    
    this.seedColor = getPixelColor(imageData, seedX, seedY);
    
    // Initialize with seed already accepted
    if (colorsAreSimilar(this.seedColor, this.seedColor, tolerance)) {
      this.mask[seedIndex] = 255;
      this.acceptedCount = 1;
    }
    
    this.minX = seedX;
    this.maxX = seedX;
    this.minY = seedY;
    this.maxY = seedY;
    this.ringNumber = 0;
    this.complete = false;
    
    return true;
  }
  
  /**
   * Process multiple rings within time budget
   */
  processFrame(timeBudget: number = 8): { completed: boolean; pixelsProcessed: number } {
    if (!this.imageData || !this.mask || !this.visited || !this.queue || !this.seedColor || this.complete) {
      return { completed: true, pixelsProcessed: 0 };
    }
    
    const startTime = performance.now();
    let pixelsProcessed = 0;
    let ringsProcessed = 0;
    
    const neighborOffsets = this.connectivity === 8
      ? [-this.width - 1, -this.width, -this.width + 1, -1, 1, this.width - 1, this.width, this.width + 1]
      : [-this.width, -1, 1, this.width];
    
    // Process until time budget or expansion rate hit
    while (
      this.queueStart < this.queueEnd && 
      ringsProcessed < this.expansionRate &&
      performance.now() - startTime < timeBudget
    ) {
      const ringEnd = this.queueEnd;
      
      while (this.queueStart < ringEnd) {
        const index = this.queue[this.queueStart++];
        const x = index % this.width;
        const y = (index / this.width) | 0;
        
        const color = getPixelColor(this.imageData!, x, y);
        
        if (colorsAreSimilar(color, this.seedColor!, this.tolerance)) {
          this.mask![index] = 255;
          this.acceptedCount++;
          pixelsProcessed++;
          
          if (x < this.minX) this.minX = x;
          if (x > this.maxX) this.maxX = x;
          if (y < this.minY) this.minY = y;
          if (y > this.maxY) this.maxY = y;
          
          // Add neighbors
          for (let i = 0; i < neighborOffsets.length; i++) {
            const nIndex = index + neighborOffsets[i];
            const nx = nIndex % this.width;
            const ny = (nIndex / this.width) | 0;
            
            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height && !this.visited![nIndex]) {
              this.visited![nIndex] = 1;
              this.queue![this.queueEnd++] = nIndex;
            }
          }
        }
      }
      
      this.ringNumber++;
      ringsProcessed++;
    }
    
    if (this.queueStart >= this.queueEnd) {
      this.complete = true;
    }
    
    return { completed: this.complete, pixelsProcessed };
  }
  
  getMask(): Uint8ClampedArray | null { return this.mask; }
  getBounds(): Rectangle { 
    return { x: this.minX, y: this.minY, width: this.maxX - this.minX + 1, height: this.maxY - this.minY + 1 }; 
  }
  getAcceptedCount(): number { return this.acceptedCount; }
  getRingNumber(): number { return this.ringNumber; }
  isComplete(): boolean { return this.complete; }
  isInitialized(): boolean { return this.imageData !== null; }
  
  updateTolerance(newTolerance: number): void {
    this.tolerance = newTolerance;
  }
  
  reset(): void {
    this.imageData = null;
    this.mask = null;
    this.visited = null;
    this.queue = null;
    this.seedColor = null;
    this.complete = false;
    this.acceptedCount = 0;
    this.ringNumber = 0;
  }
}

// ============================================
// V7 HYBRID - Best of all engines combined
// Combines: TypedArray queue (V5) + Scanline optimization (V4) + RangeSet spans (fuzzy-select)
// ============================================
export function hybridFloodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
  connectivity: Connectivity = 4
): FloodFillResult {
  const startTime = performance.now();
  const { width, height, data } = imageData;
  
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return {
      mask: new Uint8ClampedArray(width * height),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      pixels: [],
      ringCount: 0,
      processingTime: 0,
    };
  }
  
  const totalPixels = width * height;
  const mask = new Uint8ClampedArray(totalPixels);
  
  // RangeSet-style span tracking: Map<y, Set<rangeKey>>
  // This tracks horizontal spans per row for fast "already visited" checks
  const visitedSpans = new Map<number, Array<[number, number]>>();
  
  const seedIdx = (startY * width + startX) * 4;
  const seedR = data[seedIdx];
  const seedG = data[seedIdx + 1];
  const seedB = data[seedIdx + 2];
  const seedA = data[seedIdx + 3];
  
  // Inline color matching with alpha-aware comparison (from fuzzy-select)
  const colorMatches = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = (y * width + x) * 4;
    
    // Alpha-aware color distance (whitening approach from fuzzy-select)
    const a1 = seedA / 255;
    const a2 = data[idx + 3] / 255;
    
    const dr = a1 * (seedR - 255) - a2 * (data[idx] - 255);
    const dg = a1 * (seedG - 255) - a2 * (data[idx + 1] - 255);
    const db = a1 * (seedB - 255) - a2 * (data[idx + 2] - 255);
    
    const dist = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 255 / 3 * 100;
    return dist <= tolerance;
  };
  
  // Check if point in any visited span
  const isVisited = (x: number, y: number): boolean => {
    const spans = visitedSpans.get(y);
    if (!spans) return false;
    for (const [start, end] of spans) {
      if (x >= start && x <= end) return true;
    }
    return false;
  };
  
  // Add span to visited
  const addSpan = (y: number, x1: number, x2: number) => {
    if (!visitedSpans.has(y)) {
      visitedSpans.set(y, []);
    }
    visitedSpans.get(y)!.push([x1, x2]);
  };
  
  const pixels: number[] = [];
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  
  // Use TypedArray stack for scanline seeds [x, y, direction]
  // direction: 1 = down, -1 = up, 0 = initial
  const stack = new Int32Array(totalPixels * 3);
  let stackPtr = 0;
  
  // Push initial scanline (both directions)
  stack[stackPtr++] = startX;
  stack[stackPtr++] = startY;
  stack[stackPtr++] = 0; // initial - check both
  
  while (stackPtr > 0) {
    const direction = stack[--stackPtr];
    const y = stack[--stackPtr];
    const seedX = stack[--stackPtr];
    
    if (y < 0 || y >= height) continue;
    if (isVisited(seedX, y)) continue;
    
    // March left to find span start
    let x = seedX;
    while (x >= 0 && colorMatches(x, y) && !isVisited(x, y)) {
      x--;
    }
    const spanStart = x + 1;
    
    // March right to find span end
    x = seedX;
    while (x < width && colorMatches(x, y) && !isVisited(x, y)) {
      x++;
    }
    const spanEnd = x - 1;
    
    if (spanEnd < spanStart) continue;
    
    // Mark span as visited and add to mask
    addSpan(y, spanStart, spanEnd);
    for (let px = spanStart; px <= spanEnd; px++) {
      const idx = y * width + px;
      mask[idx] = 255;
      pixels.push(idx);
      
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
    }
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    
    // Scan for new spans in adjacent rows
    const checkRow = (checkY: number, dy: number) => {
      if (checkY < 0 || checkY >= height) return;
      
      let inSpan = false;
      for (let px = spanStart; px <= spanEnd; px++) {
        const matches = colorMatches(px, checkY) && !isVisited(px, checkY);
        
        if (matches && !inSpan) {
          // Start of new span seed
          stack[stackPtr++] = px;
          stack[stackPtr++] = checkY;
          stack[stackPtr++] = dy;
          inSpan = true;
        } else if (!matches && inSpan) {
          inSpan = false;
        }
      }
      
      // 8-connectivity: check diagonals at span edges
      if (connectivity === 8) {
        if (spanStart > 0 && colorMatches(spanStart - 1, checkY) && !isVisited(spanStart - 1, checkY)) {
          stack[stackPtr++] = spanStart - 1;
          stack[stackPtr++] = checkY;
          stack[stackPtr++] = dy;
        }
        if (spanEnd < width - 1 && colorMatches(spanEnd + 1, checkY) && !isVisited(spanEnd + 1, checkY)) {
          stack[stackPtr++] = spanEnd + 1;
          stack[stackPtr++] = checkY;
          stack[stackPtr++] = dy;
        }
      }
    };
    
    // Check above and below based on direction
    if (direction >= 0) checkRow(y + 1, 1);  // down
    if (direction <= 0) checkRow(y - 1, -1); // up
  }
  
  return {
    mask,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    pixels,
    ringCount: 1,
    processingTime: performance.now() - startTime,
  };
}

// ============================================
// V1 ITERATIVE GENERATOR - From fuzzy-select pattern
// Processes N steps per frame, non-blocking
// ============================================
export interface IterativeFloodFillState {
  generator: Generator<{ pixelsThisStep: number; totalPixels: number; complete: boolean }>;
  mask: Uint8ClampedArray;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  pixels: number[];
  complete: boolean;
}

export function* createIterativeFloodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number,
  connectivity: Connectivity = 4
): Generator<{ pixelsThisStep: number; totalPixels: number; complete: boolean }> {
  const { width, height, data } = imageData;
  
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return { pixelsThisStep: 0, totalPixels: 0, complete: true };
  }
  
  const totalPixels = width * height;
  const mask = new Uint8ClampedArray(totalPixels);
  const visited = new Uint8Array(totalPixels);
  const pixels: number[] = [];
  
  const seedIdx = (startY * width + startX) * 4;
  const seedR = data[seedIdx];
  const seedG = data[seedIdx + 1];
  const seedB = data[seedIdx + 2];
  const seedA = data[seedIdx + 3];
  
  const colorMatches = (idx: number): boolean => {
    const pIdx = idx * 4;
    const a1 = seedA / 255;
    const a2 = data[pIdx + 3] / 255;
    const dr = a1 * (seedR - 255) - a2 * (data[pIdx] - 255);
    const dg = a1 * (seedG - 255) - a2 * (data[pIdx + 1] - 255);
    const db = a1 * (seedB - 255) - a2 * (data[pIdx + 2] - 255);
    const dist = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 255 / 3 * 100;
    return dist <= tolerance;
  };
  
  const queue: number[] = [startY * width + startX];
  visited[queue[0]] = 1;
  
  const neighbors = connectivity === 8
    ? [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]
    : [-width, -1, 1, width];
  
  let idx = 0;
  
  while (idx < queue.length) {
    let pixelsThisStep = 0;
    const stepEnd = Math.min(idx + 100, queue.length); // Process 100 pixels per yield
    
    while (idx < stepEnd && idx < queue.length) {
      const index = queue[idx++];
      const x = index % width;
      const y = (index / width) | 0;
      
      if (colorMatches(index)) {
        mask[index] = 255;
        pixels.push(index);
        pixelsThisStep++;
        
        for (const offset of neighbors) {
          const nIndex = index + offset;
          const nx = nIndex % width;
          const ny = (nIndex / width) | 0;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[nIndex]) {
            visited[nIndex] = 1;
            queue.push(nIndex);
          }
        }
      }
    }
    
    yield { 
      pixelsThisStep, 
      totalPixels: pixels.length, 
      complete: idx >= queue.length 
    };
  }
  
  return { pixelsThisStep: 0, totalPixels: pixels.length, complete: true };
}

// ============================================
// UNIFIED API - Select engine and execute
// ============================================
export function floodFillWithEngine(
  imageData: ImageData,
  startX: number,
  startY: number,
  settings: SegmentSettings
): FloodFillResult {
  const { engine, tolerance, connectivity } = settings;
  
  switch (engine) {
    case 'v7-hybrid':
      return hybridFloodFill(imageData, startX, startY, tolerance, connectivity);
    
    case 'v5-instant':
      return instantFloodFill(imageData, startX, startY, tolerance, connectivity);
    
    case 'v4-scanline':
      return scanlineFloodFill(imageData, startX, startY, tolerance, connectivity);
    
    case 'v3-queue':
      return queueFloodFill(imageData, startX, startY, tolerance, connectivity);
    
    case 'v6-wave':
    default:
      // For blocking call, use hybrid as it's fastest
      return hybridFloodFill(imageData, startX, startY, tolerance, connectivity);
  }
}

// Legacy exports
export const floodFill = queueFloodFill;
