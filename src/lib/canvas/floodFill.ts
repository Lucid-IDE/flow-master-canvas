import { Point, Rectangle, RGBA } from './types';
import { getPixelColor, colorsAreSimilar } from './imageUtils';

/**
 * Ring-based BFS Flood Fill Algorithm
 * 
 * Processes pixels in concentric rings from seed point,
 * enabling organic wave expansion for previews.
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
  connectivity: 4 | 8;
  timeBudget?: number; // ms per frame for incremental
}

/**
 * Complete flood fill (blocking)
 */
export function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  options: FloodFillOptions
): FloodFillResult {
  const startTime = performance.now();
  const { tolerance, connectivity } = options;
  const { width, height } = imageData;
  
  // Validate start point
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return {
      mask: new Uint8ClampedArray(width * height),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      pixels: [],
      ringCount: 0,
      processingTime: performance.now() - startTime,
    };
  }
  
  const mask = new Uint8ClampedArray(width * height);
  const visited = new Uint8Array(width * height); // 0=unseen, 1=accepted, 2=rejected
  const seedColor = getPixelColor(imageData, startX, startY);
  
  let queue: number[] = [startY * width + startX];
  let nextRing: number[] = [];
  const pixels: number[] = [];
  
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  let ringCount = 0;
  
  // Get neighbor offsets based on connectivity
  const neighbors = connectivity === 8
    ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
    : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  
  while (queue.length > 0) {
    ringCount++;
    
    for (let i = 0; i < queue.length; i++) {
      const index = queue[i];
      
      if (visited[index]) continue;
      
      const x = index % width;
      const y = Math.floor(index / width);
      
      const color = getPixelColor(imageData, x, y);
      
      if (colorsAreSimilar(color, seedColor, tolerance)) {
        visited[index] = 1; // Accepted
        mask[index] = 255;
        pixels.push(index);
        
        // Update bounds
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        
        // Add neighbors to next ring
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIndex = ny * width + nx;
            if (!visited[nIndex]) {
              nextRing.push(nIndex);
            }
          }
        }
      } else {
        visited[index] = 2; // Rejected
      }
    }
    
    // Swap rings
    queue = nextRing;
    nextRing = [];
  }
  
  return {
    mask,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    pixels,
    ringCount,
    processingTime: performance.now() - startTime,
  };
}

/**
 * Incremental flood fill for preview (non-blocking)
 * Returns a generator that yields partial results
 */
export function* incrementalFloodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  options: FloodFillOptions
): Generator<{ mask: Uint8ClampedArray; ring: number; complete: boolean }, FloodFillResult> {
  const { tolerance, connectivity, timeBudget = 6 } = options;
  const { width, height } = imageData;
  
  const mask = new Uint8ClampedArray(width * height);
  const visited = new Uint8Array(width * height);
  const seedColor = getPixelColor(imageData, startX, startY);
  
  let queue: number[] = [startY * width + startX];
  let nextRing: number[] = [];
  const pixels: number[] = [];
  
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  let ring = 0;
  
  const neighbors = connectivity === 8
    ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
    : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  
  const startTime = performance.now();
  
  while (queue.length > 0) {
    const frameStart = performance.now();
    
    while (queue.length > 0 && performance.now() - frameStart < timeBudget) {
      const index = queue.shift()!;
      
      if (visited[index]) continue;
      
      const x = index % width;
      const y = Math.floor(index / width);
      
      const color = getPixelColor(imageData, x, y);
      
      if (colorsAreSimilar(color, seedColor, tolerance)) {
        visited[index] = 1;
        mask[index] = 255;
        pixels.push(index);
        
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIndex = ny * width + nx;
            if (!visited[nIndex]) {
              nextRing.push(nIndex);
            }
          }
        }
      } else {
        visited[index] = 2;
      }
    }
    
    // Yield current state for preview
    if (queue.length === 0 && nextRing.length > 0) {
      ring++;
      queue = nextRing;
      nextRing = [];
      
      yield { mask: mask.slice(), ring, complete: false };
    } else if (queue.length === 0) {
      break;
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
    pixels,
    ringCount: ring,
    processingTime: performance.now() - startTime,
  };
}
