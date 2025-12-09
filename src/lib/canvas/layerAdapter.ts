import { Layer } from './types';
import { ModifierStack } from './modifierStack';

/**
 * Layer Adapter - Adapts layer data for rendering
 * 
 * Handles coordinate conversions and caching for efficient rendering.
 */

export interface RenderableLayer {
  id: string;
  visible: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  imageData: ImageData;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

// Cache for layer rendering
const layerCache = new Map<string, {
  imageData: ImageData;
  modifiedAt: number;
}>();

/**
 * Adapt layer for rendering
 */
export function adaptLayerForRendering(layer: Layer): RenderableLayer {
  // Check cache
  const cached = layerCache.get(layer.id);
  let imageData: ImageData;
  
  if (cached && cached.modifiedAt === layer.modifiedAt) {
    // Use cached version
    imageData = cached.imageData;
  } else {
    // Apply modifiers and cache
    imageData = ModifierStack.applyStack(layer);
    layerCache.set(layer.id, {
      imageData,
      modifiedAt: layer.modifiedAt,
    });
  }
  
  return {
    id: layer.id,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: getCompositeOperation(layer.blendMode),
    imageData,
    x: layer.bounds.x + layer.transform.tx,
    y: layer.bounds.y + layer.transform.ty,
    width: layer.bounds.width,
    height: layer.bounds.height,
    rotation: layer.transform.rotation,
    scaleX: layer.transform.sx,
    scaleY: layer.transform.sy,
  };
}

/**
 * Adapt multiple layers for rendering
 */
export function adaptLayersForRendering(layers: Layer[]): RenderableLayer[] {
  return layers
    .filter(layer => layer.visible)
    .map(adaptLayerForRendering);
}

/**
 * Clear layer cache
 */
export function clearLayerCache(layerId?: string): void {
  if (layerId) {
    layerCache.delete(layerId);
  } else {
    layerCache.clear();
  }
}

/**
 * Convert blend mode to canvas composite operation
 */
function getCompositeOperation(blendMode: string): GlobalCompositeOperation {
  const modeMap: Record<string, GlobalCompositeOperation> = {
    'normal': 'source-over',
    'multiply': 'multiply',
    'screen': 'screen',
    'overlay': 'overlay',
    'darken': 'darken',
    'lighten': 'lighten',
    'color-dodge': 'color-dodge',
    'color-burn': 'color-burn',
    'hard-light': 'hard-light',
    'soft-light': 'soft-light',
    'difference': 'difference',
    'exclusion': 'exclusion',
    'hue': 'hue',
    'saturation': 'saturation',
    'color': 'color',
    'luminosity': 'luminosity',
  };
  
  return modeMap[blendMode] || 'source-over';
}

/**
 * Create temporary canvas for layer rendering
 */
export function createLayerCanvas(layer: RenderableLayer): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = layer.width;
  canvas.height = layer.height;
  
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.putImageData(layer.imageData, 0, 0);
  }
  
  return canvas;
}
