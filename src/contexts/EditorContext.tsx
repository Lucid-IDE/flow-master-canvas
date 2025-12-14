import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Project, Layer, SelectionMask, CanvasState, HistorySnapshot, ToolType, ToolState } from '@/lib/canvas/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_TOLERANCE, MAX_HISTORY_SIZE } from '@/lib/canvas/constants';
import { createLayer, updateLayer, duplicateLayer } from '@/lib/canvas/layerUtils';
import { SegmentSettings, DEFAULT_SEGMENT_SETTINGS } from '@/lib/canvas/segmentTypes';

// State types
interface EditorState {
  project: Project;
  canvasState: CanvasState;
  toolState: ToolState;
  segmentSettings: SegmentSettings;
  history: HistorySnapshot[];
  historyIndex: number;
  isProcessing: boolean;
  previewMask: Uint8ClampedArray | null;
  hoverPoint: { x: number; y: number } | null;
}

// Action types
type EditorAction =
  | { type: 'SET_PROJECT'; payload: Project }
  | { type: 'ADD_LAYER'; payload: Layer }
  | { type: 'UPDATE_LAYER'; payload: { id: string; updates: Partial<Layer> } }
  | { type: 'DELETE_LAYER'; payload: string }
  | { type: 'SELECT_LAYERS'; payload: string[] }
  | { type: 'REORDER_LAYERS'; payload: Layer[] }
  | { type: 'ADD_MODIFIER'; payload: { layerId: string; modifier: import('@/lib/canvas/types').Modifier } }
  | { type: 'REMOVE_MODIFIER'; payload: { layerId: string; modifierId: string } }
  | { type: 'UPDATE_MODIFIER'; payload: { layerId: string; modifierId: string; updates: Partial<import('@/lib/canvas/types').Modifier> } }
  | { type: 'SET_CANVAS_STATE'; payload: Partial<CanvasState> }
  | { type: 'SET_TOOL'; payload: ToolType }
  | { type: 'SET_TOLERANCE'; payload: number }
  | { type: 'SET_SEGMENT_SETTINGS'; payload: SegmentSettings }
  | { type: 'SET_SELECTION'; payload: SelectionMask | null }
  | { type: 'SET_PREVIEW_MASK'; payload: Uint8ClampedArray | null }
  | { type: 'SET_HOVER_POINT'; payload: { x: number; y: number } | null }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'PUSH_HISTORY'; payload: { description: string } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESTORE_SNAPSHOT'; payload: HistorySnapshot };

// Initial state
const createInitialProject = (): Project => ({
  id: uuidv4(),
  name: 'Untitled Project',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  layers: [],
  selectedLayerIds: [],
  activeSelection: null,
  createdAt: Date.now(),
  modifiedAt: Date.now(),
});

const initialState: EditorState = {
  project: createInitialProject(),
  canvasState: { panX: 0, panY: 0, zoom: 1 },
  toolState: {
    activeTool: 'magic-wand',
    tolerance: DEFAULT_TOLERANCE,
    brushSize: 20,
    brushHardness: 0.8,
  },
  segmentSettings: DEFAULT_SEGMENT_SETTINGS,
  history: [],
  historyIndex: -1,
  isProcessing: false,
  previewMask: null,
  hoverPoint: null,
};

// Deep clone helper
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (obj instanceof ImageData) {
    return new ImageData(
      new Uint8ClampedArray(obj.data),
      obj.width,
      obj.height
    ) as unknown as T;
  }
  
  if (obj instanceof Uint8ClampedArray) {
    return new Uint8ClampedArray(obj) as unknown as T;
  }
  
  if (obj instanceof Set) {
    return new Set(obj) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

// Reducer
function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: action.payload };
    
    case 'ADD_LAYER':
      return {
        ...state,
        project: {
          ...state.project,
          layers: [...state.project.layers, action.payload],
          selectedLayerIds: [action.payload.id],
          modifiedAt: Date.now(),
        },
      };
    
    case 'UPDATE_LAYER':
      return {
        ...state,
        project: {
          ...state.project,
          layers: state.project.layers.map(layer =>
            layer.id === action.payload.id
              ? updateLayer(layer, action.payload.updates)
              : layer
          ),
          modifiedAt: Date.now(),
        },
      };
    
    case 'DELETE_LAYER':
      return {
        ...state,
        project: {
          ...state.project,
          layers: state.project.layers.filter(l => l.id !== action.payload),
          selectedLayerIds: state.project.selectedLayerIds.filter(id => id !== action.payload),
          modifiedAt: Date.now(),
        },
      };
    
    case 'SELECT_LAYERS':
      return {
        ...state,
        project: {
          ...state.project,
          selectedLayerIds: action.payload,
        },
      };
    
    case 'REORDER_LAYERS':
      return {
        ...state,
        project: {
          ...state.project,
          layers: action.payload,
          modifiedAt: Date.now(),
        },
      };
    
    case 'ADD_MODIFIER':
      return {
        ...state,
        project: {
          ...state.project,
          layers: state.project.layers.map(layer =>
            layer.id === action.payload.layerId
              ? { ...layer, modifiers: [...layer.modifiers, action.payload.modifier], modifiedAt: Date.now() }
              : layer
          ),
          modifiedAt: Date.now(),
        },
      };
    
    case 'REMOVE_MODIFIER':
      return {
        ...state,
        project: {
          ...state.project,
          layers: state.project.layers.map(layer =>
            layer.id === action.payload.layerId
              ? { ...layer, modifiers: layer.modifiers.filter(m => m.id !== action.payload.modifierId), modifiedAt: Date.now() }
              : layer
          ),
          modifiedAt: Date.now(),
        },
      };
    
    case 'UPDATE_MODIFIER':
      return {
        ...state,
        project: {
          ...state.project,
          layers: state.project.layers.map(layer =>
            layer.id === action.payload.layerId
              ? {
                  ...layer,
                  modifiers: layer.modifiers.map(m =>
                    m.id === action.payload.modifierId
                      ? { ...m, ...action.payload.updates }
                      : m
                  ),
                  modifiedAt: Date.now(),
                }
              : layer
          ),
          modifiedAt: Date.now(),
        },
      };
    
    case 'SET_CANVAS_STATE':
      return {
        ...state,
        canvasState: { ...state.canvasState, ...action.payload },
      };
    
    case 'SET_TOOL':
      return {
        ...state,
        toolState: { ...state.toolState, activeTool: action.payload },
      };
    
    case 'SET_TOLERANCE':
      return {
        ...state,
        toolState: { ...state.toolState, tolerance: action.payload },
        segmentSettings: { ...state.segmentSettings, tolerance: action.payload },
      };
    
    case 'SET_SEGMENT_SETTINGS':
      return {
        ...state,
        segmentSettings: action.payload,
        toolState: { ...state.toolState, tolerance: action.payload.tolerance },
      };
    
    case 'SET_SELECTION':
      return {
        ...state,
        project: {
          ...state.project,
          activeSelection: action.payload,
        },
      };
    
    case 'SET_PREVIEW_MASK':
      return { ...state, previewMask: action.payload };
    
    case 'SET_HOVER_POINT':
      return { ...state, hoverPoint: action.payload };
    
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    
    case 'PUSH_HISTORY': {
      const snapshot: HistorySnapshot = {
        id: uuidv4(),
        description: action.payload.description,
        project: deepClone(state.project),
        canvasState: { ...state.canvasState },
        timestamp: Date.now(),
      };
      
      // Truncate future history if we're not at the end
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(snapshot);
      
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }
      
      return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    }
    
    case 'UNDO': {
      if (state.historyIndex <= 0) return state;
      
      const prevSnapshot = state.history[state.historyIndex - 1];
      return {
        ...state,
        project: deepClone(prevSnapshot.project),
        canvasState: { ...prevSnapshot.canvasState },
        historyIndex: state.historyIndex - 1,
      };
    }
    
    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state;
      
      const nextSnapshot = state.history[state.historyIndex + 1];
      return {
        ...state,
        project: deepClone(nextSnapshot.project),
        canvasState: { ...nextSnapshot.canvasState },
        historyIndex: state.historyIndex + 1,
      };
    }
    
    case 'RESTORE_SNAPSHOT':
      return {
        ...state,
        project: deepClone(action.payload.project),
        canvasState: { ...action.payload.canvasState },
      };
    
    default:
      return state;
  }
}

// Context
interface EditorContextType {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  
  // Helper actions
  addLayer: (imageData: ImageData, name: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  deleteLayer: (id: string) => void;
  selectLayers: (ids: string[]) => void;
  setTool: (tool: ToolType) => void;
  setTolerance: (tolerance: number) => void;
  setSegmentSettings: (settings: SegmentSettings) => void;
  setCanvasState: (state: Partial<CanvasState>) => void;
  setSelection: (selection: SelectionMask | null) => void;
  setPreviewMask: (mask: Uint8ClampedArray | null) => void;
  setHoverPoint: (point: { x: number; y: number } | null) => void;
  pushHistory: (description: string) => void;
  undo: () => void;
  redo: () => void;
  addModifier: (layerId: string, modifier: import('@/lib/canvas/types').Modifier) => void;
  removeModifier: (layerId: string, modifierId: string) => void;
  updateModifier: (layerId: string, modifierId: string, updates: Partial<import('@/lib/canvas/types').Modifier>) => void;
  
  // Computed values
  canUndo: boolean;
  canRedo: boolean;
  selectedLayers: Layer[];
}

const EditorContext = createContext<EditorContextType | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  
  const addLayer = useCallback((imageData: ImageData, name: string) => {
    const layer = createLayer(imageData, name);
    dispatch({ type: 'ADD_LAYER', payload: layer });
    dispatch({ type: 'PUSH_HISTORY', payload: { description: `Add layer: ${name}` } });
  }, []);
  
  const updateLayerFn = useCallback((id: string, updates: Partial<Layer>) => {
    dispatch({ type: 'UPDATE_LAYER', payload: { id, updates } });
  }, []);
  
  const deleteLayer = useCallback((id: string) => {
    dispatch({ type: 'DELETE_LAYER', payload: id });
    dispatch({ type: 'PUSH_HISTORY', payload: { description: 'Delete layer' } });
  }, []);
  
  const selectLayers = useCallback((ids: string[]) => {
    dispatch({ type: 'SELECT_LAYERS', payload: ids });
  }, []);
  
  const setTool = useCallback((tool: ToolType) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
  }, []);
  
  const setTolerance = useCallback((tolerance: number) => {
    dispatch({ type: 'SET_TOLERANCE', payload: tolerance });
  }, []);
  
  const setSegmentSettings = useCallback((settings: SegmentSettings) => {
    dispatch({ type: 'SET_SEGMENT_SETTINGS', payload: settings });
  }, []);
  
  const setCanvasState = useCallback((canvasState: Partial<CanvasState>) => {
    dispatch({ type: 'SET_CANVAS_STATE', payload: canvasState });
  }, []);
  
  const setSelection = useCallback((selection: SelectionMask | null) => {
    dispatch({ type: 'SET_SELECTION', payload: selection });
  }, []);
  
  const setPreviewMask = useCallback((mask: Uint8ClampedArray | null) => {
    dispatch({ type: 'SET_PREVIEW_MASK', payload: mask });
  }, []);
  
  const setHoverPoint = useCallback((point: { x: number; y: number } | null) => {
    dispatch({ type: 'SET_HOVER_POINT', payload: point });
  }, []);
  
  const pushHistory = useCallback((description: string) => {
    dispatch({ type: 'PUSH_HISTORY', payload: { description } });
  }, []);
  
  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);
  
  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);
  
  const addModifier = useCallback((layerId: string, modifier: import('@/lib/canvas/types').Modifier) => {
    dispatch({ type: 'ADD_MODIFIER', payload: { layerId, modifier } });
  }, []);
  
  const removeModifier = useCallback((layerId: string, modifierId: string) => {
    dispatch({ type: 'REMOVE_MODIFIER', payload: { layerId, modifierId } });
  }, []);
  
  const updateModifier = useCallback((layerId: string, modifierId: string, updates: Partial<import('@/lib/canvas/types').Modifier>) => {
    dispatch({ type: 'UPDATE_MODIFIER', payload: { layerId, modifierId, updates } });
  }, []);
  
  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;
  const selectedLayers = state.project.layers.filter(
    l => state.project.selectedLayerIds.includes(l.id)
  );
  
  return (
    <EditorContext.Provider value={{
      state,
      dispatch,
      addLayer,
      updateLayer: updateLayerFn,
      deleteLayer,
      selectLayers,
      setTool,
      setTolerance,
      setSegmentSettings,
      setCanvasState,
      setSelection,
      setPreviewMask,
      setHoverPoint,
      pushHistory,
      undo,
      redo,
      addModifier,
      removeModifier,
      updateModifier,
      canUndo,
      canRedo,
      selectedLayers,
    }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider');
  }
  return context;
}
