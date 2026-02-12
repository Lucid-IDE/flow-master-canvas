import React, { useRef, useEffect, useCallback } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { renderEngine, cleanupLayerTextures } from '@/lib/canvas/RenderEngine';
import { segmentHighlightCache } from '@/lib/canvas/segmentHighlightCache';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '@/lib/canvas/constants';
import { useMagicWand } from '@/hooks/useMagicWand';

/**
 * EditorCanvas - The main canvas component.
 *
 * All rendering is handled by the RenderEngine singleton (pure JS, no React).
 * This component only wires up:
 *   - DOM mounting / resize
 *   - Pointer events (pan, zoom, magic wand)
 *   - Syncing React state -> RenderEngine when layers/project change
 */
export function EditorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, setCanvasState } = useEditor();

  const {
    handleClick,
    handleMouseMove,
    handleMouseLeave,
    handleWheel: handleWandWheel,
    isActive: isMagicWandActive,
  } = useMagicWand();

  // Refs for pan/zoom (never go through React)
  const panRef = useRef({ x: state.canvasState.panX, y: state.canvasState.panY });
  const zoomRef = useRef(state.canvasState.zoom);
  const isSpaceHeldRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isRightClickRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });

  // ── Mount / Resize ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    renderEngine.attach(canvas, container);
    renderEngine.start();

    const onResize = () => {
      if (containerRef.current) {
        renderEngine.resize(containerRef.current);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      renderEngine.stop();
    };
  }, []);

  // ── Sync React state -> RenderEngine ───────────────────
  // Layers & project size
  useEffect(() => {
    renderEngine.setLayers(state.project.layers, state.project.selectedLayerIds);
    renderEngine.setProjectSize(state.project.width, state.project.height);

    // Cleanup old caches
    const activeIds = new Set(state.project.layers.map(l => l.id));
    segmentHighlightCache.cleanup(activeIds);
    cleanupLayerTextures(activeIds);
  }, [state.project.layers, state.project.selectedLayerIds, state.project.width, state.project.height]);

  // Canvas state (only for initial sync and undo/redo)
  useEffect(() => {
    panRef.current = { x: state.canvasState.panX, y: state.canvasState.panY };
    zoomRef.current = state.canvasState.zoom;
    renderEngine.setTransform(state.canvasState.panX, state.canvasState.panY, state.canvasState.zoom);
  }, [state.canvasState.panX, state.canvasState.panY, state.canvasState.zoom]);

  // Preview mask
  useEffect(() => {
    renderEngine.setPreviewMask(state.previewMask);
  }, [state.previewMask]);

  // Selection mask
  useEffect(() => {
    renderEngine.setSelectionMask(state.project.activeSelection?.mask ?? null);
  }, [state.project.activeSelection]);

  // ── Zoom-to-cursor (correct formula) ───────────────────
  const handleZoom = useCallback((deltaY: number, clientX: number, clientY: number) => {
    const oldZoom = zoomRef.current;
    const factor = deltaY > 0 ? 1 - ZOOM_STEP : 1 + ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));
    if (newZoom === oldZoom) return;

    // World point under cursor BEFORE zoom
    const worldBefore = renderEngine.screenToWorld(clientX, clientY);

    // Apply new zoom
    zoomRef.current = newZoom;

    // Compute new pan so that the same world point stays under the cursor.
    // screen formula: screenX = (worldX - pw/2) * zoom + panX + containerW/2 + rect.left
    // We need panX such that screenToWorld(clientX) still == worldBefore.
    // Rearranging: panX = (clientX - rect.left) - containerW/2 - (worldBefore.x - pw/2) * newZoom
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const cssX = clientX - rect.left;
      const cssY = clientY - rect.top;
      const cw = rect.width;
      const ch = rect.height;
      const pw = renderEngine.rs.projectWidth;
      const ph = renderEngine.rs.projectHeight;

      const newPanX = cssX - cw / 2 - (worldBefore.x - pw / 2) * newZoom;
      const newPanY = cssY - ch / 2 - (worldBefore.y - ph / 2) * newZoom;

      panRef.current = { x: newPanX, y: newPanY };
    }

    renderEngine.setTransform(panRef.current.x, panRef.current.y, newZoom);
    // Lazy sync to React (for UI display only, not blocking)
    setCanvasState({ panX: panRef.current.x, panY: panRef.current.y, zoom: newZoom });
  }, [setCanvasState]);

  // ── Pointer events ─────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Right click -> pan
    if (e.button === 2) {
      isRightClickRef.current = true;
      isDraggingRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      if (containerRef.current) containerRef.current.style.cursor = 'grab';
      return;
    }

    // Middle mouse or space+click -> pan
    if (e.button === 1 || isSpaceHeldRef.current) {
      isDraggingRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      if (containerRef.current) containerRef.current.style.cursor = 'grab';
      return;
    }

    // Left click with magic wand
    if (e.button === 0 && isMagicWandActive) {
      const world = renderEngine.screenToWorld(e.clientX, e.clientY);
      handleClick(world.x, world.y, e.shiftKey, e.altKey);
    }
  }, [isMagicWandActive, handleClick]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      lastPanRef.current = { x: e.clientX, y: e.clientY };

      panRef.current.x += dx;
      panRef.current.y += dy;

      // Direct to engine -- no React
      renderEngine.setTransform(panRef.current.x, panRef.current.y, zoomRef.current);
      return;
    }

    const world = renderEngine.screenToWorld(e.clientX, e.clientY);
    if (renderEngine.isInBounds(world.x, world.y)) {
      if (isMagicWandActive) {
        handleMouseMove(world.x, world.y);
      }
    }
  }, [isMagicWandActive, handleMouseMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      // Sync final pan to React state (for undo/redo, persistence)
      setCanvasState({ panX: panRef.current.x, panY: panRef.current.y, zoom: zoomRef.current });
    }
    isDraggingRef.current = false;
    isRightClickRef.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    if (containerRef.current) containerRef.current.style.cursor = 'crosshair';
  }, [setCanvasState]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    // Right-click held + scroll = zoom
    if (isRightClickRef.current) {
      handleZoom(e.deltaY, e.clientX, e.clientY);
      return;
    }

    // Ctrl/Cmd + scroll = zoom
    if (e.ctrlKey || e.metaKey) {
      handleZoom(e.deltaY, e.clientX, e.clientY);
      return;
    }

    // Magic wand active: scroll adjusts tolerance
    if (isMagicWandActive) {
      handleWandWheel(e.deltaY);
      return;
    }

    // Default: pan
    panRef.current.x -= e.deltaX;
    panRef.current.y -= e.deltaY;
    renderEngine.setTransform(panRef.current.x, panRef.current.y, zoomRef.current);
  }, [handleZoom, isMagicWandActive, handleWandWheel]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Space key for pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpaceHeldRef.current) {
        isSpaceHeldRef.current = true;
        if (containerRef.current) containerRef.current.style.cursor = 'grab';
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceHeldRef.current = false;
        if (containerRef.current) containerRef.current.style.cursor = 'crosshair';
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 min-w-0 canvas-container cursor-crosshair overflow-hidden relative"
      onPointerLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      <canvas
        ref={canvasRef}
        className="block absolute inset-0 w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 editor-panel px-3 py-2 text-xs text-muted-foreground z-10">
        {Math.round(state.canvasState.zoom * 100)}%
      </div>

      {/* Hover info */}
      {state.hoverPoint && (
        <div className="absolute bottom-4 left-4 editor-panel px-3 py-2 text-xs text-muted-foreground z-10">
          {Math.floor(state.hoverPoint.x)}, {Math.floor(state.hoverPoint.y)}
        </div>
      )}

      {/* Tolerance indicator when magic wand active */}
      {isMagicWandActive && (
        <div className="absolute top-4 left-4 editor-panel px-3 py-2 text-xs text-muted-foreground z-10">
          Tolerance: {state.segmentSettings.tolerance.toFixed(1)}
        </div>
      )}
    </div>
  );
}
