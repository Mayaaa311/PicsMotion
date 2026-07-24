// Components
export { InteractiveScene } from './components/InteractiveScene';
export type { InteractiveSceneProps } from './components/InteractiveScene';
export { SceneCamera } from './components/SceneCamera';
export { SceneContent } from './components/SceneContent';
export { AudioCameraController } from './components/AudioCameraController';
export { LayerPlane } from './components/LayerPlane';
export { DebugPanel } from './components/DebugPanel';
export { LoadingOverlay } from './components/LoadingOverlay';
export { FrameReporter } from './components/FrameReporter';

// Context, store, events
export { RuntimeProvider, useRuntime } from './context';
export type { RuntimeContextValue, AudioFrameAccessor } from './context';
export { evaluateBinding, applyAudioBindings } from './audio/bindings';
export { planLayerEffects } from './effects/layer-effects';
export type { LayerEffectPlan, LayerMaterialKind } from './effects/layer-effects';
export { useRuntimeStore } from './store';
export type { RuntimeState, DebugSnapshot } from './store';
export { SceneEventBus } from './events/eventBus';

// Hooks
export { usePointerField } from './hooks/usePointerField';
export { useSyncReducedMotion } from './hooks/useReducedMotion';

// Math + loader
export * from './math/coordinates';
export { loadScene } from './loader';
