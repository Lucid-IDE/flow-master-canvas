import { useCallback, useRef, useEffect, useState } from 'react';
import { useEditor } from '@/contexts/EditorContext';
import { compositeLayers } from '@/lib/canvas/compositeLayers';
import { floodFillWithEngine, WaveFloodFill, instantFloodFill, scanlineFloodFill, hybridFloodFill } from '@/lib/canvas/floodFill';
import { createLayerFromSelection } from '@/lib/canvas/layerUtils';
import { SelectionMask, Point, Rectangle, TransparencyMaskModifier, Layer } from '@/lib/canvas/types';
import { performanceTracker } from '@/components/editor/PerformanceOverlay';
import { v4 as uuidv4 } from 'uuid';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MIN_TOLERANCE, MAX_TOLERANCE } from '@/lib/canvas/constants';

/**
 * Magic Wand Hook - Multi-Engine Support with Modifier System
 *
 * Key perf fix: composite cache is only invalidated when layers change,
 * NOT on every mouse move. This avoids O(layers) recomposite per hover.
 */

interface PreviewState {
  mask: Uint8ClampedArray | null;
  bounds: Rectangle | null;
  ringNumber: number;
  acceptedCount: number;
  complete: boolean;
}

export function useMagicWand() {
  const {
    state,
    dispatch,
    setPreviewMask,
    setSelection,
    setHoverPoint,
    setTolerance,
    addLayer,
    updateLayer,
    addModifier,
    updateModifier,
    pushHistory,
  } = useEditor();

  // Add layer with color metadata for segment visualization
  const addLayerWithColor = useCallback((imageData: ImageData, name: string, bounds: Rectangle, segmentColor: string) => {
    const layer: Layer = {
      id: uuidv4(),
      name,
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      imageData,
      bounds,
      transform: { tx: 0, ty: 0, rotation: 0, sx: 1, sy: 1 },
      modifiers: [],
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      segmentColor,
    };
    dispatch({ type: 'ADD_LAYER', payload: layer });
  }, [dispatch]);

  const segmentSettings = state.segmentSettings;

  // Wave engine for V6 progressive preview
  const waveEngineRef = useRef<WaveFloodFill>(new WaveFloodFill());
  const compositeRef = useRef<ImageData | null>(null);
  const compositeVersionRef = useRef(0); // Track layer changes
  const animationRef = useRef<number | null>(null);
  const seedPointRef = useRef<Point | null>(null);

  const [previewState, setPreviewState] = useState<PreviewState>({
    mask: null, bounds: null, ringNumber: 0, acceptedCount: 0, complete: false,
  });

  // Invalidate composite only when layers actually change
  const layerVersion = state.project.layers.length +
    state.project.layers.reduce((acc, l) => acc + l.modifiedAt, 0);

  useEffect(() => {
    compositeRef.current = null;
    compositeVersionRef.current++;
  }, [layerVersion]);

  const cancelPreview = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    waveEngineRef.current.reset();
    setPreviewMask(null);
    seedPointRef.current = null;
    setPreviewState({ mask: null, bounds: null, ringNumber: 0, acceptedCount: 0, complete: false });
  }, [setPreviewMask]);

  const getComposite = useCallback((): ImageData | null => {
    const layers = state.project.layers;
    if (layers.length === 0) return null;
    if (!compositeRef.current) {
      compositeRef.current = compositeLayers(layers);
    }
    return compositeRef.current;
  }, [state.project.layers]);

  // V6 wave preview animation loop
  const runWavePreview = useCallback(() => {
    const engine = waveEngineRef.current;
    if (!engine.isInitialized() || engine.isComplete()) {
      animationRef.current = null;
      return;
    }
    const result = engine.processFrame(segmentSettings.waveTimeBudget);
    const mask = engine.getMask();
    const bounds = engine.getBounds();
    if (mask) {
      setPreviewMask(mask);
      setPreviewState({
        mask, bounds,
        ringNumber: engine.getRingNumber(),
        acceptedCount: engine.getAcceptedCount(),
        complete: result.completed,
      });
    }
    if (!result.completed) {
      animationRef.current = requestAnimationFrame(runWavePreview);
    } else {
      animationRef.current = null;
    }
  }, [segmentSettings.waveTimeBudget, setPreviewMask]);

  // Start preview at point
  const startPreview = useCallback((worldX: number, worldY: number) => {
    cancelPreview();
    const pw = state.project.width;
    const ph = state.project.height;
    if (worldX < 0 || worldX >= pw || worldY < 0 || worldY >= ph) return;
    const composite = getComposite();
    if (!composite) return;

    seedPointRef.current = { x: worldX, y: worldY };
    const startX = Math.floor(worldX);
    const startY = Math.floor(worldY);

    if (!segmentSettings.previewEnabled) return;

    const engine = segmentSettings.instantFillEnabled ? 'v5-instant' : segmentSettings.engine;

    switch (engine) {
      case 'v7-hybrid': {
        const result = hybridFloodFill(composite, startX, startY, segmentSettings.tolerance, segmentSettings.connectivity);
        performanceTracker.recordSegment(result.processingTime, result.pixels.length, result.ringCount, 'v7-hybrid');
        setPreviewMask(result.mask);
        setPreviewState({ mask: result.mask, bounds: result.bounds, ringNumber: result.ringCount, acceptedCount: result.pixels.length, complete: true });
        break;
      }
      case 'v5-instant':
      case 'v4-scanline':
      case 'v3-queue':
      case 'v2-recursive':
      case 'v1-iterative': {
        const result = engine === 'v4-scanline'
          ? scanlineFloodFill(composite, startX, startY, segmentSettings.tolerance, segmentSettings.connectivity)
          : instantFloodFill(composite, startX, startY, segmentSettings.tolerance, segmentSettings.connectivity);
        performanceTracker.recordSegment(result.processingTime, result.pixels.length, result.ringCount, engine);
        setPreviewMask(result.mask);
        setPreviewState({ mask: result.mask, bounds: result.bounds, ringNumber: result.ringCount, acceptedCount: result.pixels.length, complete: true });
        break;
      }
      case 'v6-wave':
      default: {
        const waveEngine = waveEngineRef.current;
        const initialized = waveEngine.initialize(
          composite, { x: startX, y: startY },
          segmentSettings.tolerance, segmentSettings.connectivity, segmentSettings.waveExpansionRate,
        );
        if (initialized) {
          animationRef.current = requestAnimationFrame(runWavePreview);
        }
        break;
      }
    }
  }, [cancelPreview, getComposite, segmentSettings, setPreviewMask, runWavePreview, state.project.width, state.project.height]);

  const createSelection = useCallback((worldX: number, worldY: number): SelectionMask | null => {
    const composite = getComposite();
    if (!composite) return null;
    const startX = Math.floor(worldX);
    const startY = Math.floor(worldY);
    const pw = state.project.width;
    const ph = state.project.height;
    const result = floodFillWithEngine(composite, startX, startY, segmentSettings);
    performanceTracker.recordSegment(result.processingTime, result.pixels.length, result.ringCount, segmentSettings.engine);
    if (result.pixels.length === 0) return null;
    return {
      id: uuidv4(),
      mask: result.mask,
      bounds: { x: result.bounds.x, y: result.bounds.y, width: result.bounds.width, height: result.bounds.height },
      width: pw,
      height: ph,
      pixels: new Set(result.pixels),
      feathered: false,
      metadata: {
        seedPoint: { x: worldX, y: worldY },
        tolerance: segmentSettings.tolerance,
        connectivity: segmentSettings.connectivity,
        engine: segmentSettings.engine,
        processingTime: result.processingTime,
      },
    };
  }, [getComposite, segmentSettings, state.project.width, state.project.height]);

  const generateContrastingColor = useCallback((existingLayers: Layer[]): string => {
    const goldenAngle = 137.508;
    const baseHue = (existingLayers.length * goldenAngle) % 360;
    const hue = (baseHue + Math.random() * 30 - 15 + 360) % 360;
    return `hsl(${hue}, 70%, 55%)`;
  }, []);

  // Handle click
  const handleClick = useCallback((worldX: number, worldY: number, shiftKey: boolean, altKey: boolean) => {
    cancelPreview();
    const selection = createSelection(worldX, worldY);
    if (!selection) return;
    const composite = getComposite();
    if (!composite) return;
    const pw = state.project.width;
    const ph = state.project.height;

    if (altKey && shiftKey) {
      const selectedLayerId = state.project.selectedLayerIds[0];
      if (!selectedLayerId) return;
      const selectedLayer = state.project.layers.find(l => l.id === selectedLayerId);
      if (!selectedLayer) return;
      const existingModifier = selectedLayer.modifiers.find(m => m.type === 'transparency-mask') as TransparencyMaskModifier | undefined;
      if (existingModifier) {
        const mergedMask = new Uint8ClampedArray(selection.mask.length);
        for (let i = 0; i < mergedMask.length; i++) {
          mergedMask[i] = Math.max(existingModifier.parameters.mask[i] || 0, selection.mask[i]);
        }
        const mergedBounds = {
          x: Math.min(existingModifier.parameters.bounds.x, selection.bounds.x),
          y: Math.min(existingModifier.parameters.bounds.y, selection.bounds.y),
          width: Math.max(existingModifier.parameters.bounds.x + existingModifier.parameters.bounds.width, selection.bounds.x + selection.bounds.width) - Math.min(existingModifier.parameters.bounds.x, selection.bounds.x),
          height: Math.max(existingModifier.parameters.bounds.y + existingModifier.parameters.bounds.height, selection.bounds.y + selection.bounds.height) - Math.min(existingModifier.parameters.bounds.y, selection.bounds.y),
        };
        updateModifier(selectedLayerId, existingModifier.id, { parameters: { mask: mergedMask, bounds: mergedBounds } });
        pushHistory('Merge transparency mask modifier');
      } else {
        addModifier(selectedLayerId, {
          id: uuidv4(), type: 'transparency-mask', enabled: true, opacity: 1.0,
          parameters: { mask: selection.mask, bounds: selection.bounds },
        } as TransparencyMaskModifier);
        pushHistory('Add transparency mask modifier');
      }
    } else if (altKey) {
      const selectedLayerId = state.project.selectedLayerIds[0];
      if (!selectedLayerId) return;
      addModifier(selectedLayerId, {
        id: uuidv4(), type: 'transparency-mask', enabled: true, opacity: 1.0,
        parameters: { mask: selection.mask, bounds: selection.bounds },
      } as TransparencyMaskModifier);
      pushHistory('Add transparency mask modifier');
    } else if (shiftKey) {
      const selectedLayerId = state.project.selectedLayerIds[0];
      const selectedLayer = state.project.layers.find(l => l.id === selectedLayerId);
      const isSegmentLayer = selectedLayer?.name.startsWith('Segment');
      if (!selectedLayer || !isSegmentLayer) {
        try {
          const newLayer = createLayerFromSelection(composite, selection, `Segment ${state.project.layers.length + 1}`);
          addLayerWithColor(newLayer.imageData, newLayer.name, newLayer.bounds, generateContrastingColor(state.project.layers));
          pushHistory('Create segment layer');
        } catch (e) { console.error('Failed to create layer:', e); }
        return;
      }
      try {
        const segmentLayer = createLayerFromSelection(composite, selection, 'temp');
        const mergedCanvas = document.createElement('canvas');
        const mergedWidth = Math.max(selectedLayer.bounds.x + selectedLayer.imageData.width, segmentLayer.bounds.x + segmentLayer.imageData.width) - Math.min(selectedLayer.bounds.x, segmentLayer.bounds.x);
        const mergedHeight = Math.max(selectedLayer.bounds.y + selectedLayer.imageData.height, segmentLayer.bounds.y + segmentLayer.imageData.height) - Math.min(selectedLayer.bounds.y, segmentLayer.bounds.y);
        const mergedX = Math.min(selectedLayer.bounds.x, segmentLayer.bounds.x);
        const mergedY = Math.min(selectedLayer.bounds.y, segmentLayer.bounds.y);
        mergedCanvas.width = mergedWidth;
        mergedCanvas.height = mergedHeight;
        const mergedCtx = mergedCanvas.getContext('2d')!;
        const t1 = document.createElement('canvas'); t1.width = selectedLayer.imageData.width; t1.height = selectedLayer.imageData.height;
        t1.getContext('2d')!.putImageData(selectedLayer.imageData, 0, 0);
        mergedCtx.drawImage(t1, selectedLayer.bounds.x - mergedX, selectedLayer.bounds.y - mergedY);
        const t2 = document.createElement('canvas'); t2.width = segmentLayer.imageData.width; t2.height = segmentLayer.imageData.height;
        t2.getContext('2d')!.putImageData(segmentLayer.imageData, 0, 0);
        mergedCtx.drawImage(t2, segmentLayer.bounds.x - mergedX, segmentLayer.bounds.y - mergedY);
        updateLayer(selectedLayerId, {
          imageData: mergedCtx.getImageData(0, 0, mergedWidth, mergedHeight),
          bounds: { x: mergedX, y: mergedY, width: mergedWidth, height: mergedHeight },
        });
        pushHistory('Merge segment into layer');
      } catch (e) { console.error('Failed to merge segment:', e); }
    } else {
      try {
        const newLayer = createLayerFromSelection(composite, selection, `Segment ${state.project.layers.length + 1}`);
        addLayerWithColor(newLayer.imageData, newLayer.name, newLayer.bounds, generateContrastingColor(state.project.layers));
        pushHistory('Create segment layer');
      } catch (e) { console.error('Failed to create layer:', e); }
    }
  }, [createSelection, cancelPreview, getComposite, state.project, addLayerWithColor, updateLayer, addModifier, updateModifier, pushHistory, generateContrastingColor]);

  // Handle mouse move -- composite is NOT invalidated here (big perf win)
  const handleMouseMove = useCallback((worldX: number, worldY: number) => {
    setHoverPoint({ x: worldX, y: worldY });
    startPreview(worldX, worldY);
  }, [setHoverPoint, startPreview]);

  const handleMouseLeave = useCallback(() => {
    cancelPreview();
    setHoverPoint(null);
  }, [cancelPreview, setHoverPoint]);

  // Handle scroll for tolerance adjustment
  const handleWheel = useCallback((deltaY: number) => {
    const currentTolerance = segmentSettings.tolerance;
    const delta = deltaY > 0 ? -1 : 1;
    const newTolerance = Math.max(MIN_TOLERANCE, Math.min(MAX_TOLERANCE, currentTolerance + delta));
    if (newTolerance !== currentTolerance) {
      setTolerance(newTolerance);
      if (segmentSettings.engine === 'v6-wave' && segmentSettings.breathingEnabled) {
        waveEngineRef.current.updateTolerance(newTolerance);
      }
      if (seedPointRef.current) {
        compositeRef.current = null;
        startPreview(seedPointRef.current.x, seedPointRef.current.y);
      }
    }
  }, [segmentSettings, setTolerance, startPreview]);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      waveEngineRef.current.reset();
    };
  }, []);

  useEffect(() => {
    if (seedPointRef.current && state.toolState.activeTool === 'magic-wand') {
      const timer = setTimeout(() => {
        if (seedPointRef.current) {
          compositeRef.current = null;
          startPreview(seedPointRef.current.x, seedPointRef.current.y);
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [segmentSettings.engine, segmentSettings.connectivity, segmentSettings.waveExpansionRate, segmentSettings.instantFillEnabled, segmentSettings.previewEnabled]);

  return {
    handleClick,
    handleMouseMove,
    handleMouseLeave,
    handleWheel,
    cancelPreview,
    isActive: state.toolState.activeTool === 'magic-wand',
    previewState,
    segmentSettings,
  };
}
