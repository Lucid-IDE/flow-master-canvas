import { useCallback, useRef, useEffect, useState } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { coordinateSystem } from '@/lib/canvas/coordinateSystem';
import { compositeLayers } from '@/lib/canvas/compositeLayers';
import { floodFill } from '@/lib/canvas/floodFill';
import { createLayerFromSelection } from '@/lib/canvas/layerUtils';
import { PreviewWaveEngine, PreviewResult } from '@/lib/canvas/preview/PreviewWaveEngine';
import { SelectionMask, Point } from '@/lib/canvas/types';
import { v4 as uuidv4 } from 'uuid';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MIN_TOLERANCE, MAX_TOLERANCE } from '@/lib/canvas/constants';

/**
 * V6 Magic Wand Hook with Organic Preview Flow
 * 
 * Features:
 * - Zero-latency instant seed highlight
 * - Ring BFS progressive wave expansion
 * - Breathing tolerance (scroll to expand/contract)
 * - Request cancellation (no visual glitches)
 */
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
  
  // V6 Preview Wave Engine
  const previewEngineRef = useRef<PreviewWaveEngine>(new PreviewWaveEngine());
  const compositeRef = useRef<ImageData | null>(null);
  
  // Preview state
  const [previewBounds, setPreviewBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [ringNumber, setRingNumber] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  
  // Cancel ongoing preview
  const cancelPreview = useCallback(() => {
    previewEngineRef.current.cancel();
    setPreviewMask(null);
    setPreviewBounds(null);
    setRingNumber(0);
    setAcceptedCount(0);
  }, [setPreviewMask]);
  
  // Handle preview progress callback
  const handlePreviewProgress = useCallback((result: PreviewResult) => {
    setPreviewMask(result.mask);
    setPreviewBounds(result.bounds);
    setRingNumber(result.ringNumber);
    setAcceptedCount(result.acceptedCount);
  }, [setPreviewMask]);
  
  // Handle preview complete callback
  const handlePreviewComplete = useCallback((result: PreviewResult) => {
    // Preview is complete, mask is final
    setPreviewMask(result.mask);
    setPreviewBounds(result.bounds);
  }, [setPreviewMask]);
  
  // Start V6 preview at hover point
  const startPreview = useCallback((worldX: number, worldY: number) => {
    // Cancel any existing preview
    cancelPreview();
    
    // Get composite of all layers
    const layers = state.project.layers;
    if (layers.length === 0) return;
    
    // Cache composite for performance
    compositeRef.current = compositeLayers(layers);
    
    // Validate point is in bounds
    if (worldX < 0 || worldX >= CANVAS_WIDTH || worldY < 0 || worldY >= CANVAS_HEIGHT) {
      return;
    }
    
    // Start V6 Preview Wave Engine
    previewEngineRef.current.startWave(
      compositeRef.current,
      { x: worldX, y: worldY },
      state.toolState.tolerance,
      handlePreviewProgress,
      handlePreviewComplete
    );
  }, [state.project.layers, state.toolState.tolerance, cancelPreview, handlePreviewProgress, handlePreviewComplete]);
  
  // Create selection from current preview (blocking full flood fill)
  const createSelection = useCallback((worldX: number, worldY: number): SelectionMask | null => {
    const layers = state.project.layers;
    if (layers.length === 0) return null;
    
    // Use cached composite if available
    const composite = compositeRef.current || compositeLayers(layers);
    
    const result = floodFill(
      composite,
      Math.floor(worldX),
      Math.floor(worldY),
      {
        tolerance: state.toolState.tolerance,
        connectivity: 4,
      }
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
        tolerance: state.toolState.tolerance,
        connectivity: 4,
      },
    };
    
    return selection;
  }, [state.project.layers, state.toolState.tolerance]);
  
  // Handle click - create selection
  const handleClick = useCallback((worldX: number, worldY: number, altKey: boolean) => {
    cancelPreview();
    
    const selection = createSelection(worldX, worldY);
    if (!selection) return;
    
    if (altKey) {
      // Alt+click: Extract to new layer
      const layers = state.project.layers;
      if (layers.length === 0) return;
      
      const composite = compositeRef.current || compositeLayers(layers);
      
      try {
        const newLayer = createLayerFromSelection(
          composite,
          selection,
          `Segment ${state.project.layers.length + 1}`
        );
        
        addLayer(newLayer.imageData, newLayer.name);
      } catch (e) {
        console.error('Failed to extract layer:', e);
      }
    } else {
      // Regular click: Set selection
      setSelection(selection);
      pushHistory('Create selection');
    }
  }, [createSelection, cancelPreview, state.project.layers, setSelection, addLayer, pushHistory]);
  
  // Handle mouse move - update V6 preview
  const handleMouseMove = useCallback((worldX: number, worldY: number) => {
    setHoverPoint({ x: worldX, y: worldY });
    startPreview(worldX, worldY);
  }, [setHoverPoint, startPreview]);
  
  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    cancelPreview();
    setHoverPoint(null);
    compositeRef.current = null;
  }, [cancelPreview, setHoverPoint]);
  
  // Handle scroll for breathing tolerance
  const handleWheel = useCallback((deltaY: number) => {
    const currentTolerance = state.toolState.tolerance;
    const speed = 0.5; // Pixels per scroll unit
    const newTolerance = Math.max(
      MIN_TOLERANCE, 
      Math.min(MAX_TOLERANCE, currentTolerance - deltaY * speed)
    );
    
    if (newTolerance !== currentTolerance) {
      setTolerance(newTolerance);
      
      // Update breathing tolerance in preview engine
      if (previewEngineRef.current.isActive()) {
        previewEngineRef.current.updateTolerance(newTolerance);
      }
    }
  }, [state.toolState.tolerance, setTolerance]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      previewEngineRef.current.cancel();
    };
  }, []);
  
  return {
    handleClick,
    handleMouseMove,
    handleMouseLeave,
    handleWheel,
    cancelPreview,
    isActive: state.toolState.activeTool === 'magic-wand',
    previewBounds,
    ringNumber,
    acceptedCount,
    getZeroLatencyPreview: () => previewEngineRef.current.getZeroLatencyPreview(),
  };
}
