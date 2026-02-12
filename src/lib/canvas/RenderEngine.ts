/**
 * RenderEngine - The performance-critical render loop, completely decoupled from React.
 *
 * All hot-path state lives in plain JS refs. React never touches the render loop.
 * The engine owns:
 *   - The RAF loop
 *   - Composite layer cache (OffscreenCanvas)
 *   - Preview/selection mask textures (OffscreenCanvas)
 *   - Dirty-flag system so we only recompute what changed
 *   - Transform (pan/zoom) application
 *
 * This means: moving the mouse, changing zoom, panning -- none of these trigger
 * React re-renders. The only React updates are for UI panels (toolbar, layer list, etc).
 */

import { Layer, CanvasState } from './types';
import { ModifierStack } from './modifierStack';
import { segmentHighlightCache } from './segmentHighlightCache';
import { GRID_SIZE } from './constants';

// ── Dirty flags ─────────────────────────────────────────────
export const DIRTY_NONE       = 0;
export const DIRTY_TRANSFORM  = 1 << 0;  // pan/zoom changed
export const DIRTY_LAYERS     = 1 << 1;  // layer data/order changed
export const DIRTY_PREVIEW    = 1 << 2;  // hover preview mask changed
export const DIRTY_SELECTION  = 1 << 3;  // active selection changed
export const DIRTY_RESIZE     = 1 << 4;  // canvas/container resized
export const DIRTY_ALL        = 0xFF;

// ── Render State (plain objects, NOT React state) ───────────
export interface RenderState {
  // Transform
  panX: number;
  panY: number;
  zoom: number;

  // Project geometry
  projectWidth: number;
  projectHeight: number;

  // Layers snapshot (reference, not clone)
  layers: Layer[];
  selectedLayerIds: string[];

  // Masks (typed arrays)
  previewMask: Uint8ClampedArray | null;
  selectionMask: Uint8ClampedArray | null;

  // Dirty tracking
  dirty: number;
}

export function createRenderState(): RenderState {
  return {
    panX: 0,
    panY: 0,
    zoom: 1,
    projectWidth: 1920,
    projectHeight: 1080,
    layers: [],
    selectedLayerIds: [],
    previewMask: null,
    selectionMask: null,
    dirty: DIRTY_ALL,
  };
}

// ── Checkerboard cache ──────────────────────────────────────
let _checkerCanvas: OffscreenCanvas | null = null;
let _checkerW = 0;
let _checkerH = 0;

function getCheckerboard(w: number, h: number): OffscreenCanvas {
  if (_checkerCanvas && _checkerW === w && _checkerH === h) return _checkerCanvas;

  _checkerCanvas = new OffscreenCanvas(w, h);
  const ctx = _checkerCanvas.getContext('2d')!;
  const size = GRID_SIZE;

  ctx.fillStyle = '#1a1a24';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#232333';

  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  _checkerW = w;
  _checkerH = h;
  return _checkerCanvas;
}

// ── Composite layer cache ───────────────────────────────────
interface LayerTextureEntry {
  canvas: OffscreenCanvas;
  version: number;
}

const _layerTextures = new Map<string, LayerTextureEntry>();
const _layerVersions = new Map<string, number>();

function getLayerTexture(layer: Layer, imageData: ImageData): OffscreenCanvas {
  const ver = _layerVersions.get(layer.id) ?? 0;
  const cached = _layerTextures.get(layer.id);
  if (cached && cached.version === ver) return cached.canvas;

  const oc = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = oc.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  _layerTextures.set(layer.id, { canvas: oc, version: ver });
  return oc;
}

export function invalidateLayerTexture(layerId: string): void {
  _layerVersions.set(layerId, (_layerVersions.get(layerId) ?? 0) + 1);
  _layerTextures.delete(layerId);
}

export function cleanupLayerTextures(activeIds: Set<string>): void {
  for (const id of _layerTextures.keys()) {
    if (!activeIds.has(id)) {
      _layerTextures.delete(id);
      _layerVersions.delete(id);
    }
  }
}

// ── Composite cache ─────────────────────────────────────────
// Single OffscreenCanvas that merges all visible layers.
// Only rebuilt when DIRTY_LAYERS is set.
let _compositeCanvas: OffscreenCanvas | null = null;
let _compositeW = 0;
let _compositeH = 0;

function rebuildComposite(rs: RenderState): OffscreenCanvas {
  const w = rs.projectWidth;
  const h = rs.projectHeight;

  if (!_compositeCanvas || _compositeW !== w || _compositeH !== h) {
    _compositeCanvas = new OffscreenCanvas(w, h);
    _compositeW = w;
    _compositeH = h;
  }

  const ctx = _compositeCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  for (const layer of rs.layers) {
    if (!layer.visible) continue;

    ctx.save();
    ctx.globalAlpha = layer.opacity;

    // Blend mode
    switch (layer.blendMode) {
      case 'multiply': ctx.globalCompositeOperation = 'multiply'; break;
      case 'screen':   ctx.globalCompositeOperation = 'screen'; break;
      case 'overlay':  ctx.globalCompositeOperation = 'overlay'; break;
      case 'darken':   ctx.globalCompositeOperation = 'darken'; break;
      case 'lighten':  ctx.globalCompositeOperation = 'lighten'; break;
      default:         ctx.globalCompositeOperation = 'source-over'; break;
    }

    // Apply modifier stack -> get ImageData
    const finalImageData = ModifierStack.applyStack(layer);
    const tex = getLayerTexture(layer, finalImageData);

    // Transform
    const { tx, ty, rotation, sx, sy } = layer.transform;
    const cx = layer.bounds.x + layer.bounds.width / 2;
    const cy = layer.bounds.y + layer.bounds.height / 2;
    ctx.translate(cx + tx, cy + ty);
    ctx.rotate(rotation);
    ctx.scale(sx, sy);
    ctx.translate(-layer.bounds.width / 2, -layer.bounds.height / 2);

    ctx.drawImage(tex, 0, 0);
    ctx.restore();
  }

  return _compositeCanvas;
}

// ── Mask texture caches ─────────────────────────────────────
// Instead of per-pixel fillRect calls, we bake masks into OffscreenCanvas textures.
let _previewTexture: OffscreenCanvas | null = null;
let _previewW = 0;
let _previewH = 0;

function rebuildPreviewTexture(mask: Uint8ClampedArray, w: number, h: number): OffscreenCanvas {
  if (!_previewTexture || _previewW !== w || _previewH !== h) {
    _previewTexture = new OffscreenCanvas(w, h);
    _previewW = w;
    _previewH = h;
  }

  const ctx = _previewTexture.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Write mask into ImageData: cyan-ish overlay
  const imgData = ctx.createImageData(w, h);
  const d = imgData.data;
  for (let i = 0, len = mask.length; i < len; i++) {
    if (mask[i] > 0) {
      const off = i * 4;
      d[off]     = 50;   // R
      d[off + 1] = 200;  // G
      d[off + 2] = 220;  // B
      d[off + 3] = 102;  // A  (~0.4 * 255)
    }
  }
  ctx.putImageData(imgData, 0, 0);

  return _previewTexture;
}

let _selectionTexture: OffscreenCanvas | null = null;
let _selectionW = 0;
let _selectionH = 0;
let _marchOffset = 0;

function rebuildSelectionTexture(mask: Uint8ClampedArray, w: number, h: number): OffscreenCanvas {
  if (!_selectionTexture || _selectionW !== w || _selectionH !== h) {
    _selectionTexture = new OffscreenCanvas(w, h);
    _selectionW = w;
    _selectionH = h;
  }

  const ctx = _selectionTexture.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // Build edge-only ImageData
  const imgData = ctx.createImageData(w, h);
  const d = imgData.data;
  for (let i = 0, len = mask.length; i < len; i++) {
    if (mask[i] > 0) {
      const x = i % w;
      const y = (i - x) / w;
      // Is this an edge pixel?
      const left   = x > 0     ? mask[i - 1]   : 0;
      const right  = x < w - 1 ? mask[i + 1]   : 0;
      const top    = y > 0     ? mask[i - w]    : 0;
      const bottom = y < h - 1 ? mask[i + w]    : 0;

      if (left === 0 || right === 0 || top === 0 || bottom === 0) {
        // Marching ants: alternate black/white along edge
        const march = ((x + y + Math.floor(_marchOffset)) % 8) < 4;
        const off = i * 4;
        d[off]     = march ? 59 : 255;
        d[off + 1] = march ? 130 : 255;
        d[off + 2] = march ? 246 : 255;
        d[off + 3] = 220;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  return _selectionTexture;
}

// ── Segment highlight drawing ───────────────────────────────
function drawSegmentHighlights(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  selectedLayerIds: string[],
  zoom: number,
): void {
  for (const layer of layers) {
    if (!layer.visible || !layer.segmentColor || !layer.name.startsWith('Segment')) continue;

    const highlight = segmentHighlightCache.getHighlight(layer);
    if (!highlight) continue;

    const isSelected = selectedLayerIds.includes(layer.id);

    ctx.save();
    // Fill highlight
    ctx.globalAlpha = isSelected ? 0.35 : 0.2;
    ctx.drawImage(highlight.fillCanvas, layer.bounds.x, layer.bounds.y);

    // Edge glow for selected
    if (isSelected) {
      ctx.globalAlpha = 0.8;
      ctx.shadowColor = layer.segmentColor;
      ctx.shadowBlur = 8 / zoom;
      ctx.drawImage(highlight.edgeCanvas, layer.bounds.x, layer.bounds.y);
    }
    ctx.restore();
  }
}

// ── The Engine ──────────────────────────────────────────────
export class RenderEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private containerW = 0;
  private containerH = 0;
  private rafId = 0;
  private running = false;

  // Render state lives here, outside React
  public rs: RenderState = createRenderState();

  // Timing
  private lastFrameTime = 0;
  public frameTime = 0;
  public fps = 0;
  private frameTimes: number[] = [];

  // Marching ants animation
  private marchTime = 0;

  // ── Lifecycle ──────────────────────────────────────────
  attach(canvas: HTMLCanvasElement, container: HTMLElement): void {
    this.canvas = canvas;
    this.dpr = window.devicePixelRatio || 1;
    this.resize(container);
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(container: HTMLElement): void {
    if (!this.canvas) return;
    this.containerW = container.clientWidth;
    this.containerH = container.clientHeight;
    this.canvas.width = this.containerW * this.dpr;
    this.canvas.height = this.containerH * this.dpr;
    this.canvas.style.width = `${this.containerW}px`;
    this.canvas.style.height = `${this.containerH}px`;
    this.rs.dirty |= DIRTY_RESIZE | DIRTY_TRANSFORM;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  destroy(): void {
    this.stop();
    this.canvas = null;
    this.ctx = null;
  }

  // ── State setters (call from React or event handlers) ──
  setTransform(panX: number, panY: number, zoom: number): void {
    if (this.rs.panX === panX && this.rs.panY === panY && this.rs.zoom === zoom) return;
    this.rs.panX = panX;
    this.rs.panY = panY;
    this.rs.zoom = zoom;
    this.rs.dirty |= DIRTY_TRANSFORM;
  }

  setLayers(layers: Layer[], selectedIds: string[]): void {
    this.rs.layers = layers;
    this.rs.selectedLayerIds = selectedIds;
    this.rs.dirty |= DIRTY_LAYERS;
  }

  setProjectSize(w: number, h: number): void {
    if (this.rs.projectWidth === w && this.rs.projectHeight === h) return;
    this.rs.projectWidth = w;
    this.rs.projectHeight = h;
    this.rs.dirty |= DIRTY_LAYERS | DIRTY_TRANSFORM;
  }

  setPreviewMask(mask: Uint8ClampedArray | null): void {
    this.rs.previewMask = mask;
    this.rs.dirty |= DIRTY_PREVIEW;
  }

  setSelectionMask(mask: Uint8ClampedArray | null): void {
    this.rs.selectionMask = mask;
    this.rs.dirty |= DIRTY_SELECTION;
  }

  markLayersDirty(): void {
    this.rs.dirty |= DIRTY_LAYERS;
  }

  // ── Coordinate transforms ─────────────────────────────
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    if (!this.canvas) return { x: screenX, y: screenY };

    const rect = this.canvas.getBoundingClientRect();
    // CSS pixel relative to canvas top-left
    const cssX = screenX - rect.left;
    const cssY = screenY - rect.top;

    const centerX = this.containerW / 2;
    const centerY = this.containerH / 2;
    const { panX, panY, zoom, projectWidth, projectHeight } = this.rs;

    const worldX = (cssX - centerX - panX) / zoom + projectWidth / 2;
    const worldY = (cssY - centerY - panY) / zoom + projectHeight / 2;

    return { x: worldX, y: worldY };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    if (!this.canvas) return { x: worldX, y: worldY };

    const rect = this.canvas.getBoundingClientRect();
    const centerX = this.containerW / 2;
    const centerY = this.containerH / 2;
    const { panX, panY, zoom, projectWidth, projectHeight } = this.rs;

    const screenX = (worldX - projectWidth / 2) * zoom + panX + centerX + rect.left;
    const screenY = (worldY - projectHeight / 2) * zoom + panY + centerY + rect.top;

    return { x: screenX, y: screenY };
  }

  isInBounds(worldX: number, worldY: number): boolean {
    return worldX >= 0 && worldX < this.rs.projectWidth &&
           worldY >= 0 && worldY < this.rs.projectHeight;
  }

  // ── Render tick ────────────────────────────────────────
  private tick = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // FPS tracking
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTime = avg;
    this.fps = Math.round(1000 / avg);

    // Marching ants animation
    this.marchTime += dt;
    if (this.marchTime > 100) {
      this.marchTime = 0;
      _marchOffset += 1;
      if (this.rs.selectionMask) {
        this.rs.dirty |= DIRTY_SELECTION;
      }
    }

    this.render();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    const { canvas, ctx, dpr } = this;
    if (!canvas || !ctx) return;

    const rs = this.rs;
    const dirty = rs.dirty;

    // If nothing is dirty and no marching ants, we can skip (but we always draw for now to handle animation)
    // In the future we can add full skip logic here.

    // ── Rebuild cached textures if needed ──
    if (dirty & DIRTY_LAYERS) {
      rebuildComposite(rs);
    }

    if ((dirty & DIRTY_PREVIEW) && rs.previewMask) {
      rebuildPreviewTexture(rs.previewMask, rs.projectWidth, rs.projectHeight);
    }

    if ((dirty & DIRTY_SELECTION) && rs.selectionMask) {
      rebuildSelectionTexture(rs.selectionMask, rs.projectWidth, rs.projectHeight);
    }

    // Clear dirty
    rs.dirty = DIRTY_NONE;

    // ── Draw ──
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply world transform
    const centerX = this.containerW / 2;
    const centerY = this.containerH / 2;
    const { panX, panY, zoom, projectWidth, projectHeight } = rs;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(centerX + panX, centerY + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-projectWidth / 2, -projectHeight / 2);

    // 1. Checkerboard background
    const checker = getCheckerboard(projectWidth, projectHeight);
    ctx.drawImage(checker, 0, 0);

    // 2. Canvas border
    ctx.strokeStyle = 'hsl(217, 91%, 60%)';
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, projectWidth, projectHeight);

    // 3. Composite layer image -- ONE drawImage call
    if (_compositeCanvas) {
      ctx.drawImage(_compositeCanvas, 0, 0);
    }

    // 4. Segment highlights (overlay on top of composite)
    drawSegmentHighlights(ctx, rs.layers, rs.selectedLayerIds, zoom);

    // 5. Preview mask texture -- ONE drawImage call
    if (rs.previewMask && _previewTexture) {
      ctx.drawImage(_previewTexture, 0, 0);
    }

    // 6. Selection texture -- ONE drawImage call
    if (rs.selectionMask && _selectionTexture) {
      ctx.drawImage(_selectionTexture, 0, 0);
    }
  }
}

// Singleton
export const renderEngine = new RenderEngine();
