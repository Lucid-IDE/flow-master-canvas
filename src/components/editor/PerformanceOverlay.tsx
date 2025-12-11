import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Activity, Cpu, Layers, Timer, Zap, ChevronDown, ChevronUp } from 'lucide-react';

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  lastSegmentTime: number;
  pixelsProcessed: number;
  ringsProcessed: number;
  engineUsed: string;
  memoryMB: number;
}

// Global performance tracker for segment operations
export const performanceTracker = {
  lastSegmentTime: 0,
  pixelsProcessed: 0,
  ringsProcessed: 0,
  engineUsed: 'none',
  
  recordSegment(time: number, pixels: number, rings: number, engine: string) {
    this.lastSegmentTime = time;
    this.pixelsProcessed = pixels;
    this.ringsProcessed = rings;
    this.engineUsed = engine;
  },
  
  reset() {
    this.lastSegmentTime = 0;
    this.pixelsProcessed = 0;
    this.ringsProcessed = 0;
    this.engineUsed = 'none';
  }
};

export function PerformanceOverlay() {
  const { state } = useEditor();
  const [collapsed, setCollapsed] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    frameTime: 16.67,
    lastSegmentTime: 0,
    pixelsProcessed: 0,
    ringsProcessed: 0,
    engineUsed: 'none',
    memoryMB: 0,
  });
  
  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef(performance.now());
  
  // FPS measurement loop
  useEffect(() => {
    let animationId: number;
    
    const measure = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      
      frameTimesRef.current.push(delta);
      if (frameTimesRef.current.length > 30) {
        frameTimesRef.current.shift();
      }
      
      const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      
      // Get memory if available
      let memoryMB = 0;
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        memoryMB = mem.usedJSHeapSize / 1024 / 1024;
      }
      
      setMetrics({
        fps: Math.round(1000 / avgFrameTime),
        frameTime: avgFrameTime,
        lastSegmentTime: performanceTracker.lastSegmentTime,
        pixelsProcessed: performanceTracker.pixelsProcessed,
        ringsProcessed: performanceTracker.ringsProcessed,
        engineUsed: performanceTracker.engineUsed,
        memoryMB,
      });
      
      animationId = requestAnimationFrame(measure);
    };
    
    animationId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  const getFpsColor = (fps: number) => {
    if (fps >= 55) return 'text-green-400';
    if (fps >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const getSegmentTimeColor = (time: number) => {
    if (time < 10) return 'text-green-400';
    if (time < 50) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  return (
    <div className="absolute top-4 left-4 z-50 font-mono text-xs select-none">
      <div className={cn(
        "bg-black/80 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden",
        "shadow-lg shadow-black/50"
      )}>
        {/* Header */}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-primary" />
            <span className="text-white/80 uppercase tracking-wider text-[10px]">Performance</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("font-bold", getFpsColor(metrics.fps))}>
              {metrics.fps} FPS
            </span>
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </div>
        </button>
        
        {/* Metrics Grid */}
        {!collapsed && (
          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/10">
            {/* Row 1: FPS & Frame Time */}
            <div className="grid grid-cols-2 gap-3">
              <MetricItem 
                icon={Zap}
                label="Frame Time"
                value={`${metrics.frameTime.toFixed(2)}ms`}
                color={metrics.frameTime < 16.67 ? 'text-green-400' : 'text-yellow-400'}
              />
              <MetricItem 
                icon={Cpu}
                label="Memory"
                value={`${metrics.memoryMB.toFixed(0)}MB`}
                color="text-blue-400"
              />
            </div>
            
            {/* Segment Operation Stats */}
            <div className="border-t border-white/10 pt-2 mt-2">
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
                Segment Operation
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricItem 
                  icon={Timer}
                  label="Process Time"
                  value={`${metrics.lastSegmentTime.toFixed(2)}ms`}
                  color={getSegmentTimeColor(metrics.lastSegmentTime)}
                />
                <MetricItem 
                  icon={Layers}
                  label="Pixels"
                  value={formatNumber(metrics.pixelsProcessed)}
                  color="text-cyan-400"
                />
              </div>
              
              <div className="flex items-center justify-between mt-2 text-[10px]">
                <span className="text-white/40">Engine:</span>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-white/20 text-white/80">
                  {metrics.engineUsed}
                </Badge>
              </div>
              
              {metrics.ringsProcessed > 0 && (
                <div className="flex items-center justify-between mt-1 text-[10px]">
                  <span className="text-white/40">Rings:</span>
                  <span className="text-purple-400">{metrics.ringsProcessed}</span>
                </div>
              )}
            </div>
            
            {/* Layer Info */}
            <div className="border-t border-white/10 pt-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40">Layers:</span>
                <span className="text-white/80">{state.project.layers.length}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-white/40">History:</span>
                <span className="text-white/80">{state.history.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricItem({ 
  icon: Icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 text-white/40">
        <Icon size={10} />
        <span className="text-[10px]">{label}</span>
      </div>
      <span className={cn("text-sm font-bold", color)}>{value}</span>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
