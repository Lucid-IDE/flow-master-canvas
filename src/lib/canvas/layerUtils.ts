import { v4 as uuidv4 } from 'uuid';
import { Layer, Transform, Rectangle, SelectionMask } from './types';
import { extractPixelsWithMask, calculateBounds } from './imageUtils';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

/**
 * Create identity transform
 */
export function createIdentityTransform(): Transform {
  return {
    tx: 0,
    ty: 0,
    rotation: 0,
    sx: 1,
    sy: 1,
  };
}

/**
 * Create new layer from ImageData
 */
export function createLayer(
  imageData: ImageData,
  name: string,
  bounds?: Rectangle
): Layer {
  const actualBounds = bounds || {
    x: Math.floor((CANVAS_WIDTH - imageData.width) / 2),
    y: Math.floor((CANVAS_HEIGHT - imageData.height) / 2),
    width: imageData.width,
    height: imageData.height,
  };
  
  return {
    id: uuidv4(),
    name,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    imageData,
    bounds: actualBounds,
    transform: createIdentityTransform(),
    modifiers: [],
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
}

/**
 * Create layer from selection mask
 */
export function createLayerFromSelection(
  sourceImageData: ImageData,
  selection: SelectionMask,
  name: string
): Layer {
  // Extract pixels within mask
  const extracted = extractPixelsWithMask(
    sourceImageData,
    selection.mask,
    selection.bounds
  );
  
  // Calculate actual non-empty bounds
  const actualBounds = calculateBounds(extracted);
  
  if (actualBounds.width === 0 || actualBounds.height === 0) {
    throw new Error('Selection is empty');
  }
  
  // Crop to actual bounds
  const canvas = new OffscreenCanvas(actualBounds.width, actualBounds.height);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get context');
  }
  
  const tempCanvas = new OffscreenCanvas(extracted.width, extracted.height);
  const tempCtx = tempCanvas.getContext('2d');
  
  if (!tempCtx) {
    throw new Error('Failed to get temp context');
  }
  
  tempCtx.putImageData(extracted, 0, 0);
  
  ctx.drawImage(
    tempCanvas,
    actualBounds.x, actualBounds.y, actualBounds.width, actualBounds.height,
    0, 0, actualBounds.width, actualBounds.height
  );
  
  const croppedImageData = ctx.getImageData(0, 0, actualBounds.width, actualBounds.height);
  
  return createLayer(croppedImageData, name, {
    x: selection.bounds.x + actualBounds.x,
    y: selection.bounds.y + actualBounds.y,
    width: actualBounds.width,
    height: actualBounds.height,
  });
}

/**
 * Duplicate layer
 */
export function duplicateLayer(layer: Layer): Layer {
  const newImageData = new ImageData(
    new Uint8ClampedArray(layer.imageData.data),
    layer.imageData.width,
    layer.imageData.height
  );
  
  return {
    ...layer,
    id: uuidv4(),
    name: `${layer.name} Copy`,
    imageData: newImageData,
    modifiers: layer.modifiers.map(m => ({ ...m, id: uuidv4() })),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
}

/**
 * Update layer
 */
export function updateLayer(
  layer: Layer,
  updates: Partial<Layer>
): Layer {
  return {
    ...layer,
    ...updates,
    modifiedAt: Date.now(),
  };
}

/**
 * Merge multiple layers into one
 */
export function mergeLayers(layers: Layer[]): Layer {
  if (layers.length === 0) {
    throw new Error('No layers to merge');
  }
  
  if (layers.length === 1) {
    return duplicateLayer(layers[0]);
  }
  
  // Calculate combined bounds
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const layer of layers) {
    minX = Math.min(minX, layer.bounds.x);
    minY = Math.min(minY, layer.bounds.y);
    maxX = Math.max(maxX, layer.bounds.x + layer.bounds.width);
    maxY = Math.max(maxY, layer.bounds.y + layer.bounds.height);
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  // Create composite canvas
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get context');
  }
  
  // Composite layers
  for (const layer of layers) {
    if (!layer.visible) continue;
    
    const tempCanvas = new OffscreenCanvas(
      layer.imageData.width,
      layer.imageData.height
    );
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) continue;
    
    tempCtx.putImageData(layer.imageData, 0, 0);
    
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(
      tempCanvas,
      layer.bounds.x - minX,
      layer.bounds.y - minY
    );
  }
  
  const mergedImageData = ctx.getImageData(0, 0, width, height);
  
  return createLayer(mergedImageData, 'Merged Layer', {
    x: minX,
    y: minY,
    width,
    height,
  });
}
