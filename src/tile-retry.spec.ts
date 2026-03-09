import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

/** source.ts의 backoff + onTileError/onTileLoad 로직을 독립적으로 추출한 헬퍼 */
async function loadTileWithBackoff(
  getTile: () => Promise<{ data: Uint8ClampedArray; width: number; height: number }>,
  retryCount: number,
  retryDelay: number,
  retryMaxDelay: number,
  onTileError?: (info: { col: number; row: number; error: unknown }) => void,
  onTileLoad?: (info: { col: number; row: number; decodeLevel: number }) => void,
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  let lastErr: unknown;
  let decoded: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      decoded = await getTile();
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < retryCount) {
        const delay = Math.min(retryDelay * Math.pow(2, attempt), retryMaxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  if (!decoded) {
    if (onTileError) {
      onTileError({ col: 0, row: 0, error: lastErr });
    }
    return null;
  }
  if (onTileLoad) {
    onTileLoad({ col: 0, row: 0, decodeLevel: 0 });
  }
  return decoded;
}

/** backoff delay 계산 공식 단위 테스트 */
function calcBackoffDelay(retryDelay: number, attempt: number, retryMaxDelay: number): number {
  return Math.min(retryDelay * Math.pow(2, attempt), retryMaxDelay);
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

describe('exponential backoff delay 계산', () => {
  it('attempt=0일 때 delay는 retryDelay * 1', () => {
    expect(calcBackoffDelay(500, 0, 5000)).toBe(500);
  });

  it('attempt=1일 때 delay는 retryDelay * 2', () => {
    expect(calcBackoffDelay(500, 1, 5000)).toBe(1000);
  });

  it('attempt=2일 때 delay는 retryDelay * 4', () => {
    expect(calcBackoffDelay(500, 2, 5000)).toBe(2000);
  });

  it('delay가 retryMaxDelay를 초과하지 않는다', () => {
    expect(calcBackoffDelay(500, 10, 5000)).toBe(5000);
  });

  it('retryDelay=1000, retryMaxDelay=3000일 때 상한이 올바르게 적용된다', () => {
    expect(calcBackoffDelay(1000, 0, 3000)).toBe(1000);
    expect(calcBackoffDelay(1000, 1, 3000)).toBe(2000);
    expect(calcBackoffDelay(1000, 2, 3000)).toBe(3000); // 4000이지만 상한 3000
  });
});

describe('onTileError 콜백', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('모든 재시도 실패 후 onTileError가 호출된다', async () => {
    const error = new Error('network error');
    const getTile = vi.fn().mockRejectedValue(error);
    const onTileError = vi.fn();

    const promise = loadTileWithBackoff(getTile, 2, 100, 5000, onTileError);
    await vi.runAllTimersAsync();
    await promise;

    expect(onTileError).toHaveBeenCalledTimes(1);
    expect(onTileError).toHaveBeenCalledWith(
      expect.objectContaining({ col: 0, row: 0, error }),
    );
  });

  it('성공 시 onTileError가 호출되지 않는다', async () => {
    const tile = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const getTile = vi.fn().mockResolvedValue(tile);
    const onTileError = vi.fn();

    const promise = loadTileWithBackoff(getTile, 2, 100, 5000, onTileError);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(tile);
    expect(onTileError).not.toHaveBeenCalled();
  });

  it('중간에 성공하면 onTileError가 호출되지 않는다', async () => {
    const tile = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const getTile = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(tile);
    const onTileError = vi.fn();

    const promise = loadTileWithBackoff(getTile, 2, 100, 5000, onTileError);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(tile);
    expect(onTileError).not.toHaveBeenCalled();
  });

  it('onTileError가 없으면 오류 없이 null을 반환한다', async () => {
    const getTile = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = loadTileWithBackoff(getTile, 1, 100, 5000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it('재시도 사이에 backoff delay가 적용된다', async () => {
    const getTile = vi.fn().mockRejectedValue(new Error('fail'));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = loadTileWithBackoff(getTile, 2, 500, 5000);
    await vi.runAllTimersAsync();
    await promise;

    // attempt=0 → delay=500ms, attempt=1 → delay=1000ms
    const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
    expect(delays).toContain(500);
    expect(delays).toContain(1000);
  });
});

describe('onTileLoad 콜백', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('디코딩 성공 시 onTileLoad가 정확히 한 번 호출된다', async () => {
    const tile = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const getTile = vi.fn().mockResolvedValue(tile);
    const onTileLoad = vi.fn();

    const promise = loadTileWithBackoff(getTile, 2, 100, 5000, undefined, onTileLoad);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(tile);
    expect(onTileLoad).toHaveBeenCalledTimes(1);
    expect(onTileLoad).toHaveBeenCalledWith(
      expect.objectContaining({ col: 0, row: 0, decodeLevel: 0 }),
    );
  });

  it('모든 재시도 실패 시 onTileLoad가 호출되지 않는다', async () => {
    const getTile = vi.fn().mockRejectedValue(new Error('fail'));
    const onTileLoad = vi.fn();

    const promise = loadTileWithBackoff(getTile, 2, 100, 5000, undefined, onTileLoad);
    await vi.runAllTimersAsync();
    await promise;

    expect(onTileLoad).not.toHaveBeenCalled();
  });

  it('재시도 후 성공하면 onTileLoad가 호출된다', async () => {
    const tile = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const getTile = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(tile);
    const onTileLoad = vi.fn();

    const promise = loadTileWithBackoff(getTile, 2, 100, 5000, undefined, onTileLoad);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(tile);
    expect(onTileLoad).toHaveBeenCalledTimes(1);
  });

  it('onTileLoad가 없으면 오류 없이 정상 반환한다', async () => {
    const tile = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const getTile = vi.fn().mockResolvedValue(tile);

    const promise = loadTileWithBackoff(getTile, 0, 100, 5000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(tile);
  });
});
