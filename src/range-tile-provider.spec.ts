import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@abasb75/openjpeg', () => ({ decode: vi.fn() }));

const mockDestroy = vi.hoisted(() => vi.fn());
const mockInit = vi.hoisted(() => vi.fn());

vi.mock('./worker-pool', () => ({
  WorkerPool: class {
    init = mockInit;
    decode = vi.fn();
    computeStats = vi.fn();
    destroy = mockDestroy;
  },
}));

const { RangeTileProvider } = await import('./range-tile-provider');

describe('RangeTileProvider', () => {
  beforeEach(() => {
    mockDestroy.mockClear();
    mockInit.mockClear();
  });

  describe('destroy()', () => {
    it('내부 WorkerPool.destroy()를 호출한다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2');
      provider.destroy();
      expect(mockDestroy).toHaveBeenCalledOnce();
    });

    it('init() 없이 destroy()를 호출해도 오류가 발생하지 않는다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2');
      expect(() => provider.destroy()).not.toThrow();
    });

    it('destroy()를 여러 번 호출해도 오류가 발생하지 않는다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2');
      provider.destroy();
      expect(() => provider.destroy()).not.toThrow();
      expect(mockDestroy).toHaveBeenCalledTimes(2);
    });
  });

  describe('minValue/maxValue 옵션', () => {
    it('minValue/maxValue 없이 생성하면 정상적으로 초기화된다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2');
      expect(provider).toBeInstanceOf(RangeTileProvider);
    });

    it('minValue/maxValue 커스텀 값으로 생성하면 정상적으로 초기화된다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2', {
        minValue: 0,
        maxValue: 65535,
      });
      expect(provider).toBeInstanceOf(RangeTileProvider);
    });

    it('minValue만 지정해도 오류가 발생하지 않는다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2', {
        minValue: 100,
      });
      expect(provider).toBeInstanceOf(RangeTileProvider);
    });

    it('maxValue만 지정해도 오류가 발생하지 않는다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2', {
        maxValue: 50000,
      });
      expect(provider).toBeInstanceOf(RangeTileProvider);
    });
  });

  describe('cacheTTL 옵션', () => {
    it('cacheTTL 없이 생성하면 정상적으로 초기화된다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2');
      expect(provider).toBeInstanceOf(RangeTileProvider);
    });

    it('cacheTTL 커스텀 값으로 생성하면 정상적으로 초기화된다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2', { cacheTTL: 5000 });
      expect(provider).toBeInstanceOf(RangeTileProvider);
    });

    it('cacheTTL에 0을 지정해도 오류가 발생하지 않는다', () => {
      const provider = new RangeTileProvider('https://example.com/test.jp2', { cacheTTL: 0 });
      expect(provider).toBeInstanceOf(RangeTileProvider);
    });
  });
});
