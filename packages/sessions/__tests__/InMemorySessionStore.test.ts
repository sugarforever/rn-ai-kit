import { InMemorySessionStore } from '../src/InMemorySessionStore';
import { runContractTests } from './contractTests';

runContractTests('InMemorySessionStore', async () => {
  const store = new InMemorySessionStore();
  await store.init();
  return store;
});
