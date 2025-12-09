import { Point, Rectangle } from '../types';

/**
 * V6 Preview System - Zero Latency Preview
 * 
 * Provides instant visual feedback at seed point (0ms perceived latency)
 * before full wave expansion begins.
 */
export class ZeroLatencyPreview {
  private seedRadius: number = 3;
  private seedColor: string = 'hsl(190, 90%, 50%)'; // Accent color
  private waveColor: string = 'hsla(190, 90%, 50%, 0.4)';
  private edgeColor: string = 'hsl(217, 91%, 60%)'; // Primary color
  
  /**
   * Draw instant seed highlight (3x3 patch)
   * Called immediately on hover - 0ms perceived latency
   */
  drawInstantSeed(
    ctx: CanvasRenderingContext2D,
    seedPoint: Point
  ): void {
    const x = Math.floor(seedPoint.x);
    const y = Math.floor(seedPoint.y);
    
    ctx.save();
    
    // Draw 3x3 highlight patch
    ctx.fillStyle = this.seedColor;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    
    // Draw center point with glow
    ctx.shadowColor = this.seedColor;
    ctx.shadowBlur = 4;
    ctx.fillStyle = 'white';
    ctx.fillRect(x, y, 1, 1);
    
    ctx.restore();
  }
  
  /**
   * Draw expanding wave preview mask
   */
  drawWave(
    ctx: CanvasRenderingContext2D,
    mask: Uint8ClampedArray,
    bounds: Rectangle,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = this.waveColor;
    
    // Draw mask pixels within bounds
    for (let y = bounds.y; y < bounds.y + bounds.height && y < height; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.width && x < width; x++) {
        const index = y * width + x;
        if (mask[index] > 0) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    
    ctx.restore();
    
    // Draw edge outline
    this.drawEdge(ctx, mask, bounds, width, height);
  }
  
  /**
   * Draw edge outline around selection
   */
  private drawEdge(
    ctx: CanvasRenderingContext2D,
    mask: Uint8ClampedArray,
    bounds: Rectangle,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.strokeStyle = this.edgeColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;
    
    ctx.beginPath();
    
    for (let y = bounds.y; y < bounds.y + bounds.height && y < height; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.width && x < width; x++) {
        const index = y * width + x;
        if (mask[index] > 0) {
          // Check if edge pixel
          const left = x > 0 ? mask[index - 1] : 0;
          const right = x < width - 1 ? mask[index + 1] : 0;
          const top = y > 0 ? mask[index - width] : 0;
          const bottom = y < height - 1 ? mask[index + width] : 0;
          
          if (left === 0 || right === 0 || top === 0 || bottom === 0) {
            ctx.rect(x, y, 1, 1);
          }
        }
      }
    }
    
    ctx.stroke();
    ctx.restore();
  }
  
  /**
   * Calculate minimal dirty rect for efficient redraw
   */
  calculateDirtyRect(
    mask: Uint8ClampedArray,
    bounds: Rectangle,
    width: number,
    previousBounds?: Rectangle
  ): Rectangle {
    // Start with current bounds
    let minX = bounds.x;
    let minY = bounds.y;
    let maxX = bounds.x + bounds.width;
    let maxY = bounds.y + bounds.height;
    
    // Expand to include previous bounds if available
    if (previousBounds) {
      minX = Math.min(minX, previousBounds.x);
      minY = Math.min(minY, previousBounds.y);
      maxX = Math.max(maxX, previousBounds.x + previousBounds.width);
      maxY = Math.max(maxY, previousBounds.y + previousBounds.height);
    }
    
    // Add padding for edge rendering
    const padding = 2;
    
    return {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }
}
