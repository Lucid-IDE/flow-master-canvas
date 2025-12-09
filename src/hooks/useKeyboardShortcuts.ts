import { useEffect, useCallback } from 'react';
import { useEditor } from '@/contexts/EditorContext';

/**
 * Hook for keyboard shortcuts
 */
export function useKeyboardShortcuts() {
  const { 
    setTool, 
    undo, 
    redo, 
    canUndo, 
    canRedo,
    deleteLayer,
    selectedLayers,
  } = useEditor();
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    
    const isCmd = e.metaKey || e.ctrlKey;
    
    // Undo/Redo
    if (isCmd && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        if (canRedo) redo();
      } else {
        if (canUndo) undo();
      }
      return;
    }
    
    // Tool shortcuts
    switch (e.key.toLowerCase()) {
      case 'v':
        setTool('select');
        break;
      case 'm':
        setTool('move');
        break;
      case 'w':
        setTool('magic-wand');
        break;
      case 'b':
        setTool('brush');
        break;
      case 'e':
        setTool('eraser');
        break;
      case 'z':
        if (!isCmd) setTool('zoom');
        break;
      case 'h':
        setTool('pan');
        break;
      case 'delete':
      case 'backspace':
        if (selectedLayers.length > 0) {
          selectedLayers.forEach(layer => deleteLayer(layer.id));
        }
        break;
      case ' ':
        // Spacebar for temporary pan mode (handled elsewhere)
        break;
    }
  }, [setTool, undo, redo, canUndo, canRedo, deleteLayer, selectedLayers]);
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
