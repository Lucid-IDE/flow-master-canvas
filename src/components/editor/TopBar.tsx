import React, { useCallback, useRef, useEffect } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { loadImageFromFile, resizeImageData } from '@/lib/canvas/imageUtils';
import { Upload, Save, Sparkles, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';

// Max canvas dimension we allow (browser canvas limit safety)
const MAX_DIMENSION = 8192;

export function TopBar() {
  const { state, addLayer, pushHistory, dispatch } = useEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load an image and optionally resize the project to fit it
  const loadImage = useCallback(async (file: File) => {
    try {
      let imageData = await loadImageFromFile(file);

      // If image is larger than max dimension, scale it down
      if (imageData.width > MAX_DIMENSION || imageData.height > MAX_DIMENSION) {
        imageData = resizeImageData(imageData, MAX_DIMENSION, MAX_DIMENSION);
      }

      // If this is the first layer, resize the project to match the image
      if (state.project.layers.length === 0) {
        dispatch({
          type: 'SET_PROJECT',
          payload: {
            ...state.project,
            width: imageData.width,
            height: imageData.height,
          },
        });
      }

      addLayer(imageData, file.name.split('.')[0] || 'Image');

      toast({
        title: 'Image loaded',
        description: `${imageData.width} x ${imageData.height} pixels`,
      });
    } catch (error) {
      toast({
        title: 'Failed to load image',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [addLayer, dispatch, state.project]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadImage(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [loadImage]);

  // Drag-and-drop support
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await loadImage(file);
    }
  }, [loadImage]);

  // Paste from clipboard support
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            await loadImage(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadImage]);

  // Export composite as PNG
  const handleExport = useCallback(() => {
    const layers = state.project.layers.filter(l => l.visible);
    if (layers.length === 0) {
      toast({ title: 'Nothing to export', description: 'Add at least one visible layer.', variant: 'destructive' });
      return;
    }

    const w = state.project.width;
    const h = state.project.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    for (const layer of layers) {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      const temp = document.createElement('canvas');
      temp.width = layer.imageData.width;
      temp.height = layer.imageData.height;
      temp.getContext('2d')!.putImageData(layer.imageData, 0, 0);
      ctx.drawImage(temp, layer.bounds.x, layer.bounds.y);
      ctx.restore();
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.project.name || 'export'}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: `${w} x ${h} PNG` });
    }, 'image/png');
  }, [state.project]);

  return (
    <div
      ref={containerRef}
      className="h-12 bg-card border-b border-border flex items-center px-4 gap-2"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Sparkles size={18} className="text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm">V3 Canvas</span>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* File actions */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      <Button variant="ghost" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
        <Upload size={16} />
        Upload Image
      </Button>

      <Button variant="ghost" size="sm" className="gap-2" onClick={handleExport}>
        <Download size={16} />
        Export PNG
      </Button>

      <div className="flex-1" />

      {/* Project info */}
      <div className="text-xs text-muted-foreground">
        {state.project.width} x {state.project.height} -- {state.project.layers.length} layers
      </div>

      {/* History indicator */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-4">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
        {state.history.length > 0
          ? `${state.historyIndex + 1}/${state.history.length} edits`
          : 'No edits'}
      </div>
    </div>
  );
}
