import type { SceneEvent, SceneEventType } from '@interactive-photo/scene-schema';

type Handler<T extends SceneEventType> = (
  event: Extract<SceneEvent, { type: T }>,
) => void;

/**
 * A tiny typed pub/sub bus for scene events. Effects and controllers subscribe
 * here instead of reading global state every frame, which keeps React out of the
 * hot path. Handlers are stored per event type.
 */
export class SceneEventBus {
  private handlers = new Map<SceneEventType, Set<(e: SceneEvent) => void>>();

  on<T extends SceneEventType>(type: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as (e: SceneEvent) => void);
    return () => this.off(type, handler);
  }

  off<T extends SceneEventType>(type: T, handler: Handler<T>): void {
    this.handlers.get(type)?.delete(handler as (e: SceneEvent) => void);
  }

  emit(event: SceneEvent): void {
    const set = this.handlers.get(event.type);
    if (!set) return;
    for (const handler of set) handler(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}
