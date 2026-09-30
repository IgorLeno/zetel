import { afterEach } from 'vitest';

// Tests that only do synchronous work (e.g. the agentctl suites built on
// spawnSync) chain through microtasks, so the worker never reaches the event
// loop until the whole file ends. Vitest's worker RPC (birpc) times out after
// 60s, and replies to onTaskUpdate queued during that stretch are only read
// after the expired timer fires, producing "Timeout calling onTaskUpdate" on
// slow machines. Yielding one macrotask per test lets those replies be read.
// Captured at setup time so a test that fakes timers cannot stall the hook.
const realSetImmediate = globalThis.setImmediate;

afterEach(() => new Promise<void>((resolve) => realSetImmediate(() => resolve())));
