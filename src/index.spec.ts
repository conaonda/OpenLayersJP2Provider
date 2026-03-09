import { describe, it, expect, vi } from 'vitest';

vi.mock('@abasb75/openjpeg', () => ({ decode: vi.fn() }));

import * as publicApi from './index';

describe('public API (index.ts)', () => {
  it('setDebug 함수를 export한다', () => {
    expect(typeof publicApi.setDebug).toBe('function');
  });

  it('createJP2TileLayer 함수를 export한다', () => {
    expect(typeof publicApi.createJP2TileLayer).toBe('function');
  });

  it('RangeTileProvider 클래스를 export한다', () => {
    expect(typeof publicApi.RangeTileProvider).toBe('function');
  });

  it('JP2Decoder 클래스를 export한다', () => {
    expect(typeof publicApi.JP2Decoder).toBe('function');
  });

  it('setDebug(true/false) 호출이 오류 없이 동작한다', () => {
    expect(() => publicApi.setDebug(true)).not.toThrow();
    expect(() => publicApi.setDebug(false)).not.toThrow();
  });
});
