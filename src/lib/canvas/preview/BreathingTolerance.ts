import { Point, Rectangle, RGBA } from '../types';
import { getPixelColor, colorsAreSimilar } from '../imageUtils';
import { RingBFS } from './RingBFS';

/**
 * V6 Preview System - Breathing Tolerance
 * 
 * Handles smooth expansion/contraction when user scrolls to change tolerance.
 * Uses frontier-resume model: re-tests rejected pixels on the frontier
 * instead of restarting from scratch.
 */

export class BreathingTolerance {
  private ringBFS: RingBFS;
  private currentTolerance: number = 32;
  private imageData: ImageData | null = null;
  private seedColor: RGBA | null = null;
  
  constructor() {
    this.ringBFS = new RingBFS();
  }
  
  /**
   * Initialize with Ring BFS instance
   */
  initialize(
    imageData: ImageData,
    seedPoint: Point,
    tolerance: number
  ): void {
    this.imageData = imageData;
    this.currentTolerance = tolerance;
    
    const seedX = Math.floor(seedPoint.x);
    const seedY = Math.floor(seedPoint.y);
    this.seedColor = getPixelColor(imageData, seedX, seedY);
    
    this.ringBFS.initialize(imageData, seedPoint, tolerance, 4);
  }
  
  /**
   * Increase tolerance - re-test rejected frontier and expand
   */
  increaseTolerance(newTolerance: number): void {
    if (!this.imageData || !this.seedColor) return;
    if (newTolerance <= this.currentTolerance) return;
    
    // Get rejected frontier pixels
    const frontier = this.ringBFS.getRejectedFrontier();
    
    if (frontier.length === 0) {
      // Just update tolerance for next ring
      this.ringBFS.updateTolerance(newTolerance);
      this.currentTolerance = newTolerance;
      return;
    }
    
    const width = this.imageData.width;
    const mask = this.ringBFS.getCurrentMask();
    
    if (!mask) return;
    
    // Re-test frontier pixels with new tolerance
    const newlyAccepted: number[] = [];
    
    for (const index of frontier) {
      const x = index % width;
      const y = Math.floor(index / width);
      const color = getPixelColor(this.imageData, x, y);
      
      if (colorsAreSimilar(color, this.seedColor, newTolerance)) {
        newlyAccepted.push(index);
        mask[index] = 255;
      }
    }
    
    // Update tolerance
    this.ringBFS.updateTolerance(newTolerance);
    this.currentTolerance = newTolerance;
    
    // If we have newly accepted pixels, they become the new expansion frontier
    // This is handled by Ring BFS continuing from where it left off
  }
  
  /**
   * Decrease tolerance - contract selection
   * Note: This is more expensive as we need to re-validate all pixels
   */
  decreaseTolerance(newTolerance: number): void {
    if (!this.imageData || !this.seedColor) return;
    if (newTolerance >= this.currentTolerance) return;
    
    const mask = this.ringBFS.getCurrentMask();
    if (!mask) return;
    
    const width = this.imageData.width;
    const height = this.imageData.height;
    
    // Re-validate all accepted pixels with new tolerance
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (mask[index] > 0) {
          const color = getPixelColor(this.imageData, x, y);
          if (!colorsAreSimilar(color, this.seedColor, newTolerance)) {
            mask[index] = 0;
          }
        }
      }
    }
    
    this.currentTolerance = newTolerance;
  }
  
  /**
   * Get current accepted mask
   */
  getAcceptedMask(): Uint8ClampedArray | null {
    return this.ringBFS.getCurrentMask();
  }
  
  /**
   * Get current bounds
   */
  getCurrentBounds(): Rectangle | null {
    return this.ringBFS.getCurrentBounds();
  }
  
  /**
   * Get Ring BFS instance for processing
   */
  getRingBFS(): RingBFS {
    return this.ringBFS;
  }
  
  /**
   * Reset
   */
  reset(): void {
    this.ringBFS.reset();
    this.imageData = null;
    this.seedColor = null;
  }
}
