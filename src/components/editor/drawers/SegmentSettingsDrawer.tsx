import React from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { 
  SegmentEngine, 
  SegmentMethod, 
  Connectivity, 
  ColorSpace,
  SEGMENT_ENGINE_INFO,
  SEGMENT_METHOD_INFO,
} from '@/lib/canvas/segmentTypes';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Zap, 
  Waves, 
  Timer, 
  Eye, 
  Target, 
  Sparkles,
  CircleDot,
  Grid3X3,
  Blend,
} from 'lucide-react';

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function SettingRow({ label, children, description }: { 
  label: string; 
  children: React.ReactNode; 
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        {children}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function SliderRow({ 
  label, 
  value, 
  onChange, 
  min, 
  max, 
  step = 1,
  unit = '',
  description,
}: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void; 
  min: number; 
  max: number; 
  step?: number;
  unit?: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">
          {value}{unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function SegmentSettingsDrawer() {
  const { state, setSegmentSettings, setTolerance } = useEditor();
  const settings = state.segmentSettings;
  
  const updateSetting = <K extends keyof typeof settings>(
    key: K, 
    value: typeof settings[K]
  ) => {
    setSegmentSettings({ ...settings, [key]: value });
    if (key === 'tolerance') {
      setTolerance(value as number);
    }
  };
  
  return (
    <div className="w-80 bg-card border-l border-border h-full overflow-y-auto">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Sparkles size={20} className="text-primary" />
          Segment Settings
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Configure magic wand and segment engines
        </p>
      </div>
      
      <Tabs defaultValue="engine" className="w-full">
        <TabsList className="w-full grid grid-cols-3 p-1 m-4 mb-0 bg-secondary/50">
          <TabsTrigger value="engine" className="text-xs">Engine</TabsTrigger>
          <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
          <TabsTrigger value="refine" className="text-xs">Refine</TabsTrigger>
        </TabsList>
        
        <TabsContent value="engine" className="p-4 space-y-6">
          {/* Engine Selection */}
          <SettingsSection title="Segment Engine">
            <div className="space-y-3">
              <Select 
                value={settings.engine} 
                onValueChange={(v) => updateSetting('engine', v as SegmentEngine)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_ENGINE_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span>{info.name}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${info.recommended ? 'border-green-500 text-green-500' : ''}`}>
                          {info.speed}
                        </Badge>
                        {info.recommended && (
                          <Badge className="text-[9px] px-1 py-0 bg-green-500">★</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SEGMENT_ENGINE_INFO[settings.engine].description}
              </p>
              {SEGMENT_ENGINE_INFO[settings.engine].recommended && (
                <Badge variant="outline" className="text-green-500 border-green-500 text-[10px]">
                  Recommended - Best Performance
                </Badge>
              )}
            </div>
          </SettingsSection>
          
          <Separator />
          
          {/* Method */}
          <SettingsSection title="Selection Method">
            <Select 
              value={settings.method} 
              onValueChange={(v) => updateSetting('method', v as SegmentMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SEGMENT_METHOD_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    {info.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {SEGMENT_METHOD_INFO[settings.method].description}
            </p>
          </SettingsSection>
          
          <Separator />
          
          {/* Core Parameters */}
          <SettingsSection title="Core Parameters">
            <SliderRow
              label="Tolerance"
              value={settings.tolerance}
              onChange={(v) => updateSetting('tolerance', v)}
              min={0}
              max={255}
              description="Color difference threshold (0-255)"
            />
            
            <SettingRow label="Connectivity">
              <Select 
                value={String(settings.connectivity)} 
                onValueChange={(v) => updateSetting('connectivity', Number(v) as Connectivity)}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">
                    <div className="flex items-center gap-2">
                      <Target size={14} />
                      <span>4-way</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="8">
                    <div className="flex items-center gap-2">
                      <Grid3X3 size={14} />
                      <span>8-way</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            
            <SettingRow label="Color Space">
              <Select 
                value={settings.colorSpace} 
                onValueChange={(v) => updateSetting('colorSpace', v as ColorSpace)}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rgb">RGB</SelectItem>
                  <SelectItem value="hsl">HSL</SelectItem>
                  <SelectItem value="lab">LAB</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </SettingsSection>
          
          <Separator />
          
          {/* V6 Wave Settings */}
          {settings.engine === 'v6-wave' && (
            <SettingsSection title="V6 Wave Options">
              <SliderRow
                label="Time Budget"
                value={settings.waveTimeBudget}
                onChange={(v) => updateSetting('waveTimeBudget', v)}
                min={2}
                max={14}
                unit="ms"
                description="Processing time per frame (lower = smoother)"
              />
              
              <SliderRow
                label="Expansion Rate"
                value={settings.waveExpansionRate}
                onChange={(v) => updateSetting('waveExpansionRate', v)}
                min={1}
                max={50}
                description="Rings per frame (higher = faster fill)"
              />
              
              <SettingRow label="Breathing Tolerance">
                <Switch
                  checked={settings.breathingEnabled}
                  onCheckedChange={(v) => updateSetting('breathingEnabled', v)}
                />
              </SettingRow>
              
              {settings.breathingEnabled && (
                <SliderRow
                  label="Smoothness"
                  value={settings.breathingSmoothness}
                  onChange={(v) => updateSetting('breathingSmoothness', v)}
                  min={0}
                  max={1}
                  step={0.1}
                  description="How smoothly tolerance changes propagate"
                />
              )}
            </SettingsSection>
          )}
          
          {/* Instant Mode Toggle */}
          <SettingsSection title="Quick Options">
            <SettingRow 
              label="Instant Fill Mode" 
              description="Skip preview, fill immediately on click"
            >
              <Switch
                checked={settings.instantFillEnabled}
                onCheckedChange={(v) => updateSetting('instantFillEnabled', v)}
              />
            </SettingRow>
            
            <SettingRow label="Contiguous Only">
              <Switch
                checked={settings.contiguousOnly}
                onCheckedChange={(v) => updateSetting('contiguousOnly', v)}
              />
            </SettingRow>
            
            <SettingRow label="Sample All Layers">
              <Switch
                checked={settings.selectAllLayers}
                onCheckedChange={(v) => updateSetting('selectAllLayers', v)}
              />
            </SettingRow>
          </SettingsSection>
        </TabsContent>
        
        <TabsContent value="preview" className="p-4 space-y-6">
          <SettingsSection title="Preview Options">
            <SettingRow label="Enable Preview">
              <Switch
                checked={settings.previewEnabled}
                onCheckedChange={(v) => updateSetting('previewEnabled', v)}
              />
            </SettingRow>
            
            {settings.previewEnabled && (
              <>
                <SettingRow 
                  label="Zero-Latency Seed" 
                  description="Show instant feedback at cursor position"
                >
                  <Switch
                    checked={settings.zeroLatencyPreview}
                    onCheckedChange={(v) => updateSetting('zeroLatencyPreview', v)}
                  />
                </SettingRow>
                
                <SliderRow
                  label="Preview Opacity"
                  value={settings.previewOpacity}
                  onChange={(v) => updateSetting('previewOpacity', v)}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </>
            )}
          </SettingsSection>
          
          <Separator />
          
          <SettingsSection title="Sample Size">
            <Select 
              value={String(settings.sampleSize)} 
              onValueChange={(v) => updateSetting('sampleSize', Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">
                  <div className="flex items-center gap-2">
                    <CircleDot size={14} />
                    <span>Point Sample (1×1)</span>
                  </div>
                </SelectItem>
                <SelectItem value="3">3×3 Average</SelectItem>
                <SelectItem value="5">5×5 Average</SelectItem>
                <SelectItem value="11">11×11 Average</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Larger samples reduce noise sensitivity
            </p>
          </SettingsSection>
          
          <Separator />
          
          <SettingsSection title="Output Mode">
            <Select 
              value={settings.maskOutput} 
              onValueChange={(v) => updateSetting('maskOutput', v as typeof settings.maskOutput)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="selection">Selection (Marching Ants)</SelectItem>
                <SelectItem value="layer">New Layer</SelectItem>
                <SelectItem value="mask-channel">Mask Channel</SelectItem>
              </SelectContent>
            </Select>
          </SettingsSection>
        </TabsContent>
        
        <TabsContent value="refine" className="p-4 space-y-6">
          <SettingsSection title="Edge Refinement">
            <SettingRow label="Anti-Alias">
              <Switch
                checked={settings.antiAlias}
                onCheckedChange={(v) => updateSetting('antiAlias', v)}
              />
            </SettingRow>
            
            <SliderRow
              label="Feather Radius"
              value={settings.featherRadius}
              onChange={(v) => updateSetting('featherRadius', v)}
              min={0}
              max={50}
              unit="px"
              description="Soft edge blur radius"
            />
            
            <SettingRow label="Smooth Edges">
              <Switch
                checked={settings.smoothEdges}
                onCheckedChange={(v) => updateSetting('smoothEdges', v)}
              />
            </SettingRow>
            
            <SliderRow
              label="Edge Contrast"
              value={settings.edgeContrast}
              onChange={(v) => updateSetting('edgeContrast', v)}
              min={0}
              max={2}
              step={0.1}
              description="Edge detection sensitivity"
            />
          </SettingsSection>
        </TabsContent>
      </Tabs>
      
      {/* Stats Footer */}
      <div className="p-4 border-t border-border bg-secondary/30 mt-auto">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-primary" />
            <span className="text-muted-foreground">Engine:</span>
            <span className="font-medium">{settings.engine}</span>
          </div>
          <div className="flex items-center gap-2">
            <Timer size={12} className="text-primary" />
            <span className="text-muted-foreground">Budget:</span>
            <span className="font-medium">{settings.waveTimeBudget}ms</span>
          </div>
        </div>
      </div>
    </div>
  );
}
