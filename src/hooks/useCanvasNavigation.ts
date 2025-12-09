import { useCallback, useRef, useEffect } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { coordinateSystem } from '@/lib/canvas/coordinateSystem';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, MAX_PAN_OFFSET } from '@/lib/canvas/constants';

/**
 * Hook for canvas pan and zoom functionality
 */
export function useCanvasNavigation(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const { state, setCanvasState } = useEditor();
  const isPanningRef = useRef(false);
  const lastPanPointRef = useRef({ x: 0, y: 0 });
  
  // Initialize coordinate system when canvas is ready
  useEffect(() => {
    if (canvasRef.current) {
      coordinateSystem.setCanvas(canvasRef.current);
    }
  }, [canvasRef.current]);
  
  // Update coordinate system when transform changes
  useEffect(() => {
    coordinateSystem.updateTransform(
      state.canvasState.panX,
      state.canvasState.panY,
      state.canvasState.zoom
    );
  }, [state.canvasState]);
  
  // Handle zoom
  const handleZoom = useCallback((deltaY: number, centerX?: number, centerY?: number) => {
    const { zoom, panX, panY } = state.canvasState;
    const zoomFactor = deltaY > 0 ? 1 - ZOOM_STEP : 1 + ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor));
    
    // Zoom towards mouse position if provided
    if (centerX !== undefined && centerY !== undefined) {
      const worldPoint = coordinateSystem.screenToWorld(centerX, centerY);
      
      // Calculate new pan to keep world point under cursor
      const scale = newZoom / zoom;
      const newPanX = panX - (worldPoint.x * (scale - 1) * zoom);
      const newPanY = panY - (worldPoint.y * (scale - 1) * zoom);
      
      setCanvasState({
        zoom: newZoom,
        panX: Math.max(-MAX_PAN_OFFSET, Math.min(MAX_PAN_OFFSET, newPanX)),
        panY: Math.max(-MAX_PAN_OFFSET, Math.min(MAX_PAN_OFFSET, newPanY)),
      });
    } else {
      setCanvasState({ zoom: newZoom });
    }
  }, [state.canvasState, setCanvasState]);
  
  // Start panning
  const startPan = useCallback((screenX: number, screenY: number) => {
    isPanningRef.current = true;
    lastPanPointRef.current = { x: screenX, y: screenY };
  }, []);
  
  // Update pan
  const updatePan = useCallback((screenX: number, screenY: number) => {
    if (!isPanningRef.current) return;
    
    const deltaX = screenX - lastPanPointRef.current.x;
    const deltaY = screenY - lastPanPointRef.current.y;
    
    lastPanPointRef.current = { x: screenX, y: screenY };
    
    const { panX, panY } = state.canvasState;
    setCanvasState({
      panX: Math.max(-MAX_PAN_OFFSET, Math.min(MAX_PAN_OFFSET, panX + deltaX)),
      panY: Math.max(-MAX_PAN_OFFSET, Math.min(MAX_PAN_OFFSET, panY + deltaY)),
    });
  }, [state.canvasState, setCanvasState]);
  
  // End panning
  const endPan = useCallback(() => {
    isPanningRef.current = false;
  }, []);
  
  // Reset view
  const resetView = useCallback(() => {
    setCanvasState({
      panX: 0,
      panY: 0,
      zoom: 1,
    });
  }, [setCanvasState]);
  
  // Fit to screen
  const fitToScreen = useCallback(() => {
    if (!canvasRef.current) return;
    
    const containerWidth = canvasRef.current.parentElement?.clientWidth || 800;
    const containerHeight = canvasRef.current.parentElement?.clientHeight || 600;
    
    const scaleX = (containerWidth - 100) / state.project.width;
    const scaleY = (containerHeight - 100) / state.project.height;
    const scale = Math.min(scaleX, scaleY, 1);
    
    setCanvasState({
      panX: 0,
      panY: 0,
      zoom: scale,
    });
  }, [canvasRef, state.project.width, state.project.height, setCanvasState]);
  
  return {
    handleZoom,
    startPan,
    updatePan,
    endPan,
    resetView,
    fitToScreen,
    isPanning: isPanningRef.current,
  };
}
