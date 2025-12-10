import React from 'react';
import { cn } from '@/lib/utils';
import { 
  Settings2, 
  Wand2, 
  Layers, 
  Palette, 
  History, 
  Info,
  Gauge,
  Sliders,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type DrawerType = 'segment-settings' | 'layers' | 'colors' | 'history' | 'debug' | 'performance' | 'adjustments';

interface DrawerButtonProps {
  drawer: DrawerType;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function DrawerButton({ icon, label, isActive, onClick }: DrawerButtonProps) {
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
      <TooltipContent side="left">
        <span>{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

interface RightDrawerBarProps {
  activeDrawer: DrawerType | null;
  onDrawerToggle: (drawer: DrawerType) => void;
}

export function RightDrawerBar({ activeDrawer, onDrawerToggle }: RightDrawerBarProps) {
  const drawers: { drawer: DrawerType; icon: React.ReactNode; label: string }[] = [
    { drawer: 'segment-settings', icon: <Wand2 size={18} />, label: 'Segment Settings' },
    { drawer: 'adjustments', icon: <Sliders size={18} />, label: 'Adjustments' },
    { drawer: 'layers', icon: <Layers size={18} />, label: 'Layers' },
    { drawer: 'colors', icon: <Palette size={18} />, label: 'Colors' },
    { drawer: 'history', icon: <History size={18} />, label: 'History' },
    { drawer: 'performance', icon: <Gauge size={18} />, label: 'Performance' },
    { drawer: 'debug', icon: <Info size={18} />, label: 'Debug Info' },
  ];
  
  return (
    <div className="w-14 bg-card border-l border-border flex flex-col items-center py-3 gap-1">
      {drawers.map(({ drawer, icon, label }) => (
        <DrawerButton
          key={drawer}
          drawer={drawer}
          icon={icon}
          label={label}
          isActive={activeDrawer === drawer}
          onClick={() => onDrawerToggle(drawer)}
        />
      ))}
      
      <div className="flex-1" />
      
      <DrawerButton
        drawer="segment-settings"
        icon={<Settings2 size={18} />}
        label="General Settings"
        isActive={false}
        onClick={() => {}}
      />
    </div>
  );
}
