import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * fetchRange에 extraHeaders가 올바르게 병합되는지 검증한다.
 * jp2-parser.ts의 fetchRange는 모듈 내부 함수이므로,
 * 글로벌 fetch를 모킹하여 실제 호출된 헤더를 검사한다.
 */

// Dynamic import after fetch mock setup
async function getFetchRange() {
  // Re-import to pick up the mocked fetch
  const mod = await import('./jp2-parser');
  return { parseJP2: mod.parseJP2, fetchTileData: mod.fetchTileData };
}

describe('requestHeaders (extraHeaders)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchTileData should include extraHeaders in the fetch call', async () => {
    const mockArrayBuffer = new ArrayBuffer(8);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    } as Response);

    const { fetchTileData } = await getFetchRange();

    const tile = { tileId: 0, offset: 100, length: 50 };
    const headers = { Authorization: 'Bearer token123', 'X-Api-Key': 'mykey' };

    await fetchTileData('http://example.com/test.jp2', tile, headers);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const calledHeaders = calledInit.headers as Record<string, string>;

    expect(calledHeaders['Authorization']).toBe('Bearer token123');
    expect(calledHeaders['X-Api-Key']).toBe('mykey');
    expect(calledHeaders['Range']).toBe('bytes=100-149');
  });

  it('Range header should not be overridden by extraHeaders', async () => {
    const mockArrayBuffer = new ArrayBuffer(8);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    } as Response);

    const { fetchTileData } = await getFetchRange();

    const tile = { tileId: 0, offset: 0, length: 10 };
    // Attempt to override Range header
    await fetchTileData('http://example.com/test.jp2', tile, { Range: 'bytes=9999-9999' });

    const calledHeaders = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    // Range should be the computed value, not the user-provided one
    expect(calledHeaders['Range']).toBe('bytes=0-9');
  });

  it('fetchTileData should work without extraHeaders', async () => {
    const mockArrayBuffer = new ArrayBuffer(8);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    } as Response);

    const { fetchTileData } = await getFetchRange();

    const tile = { tileId: 0, offset: 50, length: 20 };
    await fetchTileData('http://example.com/test.jp2', tile);

    const calledHeaders = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(calledHeaders['Range']).toBe('bytes=50-69');
    expect(Object.keys(calledHeaders)).toEqual(['Range']);
  });
});
