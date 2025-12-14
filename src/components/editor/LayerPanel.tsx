import React, { useCallback, useState } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { Layer, Modifier } from '@/lib/canvas/types';
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
  Layers,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { duplicateLayer } from '@/lib/canvas/layerUtils';

interface ModifierItemProps {
  modifier: Modifier;
  layerId: string;
  onRemove: () => void;
  onToggle: () => void;
  onOpacityChange: (opacity: number) => void;
}

function ModifierItem({ modifier, layerId, onRemove, onToggle, onOpacityChange }: ModifierItemProps) {
  const getModifierLabel = (type: string) => {
    switch (type) {
      case 'transparency-mask': return 'Transparency Mask';
      case 'brightness': return 'Brightness';
      case 'contrast': return 'Contrast';
      case 'saturation': return 'Saturation';
      default: return type;
    }
  };
  
  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1.5 bg-secondary/50 rounded text-xs',
      !modifier.enabled && 'opacity-50'
    )}>
      <button
        onClick={onToggle}
        className="p-0.5 hover:bg-secondary rounded"
        title={modifier.enabled ? 'Disable modifier' : 'Enable modifier'}
      >
        {modifier.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      
      <span className="flex-1 truncate">{getModifierLabel(modifier.type)}</span>
      
      <div className="flex items-center gap-1 w-20">
        <Slider
          value={[modifier.opacity * 100]}
          onValueChange={([value]) => onOpacityChange(value / 100)}
          min={0}
          max={100}
          step={1}
          className="flex-1"
        />
        <span className="w-6 text-right text-muted-foreground">{Math.round(modifier.opacity * 100)}%</span>
      </div>
      
      <button
        onClick={onRemove}
        className="p-0.5 hover:bg-destructive/20 hover:text-destructive rounded"
        title="Remove modifier"
      >
        <X size={12} />
      </button>
    </div>
  );
}

interface LayerItemProps {
  layer: Layer;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpacityChange: (opacity: number) => void;
  onRemoveModifier: (modifierId: string) => void;
  onToggleModifier: (modifierId: string) => void;
  onModifierOpacityChange: (modifierId: string, opacity: number) => void;
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
  onRemoveModifier,
  onToggleModifier,
  onModifierOpacityChange,
}: LayerItemProps) {
  const [showModifiers, setShowModifiers] = useState(false);
  const hasModifiers = layer.modifiers.length > 0;
  
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
    <div className="space-y-1">
      <div
        className={cn(
          'layer-item group',
          isSelected && 'selected'
        )}
        onClick={onSelect}
      >
        {/* Modifier toggle */}
        {hasModifiers && (
          <button
            className={cn(
              'p-1 hover:bg-secondary rounded transition-transform',
              showModifiers && 'rotate-90'
            )}
            onClick={(e) => { e.stopPropagation(); setShowModifiers(!showModifiers); }}
          >
            <ChevronRight size={14} />
          </button>
        )}
        
        {/* Thumbnail */}
        <div className="w-10 h-10 rounded border border-border overflow-hidden flex-shrink-0">
          <img src={thumbnailUrl} alt={layer.name} className="w-full h-full object-cover" />
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm font-medium truncate">{layer.name}</p>
            {hasModifiers && (
              <span className="text-xs text-primary bg-primary/20 px-1 rounded">
                {layer.modifiers.length}
              </span>
            )}
          </div>
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
      
      {/* Modifiers list */}
      {showModifiers && hasModifiers && (
        <div className="ml-6 space-y-1 pl-2 border-l-2 border-primary/30">
          {layer.modifiers.map((modifier) => (
            <ModifierItem
              key={modifier.id}
              modifier={modifier}
              layerId={layer.id}
              onRemove={() => onRemoveModifier(modifier.id)}
              onToggle={() => onToggleModifier(modifier.id)}
              onOpacityChange={(opacity) => onModifierOpacityChange(modifier.id, opacity)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LayerPanel() {
  const { state, selectLayers, updateLayer, deleteLayer, dispatch, pushHistory, removeModifier, updateModifier } = useEditor();
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
  
  const handleRemoveModifier = useCallback((layerId: string, modifierId: string) => {
    removeModifier(layerId, modifierId);
    pushHistory('Remove modifier');
  }, [removeModifier, pushHistory]);
  
  const handleToggleModifier = useCallback((layerId: string, modifierId: string) => {
    const layer = state.project.layers.find(l => l.id === layerId);
    const modifier = layer?.modifiers.find(m => m.id === modifierId);
    if (modifier) {
      updateModifier(layerId, modifierId, { enabled: !modifier.enabled });
    }
  }, [state.project.layers, updateModifier]);
  
  const handleModifierOpacityChange = useCallback((layerId: string, modifierId: string, opacity: number) => {
    updateModifier(layerId, modifierId, { opacity });
  }, [updateModifier]);
  
  return (
    <div className="w-64 bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Layers size={16} className="text-primary" />
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
              onRemoveModifier={(modifierId) => handleRemoveModifier(layer.id, modifierId)}
              onToggleModifier={(modifierId) => handleToggleModifier(layer.id, modifierId)}
              onModifierOpacityChange={(modifierId, opacity) => handleModifierOpacityChange(layer.id, modifierId, opacity)}
            />
          ))
        )}
      </div>
      
      {/* Help text */}
      <div className="p-2 border-t border-border text-xs text-muted-foreground">
        <p>Click: New layer from segment</p>
        <p>Shift+Click: Merge into layer</p>
        <p>Alt+Click: Add mask modifier</p>
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