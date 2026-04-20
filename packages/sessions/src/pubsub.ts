import type { StoreEvent, StoreEventListener, StoreEventPayload } from './types';

export class PubSub {
  private listeners = new Map<StoreEvent, Set<StoreEventListener>>();

  subscribe(event: StoreEvent, listener: StoreEventListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }

  emit(event: StoreEvent, payload: StoreEventPayload): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) listener(payload);
  }
}
