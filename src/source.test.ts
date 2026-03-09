import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * tileLoadTimeout 로직을 직접 테스트한다.
 * createJP2TileLayer는 OpenLayers DOM 의존이 있으므로,
 * 타임아웃 핵심 로직(clearTimeout 패턴)을 단위 테스트한다.
 */

function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (timeoutMs == null) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Tile load timeout')),
      timeoutMs,
    );
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

describe('tileLoadTimeout', () => {
  it('should resolve normally when no timeout is set', async () => {
    const result = await withTimeout(
      new Promise<string>(resolve => setTimeout(() => resolve('ok'), 50)),
    );
    expect(result).toBe('ok');
  });

  it('should resolve when response is within timeout', async () => {
    const result = await withTimeout(
      new Promise<string>(resolve => setTimeout(() => resolve('ok'), 10)),
      200,
    );
    expect(result).toBe('ok');
  });

  it('should reject with "Tile load timeout" when timeout expires', async () => {
    await expect(
      withTimeout(
        new Promise<string>(resolve => setTimeout(() => resolve('ok'), 500)),
        50,
      ),
    ).rejects.toThrow('Tile load timeout');
  });

  it('should propagate original error when it occurs before timeout', async () => {
    await expect(
      withTimeout(
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('network error')), 10),
        ),
        500,
      ),
    ).rejects.toThrow('network error');
  });

  describe('timer cleanup (no leak)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear the timeout timer when promise resolves before timeout', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const fastPromise = Promise.resolve('fast');
      await withTimeout(fastPromise, 5000);

      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(0);
      clearTimeoutSpy.mockRestore();
    });

    it('should clear the timeout timer when promise rejects before timeout', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const failingPromise = Promise.reject(new Error('fail'));
      await expect(withTimeout(failingPromise, 5000)).rejects.toThrow('fail');

      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(0);
      clearTimeoutSpy.mockRestore();
    });

    it('should fire timeout when timer expires', async () => {
      let resolved = false;
      const slowPromise = new Promise<string>(resolve => {
        setTimeout(() => { resolved = true; resolve('slow'); }, 10000);
      });

      const timeoutPromise = withTimeout(slowPromise, 1000);
      vi.advanceTimersByTime(1001);

      await expect(timeoutPromise).rejects.toThrow('Tile load timeout');
      expect(resolved).toBe(false);
    });
  });
});
