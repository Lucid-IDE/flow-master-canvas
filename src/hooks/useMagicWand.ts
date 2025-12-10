import { useCallback, useRef, useEffect, useState } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { coordinateSystem } from '@/lib/canvas/coordinateSystem';
import { compositeLayers } from '@/lib/canvas/compositeLayers';
import { floodFillWithEngine, WaveFloodFill, instantFloodFill, scanlineFloodFill } from '@/lib/canvas/floodFill';
import { createLayerFromSelection } from '@/lib/canvas/layerUtils';
import { SelectionMask, Point, Rectangle } from '@/lib/canvas/types';
import { SegmentSettings } from '@/lib/canvas/segmentTypes';
import { v4 as uuidv4 } from 'uuid';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MIN_TOLERANCE, MAX_TOLERANCE } from '@/lib/canvas/constants';

/**
 * Magic Wand Hook - Multi-Engine Support
 * 
 * Supports all segment engines from settings:
 * - V6 Wave: Progressive ring expansion with preview
 * - V5 Instant: Complete fill immediately
 * - V4 Scanline: Optimized scanline algorithm
 * - V3 Queue: Standard BFS
 */

interface PreviewState {
  mask: Uint8ClampedArray | null;
  bounds: Rectangle | null;
  ringNumber: number;
  acceptedCount: number;
  complete: boolean;
}

export function useMagicWand() {
  const { 
    state, 
    setPreviewMask, 
    setSelection, 
    setHoverPoint,
    setTolerance,
    addLayer,
    pushHistory
  } = useEditor();
  
  // Get segment settings from context
  const segmentSettings = state.segmentSettings;
  
  // Wave engine for V6 progressive preview
  const waveEngineRef = useRef<WaveFloodFill>(new WaveFloodFill());
  const compositeRef = useRef<ImageData | null>(null);
  const animationRef = useRef<number | null>(null);
  const seedPointRef = useRef<Point | null>(null);
  
  // Preview state
  const [previewState, setPreviewState] = useState<PreviewState>({
    mask: null,
    bounds: null,
    ringNumber: 0,
    acceptedCount: 0,
    complete: false,
  });
  
  // Cancel ongoing preview
  const cancelPreview = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    waveEngineRef.current.reset();
    setPreviewMask(null);
    seedPointRef.current = null;
    setPreviewState({
      mask: null,
      bounds: null,
      ringNumber: 0,
      acceptedCount: 0,
      complete: false,
    });
  }, [setPreviewMask]);
  
  // Get composite image data
  const getComposite = useCallback((): ImageData | null => {
    const layers = state.project.layers;
    if (layers.length === 0) return null;
    
    // Cache composite for performance
    if (!compositeRef.current) {
      compositeRef.current = compositeLayers(layers);
    }
    return compositeRef.current;
  }, [state.project.layers]);
  
  // Run V6 wave preview animation loop
  const runWavePreview = useCallback(() => {
    const engine = waveEngineRef.current;
    
    if (!engine.isInitialized() || engine.isComplete()) {
      animationRef.current = null;
      return;
    }
    
    // Process frame with settings
    const result = engine.processFrame(
      segmentSettings.waveTimeBudget
    );
    
    const mask = engine.getMask();
    const bounds = engine.getBounds();
    
    if (mask) {
      setPreviewMask(mask);
      setPreviewState({
        mask,
        bounds,
        ringNumber: engine.getRingNumber(),
        acceptedCount: engine.getAcceptedCount(),
        complete: result.completed,
      });
    }
    
    if (!result.completed) {
      animationRef.current = requestAnimationFrame(runWavePreview);
    } else {
      animationRef.current = null;
    }
  }, [segmentSettings.waveTimeBudget, setPreviewMask]);
  
  // Start preview at point
  const startPreview = useCallback((worldX: number, worldY: number) => {
    // Cancel any existing preview
    cancelPreview();
    
    // Validate point
    if (worldX < 0 || worldX >= CANVAS_WIDTH || worldY < 0 || worldY >= CANVAS_HEIGHT) {
      return;
    }
    
    const composite = getComposite();
    if (!composite) return;
    
    seedPointRef.current = { x: worldX, y: worldY };
    const startX = Math.floor(worldX);
    const startY = Math.floor(worldY);
    
    // Check if preview is enabled
    if (!segmentSettings.previewEnabled) {
      return;
    }
    
    // Select engine based on settings
    const engine = segmentSettings.instantFillEnabled ? 'v5-instant' : segmentSettings.engine;
    
    switch (engine) {
      case 'v5-instant':
      case 'v4-scanline':
      case 'v3-queue':
      case 'v2-recursive': {
        // Instant preview - complete fill immediately
        const result = engine === 'v4-scanline'
          ? scanlineFloodFill(composite, startX, startY, segmentSettings.tolerance, segmentSettings.connectivity)
          : instantFloodFill(composite, startX, startY, segmentSettings.tolerance, segmentSettings.connectivity);
        
        setPreviewMask(result.mask);
        setPreviewState({
          mask: result.mask,
          bounds: result.bounds,
          ringNumber: result.ringCount,
          acceptedCount: result.pixels.length,
          complete: true,
        });
        break;
      }
      
      case 'v6-wave':
      default: {
        // Progressive wave preview
        const waveEngine = waveEngineRef.current;
        const initialized = waveEngine.initialize(
          composite,
          { x: startX, y: startY },
          segmentSettings.tolerance,
          segmentSettings.connectivity,
          segmentSettings.waveExpansionRate
        );
        
        if (initialized) {
          // Start animation loop
          animationRef.current = requestAnimationFrame(runWavePreview);
        }
        break;
      }
    }
  }, [cancelPreview, getComposite, segmentSettings, setPreviewMask, runWavePreview]);
  
  // Create selection from current preview or fresh fill
  const createSelection = useCallback((worldX: number, worldY: number): SelectionMask | null => {
    const composite = getComposite();
    if (!composite) return null;
    
    const startX = Math.floor(worldX);
    const startY = Math.floor(worldY);
    
    // Use the configured engine for final selection
    const result = floodFillWithEngine(composite, startX, startY, segmentSettings);
    
    if (result.pixels.length === 0) return null;
    
    const selection: SelectionMask = {
      id: uuidv4(),
      mask: result.mask,
      bounds: result.bounds,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      pixels: new Set(result.pixels),
      feathered: false,
      metadata: {
        seedPoint: { x: worldX, y: worldY },
        tolerance: segmentSettings.tolerance,
        connectivity: segmentSettings.connectivity,
        engine: segmentSettings.engine,
        processingTime: result.processingTime,
      },
    };
    
    return selection;
  }, [getComposite, segmentSettings]);
  
  // Handle click - create selection
  const handleClick = useCallback((worldX: number, worldY: number, altKey: boolean) => {
    cancelPreview();
    
    const selection = createSelection(worldX, worldY);
    if (!selection) return;
    
    if (altKey) {
      // Alt+click: Extract to new layer
      const composite = getComposite();
      if (!composite) return;
      
      try {
        const newLayer = createLayerFromSelection(
          composite,
          selection,
          `Segment ${state.project.layers.length + 1}`
        );
        
        addLayer(newLayer.imageData, newLayer.name);
        pushHistory('Extract segment to layer');
      } catch (e) {
        console.error('Failed to extract layer:', e);
      }
    } else {
      // Regular click: Set selection
      setSelection(selection);
      pushHistory('Create selection');
    }
  }, [createSelection, cancelPreview, getComposite, state.project.layers.length, setSelection, addLayer, pushHistory]);
  
  // Handle mouse move - update preview
  const handleMouseMove = useCallback((worldX: number, worldY: number) => {
    setHoverPoint({ x: worldX, y: worldY });
    
    // Invalidate composite cache when layers change
    compositeRef.current = null;
    
    startPreview(worldX, worldY);
  }, [setHoverPoint, startPreview]);
  
  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    cancelPreview();
    setHoverPoint(null);
    compositeRef.current = null;
  }, [cancelPreview, setHoverPoint]);
  
  // Handle scroll for tolerance adjustment
  const handleWheel = useCallback((deltaY: number) => {
    const currentTolerance = segmentSettings.tolerance;
    const speed = 0.5;
    const newTolerance = Math.max(
      MIN_TOLERANCE, 
      Math.min(MAX_TOLERANCE, currentTolerance - deltaY * speed)
    );
    
    if (newTolerance !== currentTolerance) {
      setTolerance(newTolerance);
      
      // For V6 wave, update tolerance and let breathing work
      if (segmentSettings.engine === 'v6-wave' && segmentSettings.breathingEnabled) {
        waveEngineRef.current.updateTolerance(newTolerance);
      }
      
      // Restart preview with new tolerance
      if (seedPointRef.current) {
        compositeRef.current = null; // Force recompute
        startPreview(seedPointRef.current.x, seedPointRef.current.y);
      }
    }
  }, [segmentSettings, setTolerance, startPreview]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      waveEngineRef.current.reset();
    };
  }, []);
  
  // Re-run preview when engine settings change
  useEffect(() => {
    if (seedPointRef.current && state.toolState.activeTool === 'magic-wand') {
      // Small delay to ensure state is updated
      const timer = setTimeout(() => {
        if (seedPointRef.current) {
          compositeRef.current = null;
          startPreview(seedPointRef.current.x, seedPointRef.current.y);
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [
    segmentSettings.engine, 
    segmentSettings.connectivity, 
    segmentSettings.waveExpansionRate,
    segmentSettings.instantFillEnabled,
    segmentSettings.previewEnabled,
  ]);
  
  return {
    handleClick,
    handleMouseMove,
    handleMouseLeave,
    handleWheel,
    cancelPreview,
    isActive: state.toolState.activeTool === 'magic-wand',
    previewState,
    segmentSettings,
  };
}
