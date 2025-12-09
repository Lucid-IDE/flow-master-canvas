import { Point, Rectangle, RGBA } from '../types';
import { getPixelColor, colorsAreSimilar } from '../imageUtils';

/**
 * V6 Preview System - Ring BFS Algorithm
 * 
 * Processes flood fill in concentric rings from seed point.
 * Enables natural wave expansion for organic preview.
 * 
 * Memory: O(perimeter) queue instead of O(area)
 * CPU: 4-8ms per frame budget (respects 60fps)
 */

// Pixel states
const UNSEEN = 0;
const ACCEPTED = 1;
const REJECTED = 2;

export interface RingBFSState {
  mask: Uint8ClampedArray;
  visited: Uint8Array;
  queue: number[];
  nextRing: number[];
  ringNumber: number;
  bounds: Rectangle;
  complete: boolean;
  seedColor: RGBA;
  acceptedCount: number;
}

export interface RingProcessResult {
  completed: boolean;
  timeUsed: number;
  pixelsProcessed: number;
}

export class RingBFS {
  private state: RingBFSState | null = null;
  private width: number = 0;
  private height: number = 0;
  private imageData: ImageData | null = null;
  private tolerance: number = 32;
  private connectivity: 4 | 8 = 4;
  
  // Neighbor offsets
  private neighbors4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  private neighbors8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  
  /**
   * Initialize Ring BFS from seed point
   */
  initialize(
    imageData: ImageData,
    seedPoint: Point,
    tolerance: number,
    connectivity: 4 | 8 = 4
  ): void {
    this.imageData = imageData;
    this.width = imageData.width;
    this.height = imageData.height;
    this.tolerance = tolerance;
    this.connectivity = connectivity;
    
    const seedX = Math.floor(seedPoint.x);
    const seedY = Math.floor(seedPoint.y);
    
    // Validate seed point
    if (seedX < 0 || seedX >= this.width || seedY < 0 || seedY >= this.height) {
      this.state = null;
      return;
    }
    
    const seedIndex = seedY * this.width + seedX;
    const seedColor = getPixelColor(imageData, seedX, seedY);
    
    // Initialize state
    this.state = {
      mask: new Uint8ClampedArray(this.width * this.height),
      visited: new Uint8Array(this.width * this.height),
      queue: [seedIndex],
      nextRing: [],
      ringNumber: 0,
      bounds: { x: seedX, y: seedY, width: 1, height: 1 },
      complete: false,
      seedColor,
      acceptedCount: 0,
    };
  }
  
  /**
   * Process one ring of expansion within time budget
   * @param timeBudget - Time budget in milliseconds (4-8ms recommended)
   */
  processRing(timeBudget: number = 6): RingProcessResult {
    const startTime = performance.now();
    
    if (!this.state || !this.imageData || this.state.complete) {
      return { completed: true, timeUsed: 0, pixelsProcessed: 0 };
    }
    
    const { mask, visited, queue, nextRing, bounds, seedColor } = this.state;
    const neighbors = this.connectivity === 8 ? this.neighbors8 : this.neighbors4;
    
    let pixelsProcessed = 0;
    
    // Process current ring
    while (queue.length > 0) {
      // Check time budget
      if (performance.now() - startTime >= timeBudget) {
        // Time budget exhausted, continue next frame
        return {
          completed: false,
          timeUsed: performance.now() - startTime,
          pixelsProcessed,
        };
      }
      
      const index = queue.shift()!;
      
      if (visited[index]) continue;
      
      const x = index % this.width;
      const y = Math.floor(index / this.width);
      
      const color = getPixelColor(this.imageData!, x, y);
      
      if (colorsAreSimilar(color, seedColor, this.tolerance)) {
        // Accept pixel
        visited[index] = ACCEPTED;
        mask[index] = 255;
        this.state.acceptedCount++;
        pixelsProcessed++;
        
        // Update bounds
        if (x < bounds.x) {
          bounds.width += bounds.x - x;
          bounds.x = x;
        } else if (x >= bounds.x + bounds.width) {
          bounds.width = x - bounds.x + 1;
        }
        
        if (y < bounds.y) {
          bounds.height += bounds.y - y;
          bounds.y = y;
        } else if (y >= bounds.y + bounds.height) {
          bounds.height = y - bounds.y + 1;
        }
        
        // Add neighbors to next ring
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            const nIndex = ny * this.width + nx;
            if (!visited[nIndex]) {
              nextRing.push(nIndex);
            }
          }
        }
      } else {
        // Reject pixel
        visited[index] = REJECTED;
      }
    }
    
    // Ring complete - move to next ring
    if (nextRing.length > 0) {
      this.state.queue = [...nextRing];
      this.state.nextRing = [];
      this.state.ringNumber++;
    } else {
      // No more rings - expansion complete
      this.state.complete = true;
    }
    
    return {
      completed: this.state.complete,
      timeUsed: performance.now() - startTime,
      pixelsProcessed,
    };
  }
  
  /**
   * Get current mask (partial or complete)
   */
  getCurrentMask(): Uint8ClampedArray | null {
    return this.state?.mask || null;
  }
  
  /**
   * Get current bounds
   */
  getCurrentBounds(): Rectangle | null {
    return this.state?.bounds || null;
  }
  
  /**
   * Get current ring number
   */
  getRingNumber(): number {
    return this.state?.ringNumber || 0;
  }
  
  /**
   * Check if expansion is complete
   */
  isComplete(): boolean {
    return this.state?.complete || false;
  }
  
  /**
   * Get accepted pixel count
   */
  getAcceptedCount(): number {
    return this.state?.acceptedCount || 0;
  }
  
  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.state !== null;
  }
  
  /**
   * Reset state
   */
  reset(): void {
    this.state = null;
    this.imageData = null;
  }
  
  /**
   * Update tolerance (for breathing tolerance)
   */
  updateTolerance(newTolerance: number): void {
    this.tolerance = newTolerance;
  }
  
  /**
   * Get rejected frontier for breathing tolerance
   */
  getRejectedFrontier(): number[] {
    if (!this.state) return [];
    
    const frontier: number[] = [];
    const { visited, mask } = this.state;
    
    for (let i = 0; i < visited.length; i++) {
      if (visited[i] === REJECTED) {
        // Check if adjacent to accepted pixel
        const x = i % this.width;
        const y = Math.floor(i / this.width);
        
        for (const [dx, dy] of this.neighbors4) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
            const nIndex = ny * this.width + nx;
            if (visited[nIndex] === ACCEPTED) {
              frontier.push(i);
              break;
            }
          }
        }
      }
    }
    
    return frontier;
  }
}
