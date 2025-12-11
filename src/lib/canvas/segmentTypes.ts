// Segment/Magic Wand Engine Types

export type SegmentEngine = 
  | 'v7-hybrid'      // NEW: Best of all approaches combined
  | 'v6-wave' 
  | 'v5-instant' 
  | 'v4-scanline' 
  | 'v3-queue' 
  | 'v2-recursive'
  | 'v1-iterative';  // NEW: Generator-based iterative (from fuzzy-select)

export type SegmentMethod = 'flood-fill' | 'color-range' | 'edge-detect' | 'contiguous' | 'similar';
export type Connectivity = 4 | 8;
export type ColorSpace = 'rgb' | 'hsl' | 'lab';

export interface SegmentSettings {
  // Engine selection
  engine: SegmentEngine;
  method: SegmentMethod;
  
  // Core parameters
  tolerance: number;
  connectivity: Connectivity;
  colorSpace: ColorSpace;
  
  // V6 Wave-specific
  waveTimeBudget: number; // ms per frame (4-12)
  waveExpansionRate: number; // rings per frame (1-10)
  breathingEnabled: boolean;
  breathingSmoothness: number; // 0-1
  
  // Instant mode
  instantFillEnabled: boolean;
  
  // Preview options
  previewEnabled: boolean;
  zeroLatencyPreview: boolean;
  previewOpacity: number; // 0-1
  
  // Edge refinement
  antiAlias: boolean;
  featherRadius: number; // 0-50
  smoothEdges: boolean;
  edgeContrast: number; // 0-2
  
  // Advanced
  sampleSize: number; // 1, 3, 5, 11 (point sample, 3x3, 5x5, 11x11)
  contiguousOnly: boolean;
  selectAllLayers: boolean;
  maskOutput: 'selection' | 'layer' | 'mask-channel';
}

export const DEFAULT_SEGMENT_SETTINGS: SegmentSettings = {
  engine: 'v6-wave',
  method: 'flood-fill',
  tolerance: 32,
  connectivity: 4,
  colorSpace: 'rgb',
  waveTimeBudget: 8,
  waveExpansionRate: 20, // Much faster default
  breathingEnabled: true,
  breathingSmoothness: 0.5,
  instantFillEnabled: false,
  previewEnabled: true,
  zeroLatencyPreview: true,
  previewOpacity: 0.5,
  antiAlias: true,
  featherRadius: 0,
  smoothEdges: false,
  edgeContrast: 1,
  sampleSize: 1,
  contiguousOnly: true,
  selectAllLayers: false,
  maskOutput: 'selection',
};

export const SEGMENT_ENGINE_INFO: Record<SegmentEngine, { 
  name: string; 
  description: string; 
  speed: 'slow' | 'medium' | 'fast' | 'instant';
  recommended?: boolean;
}> = {
  'v7-hybrid': {
    name: 'V7 Hybrid',
    description: 'Best of all engines: TypedArray queue + RangeSet spans + scanline optimization + progressive mode',
    speed: 'instant',
    recommended: true,
  },
  'v6-wave': {
    name: 'V6 Organic Wave',
    description: 'Ring BFS with progressive expansion, breathing tolerance, zero-latency preview',
    speed: 'fast',
  },
  'v5-instant': {
    name: 'V5 Instant Fill',
    description: 'Complete flood fill in single frame using TypedArray queue for O(1) operations',
    speed: 'instant',
  },
  'v4-scanline': {
    name: 'V4 Scanline',
    description: 'Optimized scanline flood fill with horizontal run detection, faster for large areas',
    speed: 'fast',
  },
  'v3-queue': {
    name: 'V3 Queue BFS',
    description: 'Standard queue-based BFS, reliable and predictable',
    speed: 'medium',
  },
  'v2-recursive': {
    name: 'V2 Recursive',
    description: 'Simple recursive flood fill, may stack overflow on large areas',
    speed: 'slow',
  },
  'v1-iterative': {
    name: 'V1 Iterative Generator',
    description: 'Generator-based iterative processing, processes N steps per frame without blocking',
    speed: 'medium',
  },
};

export const SEGMENT_METHOD_INFO: Record<SegmentMethod, {
  name: string;
  description: string;
}> = {
  'flood-fill': {
    name: 'Flood Fill',
    description: 'Select contiguous pixels matching seed color within tolerance',
  },
  'color-range': {
    name: 'Color Range',
    description: 'Select all pixels in image matching color range (non-contiguous)',
  },
  'edge-detect': {
    name: 'Edge Detection',
    description: 'Stop expansion at detected edges regardless of color',
  },
  'contiguous': {
    name: 'Contiguous',
    description: 'Standard contiguous selection based on pixel connectivity',
  },
  'similar': {
    name: 'Similar Colors',
    description: 'Select all similar colors throughout the image',
  },
};
