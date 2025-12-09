import { Layer, Modifier, TransparencyMaskModifier } from './types';
import { cloneImageData } from './imageUtils';

/**
 * ModifierStack - Apply non-destructive modifications to layers
 */
export class ModifierStack {
  /**
   * Apply all enabled modifiers to layer imageData
   */
  static applyStack(layer: Layer): ImageData {
    if (layer.modifiers.length === 0) {
      return layer.imageData;
    }
    
    let result = cloneImageData(layer.imageData);
    
    for (const modifier of layer.modifiers) {
      if (!modifier.enabled) continue;
      
      result = this.applyModifier(result, modifier);
    }
    
    return result;
  }
  
  /**
   * Apply single modifier to imageData
   */
  static applyModifier(imageData: ImageData, modifier: Modifier): ImageData {
    switch (modifier.type) {
      case 'transparency-mask':
        return this.applyTransparencyMask(
          imageData, 
          modifier as TransparencyMaskModifier
        );
      case 'brightness':
        return this.applyBrightness(
          imageData, 
          modifier.parameters.value as number
        );
      case 'contrast':
        return this.applyContrast(
          imageData,
          modifier.parameters.value as number
        );
      default:
        return imageData;
    }
  }
  
  /**
   * Apply transparency mask to imageData
   */
  static applyTransparencyMask(
    imageData: ImageData,
    modifier: TransparencyMaskModifier
  ): ImageData {
    const result = cloneImageData(imageData);
    const { mask, bounds } = modifier.parameters;
    const effectStrength = modifier.opacity;
    
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
          continue;
        }
        
        const maskIndex = y * imageData.width + x;
        const maskValue = mask[maskIndex] / 255;
        
        if (maskValue > 0) {
          const dataIndex = maskIndex * 4;
          const currentAlpha = result.data[dataIndex + 3];
          result.data[dataIndex + 3] = currentAlpha * (1 - maskValue * effectStrength);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Apply brightness adjustment
   */
  static applyBrightness(imageData: ImageData, brightness: number): ImageData {
    const result = cloneImageData(imageData);
    
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = Math.min(255, Math.max(0, result.data[i] + brightness));
      result.data[i + 1] = Math.min(255, Math.max(0, result.data[i + 1] + brightness));
      result.data[i + 2] = Math.min(255, Math.max(0, result.data[i + 2] + brightness));
    }
    
    return result;
  }
  
  /**
   * Apply contrast adjustment
   */
  static applyContrast(imageData: ImageData, contrast: number): ImageData {
    const result = cloneImageData(imageData);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = Math.min(255, Math.max(0, factor * (result.data[i] - 128) + 128));
      result.data[i + 1] = Math.min(255, Math.max(0, factor * (result.data[i + 1] - 128) + 128));
      result.data[i + 2] = Math.min(255, Math.max(0, factor * (result.data[i + 2] - 128) + 128));
    }
    
    return result;
  }
}
