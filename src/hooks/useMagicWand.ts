import { useCallback, useRef, useEffect } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { coordinateSystem } from '@/lib/canvas/coordinateSystem';
import { compositeLayers } from '@/lib/canvas/compositeLayers';
import { floodFill, incrementalFloodFill } from '@/lib/canvas/floodFill';
import { createLayerFromSelection } from '@/lib/canvas/layerUtils';
import { SelectionMask, Point } from '@/lib/canvas/types';
import { v4 as uuidv4 } from 'uuid';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/canvas/constants';

/**
 * Hook for Magic Wand tool workflow
 * Handles preview expansion, selection creation, and layer extraction
 */
export function useMagicWand() {
  const { 
    state, 
    setPreviewMask, 
    setSelection, 
    setHoverPoint,
    addLayer,
    pushHistory
  } = useEditor();
  
  const previewGeneratorRef = useRef<Generator | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastRequestIdRef = useRef<string | null>(null);
  
  // Cancel ongoing preview
  const cancelPreview = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    previewGeneratorRef.current = null;
    lastRequestIdRef.current = null;
  }, []);
  
  // Start preview at hover point
  const startPreview = useCallback((worldX: number, worldY: number) => {
    // Cancel any existing preview
    cancelPreview();
    
    const requestId = uuidv4();
    lastRequestIdRef.current = requestId;
    
    // Get composite of all layers
    const layers = state.project.layers;
    if (layers.length === 0) return;
    
    const composite = compositeLayers(layers);
    
    // Validate point is in bounds
    if (worldX < 0 || worldX >= CANVAS_WIDTH || worldY < 0 || worldY >= CANVAS_HEIGHT) {
      return;
    }
    
    // Start incremental flood fill
    const generator = incrementalFloodFill(
      composite,
      Math.floor(worldX),
      Math.floor(worldY),
      {
        tolerance: state.toolState.tolerance,
        connectivity: 4,
        timeBudget: 6,
      }
    );
    
    previewGeneratorRef.current = generator;
    
    // Process frames
    const processFrame = () => {
      if (lastRequestIdRef.current !== requestId) return;
      if (!previewGeneratorRef.current) return;
      
      const result = previewGeneratorRef.current.next();
      
      if (result.done) {
        // Final result
        const finalResult = result.value;
        setPreviewMask(finalResult.mask);
        previewGeneratorRef.current = null;
      } else {
        // Partial result
        setPreviewMask(result.value.mask);
        animationFrameRef.current = requestAnimationFrame(processFrame);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [state.project.layers, state.toolState.tolerance, cancelPreview, setPreviewMask]);
  
  // Create selection from current preview
  const createSelection = useCallback((worldX: number, worldY: number): SelectionMask | null => {
    const layers = state.project.layers;
    if (layers.length === 0) return null;
    
    const composite = compositeLayers(layers);
    
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
      
      const composite = compositeLayers(layers);
      
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
    }
  }, [createSelection, cancelPreview, state.project.layers, setSelection, addLayer]);
  
  // Handle mouse move - update preview
  const handleMouseMove = useCallback((worldX: number, worldY: number) => {
    setHoverPoint({ x: worldX, y: worldY });
    startPreview(worldX, worldY);
  }, [setHoverPoint, startPreview]);
  
  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    cancelPreview();
    setHoverPoint(null);
    setPreviewMask(null);
  }, [cancelPreview, setHoverPoint, setPreviewMask]);
  
  // Handle scroll for tolerance adjustment
  const handleWheel = useCallback((deltaY: number) => {
    const { setTolerance } = useEditor();
    const currentTolerance = state.toolState.tolerance;
    const newTolerance = Math.max(0, Math.min(255, currentTolerance - deltaY * 0.5));
    setTolerance(newTolerance);
  }, [state.toolState.tolerance]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelPreview();
    };
  }, [cancelPreview]);
  
  return {
    handleClick,
    handleMouseMove,
    handleMouseLeave,
    handleWheel,
    cancelPreview,
    isActive: state.toolState.activeTool === 'magic-wand',
  };
}
