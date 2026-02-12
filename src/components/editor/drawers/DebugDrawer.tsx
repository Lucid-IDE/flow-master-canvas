import React from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

export function DebugDrawer() {
  const { state } = useEditor();
  
  const layerCount = state.project.layers.length;
  const selectedCount = state.project.selectedLayerIds.length;
  const hasSelection = state.project.activeSelection !== null;
  const hasPreview = state.previewMask !== null;
  
  return (
    <div className="w-72 bg-card border-l border-border h-full overflow-y-auto">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold">Debug Info</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Real-time editor state inspection
        </p>
      </div>
      
      <div className="p-4 space-y-6">
        <Section title="Canvas">
          <InfoRow label="Dimensions" value={`${state.project.width} x ${state.project.height}`} mono />
          <InfoRow label="Zoom" value={`${(state.canvasState.zoom * 100).toFixed(0)}%`} mono />
          <InfoRow label="Pan" value={`${state.canvasState.panX.toFixed(0)}, ${state.canvasState.panY.toFixed(0)}`} mono />
        </Section>
        
        <Separator />
        
        <Section title="Project">
          <InfoRow label="Layers" value={layerCount} />
          <InfoRow label="Selected" value={selectedCount} />
          <InfoRow label="Has Selection" value={hasSelection ? <Badge variant="default" className="text-[10px]">Yes</Badge> : <Badge variant="outline" className="text-[10px]">No</Badge>} />
          <InfoRow label="Has Preview" value={hasPreview ? <Badge variant="default" className="text-[10px]">Yes</Badge> : <Badge variant="outline" className="text-[10px]">No</Badge>} />
        </Section>
        
        <Separator />
        
        <Section title="Tool State">
          <InfoRow label="Active Tool" value={<Badge variant="secondary">{state.toolState.activeTool}</Badge>} />
          <InfoRow label="Tolerance" value={state.toolState.tolerance.toFixed(0)} mono />
          <InfoRow label="Brush Size" value={`${state.toolState.brushSize}px`} mono />
        </Section>
        
        <Separator />
        
        <Section title="Segment Settings">
          <InfoRow label="Engine" value={<Badge variant="outline">{state.segmentSettings.engine}</Badge>} />
          <InfoRow label="Method" value={state.segmentSettings.method} />
          <InfoRow label="Connectivity" value={`${state.segmentSettings.connectivity}-way`} />
          <InfoRow label="Preview" value={state.segmentSettings.previewEnabled ? 'On' : 'Off'} />
          <InfoRow label="Instant Mode" value={state.segmentSettings.instantFillEnabled ? 'On' : 'Off'} />
        </Section>
        
        <Separator />
        
        <Section title="History">
          <InfoRow label="Snapshots" value={state.history.length} />
          <InfoRow label="Index" value={state.historyIndex} mono />
          <InfoRow label="Can Undo" value={state.historyIndex > 0 ? 'Yes' : 'No'} />
          <InfoRow label="Can Redo" value={state.historyIndex < state.history.length - 1 ? 'Yes' : 'No'} />
        </Section>
        
        {state.hoverPoint && (
          <>
            <Separator />
            <Section title="Hover Point">
              <InfoRow label="World X" value={state.hoverPoint.x.toFixed(1)} mono />
              <InfoRow label="World Y" value={state.hoverPoint.y.toFixed(1)} mono />
            </Section>
          </>
        )}
        
        {state.project.activeSelection && (
          <>
            <Separator />
            <Section title="Active Selection">
              <InfoRow label="Pixels" value={state.project.activeSelection.pixels.size.toLocaleString()} mono />
              <InfoRow label="Bounds" value={`${state.project.activeSelection.bounds.width} × ${state.project.activeSelection.bounds.height}`} mono />
              <InfoRow label="Feathered" value={state.project.activeSelection.feathered ? 'Yes' : 'No'} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
