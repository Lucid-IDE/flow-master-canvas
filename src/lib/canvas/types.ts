// Core Types for V3 Image Editor

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Transform {
  tx: number;
  ty: number;
  rotation: number;
  sx: number;
  sy: number;
}

export type BlendMode = 
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten';

export interface Modifier {
  id: string;
  type: 'transparency-mask' | 'brightness' | 'contrast' | 'saturation';
  enabled: boolean;
  opacity: number;
  parameters: Record<string, unknown>;
}

export interface TransparencyMaskModifier extends Modifier {
  type: 'transparency-mask';
  parameters: {
    mask: Uint8ClampedArray;
    bounds: Rectangle;
  };
}

export interface Layer {
  id: string;
  name: string;
  type: 'raster';
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  imageData: ImageData;
  bounds: Rectangle;
  transform: Transform;
  modifiers: Modifier[];
  createdAt: number;
  modifiedAt: number;
  segmentColor?: string; // Color for segment highlight visualization
}

export interface SelectionMask {
  id: string;
  mask: Uint8ClampedArray;
  bounds: Rectangle;
  width: number;
  height: number;
  pixels: Set<number>;
  feathered: boolean;
  metadata: {
    seedPoint: Point;
    tolerance: number;
    connectivity: 4 | 8;
    engine?: string;
    processingTime?: number;
  };
}

export interface CanvasState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: Layer[];
  selectedLayerIds: string[];
  activeSelection: SelectionMask | null;
  createdAt: number;
  modifiedAt: number;
}

export interface HistorySnapshot {
  id: string;
  description: string;
  project: Project;
  canvasState: CanvasState;
  timestamp: number;
}

export type ToolType = 
  | 'select'
  | 'move'
  | 'magic-wand'
  | 'brush'
  | 'eraser'
  | 'zoom'
  | 'pan';

export interface ToolState {
  activeTool: ToolType;
  tolerance: number;
  brushSize: number;
  brushHardness: number;
}

// Worker message types
export interface SegmentRequest {
  type: 'segment';
  id: string;
  imageData: {
    data: ArrayBuffer;
    width: number;
    height: number;
  };
  startPoint: Point;
  options: {
    tolerance: number;
    connectivity: 4 | 8;
    feather: number;
  };
}

export interface SegmentResult {
  type: 'segment-result';
  id: string;
  mask: ArrayBuffer;
  bounds: Rectangle;
  pixels: number[];
  metadata: {
    pixelCount: number;
    processingTime: number;
  };
}

export interface PreviewRequest {
  type: 'preview';
  id: string;
  imageData: {
    data: ArrayBuffer;
    width: number;
    height: number;
  };
  startPoint: Point;
  tolerance: number;
}

export interface PreviewResult {
  type: 'preview-result';
  id: string;
  ring: number;
  mask: ArrayBuffer;
  bounds: Rectangle;
  complete: boolean;
}

export type WorkerMessage = SegmentRequest | PreviewRequest;
export type WorkerResponse = SegmentResult | PreviewResult;
