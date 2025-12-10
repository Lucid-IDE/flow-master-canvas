import React, { useState, useEffect, useRef } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { FRAME_BUDGET_MS, PREVIEW_TIME_BUDGET_MS } from '@/lib/canvas/constants';
import { Activity, Cpu, Timer, Zap } from 'lucide-react';

function MetricCard({ 
  icon: Icon, 
  label, 
  value, 
  unit, 
  status 
}: { 
  icon: React.ElementType;
  label: string; 
  value: number; 
  unit: string;
  status: 'good' | 'warning' | 'critical';
}) {
  const statusColors = {
    good: 'text-green-500',
    warning: 'text-yellow-500',
    critical: 'text-red-500',
  };
  
  return (
    <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className={statusColors[status]} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <Badge variant="outline" className={`text-xs ${statusColors[status]}`}>
          {status}
        </Badge>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-mono font-bold">{value.toFixed(1)}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export function PerformanceDrawer() {
  const { state } = useEditor();
  const [fps, setFps] = useState(60);
  const [frameTime, setFrameTime] = useState(16.67);
  const [memoryUsed, setMemoryUsed] = useState(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef(performance.now());
  
  // FPS counter
  useEffect(() => {
    let animationId: number;
    
    const measureFrame = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      
      frameTimesRef.current.push(delta);
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }
      
      const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      setFrameTime(avgFrameTime);
      setFps(1000 / avgFrameTime);
      
      // Memory estimate (rough)
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        setMemoryUsed(mem.usedJSHeapSize / 1024 / 1024);
      }
      
      animationId = requestAnimationFrame(measureFrame);
    };
    
    animationId = requestAnimationFrame(measureFrame);
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  const getFpsStatus = (fps: number): 'good' | 'warning' | 'critical' => {
    if (fps >= 55) return 'good';
    if (fps >= 30) return 'warning';
    return 'critical';
  };
  
  const getFrameTimeStatus = (ft: number): 'good' | 'warning' | 'critical' => {
    if (ft <= FRAME_BUDGET_MS) return 'good';
    if (ft <= FRAME_BUDGET_MS * 2) return 'warning';
    return 'critical';
  };
  
  const budgetUsed = (frameTime / FRAME_BUDGET_MS) * 100;
  
  return (
    <div className="w-72 bg-card border-l border-border h-full overflow-y-auto">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity size={18} className="text-primary" />
          Performance
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Real-time performance metrics
        </p>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Main Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={Zap}
            label="FPS"
            value={fps}
            unit="fps"
            status={getFpsStatus(fps)}
          />
          <MetricCard
            icon={Timer}
            label="Frame Time"
            value={frameTime}
            unit="ms"
            status={getFrameTimeStatus(frameTime)}
          />
        </div>
        
        <Separator />
        
        {/* Frame Budget */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Frame Budget</span>
            <span className="font-mono">{budgetUsed.toFixed(0)}%</span>
          </div>
          <Progress 
            value={Math.min(100, budgetUsed)} 
            className={`h-2 ${budgetUsed > 100 ? '[&>div]:bg-red-500' : budgetUsed > 80 ? '[&>div]:bg-yellow-500' : ''}`}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0ms</span>
            <span>{FRAME_BUDGET_MS}ms (60fps)</span>
            <span>{FRAME_BUDGET_MS * 2}ms</span>
          </div>
        </div>
        
        <Separator />
        
        {/* Budget Breakdown */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Budget Breakdown (target: {FRAME_BUDGET_MS}ms)
          </h4>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span>Preview Compute</span>
              <span className="font-mono">{PREVIEW_TIME_BUDGET_MS}ms</span>
            </div>
            <div className="flex justify-between">
              <span>Drawing</span>
              <span className="font-mono">2-4ms</span>
            </div>
            <div className="flex justify-between">
              <span>UI Updates</span>
              <span className="font-mono">2-4ms</span>
            </div>
            <div className="flex justify-between">
              <span>Browser Overhead</span>
              <span className="font-mono">2-4ms</span>
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* Memory */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Memory Usage</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-mono font-bold">{memoryUsed.toFixed(0)}</span>
            <span className="text-xs text-muted-foreground">MB</span>
          </div>
        </div>
        
        <Separator />
        
        {/* Layer Stats */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Layer Statistics
          </h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Layers</span>
              <span>{state.project.layers.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Visible Layers</span>
              <span>{state.project.layers.filter(l => l.visible).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">History Size</span>
              <span>{state.history.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
