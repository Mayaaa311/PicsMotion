// Components
export { InteractiveScene } from './components/InteractiveScene';
export type { InteractiveSceneProps } from './components/InteractiveScene';
export { SceneCamera } from './components/SceneCamera';
export { SceneContent } from './components/SceneContent';
export { LayerPlane } from './components/LayerPlane';
export { DebugPanel } from './components/DebugPanel';
export { LoadingOverlay } from './components/LoadingOverlay';
export { FrameReporter } from './components/FrameReporter';

// Context, store, events
export { RuntimeProvider, useRuntime } from './context';
export type { RuntimeContextValue } from './context';
export { useRuntimeStore } from './store';
export type { RuntimeState, DebugSnapshot } from './store';
export { SceneEventBus } from './events/eventBus';

// Hooks
export { usePointerField } from './hooks/usePointerField';
export { useSyncReducedMotion } from './hooks/useReducedMotion';

// Math + loader
export * from './math/coordinates';
export { loadScene } from './loader';
