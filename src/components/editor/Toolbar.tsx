import React, { useCallback } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { ToolType } from '@/lib/canvas/types';
import { 
  MousePointer2, 
  Move, 
  Wand2, 
  Paintbrush, 
  Eraser, 
  ZoomIn, 
  Hand,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ToolButtonProps {
  tool: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  isActive: boolean;
  onClick: () => void;
}

function ToolButton({ icon, label, shortcut, isActive, onClick }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            'tool-button w-10 h-10 flex items-center justify-center',
            isActive && 'active'
          )}
          onClick={onClick}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        <span>{label}</span>
        <kbd className="px-1.5 py-0.5 text-xs bg-secondary rounded">{shortcut}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function Toolbar() {
  const { 
    state, 
    setTool, 
    setTolerance,
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useEditor();
  
  const tools: { tool: ToolType; icon: React.ReactNode; label: string; shortcut: string }[] = [
    { tool: 'select', icon: <MousePointer2 size={18} />, label: 'Select', shortcut: 'V' },
    { tool: 'move', icon: <Move size={18} />, label: 'Move', shortcut: 'M' },
    { tool: 'magic-wand', icon: <Wand2 size={18} />, label: 'Magic Wand', shortcut: 'W' },
    { tool: 'brush', icon: <Paintbrush size={18} />, label: 'Brush', shortcut: 'B' },
    { tool: 'eraser', icon: <Eraser size={18} />, label: 'Eraser', shortcut: 'E' },
    { tool: 'zoom', icon: <ZoomIn size={18} />, label: 'Zoom', shortcut: 'Z' },
    { tool: 'pan', icon: <Hand size={18} />, label: 'Pan', shortcut: 'H' },
  ];
  
  return (
    <div className="w-14 bg-card border-r border-border flex flex-col items-center py-3 gap-1">
      {/* Undo/Redo */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="tool-button w-10 h-10 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={undo}
            disabled={!canUndo}
          >
            <Undo2 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span>Undo</span>
          <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-secondary rounded">⌘Z</kbd>
        </TooltipContent>
      </Tooltip>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="tool-button w-10 h-10 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={redo}
            disabled={!canRedo}
          >
            <Redo2 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span>Redo</span>
          <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-secondary rounded">⌘⇧Z</kbd>
        </TooltipContent>
      </Tooltip>
      
      <Separator className="my-2 w-8" />
      
      {/* Tools */}
      {tools.map(({ tool, icon, label, shortcut }) => (
        <ToolButton
          key={tool}
          tool={tool}
          icon={icon}
          label={label}
          shortcut={shortcut}
          isActive={state.toolState.activeTool === tool}
          onClick={() => setTool(tool)}
        />
      ))}
      
      {/* Spacer */}
      <div className="flex-1" />
      
      {/* Tolerance slider for magic wand */}
      {state.toolState.activeTool === 'magic-wand' && (
        <div className="w-10 flex flex-col items-center gap-2 mb-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tol</span>
          <div className="h-24 flex items-center">
            <Slider
              orientation="vertical"
              value={[state.toolState.tolerance]}
              onValueChange={([value]) => setTolerance(value)}
              min={0}
              max={255}
              step={1}
              className="h-full"
            />
          </div>
          <span className="text-xs text-foreground font-medium">
            {Math.round(state.toolState.tolerance)}
          </span>
        </div>
      )}
    </div>
  );
}
