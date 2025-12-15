/**
 * Segment Highlight Cache
 * 
 * Pre-renders segment fill and edge highlights to offscreen canvases
 * to avoid per-frame pixel iteration which kills performance.
 */

import { Layer } from './types';

interface CachedHighlight {
  fillCanvas: HTMLCanvasElement;
  edgeCanvas: HTMLCanvasElement;
  layerId: string;
  version: number; // Track changes to invalidate cache
}

class SegmentHighlightCache {
  private cache = new Map<string, CachedHighlight>();
  private layerVersions = new Map<string, number>();
  
  /**
   * Get or create cached highlight canvases for a segment layer
   */
  getHighlight(layer: Layer): CachedHighlight | null {
    if (!layer.segmentColor) return null;
    
    const currentVersion = this.layerVersions.get(layer.id) || 0;
    const cached = this.cache.get(layer.id);
    
    if (cached && cached.version === currentVersion) {
      return cached;
    }
    
    // Generate new cache
    const highlight = this.generateHighlight(layer, currentVersion);
    this.cache.set(layer.id, highlight);
    return highlight;
  }
  
  /**
   * Invalidate cache for a layer (call when layer changes)
   */
  invalidate(layerId: string): void {
    const version = (this.layerVersions.get(layerId) || 0) + 1;
    this.layerVersions.set(layerId, version);
    this.cache.delete(layerId);
  }
  
  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.layerVersions.clear();
  }
  
  /**
   * Remove cache for deleted layers
   */
  cleanup(activeLayerIds: Set<string>): void {
    for (const id of this.cache.keys()) {
      if (!activeLayerIds.has(id)) {
        this.cache.delete(id);
        this.layerVersions.delete(id);
      }
    }
  }
  
  private generateHighlight(layer: Layer, version: number): CachedHighlight {
    const { width, height, data } = layer.imageData;
    const color = layer.segmentColor!;
    
    // Create fill canvas
    const fillCanvas = document.createElement('canvas');
    fillCanvas.width = width;
    fillCanvas.height = height;
    const fillCtx = fillCanvas.getContext('2d')!;
    
    // Create edge canvas
    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = width;
    edgeCanvas.height = height;
    const edgeCtx = edgeCanvas.getContext('2d')!;
    
    // Use ImageData for faster pixel manipulation
    const fillImageData = fillCtx.createImageData(width, height);
    const edgeImageData = edgeCtx.createImageData(width, height);
    
    // Parse color to RGB
    const rgb = this.parseColor(color);
    
    // Single pass: identify filled and edge pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        
        if (alpha > 0) {
          // Fill pixel
          fillImageData.data[idx] = rgb.r;
          fillImageData.data[idx + 1] = rgb.g;
          fillImageData.data[idx + 2] = rgb.b;
          fillImageData.data[idx + 3] = 255;
          
          // Check if edge
          const leftIdx = x > 0 ? (y * width + x - 1) * 4 : -1;
          const rightIdx = x < width - 1 ? (y * width + x + 1) * 4 : -1;
          const topIdx = y > 0 ? ((y - 1) * width + x) * 4 : -1;
          const bottomIdx = y < height - 1 ? ((y + 1) * width + x) * 4 : -1;
          
          const isEdge = 
            (leftIdx < 0 || data[leftIdx + 3] === 0) ||
            (rightIdx < 0 || data[rightIdx + 3] === 0) ||
            (topIdx < 0 || data[topIdx + 3] === 0) ||
            (bottomIdx < 0 || data[bottomIdx + 3] === 0);
          
          if (isEdge) {
            edgeImageData.data[idx] = rgb.r;
            edgeImageData.data[idx + 1] = rgb.g;
            edgeImageData.data[idx + 2] = rgb.b;
            edgeImageData.data[idx + 3] = 255;
          }
        }
      }
    }
    
    fillCtx.putImageData(fillImageData, 0, 0);
    edgeCtx.putImageData(edgeImageData, 0, 0);
    
    return {
      fillCanvas,
      edgeCanvas,
      layerId: layer.id,
      version,
    };
  }
  
  private parseColor(color: string): { r: number; g: number; b: number } {
    // Handle hsl() format
    const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]) / 360;
      const s = parseInt(hslMatch[2]) / 100;
      const l = parseInt(hslMatch[3]) / 100;
      return this.hslToRgb(h, s, l);
    }
    
    // Handle hex format
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    
    // Default fallback
    return { r: 59, g: 130, b: 246 }; // Blue
  }
  
  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    let r, g, b;
    
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }
}

export const segmentHighlightCache = new SegmentHighlightCache();
