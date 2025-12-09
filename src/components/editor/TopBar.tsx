import React, { useCallback, useRef } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { loadImageFromFile, resizeImageData } from '@/lib/canvas/imageUtils';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/canvas/constants';
import { Upload, FileImage, Sparkles, Save, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';

export function TopBar() {
  const { state, addLayer, pushHistory } = useEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      let imageData = await loadImageFromFile(file);
      
      // Resize if needed
      if (imageData.width > CANVAS_WIDTH || imageData.height > CANVAS_HEIGHT) {
        imageData = resizeImageData(imageData, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
      
      addLayer(imageData, file.name.split('.')[0] || 'Image');
      
      toast({
        title: 'Image loaded',
        description: `${imageData.width}×${imageData.height} pixels`,
      });
    } catch (error) {
      toast({
        title: 'Failed to load image',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addLayer]);
  
  const handleExport = useCallback(() => {
    // TODO: Implement export
    toast({
      title: 'Export',
      description: 'Export functionality coming soon',
    });
  }, []);
  
  return (
    <div className="h-12 bg-card border-b border-border flex items-center px-4 gap-2">
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
      
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={16} />
        Upload Image
      </Button>
      
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={handleExport}
      >
        <Save size={16} />
        Export
      </Button>
      
      <div className="flex-1" />
      
      {/* Project info */}
      <div className="text-xs text-muted-foreground">
        {state.project.width} × {state.project.height} · {state.project.layers.length} layers
      </div>
      
      {/* History indicator */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-4">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
        {state.history.length > 0 
          ? `${state.historyIndex + 1}/${state.history.length} edits`
          : 'No edits'
        }
      </div>
    </div>
  );
}
