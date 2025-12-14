import { useCallback, useRef, useEffect, useState } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { coordinateSystem } from '@/lib/canvas/coordinateSystem';
import { compositeLayers } from '@/lib/canvas/compositeLayers';
import { floodFillWithEngine, WaveFloodFill, instantFloodFill, scanlineFloodFill, hybridFloodFill } from '@/lib/canvas/floodFill';
import { createLayerFromSelection } from '@/lib/canvas/layerUtils';
import { SelectionMask, Point, Rectangle, TransparencyMaskModifier } from '@/lib/canvas/types';
import { SegmentSettings } from '@/lib/canvas/segmentTypes';
import { performanceTracker } from '@/components/editor/PerformanceOverlay';
import { v4 as uuidv4 } from 'uuid';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MIN_TOLERANCE, MAX_TOLERANCE } from '@/lib/canvas/constants';

/**
 * Magic Wand Hook - Multi-Engine Support with Modifier System
 * 
 * Click behaviors:
 * - Normal click: Create new layer with segment
 * - Shift+click: Add segment to selected layer (merge overlaps)
 * - Alt+click: Create transparency mask modifier on clicked layer
 * 
 * Scroll: Adjust tolerance when wand is active
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
    updateLayer,
    addModifier,
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
      case 'v7-hybrid': {
        // Fastest hybrid engine
        const result = hybridFloodFill(composite, startX, startY, segmentSettings.tolerance, segmentSettings.connectivity);
        performanceTracker.recordSegment(result.processingTime, result.pixels.length, result.ringCount, 'v7-hybrid');
        
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
      
      case 'v5-instant':
      case 'v4-scanline':
      case 'v3-queue':
      case 'v2-recursive':
      case 'v1-iterative': {
        // Instant preview - complete fill immediately
        const result = engine === 'v4-scanline'
          ? scanlineFloodFill(composite, startX, startY, segmentSettings.tolerance, segmentSettings.connectivity)
          : instantFloodFill(composite, startX, startY, segmentSettings.tolerance, segmentSettings.connectivity);
        
        performanceTracker.recordSegment(result.processingTime, result.pixels.length, result.ringCount, engine);
        
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
    
    // Track performance
    performanceTracker.recordSegment(
      result.processingTime, 
      result.pixels.length, 
      result.ringCount, 
      segmentSettings.engine
    );
    
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
  
  // Handle click - create selection or layer based on modifiers
  const handleClick = useCallback((worldX: number, worldY: number, shiftKey: boolean, altKey: boolean) => {
    cancelPreview();
    
    const selection = createSelection(worldX, worldY);
    if (!selection) return;
    
    const composite = getComposite();
    if (!composite) return;
    
    if (altKey) {
      // Alt+click: Create transparency mask modifier on selected layer
      const selectedLayerId = state.project.selectedLayerIds[0];
      if (!selectedLayerId) {
        console.warn('No layer selected for modifier');
        return;
      }
      
      const modifier: TransparencyMaskModifier = {
        id: uuidv4(),
        type: 'transparency-mask',
        enabled: true,
        opacity: 1.0, // Full transparency effect
        parameters: {
          mask: selection.mask,
          bounds: selection.bounds,
        },
      };
      
      addModifier(selectedLayerId, modifier);
      pushHistory('Add transparency mask modifier');
    } else if (shiftKey) {
      // Shift+click: Add segment to selected layer (merge)
      const selectedLayerId = state.project.selectedLayerIds[0];
      const selectedLayer = state.project.layers.find(l => l.id === selectedLayerId);
      
      if (!selectedLayer) {
        // No layer selected, create new one
        try {
          const newLayer = createLayerFromSelection(
            composite,
            selection,
            `Segment ${state.project.layers.length + 1}`
          );
          addLayer(newLayer.imageData, newLayer.name);
          pushHistory('Create segment layer');
        } catch (e) {
          console.error('Failed to create layer:', e);
        }
        return;
      }
      
      // Merge segment into existing layer
      try {
        const segmentLayer = createLayerFromSelection(
          composite,
          selection,
          'temp'
        );
        
        // Create merged imageData
        const mergedCanvas = document.createElement('canvas');
        const mergedWidth = Math.max(
          selectedLayer.bounds.x + selectedLayer.imageData.width,
          segmentLayer.bounds.x + segmentLayer.imageData.width
        ) - Math.min(selectedLayer.bounds.x, segmentLayer.bounds.x);
        const mergedHeight = Math.max(
          selectedLayer.bounds.y + selectedLayer.imageData.height,
          segmentLayer.bounds.y + segmentLayer.imageData.height
        ) - Math.min(selectedLayer.bounds.y, segmentLayer.bounds.y);
        const mergedX = Math.min(selectedLayer.bounds.x, segmentLayer.bounds.x);
        const mergedY = Math.min(selectedLayer.bounds.y, segmentLayer.bounds.y);
        
        mergedCanvas.width = mergedWidth;
        mergedCanvas.height = mergedHeight;
        const mergedCtx = mergedCanvas.getContext('2d')!;
        
        // Draw existing layer
        const tempCanvas1 = document.createElement('canvas');
        tempCanvas1.width = selectedLayer.imageData.width;
        tempCanvas1.height = selectedLayer.imageData.height;
        const tempCtx1 = tempCanvas1.getContext('2d')!;
        tempCtx1.putImageData(selectedLayer.imageData, 0, 0);
        mergedCtx.drawImage(
          tempCanvas1,
          selectedLayer.bounds.x - mergedX,
          selectedLayer.bounds.y - mergedY
        );
        
        // Draw segment layer
        const tempCanvas2 = document.createElement('canvas');
        tempCanvas2.width = segmentLayer.imageData.width;
        tempCanvas2.height = segmentLayer.imageData.height;
        const tempCtx2 = tempCanvas2.getContext('2d')!;
        tempCtx2.putImageData(segmentLayer.imageData, 0, 0);
        mergedCtx.drawImage(
          tempCanvas2,
          segmentLayer.bounds.x - mergedX,
          segmentLayer.bounds.y - mergedY
        );
        
        const mergedImageData = mergedCtx.getImageData(0, 0, mergedWidth, mergedHeight);
        
        updateLayer(selectedLayerId, {
          imageData: mergedImageData,
          bounds: { x: mergedX, y: mergedY, width: mergedWidth, height: mergedHeight },
        });
        pushHistory('Merge segment into layer');
      } catch (e) {
        console.error('Failed to merge segment:', e);
      }
    } else {
      // Normal click: Create new layer with segment
      try {
        const newLayer = createLayerFromSelection(
          composite,
          selection,
          `Segment ${state.project.layers.length + 1}`
        );
        
        addLayer(newLayer.imageData, newLayer.name);
        pushHistory('Create segment layer');
      } catch (e) {
        console.error('Failed to create layer:', e);
      }
    }
  }, [createSelection, cancelPreview, getComposite, state.project, addLayer, updateLayer, addModifier, pushHistory]);
  
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