import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

/**
 * DimensionValidator - Validates ImageData dimensions
 * 
 * Ensures all ImageData entering the system has correct dimensions.
 * Fail-fast approach prevents downstream errors.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DimensionValidatorOptions {
  allowDownscale?: boolean;
  maxDimension?: number;
  requireExact?: boolean;
}

export class DimensionValidator {
  /**
   * Validate ImageData has correct dimensions
   */
  static validate(
    imageData: ImageData,
    expectedWidth: number = CANVAS_WIDTH,
    expectedHeight: number = CANVAS_HEIGHT
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check width
    if (imageData.width !== expectedWidth) {
      errors.push(`Width mismatch: expected ${expectedWidth}, got ${imageData.width}`);
    }
    
    // Check height
    if (imageData.height !== expectedHeight) {
      errors.push(`Height mismatch: expected ${expectedHeight}, got ${imageData.height}`);
    }
    
    // Check data array length
    const expectedLength = expectedWidth * expectedHeight * 4;
    if (imageData.data.length !== expectedLength) {
      errors.push(`Data length mismatch: expected ${expectedLength}, got ${imageData.data.length}`);
    }
    
    // Check data type
    if (!(imageData.data instanceof Uint8ClampedArray)) {
      errors.push('Data must be Uint8ClampedArray');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * Validate and optionally resize ImageData
   */
  static validateAndResize(
    imageData: ImageData,
    options: DimensionValidatorOptions = {}
  ): { imageData: ImageData; result: ValidationResult } {
    const {
      allowDownscale = true,
      maxDimension = Math.max(CANVAS_WIDTH, CANVAS_HEIGHT),
      requireExact = false,
    } = options;
    
    const result = this.validate(imageData);
    
    if (result.valid) {
      return { imageData, result };
    }
    
    if (requireExact) {
      return { imageData, result };
    }
    
    // Calculate new dimensions
    let newWidth = imageData.width;
    let newHeight = imageData.height;
    
    if (imageData.width > maxDimension || imageData.height > maxDimension) {
      if (allowDownscale) {
        const scale = Math.min(
          maxDimension / imageData.width,
          maxDimension / imageData.height
        );
        newWidth = Math.floor(imageData.width * scale);
        newHeight = Math.floor(imageData.height * scale);
        result.warnings.push(`Downscaled from ${imageData.width}x${imageData.height} to ${newWidth}x${newHeight}`);
      }
    }
    
    // Resize if needed
    if (newWidth !== imageData.width || newHeight !== imageData.height) {
      const resized = this.resize(imageData, newWidth, newHeight);
      result.valid = true;
      result.errors = [];
      return { imageData: resized, result };
    }
    
    return { imageData, result };
  }
  
  /**
   * Resize ImageData to new dimensions
   */
  static resize(
    imageData: ImageData,
    newWidth: number,
    newHeight: number
  ): ImageData {
    // Create temp canvas with original image
    const tempCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error('Failed to get temp context');
    tempCtx.putImageData(imageData, 0, 0);
    
    // Create output canvas
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get context');
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
    
    return ctx.getImageData(0, 0, newWidth, newHeight);
  }
  
  /**
   * Validate point is within ImageData bounds
   */
  static validatePoint(
    x: number,
    y: number,
    width: number = CANVAS_WIDTH,
    height: number = CANVAS_HEIGHT
  ): boolean {
    return x >= 0 && x < width && y >= 0 && y < height;
  }
  
  /**
   * Validate rectangle is within ImageData bounds
   */
  static validateRectangle(
    rect: { x: number; y: number; width: number; height: number },
    imageWidth: number = CANVAS_WIDTH,
    imageHeight: number = CANVAS_HEIGHT
  ): boolean {
    return (
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= imageWidth &&
      rect.y + rect.height <= imageHeight &&
      rect.width > 0 &&
      rect.height > 0
    );
  }
}
