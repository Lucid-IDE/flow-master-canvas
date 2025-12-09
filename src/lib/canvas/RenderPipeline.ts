import { Layer } from './types';
import { CoordinateSystem, coordinateSystem } from './coordinateSystem';
import { adaptLayersForRendering, RenderableLayer } from './layerAdapter';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from './constants';

/**
 * Render Pipeline - Handles 60fps rendering loop
 * 
 * Uses requestAnimationFrame and refs (not React state)
 * for smooth, jank-free rendering.
 */

export interface RenderState {
  layers: Layer[];
  selectedLayerIds: string[];
  previewMask: Uint8ClampedArray | null;
  hoverPoint: { x: number; y: number } | null;
  selectionMask: Uint8ClampedArray | null;
  showGrid: boolean;
  showGuides: boolean;
}

export interface RenderOptions {
  backgroundColor: string;
  gridColor: string;
  selectionColor: string;
  previewColor: string;
  gridSize: number;
}

const defaultOptions: RenderOptions = {
  backgroundColor: '#0f0f17',
  gridColor: '#1a1a24',
  selectionColor: 'hsl(217, 91%, 60%)',
  previewColor: 'hsla(190, 90%, 50%, 0.4)',
  gridSize: GRID_SIZE,
};

export class RenderPipeline {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isDirty: boolean = true;
  private state: RenderState | null = null;
  private options: RenderOptions;
  private dpr: number = 1;
  
  // Marching ants animation
  private marchingAntsOffset: number = 0;
  private lastMarchingAntsTime: number = 0;
  
  constructor(options: Partial<RenderOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }
  
  /**
   * Initialize render pipeline with canvas
   */
  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    
    // Initialize coordinate system
    coordinateSystem.setCanvas(canvas);
    
    // Start render loop
    this.startRenderLoop();
  }
  
  /**
   * Start 60fps render loop
   */
  private startRenderLoop(): void {
    const render = (timestamp: number) => {
      this.render(timestamp);
      this.animationFrameId = requestAnimationFrame(render);
    };
    
    this.animationFrameId = requestAnimationFrame(render);
  }
  
  /**
   * Stop render loop
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * Update render state
   */
  updateState(state: RenderState): void {
    this.state = state;
    this.markDirty();
  }
  
  /**
   * Mark as needing re-render
   */
  markDirty(): void {
    this.isDirty = true;
  }
  
  /**
   * Main render function
   */
  private render(timestamp: number): void {
    if (!this.canvas || !this.ctx || !this.state) return;
    
    const ctx = this.ctx;
    
    // Update marching ants animation
    if (timestamp - this.lastMarchingAntsTime > 50) {
      this.marchingAntsOffset = (this.marchingAntsOffset + 1) % 16;
      this.lastMarchingAntsTime = timestamp;
      if (this.state.selectionMask) {
        this.isDirty = true;
      }
    }
    
    // Only render if dirty or animating selection
    if (!this.isDirty && !this.state.selectionMask) return;
    
    // Clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.options.backgroundColor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Apply coordinate system transform
    coordinateSystem.applyTransform(ctx);
    
    // Draw checkerboard background
    this.drawCheckerboard(ctx);
    
    // Draw canvas border
    this.drawCanvasBorder(ctx);
    
    // Draw layers
    const renderableLayers = adaptLayersForRendering(this.state.layers);
    for (const layer of renderableLayers) {
      this.drawLayer(ctx, layer);
    }
    
    // Draw preview mask (V6 organic flow)
    if (this.state.previewMask && this.state.hoverPoint) {
      this.drawPreviewMask(ctx, this.state.previewMask);
    }
    
    // Draw selection mask with marching ants
    if (this.state.selectionMask) {
      this.drawSelectionMask(ctx, this.state.selectionMask);
    }
    
    // Draw guides
    if (this.state.showGuides) {
      this.drawGuides(ctx);
    }
    
    this.isDirty = false;
  }
  
  /**
   * Draw checkerboard transparency pattern
   */
  private drawCheckerboard(ctx: CanvasRenderingContext2D): void {
    const size = this.options.gridSize;
    
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#232333';
    for (let y = 0; y < CANVAS_HEIGHT; y += size) {
      for (let x = 0; x < CANVAS_WIDTH; x += size) {
        if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
          ctx.fillRect(x, y, size, size);
        }
      }
    }
  }
  
  /**
   * Draw canvas border
   */
  private drawCanvasBorder(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = this.options.selectionColor;
    ctx.lineWidth = 2 / (this.state ? 1 : 1); // Adjust for zoom
    ctx.strokeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  
  /**
   * Draw single layer
   */
  private drawLayer(ctx: CanvasRenderingContext2D, layer: RenderableLayer): void {
    ctx.save();
    
    // Apply layer opacity
    ctx.globalAlpha = layer.opacity;
    
    // Apply blend mode
    ctx.globalCompositeOperation = layer.blendMode;
    
    // Create temp canvas for layer
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = layer.imageData.width;
    tempCanvas.height = layer.imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      tempCtx.putImageData(layer.imageData, 0, 0);
      
      // Apply transform
      if (layer.rotation !== 0 || layer.scaleX !== 1 || layer.scaleY !== 1) {
        const centerX = layer.x + layer.width / 2;
        const centerY = layer.y + layer.height / 2;
        
        ctx.translate(centerX, centerY);
        ctx.rotate(layer.rotation);
        ctx.scale(layer.scaleX, layer.scaleY);
        ctx.translate(-layer.width / 2, -layer.height / 2);
        ctx.drawImage(tempCanvas, 0, 0);
      } else {
        ctx.drawImage(tempCanvas, layer.x, layer.y);
      }
    }
    
    ctx.restore();
  }
  
  /**
   * Draw preview mask (V6 organic flow)
   */
  private drawPreviewMask(
    ctx: CanvasRenderingContext2D,
    mask: Uint8ClampedArray
  ): void {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = this.options.previewColor;
    
    // Draw mask pixels
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const index = y * CANVAS_WIDTH + x;
        if (mask[index] > 0) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    
    ctx.restore();
    
    // Draw edge
    this.drawMaskEdge(ctx, mask, this.options.previewColor.replace('0.4', '0.8'));
  }
  
  /**
   * Draw selection mask with marching ants
   */
  private drawSelectionMask(
    ctx: CanvasRenderingContext2D,
    mask: Uint8ClampedArray
  ): void {
    ctx.save();
    ctx.strokeStyle = this.options.selectionColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = this.marchingAntsOffset;
    
    ctx.beginPath();
    
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const index = y * CANVAS_WIDTH + x;
        if (mask[index] > 0) {
          // Check if edge pixel
          const left = x > 0 ? mask[index - 1] : 0;
          const right = x < CANVAS_WIDTH - 1 ? mask[index + 1] : 0;
          const top = y > 0 ? mask[index - CANVAS_WIDTH] : 0;
          const bottom = y < CANVAS_HEIGHT - 1 ? mask[index + CANVAS_WIDTH] : 0;
          
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
   * Draw mask edge
   */
  private drawMaskEdge(
    ctx: CanvasRenderingContext2D,
    mask: Uint8ClampedArray,
    color: string
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const index = y * CANVAS_WIDTH + x;
        if (mask[index] > 0) {
          const left = x > 0 ? mask[index - 1] : 0;
          const right = x < CANVAS_WIDTH - 1 ? mask[index + 1] : 0;
          const top = y > 0 ? mask[index - CANVAS_WIDTH] : 0;
          const bottom = y < CANVAS_HEIGHT - 1 ? mask[index + CANVAS_WIDTH] : 0;
          
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
   * Draw guides
   */
  private drawGuides(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Center lines
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();
    
    // Rule of thirds
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 3, 0);
    ctx.lineTo(CANVAS_WIDTH / 3, CANVAS_HEIGHT);
    ctx.moveTo((CANVAS_WIDTH * 2) / 3, 0);
    ctx.lineTo((CANVAS_WIDTH * 2) / 3, CANVAS_HEIGHT);
    ctx.moveTo(0, CANVAS_HEIGHT / 3);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 3);
    ctx.moveTo(0, (CANVAS_HEIGHT * 2) / 3);
    ctx.lineTo(CANVAS_WIDTH, (CANVAS_HEIGHT * 2) / 3);
    ctx.stroke();
    
    ctx.restore();
  }
  
  /**
   * Update options
   */
  setOptions(options: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...options };
    this.markDirty();
  }
}
