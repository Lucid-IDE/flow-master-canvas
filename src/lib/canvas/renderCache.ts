/**
 * Render Cache - Caches expensive render operations
 * 
 * Caches checkerboard pattern and layer render results
 * to avoid recreating them every frame.
 */

import { Layer } from './types';
import { GRID_SIZE } from './constants';

// Checkerboard pattern cache
let checkerboardCanvas: HTMLCanvasElement | null = null;
let checkerboardSize = { width: 0, height: 0 };

export function getCheckerboardCanvas(width: number, height: number): HTMLCanvasElement {
  if (checkerboardCanvas && 
      checkerboardSize.width === width && 
      checkerboardSize.height === height) {
    return checkerboardCanvas;
  }
  
  // Create new checkerboard
  checkerboardCanvas = document.createElement('canvas');
  checkerboardCanvas.width = width;
  checkerboardCanvas.height = height;
  checkerboardSize = { width, height };
  
  const ctx = checkerboardCanvas.getContext('2d')!;
  const size = GRID_SIZE;
  
  ctx.fillStyle = '#1a1a24';
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = '#232333';
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
        ctx.fillRect(x, y, size, size);
      }
    }
  }
  
  return checkerboardCanvas;
}

// Layer render cache
interface LayerCache {
  canvas: HTMLCanvasElement;
  layerId: string;
  version: number;
}

const layerRenderCache = new Map<string, LayerCache>();
const layerVersions = new Map<string, number>();

export function getCachedLayerCanvas(layer: Layer, imageData: ImageData): HTMLCanvasElement {
  const version = layerVersions.get(layer.id) || 0;
  const cached = layerRenderCache.get(layer.id);
  
  if (cached && cached.version === version) {
    return cached.canvas;
  }
  
  // Create new cached canvas
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  
  layerRenderCache.set(layer.id, {
    canvas,
    layerId: layer.id,
    version,
  });
  
  return canvas;
}

export function invalidateLayerCache(layerId: string): void {
  const version = (layerVersions.get(layerId) || 0) + 1;
  layerVersions.set(layerId, version);
  layerRenderCache.delete(layerId);
}

export function cleanupLayerCache(activeLayerIds: Set<string>): void {
  for (const id of layerRenderCache.keys()) {
    if (!activeLayerIds.has(id)) {
      layerRenderCache.delete(id);
      layerVersions.delete(id);
    }
  }
}
