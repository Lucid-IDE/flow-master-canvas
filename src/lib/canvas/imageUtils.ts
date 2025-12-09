import { RGBA, Rectangle, Point } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

/**
 * Get RGBA color at pixel index
 */
export function getPixelColor(imageData: ImageData, x: number, y: number): RGBA {
  const index = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
    a: imageData.data[index + 3],
  };
}

/**
 * Set RGBA color at pixel index
 */
export function setPixelColor(imageData: ImageData, x: number, y: number, color: RGBA): void {
  const index = (y * imageData.width + x) * 4;
  imageData.data[index] = color.r;
  imageData.data[index + 1] = color.g;
  imageData.data[index + 2] = color.b;
  imageData.data[index + 3] = color.a;
}

/**
 * Calculate color similarity (0-255 range)
 */
export function colorSimilarity(c1: RGBA, c2: RGBA): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  const da = c1.a - c2.a;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
}

/**
 * Check if colors are similar within tolerance
 */
export function colorsAreSimilar(c1: RGBA, c2: RGBA, tolerance: number): boolean {
  return colorSimilarity(c1, c2) <= tolerance;
}

/**
 * Create empty ImageData with specified dimensions
 */
export function createEmptyImageData(
  width: number = CANVAS_WIDTH,
  height: number = CANVAS_HEIGHT
): ImageData {
  return new ImageData(width, height);
}

/**
 * Clone ImageData (immutable operation)
 */
export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

/**
 * Extract pixels within bounds using mask
 */
export function extractPixelsWithMask(
  sourceImageData: ImageData,
  mask: Uint8ClampedArray,
  bounds: Rectangle
): ImageData {
  const result = new ImageData(bounds.width, bounds.height);
  
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const worldX = bounds.x + x;
      const worldY = bounds.y + y;
      
      if (worldX < 0 || worldX >= sourceImageData.width ||
          worldY < 0 || worldY >= sourceImageData.height) {
        continue;
      }
      
      const maskIndex = worldY * sourceImageData.width + worldX;
      const maskValue = mask[maskIndex];
      
      if (maskValue > 0) {
        const srcIndex = (worldY * sourceImageData.width + worldX) * 4;
        const destIndex = (y * bounds.width + x) * 4;
        
        result.data[destIndex] = sourceImageData.data[srcIndex];
        result.data[destIndex + 1] = sourceImageData.data[srcIndex + 1];
        result.data[destIndex + 2] = sourceImageData.data[srcIndex + 2];
        result.data[destIndex + 3] = sourceImageData.data[srcIndex + 3] * (maskValue / 255);
      }
    }
  }
  
  return result;
}

/**
 * Calculate non-empty bounds of ImageData
 */
export function calculateBounds(imageData: ImageData): Rectangle {
  let minX = imageData.width;
  let minY = imageData.height;
  let maxX = 0;
  let maxY = 0;
  
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const index = (y * imageData.width + x) * 4;
      if (imageData.data[index + 3] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  if (minX > maxX || minY > maxY) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Validate ImageData dimensions
 */
export function validateImageDataDimensions(
  imageData: ImageData,
  expectedWidth: number,
  expectedHeight: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (imageData.width !== expectedWidth) {
    errors.push(`Width mismatch: expected ${expectedWidth}, got ${imageData.width}`);
  }
  
  if (imageData.height !== expectedHeight) {
    errors.push(`Height mismatch: expected ${expectedHeight}, got ${imageData.height}`);
  }
  
  const expectedLength = expectedWidth * expectedHeight * 4;
  if (imageData.data.length !== expectedLength) {
    errors.push(`Data length mismatch: expected ${expectedLength}, got ${imageData.data.length}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Load image from file
 */
export function loadImageFromFile(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        resolve(imageData);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Resize ImageData to fit within bounds while maintaining aspect ratio
 */
export function resizeImageData(
  imageData: ImageData,
  maxWidth: number,
  maxHeight: number
): ImageData {
  const scale = Math.min(
    maxWidth / imageData.width,
    maxHeight / imageData.height,
    1 // Don't upscale
  );
  
  const newWidth = Math.floor(imageData.width * scale);
  const newHeight = Math.floor(imageData.height * scale);
  
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) throw new Error('Failed to get temp context');
  tempCtx.putImageData(imageData, 0, 0);
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get context');
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
  
  return ctx.getImageData(0, 0, newWidth, newHeight);
}
