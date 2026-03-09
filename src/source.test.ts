import { describe, it, expect, vi } from 'vitest';

/**
 * tileLoadTimeout 로직을 직접 테스트한다.
 * createJP2TileLayer는 OpenLayers DOM 의존이 있으므로,
 * 타임아웃 핵심 로직(Promise.race)을 단위 테스트한다.
 */

function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (timeoutMs == null) return promise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tile load timeout')), timeoutMs),
    ),
  ]);
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
});
