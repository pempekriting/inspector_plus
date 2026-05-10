import React from 'react';
import { describe, it, expect } from 'vitest';
// RecorderPanel uses useMutation via apiFetch — requires QueryClientProvider
// Tested via integration/e2e tests; this verifies module imports cleanly
describe('RecorderPanel', () => {
  it('module can be imported', async () => {
    const mod = await import('../RecorderPanel');
    expect(mod.RecorderPanel).toBeDefined();
  });
});
