import { Layer, Rectangle } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { ModifierStack } from './modifierStack';

/**
 * Composite multiple layers into single ImageData
 * 
 * Process: Bottom to top, apply transforms and blend modes
 */
export function compositeLayers(
  layers: Layer[],
  width: number = CANVAS_WIDTH,
  height: number = CANVAS_HEIGHT
): ImageData {
  // Create offscreen canvas for compositing
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get offscreen canvas context');
  }
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Get visible layers sorted by z-index (bottom to top)
  const visibleLayers = layers.filter(layer => layer.visible);
  
  for (const layer of visibleLayers) {
    // Apply modifiers to get modified imageData
    const modifiedImageData = ModifierStack.applyStack(layer);
    
    // Create temp canvas for layer
    const tempCanvas = new OffscreenCanvas(
      modifiedImageData.width,
      modifiedImageData.height
    );
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) continue;
    
    tempCtx.putImageData(modifiedImageData, 0, 0);
    
    // Apply layer settings
    ctx.save();
    
    // Set blend mode
    ctx.globalCompositeOperation = getCompositeOperation(layer.blendMode);
    
    // Set opacity
    ctx.globalAlpha = layer.opacity;
    
    // Apply transform
    const { tx, ty, rotation, sx, sy } = layer.transform;
    const centerX = layer.bounds.x + layer.bounds.width / 2;
    const centerY = layer.bounds.y + layer.bounds.height / 2;
    
    ctx.translate(centerX + tx, centerY + ty);
    ctx.rotate(rotation);
    ctx.scale(sx, sy);
    ctx.translate(-layer.bounds.width / 2, -layer.bounds.height / 2);
    
    // Draw layer
    ctx.drawImage(tempCanvas, 0, 0);
    
    ctx.restore();
  }
  
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Convert blend mode to canvas composite operation
 */
function getCompositeOperation(blendMode: string): GlobalCompositeOperation {
  switch (blendMode) {
    case 'multiply': return 'multiply';
    case 'screen': return 'screen';
    case 'overlay': return 'overlay';
    case 'darken': return 'darken';
    case 'lighten': return 'lighten';
    default: return 'source-over';
  }
}

/**
 * Get composite within specific bounds
 */
export function compositeLayersInBounds(
  layers: Layer[],
  bounds: Rectangle
): ImageData {
  const fullComposite = compositeLayers(layers);
  
  const canvas = new OffscreenCanvas(bounds.width, bounds.height);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get context');
  }
  
  // Create temp canvas with full composite
  const tempCanvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const tempCtx = tempCanvas.getContext('2d');
  
  if (!tempCtx) {
    throw new Error('Failed to get temp context');
  }
  
  tempCtx.putImageData(fullComposite, 0, 0);
  
  // Draw cropped region
  ctx.drawImage(
    tempCanvas,
    bounds.x, bounds.y, bounds.width, bounds.height,
    0, 0, bounds.width, bounds.height
  );
  
  return ctx.getImageData(0, 0, bounds.width, bounds.height);
}
