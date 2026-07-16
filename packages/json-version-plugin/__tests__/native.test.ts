import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadNative,
  __setNativeForTests,
  type NativeModule,
} from '../src/native.js';

describe('native loader', () => {
  beforeEach(() => {
    // Clear any test stub the prior test installed.
    __setNativeForTests(undefined as unknown as NativeModule);
  });

  it('returns the module set by __setNativeForTests', async () => {
    const stub: NativeModule = {
      computeVersion: () => 'deadbeef',
    };
    __setNativeForTests(stub);
    const mod = await loadNative();
    expect(mod.computeVersion({ root: '.', include: [], length: 8 })).toBe('deadbeef');
  });
});