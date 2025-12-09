import { Point, Rectangle } from '../types';
import { RequestCancellation } from './RequestCancellation';
import { ZeroLatencyPreview } from './ZeroLatencyPreview';
import { BreathingTolerance } from './BreathingTolerance';
import { PREVIEW_TIME_BUDGET_MS } from '../constants';

/**
 * V6 Preview System - Preview Wave Engine
 * 
 * Orchestrates the organic preview expansion:
 * 1. Zero-latency seed highlight (instant)
 * 2. Ring BFS expansion (4-8ms per frame)
 * 3. Breathing tolerance (scroll to expand/contract)
 * 4. Request cancellation (no visual glitches)
 */

export interface PreviewResult {
  mask: Uint8ClampedArray;
  bounds: Rectangle;
  complete: boolean;
  ringNumber: number;
  seedPoint: Point;
  tolerance: number;
  acceptedCount: number;
}

export type PreviewCallback = (result: PreviewResult) => void;

export class PreviewWaveEngine {
  private requestCancellation: RequestCancellation;
  private zeroLatencyPreview: ZeroLatencyPreview;
  private breathingTolerance: BreathingTolerance;
  
  private animationFrameId: number | null = null;
  private currentRequestId: number = 0;
  private currentSeedPoint: Point | null = null;
  private currentTolerance: number = 32;
  private imageData: ImageData | null = null;
  
  private onProgress: PreviewCallback | null = null;
  private onComplete: PreviewCallback | null = null;
  
  constructor() {
    this.requestCancellation = new RequestCancellation();
    this.zeroLatencyPreview = new ZeroLatencyPreview();
    this.breathingTolerance = new BreathingTolerance();
  }
  
  /**
   * Start preview wave expansion
   */
  startWave(
    imageData: ImageData,
    seedPoint: Point,
    tolerance: number,
    onProgress?: PreviewCallback,
    onComplete?: PreviewCallback
  ): number {
    // Cancel any existing preview
    this.cancel();
    
    // Start new request
    this.currentRequestId = this.requestCancellation.startPreview();
    this.currentSeedPoint = seedPoint;
    this.currentTolerance = tolerance;
    this.imageData = imageData;
    this.onProgress = onProgress || null;
    this.onComplete = onComplete || null;
    
    // Initialize breathing tolerance with Ring BFS
    this.breathingTolerance.initialize(imageData, seedPoint, tolerance);
    
    // Start animation loop
    this.scheduleFrame();
    
    return this.currentRequestId;
  }
  
  /**
   * Schedule next animation frame
   */
  private scheduleFrame(): void {
    this.animationFrameId = requestAnimationFrame(() => this.processFrame());
  }
  
  /**
   * Process one frame of expansion
   */
  private processFrame(): void {
    // Check if request is still valid
    if (!this.requestCancellation.isValid(this.currentRequestId)) {
      this.cleanup();
      return;
    }
    
    const ringBFS = this.breathingTolerance.getRingBFS();
    
    if (!ringBFS.isInitialized()) {
      this.cleanup();
      return;
    }
    
    // Process ring within time budget
    const result = ringBFS.processRing(PREVIEW_TIME_BUDGET_MS);
    
    // Get current state
    const mask = ringBFS.getCurrentMask();
    const bounds = ringBFS.getCurrentBounds();
    
    if (mask && bounds && this.currentSeedPoint) {
      const previewResult: PreviewResult = {
        mask,
        bounds,
        complete: result.completed,
        ringNumber: ringBFS.getRingNumber(),
        seedPoint: this.currentSeedPoint,
        tolerance: this.currentTolerance,
        acceptedCount: ringBFS.getAcceptedCount(),
      };
      
      // Notify progress
      if (this.onProgress) {
        this.onProgress(previewResult);
      }
      
      if (result.completed) {
        // Notify complete
        if (this.onComplete) {
          this.onComplete(previewResult);
        }
        
        this.requestCancellation.complete(this.currentRequestId);
        this.animationFrameId = null;
        return;
      }
    }
    
    // Schedule next frame
    this.scheduleFrame();
  }
  
  /**
   * Update tolerance (breathing effect)
   */
  updateTolerance(newTolerance: number): void {
    if (!this.imageData) return;
    
    const oldTolerance = this.currentTolerance;
    this.currentTolerance = newTolerance;
    
    if (newTolerance > oldTolerance) {
      this.breathingTolerance.increaseTolerance(newTolerance);
    } else if (newTolerance < oldTolerance) {
      this.breathingTolerance.decreaseTolerance(newTolerance);
    }
    
    // Emit current state
    const mask = this.breathingTolerance.getAcceptedMask();
    const bounds = this.breathingTolerance.getCurrentBounds();
    
    if (mask && bounds && this.currentSeedPoint && this.onProgress) {
      this.onProgress({
        mask,
        bounds,
        complete: this.breathingTolerance.getRingBFS().isComplete(),
        ringNumber: this.breathingTolerance.getRingBFS().getRingNumber(),
        seedPoint: this.currentSeedPoint,
        tolerance: this.currentTolerance,
        acceptedCount: this.breathingTolerance.getRingBFS().getAcceptedCount(),
      });
    }
  }
  
  /**
   * Cancel current preview
   */
  cancel(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.requestCancellation.cancelAll();
    this.cleanup();
  }
  
  /**
   * Cleanup state
   */
  private cleanup(): void {
    this.breathingTolerance.reset();
    this.imageData = null;
    this.currentSeedPoint = null;
    this.onProgress = null;
    this.onComplete = null;
  }
  
  /**
   * Get zero latency preview renderer
   */
  getZeroLatencyPreview(): ZeroLatencyPreview {
    return this.zeroLatencyPreview;
  }
  
  /**
   * Check if preview is active
   */
  isActive(): boolean {
    return this.animationFrameId !== null;
  }
  
  /**
   * Get current request ID
   */
  getCurrentRequestId(): number {
    return this.currentRequestId;
  }
}
