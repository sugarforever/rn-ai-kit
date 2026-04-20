import { PubSub } from '../src/pubsub';
import type { StoreEventPayload } from '../src/types';

describe('PubSub', () => {
  it('delivers events to subscribed listeners', () => {
    const pubsub = new PubSub();
    const received: StoreEventPayload[] = [];
    pubsub.subscribe('sessions-changed', (payload) => received.push(payload));
    pubsub.emit('sessions-changed', {});
    expect(received).toEqual([{}]);
  });

  it('filters by event name', () => {
    const pubsub = new PubSub();
    const received: StoreEventPayload[] = [];
    pubsub.subscribe('messages-changed', (p) => received.push(p));
    pubsub.emit('sessions-changed', {});
    expect(received).toEqual([]);
  });

  it('returns an unsubscribe function', () => {
    const pubsub = new PubSub();
    let count = 0;
    const unsub = pubsub.subscribe('sessions-changed', () => { count++; });
    pubsub.emit('sessions-changed', {});
    unsub();
    pubsub.emit('sessions-changed', {});
    expect(count).toBe(1);
  });

  it('passes the payload to listeners', () => {
    const pubsub = new PubSub();
    const received: StoreEventPayload[] = [];
    pubsub.subscribe('messages-changed', (p) => received.push(p));
    pubsub.emit('messages-changed', { sessionId: 'abc' });
    expect(received).toEqual([{ sessionId: 'abc' }]);
  });

  it('supports multiple listeners on the same event', () => {
    const pubsub = new PubSub();
    let a = 0;
    let b = 0;
    pubsub.subscribe('sessions-changed', () => { a++; });
    pubsub.subscribe('sessions-changed', () => { b++; });
    pubsub.emit('sessions-changed', {});
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});
