import React, { useState } from 'react';
import { EditorProvider } from '@/contexts/EditorContext';
import { EditorCanvas } from './EditorCanvas';
import { Toolbar } from './Toolbar';
import { LayerPanel } from './LayerPanel';
import { TopBar } from './TopBar';
import { RightDrawerBar, DrawerType } from './RightDrawerBar';
import { SegmentSettingsDrawer, DebugDrawer, PerformanceDrawer } from './drawers';
import { PerformanceOverlay } from './PerformanceOverlay';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

function DrawerContent({ drawer }: { drawer: DrawerType | null }) {
  switch (drawer) {
    case 'segment-settings':
      return <SegmentSettingsDrawer />;
    case 'layers':
      return <LayerPanel />;
    case 'debug':
      return <DebugDrawer />;
    case 'performance':
      return <PerformanceDrawer />;
    default:
      return null;
  }
}

function EditorContent() {
  useKeyboardShortcuts();
  const [activeDrawer, setActiveDrawer] = useState<DrawerType | null>('segment-settings');
  const [showOverlay, setShowOverlay] = useState(true);
  
  const handleDrawerToggle = (drawer: DrawerType) => {
    setActiveDrawer(prev => prev === drawer ? null : drawer);
  };
  
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar />
      <div className="flex-1 flex overflow-hidden relative">
        <Toolbar />
        <div className="relative flex-1">
          <EditorCanvas />
          {showOverlay && <PerformanceOverlay />}
        </div>
        {activeDrawer && <DrawerContent drawer={activeDrawer} />}
        <RightDrawerBar activeDrawer={activeDrawer} onDrawerToggle={handleDrawerToggle} />
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
