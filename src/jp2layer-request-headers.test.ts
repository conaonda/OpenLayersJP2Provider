import { describe, it, expect, vi } from 'vitest';

/**
 * createJP2TileLayer에 URL string + requestHeaders를 전달하면
 * 내부에서 RangeTileProvider가 올바르게 생성되는지 검증한다.
 */

const constructorSpy = vi.fn();
const mockInit = vi.fn();
const mockDestroy = vi.fn();

vi.mock('./range-tile-provider', () => ({
  RangeTileProvider: class MockRangeTileProvider {
    constructor(...args: unknown[]) {
      constructorSpy(...args);
    }
    init = mockInit;
    destroy = mockDestroy;
  },
}));

describe('createJP2TileLayer with URL string and requestHeaders', () => {
  it('should create RangeTileProvider with requestHeaders when URL string is provided', async () => {
    constructorSpy.mockClear();
    mockInit.mockRejectedValueOnce(new Error('stop here'));

    const { createJP2TileLayer } = await import('./source');
    const headers = { Authorization: 'Bearer test-token' };

    await expect(
      createJP2TileLayer('http://example.com/test.jp2', { requestHeaders: headers }),
    ).rejects.toThrow('stop here');

    expect(constructorSpy).toHaveBeenCalledWith('http://example.com/test.jp2', {
      minValue: undefined,
      maxValue: undefined,
      requestHeaders: headers,
    });
  });

  it('should not create RangeTileProvider when TileProvider object is passed', async () => {
    constructorSpy.mockClear();

    const { createJP2TileLayer } = await import('./source');
    const mockProvider = {
      init: vi.fn().mockRejectedValue(new Error('stop')),
      getTile: vi.fn(),
      destroy: vi.fn(),
    } as any;

    await expect(
      createJP2TileLayer(mockProvider, { requestHeaders: { 'X-Key': 'val' } }),
    ).rejects.toThrow('stop');

    expect(constructorSpy).not.toHaveBeenCalled();
  });
});
