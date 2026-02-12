import { useCallback } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { renderEngine } from '@/lib/canvas/RenderEngine';

/**
 * Hook for canvas navigation helpers.
 *
 * Pan/zoom is now handled directly in EditorCanvas via the RenderEngine.
 * This hook provides utility functions (fitToScreen, resetView) for UI buttons.
 */
export function useCanvasNavigation(canvasRef?: React.RefObject<HTMLCanvasElement>) {
  const { setCanvasState, state } = useEditor();

  const resetView = useCallback(() => {
    setCanvasState({ panX: 0, panY: 0, zoom: 1 });
  }, [setCanvasState]);

  const fitToScreen = useCallback(() => {
    const canvas = canvasRef?.current ?? document.querySelector('canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const pw = state.project.width;
    const ph = state.project.height;
    const cw = container.clientWidth - 100;
    const ch = container.clientHeight - 100;

    const scale = Math.min(cw / pw, ch / ph, 1);
    setCanvasState({ panX: 0, panY: 0, zoom: scale });
  }, [canvasRef, state.project.width, state.project.height, setCanvasState]);

  return {
    resetView,
    fitToScreen,
  };
}
