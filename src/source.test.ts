import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JP2LayerOptions } from './source';

/**
 * JP2LayerOptions 타입 테스트 및 tileLoadTimeout 로직을 직접 테스트한다.
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

describe('onTileLoadStart callback', () => {
  it('should be defined in JP2LayerOptions type', () => {
    const opts: JP2LayerOptions = {
      onTileLoadStart: ({ col, row, decodeLevel }) => {
        // type-check: all fields should be numbers
        const _c: number = col;
        const _r: number = row;
        const _d: number = decodeLevel;
        void (_c + _r + _d);
      },
    };
    expect(opts.onTileLoadStart).toBeDefined();
  });

  it('should invoke callback with correct info', () => {
    const calls: Array<{ col: number; row: number; decodeLevel: number }> = [];
    const onTileLoadStart: JP2LayerOptions['onTileLoadStart'] = (info) => {
      calls.push(info);
    };

    // Simulate the call pattern from source.ts
    onTileLoadStart!({ col: 2, row: 3, decodeLevel: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ col: 2, row: 3, decodeLevel: 1 });
  });
});

