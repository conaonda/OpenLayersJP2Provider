import { describe, it, expect, vi } from 'vitest';

/**
 * tileLoadFunction 내부의 retry 로직을 검증하기 위한 테스트.
 * source.ts의 retry 패턴을 독립적으로 추출하여 테스트한다.
 */

async function loadTileWithRetry(
  getTile: () => Promise<{ data: Uint8ClampedArray; width: number; height: number }>,
  retryCount: number,
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      return await getTile();
    } catch (err) {
      lastErr = err;
    }
  }
  return null;
}

describe('tile retry logic', () => {
  it('retryCount=0이면 재시도 없이 1회만 시도한다', async () => {
    const getTile = vi.fn().mockRejectedValue(new Error('network error'));
    const result = await loadTileWithRetry(getTile, 0);
    expect(result).toBeNull();
    expect(getTile).toHaveBeenCalledTimes(1);
  });

  it('retryCount=2이면 최대 3회 시도한다', async () => {
    const getTile = vi.fn().mockRejectedValue(new Error('network error'));
    const result = await loadTileWithRetry(getTile, 2);
    expect(result).toBeNull();
    expect(getTile).toHaveBeenCalledTimes(3);
  });

  it('첫 번째 시도 성공 시 즉시 반환한다', async () => {
    const tile = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const getTile = vi.fn().mockResolvedValue(tile);
    const result = await loadTileWithRetry(getTile, 3);
    expect(result).toBe(tile);
    expect(getTile).toHaveBeenCalledTimes(1);
  });

  it('두 번째 시도에서 성공하면 해당 결과를 반환한다', async () => {
    const tile = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const getTile = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(tile);
    const result = await loadTileWithRetry(getTile, 2);
    expect(result).toBe(tile);
    expect(getTile).toHaveBeenCalledTimes(2);
  });

  it('마지막 시도에서 성공하면 해당 결과를 반환한다', async () => {
    const tile = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const getTile = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce(tile);
    const result = await loadTileWithRetry(getTile, 2);
    expect(result).toBe(tile);
    expect(getTile).toHaveBeenCalledTimes(3);
  });
});
