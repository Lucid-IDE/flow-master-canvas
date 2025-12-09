import React from 'react';
import { EditorProvider } from '@/contexts/EditorContext';
import { EditorCanvas } from './EditorCanvas';
import { Toolbar } from './Toolbar';
import { LayerPanel } from './LayerPanel';
import { TopBar } from './TopBar';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function EditorContent() {
  useKeyboardShortcuts();
  
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <Toolbar />
        <EditorCanvas />
        <LayerPanel />
      </div>
    </div>
  );
}

export function ImageEditor() {
  return (
    <EditorProvider>
      <EditorContent />
    </EditorProvider>
  );
}
