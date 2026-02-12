import { Point } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

/**
 * CoordinateSystem - Handles all coordinate transformations
 *
 * Now supports dynamic project dimensions via setProjectSize().
 * Falls back to CANVAS_WIDTH/CANVAS_HEIGHT for backwards compatibility.
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
  private projectW: number = CANVAS_WIDTH;
  private projectH: number = CANVAS_HEIGHT;

  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.dpr = window.devicePixelRatio || 1;
  }

  setProjectSize(w: number, h: number): void {
    this.projectW = w;
    this.projectH = h;
  }

  updateTransform(panX: number, panY: number, zoom: number): void {
    this.panX = panX;
    this.panY = panY;
    this.zoom = zoom;
  }

  screenToCanvas(screenX: number, screenY: number): Point {
    if (!this.canvas) return { x: screenX, y: screenY };
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (screenX - rect.left) * scaleX,
      y: (screenY - rect.top) * scaleY,
    };
  }

  canvasToWorld(canvasX: number, canvasY: number): Point {
    if (!this.canvas) return { x: canvasX, y: canvasY };
    const centerX = this.canvas.width / (2 * this.dpr);
    const centerY = this.canvas.height / (2 * this.dpr);
    return {
      x: (canvasX / this.dpr - centerX - this.panX) / this.zoom + this.projectW / 2,
      y: (canvasY / this.dpr - centerY - this.panY) / this.zoom + this.projectH / 2,
    };
  }

  screenToWorld(screenX: number, screenY: number): Point {
    const canvasPoint = this.screenToCanvas(screenX, screenY);
    return this.canvasToWorld(canvasPoint.x, canvasPoint.y);
  }

  worldToCanvas(worldX: number, worldY: number): Point {
    if (!this.canvas) return { x: worldX, y: worldY };
    const centerX = this.canvas.width / (2 * this.dpr);
    const centerY = this.canvas.height / (2 * this.dpr);
    return {
      x: ((worldX - this.projectW / 2) * this.zoom + this.panX + centerX) * this.dpr,
      y: ((worldY - this.projectH / 2) * this.zoom + this.panY + centerY) * this.dpr,
    };
  }

  worldToPixelIndex(worldX: number, worldY: number, width: number = this.projectW): number {
    return Math.floor(worldY) * width + Math.floor(worldX);
  }

  pixelIndexToWorld(index: number, width: number = this.projectW): Point {
    return { x: index % width, y: Math.floor(index / width) };
  }

  isInBounds(worldX: number, worldY: number): boolean {
    return worldX >= 0 && worldX < this.projectW && worldY >= 0 && worldY < this.projectH;
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    if (!this.canvas) return;
    const centerX = this.canvas.width / (2 * this.dpr);
    const centerY = this.canvas.height / (2 * this.dpr);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(centerX + this.panX, centerY + this.panY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.projectW / 2, -this.projectH / 2);
  }

  resetTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}

// Singleton instance
export const coordinateSystem = new CoordinateSystem();
