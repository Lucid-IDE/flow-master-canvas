import { Point } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

/**
 * CoordinateSystem - Handles all coordinate transformations
 * 
 * Coordinate Spaces:
 * - Screen: CSS pixels from browser event
 * - Canvas: Physical pixels on canvas element
 * - World: Image space (0,0 at top-left)
 */
export class CoordinateSystem {
  private canvas: HTMLCanvasElement | null = null;
  private panX: number = 0;
  private panY: number = 0;
  private zoom: number = 1;
  private dpr: number = 1;

  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.dpr = window.devicePixelRatio || 1;
  }

  updateTransform(panX: number, panY: number, zoom: number): void {
    this.panX = panX;
    this.panY = panY;
    this.zoom = zoom;
  }

  /**
   * Convert screen coordinates to canvas coordinates
   */
  screenToCanvas(screenX: number, screenY: number): Point {
    if (!this.canvas) {
      return { x: screenX, y: screenY };
    }

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x: (screenX - rect.left) * scaleX,
      y: (screenY - rect.top) * scaleY,
    };
  }

  /**
   * Convert canvas coordinates to world coordinates
   */
  canvasToWorld(canvasX: number, canvasY: number): Point {
    if (!this.canvas) {
      return { x: canvasX, y: canvasY };
    }

    const centerX = this.canvas.width / (2 * this.dpr);
    const centerY = this.canvas.height / (2 * this.dpr);

    return {
      x: (canvasX / this.dpr - centerX - this.panX) / this.zoom + CANVAS_WIDTH / 2,
      y: (canvasY / this.dpr - centerY - this.panY) / this.zoom + CANVAS_HEIGHT / 2,
    };
  }

  /**
   * Convert screen coordinates directly to world coordinates
   */
  screenToWorld(screenX: number, screenY: number): Point {
    const canvasPoint = this.screenToCanvas(screenX, screenY);
    return this.canvasToWorld(canvasPoint.x, canvasPoint.y);
  }

  /**
   * Convert world coordinates to canvas coordinates
   */
  worldToCanvas(worldX: number, worldY: number): Point {
    if (!this.canvas) {
      return { x: worldX, y: worldY };
    }

    const centerX = this.canvas.width / (2 * this.dpr);
    const centerY = this.canvas.height / (2 * this.dpr);

    return {
      x: ((worldX - CANVAS_WIDTH / 2) * this.zoom + this.panX + centerX) * this.dpr,
      y: ((worldY - CANVAS_HEIGHT / 2) * this.zoom + this.panY + centerY) * this.dpr,
    };
  }

  /**
   * Convert world coordinates to pixel index
   */
  worldToPixelIndex(worldX: number, worldY: number, width: number = CANVAS_WIDTH): number {
    const x = Math.floor(worldX);
    const y = Math.floor(worldY);
    return y * width + x;
  }

  /**
   * Convert pixel index to world coordinates
   */
  pixelIndexToWorld(index: number, width: number = CANVAS_WIDTH): Point {
    return {
      x: index % width,
      y: Math.floor(index / width),
    };
  }

  /**
   * Check if world point is within canvas bounds
   */
  isInBounds(worldX: number, worldY: number): boolean {
    return (
      worldX >= 0 &&
      worldX < CANVAS_WIDTH &&
      worldY >= 0 &&
      worldY < CANVAS_HEIGHT
    );
  }

  /**
   * Apply transform to canvas context for rendering
   */
  applyTransform(ctx: CanvasRenderingContext2D): void {
    if (!this.canvas) return;

    const centerX = this.canvas.width / (2 * this.dpr);
    const centerY = this.canvas.height / (2 * this.dpr);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(centerX + this.panX, centerY + this.panY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
  }

  /**
   * Reset transform on canvas context
   */
  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}

// Singleton instance
export const coordinateSystem = new CoordinateSystem();
