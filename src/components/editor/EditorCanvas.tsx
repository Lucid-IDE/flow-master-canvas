import React, { useRef, useEffect, useCallback } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { useCanvasNavigation } from '@/hooks/useCanvasNavigation';
import { useMagicWand } from '@/hooks/useMagicWand';
import { coordinateSystem } from '@/lib/canvas/coordinateSystem';
import { ModifierStack } from '@/lib/canvas/modifierStack';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/lib/canvas/constants';

export function EditorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, setCanvasState } = useEditor();
  const { handleZoom, startPan, updatePan, endPan } = useCanvasNavigation(canvasRef);
  const { handleClick, handleMouseMove, handleMouseLeave, handleWheel: handleWandWheel, isActive: isMagicWandActive } = useMagicWand();
  
  const isSpaceHeldRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isRightClickRef = useRef(false);
  const rightClickStartRef = useRef<{ x: number; y: number } | null>(null);
  
  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dpr = window.devicePixelRatio || 1;
    const container = containerRef.current;
    
    if (container) {
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
    }
    
    coordinateSystem.setCanvas(canvas);
  }, []);
  
  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      
      coordinateSystem.setCanvas(canvas);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      
      // Clear canvas
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Apply transform
      coordinateSystem.applyTransform(ctx);
      
      // Draw checkerboard background
      drawCheckerboard(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Draw canvas border
      ctx.strokeStyle = 'hsl(217, 91%, 60%)';
      ctx.lineWidth = 2 / state.canvasState.zoom;
      ctx.strokeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Draw layers with modifiers applied
      for (const layer of state.project.layers) {
        if (!layer.visible) continue;
        
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        
        // Apply modifier stack to get final imageData
        const finalImageData = ModifierStack.applyStack(layer);
        
        // Create temp canvas for layer
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = finalImageData.width;
        tempCanvas.height = finalImageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        if (tempCtx) {
          tempCtx.putImageData(finalImageData, 0, 0);
          ctx.drawImage(tempCanvas, layer.bounds.x, layer.bounds.y);
        }
        
        ctx.restore();
        
        // Draw segment highlight for segment layers
        const isSelected = state.project.selectedLayerIds.includes(layer.id);
        if (layer.name.startsWith('Segment') && layer.segmentColor) {
          ctx.save();
          
          // Draw filled highlight with low opacity
          ctx.globalAlpha = isSelected ? 0.35 : 0.2;
          ctx.fillStyle = layer.segmentColor;
          
          // Iterate over layer pixels and fill non-transparent ones
          const data = layer.imageData.data;
          for (let py = 0; py < layer.imageData.height; py++) {
            for (let px = 0; px < layer.imageData.width; px++) {
              const idx = (py * layer.imageData.width + px) * 4;
              if (data[idx + 3] > 0) {
                ctx.fillRect(layer.bounds.x + px, layer.bounds.y + py, 1, 1);
              }
            }
          }
          
          // Draw border/glow outline for selected segments
          if (isSelected) {
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = layer.segmentColor;
            ctx.lineWidth = 2 / state.canvasState.zoom;
            ctx.shadowColor = layer.segmentColor;
            ctx.shadowBlur = 8 / state.canvasState.zoom;
            
            // Draw outline around non-transparent edge pixels
            ctx.beginPath();
            for (let py = 0; py < layer.imageData.height; py++) {
              for (let px = 0; px < layer.imageData.width; px++) {
                const idx = (py * layer.imageData.width + px) * 4;
                if (data[idx + 3] > 0) {
                  // Check if edge pixel
                  const leftIdx = px > 0 ? (py * layer.imageData.width + px - 1) * 4 : -1;
                  const rightIdx = px < layer.imageData.width - 1 ? (py * layer.imageData.width + px + 1) * 4 : -1;
                  const topIdx = py > 0 ? ((py - 1) * layer.imageData.width + px) * 4 : -1;
                  const bottomIdx = py < layer.imageData.height - 1 ? ((py + 1) * layer.imageData.width + px) * 4 : -1;
                  
                  const isEdge = 
                    (leftIdx < 0 || data[leftIdx + 3] === 0) ||
                    (rightIdx < 0 || data[rightIdx + 3] === 0) ||
                    (topIdx < 0 || data[topIdx + 3] === 0) ||
                    (bottomIdx < 0 || data[bottomIdx + 3] === 0);
                  
                  if (isEdge) {
                    ctx.rect(layer.bounds.x + px, layer.bounds.y + py, 1, 1);
                  }
                }
              }
            }
            ctx.stroke();
          }
          
          ctx.restore();
        }
      }
      
      // Draw preview mask
      if (state.previewMask && state.hoverPoint) {
        drawPreviewMask(ctx, state.previewMask, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
      
      // Draw selection
      if (state.project.activeSelection) {
        drawSelection(ctx, state.project.activeSelection.mask, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
      
      animationId = requestAnimationFrame(render);
    };
    
    render();
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [state]);
  
  // Draw checkerboard pattern
  const drawCheckerboard = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const size = GRID_SIZE;
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, width, height);
    
    ctx.fillStyle = '#232333';
    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
          ctx.fillRect(x, y, size, size);
        }
      }
    }
  };
  
  // Draw preview mask with glow effect
  const drawPreviewMask = (
    ctx: CanvasRenderingContext2D,
    mask: Uint8ClampedArray,
    width: number,
    height: number
  ) => {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'hsl(190, 90%, 50%)';
    
    // Draw mask pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (mask[index] > 0) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    
    ctx.restore();
  };
  
  // Draw selection with marching ants
  const drawSelection = (
    ctx: CanvasRenderingContext2D,
    mask: Uint8ClampedArray,
    width: number,
    height: number
  ) => {
    ctx.save();
    ctx.strokeStyle = 'hsl(217, 91%, 60%)';
    ctx.lineWidth = 1 / state.canvasState.zoom;
    ctx.setLineDash([4 / state.canvasState.zoom, 4 / state.canvasState.zoom]);
    
    // Draw outline of selection
    ctx.beginPath();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (mask[index] > 0) {
          // Check if edge pixel
          const left = x > 0 ? mask[index - 1] : 0;
          const right = x < width - 1 ? mask[index + 1] : 0;
          const top = y > 0 ? mask[index - width] : 0;
          const bottom = y < height - 1 ? mask[index + width] : 0;
          
          if (left === 0 || right === 0 || top === 0 || bottom === 0) {
            ctx.rect(x, y, 1, 1);
          }
        }
      }
    }
    ctx.stroke();
    
    ctx.restore();
  };
  
  // Prevent context menu on right click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);
  
  // Event handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const worldPoint = coordinateSystem.screenToWorld(e.clientX, e.clientY);
    
    // Right click for pan
    if (e.button === 2) {
      isRightClickRef.current = true;
      rightClickStartRef.current = { x: e.clientX, y: e.clientY };
      isDraggingRef.current = true;
      startPan(e.clientX, e.clientY);
      canvas.setPointerCapture(e.pointerId);
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grab';
      }
      return;
    }
    
    // Middle mouse or space+click for pan
    if (e.button === 1 || isSpaceHeldRef.current) {
      isDraggingRef.current = true;
      startPan(e.clientX, e.clientY);
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    
    // Left click with magic wand
    if (e.button === 0 && isMagicWandActive) {
      handleClick(worldPoint.x, worldPoint.y, e.shiftKey, e.altKey);
    }
  }, [startPan, handleClick, isMagicWandActive]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      updatePan(e.clientX, e.clientY);
      return;
    }
    
    const worldPoint = coordinateSystem.screenToWorld(e.clientX, e.clientY);
    
    // Check if within canvas bounds
    if (worldPoint.x >= 0 && worldPoint.x < CANVAS_WIDTH &&
        worldPoint.y >= 0 && worldPoint.y < CANVAS_HEIGHT) {
      if (isMagicWandActive) {
        handleMouseMove(worldPoint.x, worldPoint.y);
      }
    }
  }, [updatePan, handleMouseMove, isMagicWandActive]);
  
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    isRightClickRef.current = false;
    rightClickStartRef.current = null;
    endPan();
    canvasRef.current?.releasePointerCapture(e.pointerId);
    if (containerRef.current) {
      containerRef.current.style.cursor = 'crosshair';
    }
  }, [endPan]);
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    // Right click held + scroll = zoom
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
    const panSpeed = 1;
    setCanvasState({
      panX: state.canvasState.panX - e.deltaX * panSpeed,
      panY: state.canvasState.panY - e.deltaY * panSpeed,
    });
  }, [handleZoom, isMagicWandActive, handleWandWheel, setCanvasState, state.canvasState]);
  
  // Space key for pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpaceHeldRef.current) {
        isSpaceHeldRef.current = true;
        if (containerRef.current) {
          containerRef.current.style.cursor = 'grab';
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceHeldRef.current = false;
        if (containerRef.current) {
          containerRef.current.style.cursor = 'crosshair';
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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