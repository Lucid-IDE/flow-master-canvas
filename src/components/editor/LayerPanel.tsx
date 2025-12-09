import React, { useCallback } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { Layer } from '@/lib/canvas/types';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  Copy,
  ChevronUp,
  ChevronDown,
  Image,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { duplicateLayer } from '@/lib/canvas/layerUtils';

interface LayerItemProps {
  layer: Layer;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpacityChange: (opacity: number) => void;
}

function LayerItem({
  layer,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onDuplicate,
  onOpacityChange,
}: LayerItemProps) {
  // Create thumbnail
  const thumbnailUrl = React.useMemo(() => {
    const canvas = document.createElement('canvas');
    const size = 40;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // Draw checkerboard
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#232333';
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        if ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0) {
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
    
    // Draw layer thumbnail
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = layer.imageData.width;
    tempCanvas.height = layer.imageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(layer.imageData, 0, 0);
      
      const scale = Math.min(size / layer.imageData.width, size / layer.imageData.height);
      const w = layer.imageData.width * scale;
      const h = layer.imageData.height * scale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;
      
      ctx.drawImage(tempCanvas, x, y, w, h);
    }
    
    return canvas.toDataURL();
  }, [layer.imageData]);
  
  return (
    <div
      className={cn(
        'layer-item group',
        isSelected && 'selected'
      )}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded border border-border overflow-hidden flex-shrink-0">
        <img src={thumbnailUrl} alt={layer.name} className="w-full h-full object-cover" />
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{layer.name}</p>
        <p className="text-xs text-muted-foreground">
          {layer.imageData.width} × {layer.imageData.height}
        </p>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 hover:bg-secondary rounded"
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
        >
          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          className="p-1 hover:bg-secondary rounded"
          onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
        >
          {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
      </div>
      
      {/* Opacity slider on selection */}
      {isSelected && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-card/90 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Opacity</span>
            <Slider
              value={[layer.opacity * 100]}
              onValueChange={([value]) => onOpacityChange(value / 100)}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs w-8 text-right">{Math.round(layer.opacity * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function LayerPanel() {
  const { state, selectLayers, updateLayer, deleteLayer, dispatch, pushHistory } = useEditor();
  const layers = [...state.project.layers].reverse(); // Display top to bottom
  
  const handleToggleVisibility = useCallback((layer: Layer) => {
    updateLayer(layer.id, { visible: !layer.visible });
  }, [updateLayer]);
  
  const handleToggleLock = useCallback((layer: Layer) => {
    updateLayer(layer.id, { locked: !layer.locked });
  }, [updateLayer]);
  
  const handleOpacityChange = useCallback((layer: Layer, opacity: number) => {
    updateLayer(layer.id, { opacity });
  }, [updateLayer]);
  
  const handleDuplicate = useCallback((layer: Layer) => {
    const newLayer = duplicateLayer(layer);
    dispatch({ type: 'ADD_LAYER', payload: newLayer });
    pushHistory(`Duplicate layer: ${layer.name}`);
  }, [dispatch, pushHistory]);
  
  const handleMoveUp = useCallback((layerId: string) => {
    const index = state.project.layers.findIndex(l => l.id === layerId);
    if (index < state.project.layers.length - 1) {
      const newLayers = [...state.project.layers];
      [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
      dispatch({ type: 'REORDER_LAYERS', payload: newLayers });
    }
  }, [state.project.layers, dispatch]);
  
  const handleMoveDown = useCallback((layerId: string) => {
    const index = state.project.layers.findIndex(l => l.id === layerId);
    if (index > 0) {
      const newLayers = [...state.project.layers];
      [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
      dispatch({ type: 'REORDER_LAYERS', payload: newLayers });
    }
  }, [state.project.layers, dispatch]);
  
  return (
    <div className="w-64 bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Layers
        </h2>
      </div>
      
      {/* Layer list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Image size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No layers</p>
            <p className="text-xs">Upload an image to start</p>
          </div>
        ) : (
          layers.map((layer) => (
            <LayerItem
              key={layer.id}
              layer={layer}
              isSelected={state.project.selectedLayerIds.includes(layer.id)}
              onSelect={() => selectLayers([layer.id])}
              onToggleVisibility={() => handleToggleVisibility(layer)}
              onToggleLock={() => handleToggleLock(layer)}
              onDelete={() => deleteLayer(layer.id)}
              onDuplicate={() => handleDuplicate(layer)}
              onOpacityChange={(opacity) => handleOpacityChange(layer, opacity)}
            />
          ))
        )}
      </div>
      
      {/* Actions */}
      <div className="p-2 border-t border-border flex items-center gap-1">
        {state.project.selectedLayerIds.length > 0 && (
          <>
            <button
              className="tool-button p-2"
              onClick={() => {
                const layer = state.project.layers.find(
                  l => l.id === state.project.selectedLayerIds[0]
                );
                if (layer) handleDuplicate(layer);
              }}
            >
              <Copy size={16} />
            </button>
            <button
              className="tool-button p-2"
              onClick={() => handleMoveUp(state.project.selectedLayerIds[0])}
            >
              <ChevronUp size={16} />
            </button>
            <button
              className="tool-button p-2"
              onClick={() => handleMoveDown(state.project.selectedLayerIds[0])}
            >
              <ChevronDown size={16} />
            </button>
            <div className="flex-1" />
            <button
              className="tool-button p-2 text-destructive hover:bg-destructive/20"
              onClick={() => deleteLayer(state.project.selectedLayerIds[0])}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
