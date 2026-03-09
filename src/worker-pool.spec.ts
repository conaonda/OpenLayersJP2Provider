import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Worker before importing WorkerPool
class MockWorker {
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

vi.stubGlobal('Worker', function (this: MockWorker) {
  const w = new MockWorker();
  mockWorkers.push(w);
  return w;
} as any);

let mockWorkers: MockWorker[] = [];

// Dynamic import to pick up mocked Worker
const { WorkerPool } = await import('./worker-pool');

describe('WorkerPool', () => {
  beforeEach(() => {
    mockWorkers = [];
  });

  it('rejects pending task on worker error', async () => {
    const pool = new WorkerPool(1);
    pool.init();

    const worker = mockWorkers[0];
    const buf = new ArrayBuffer(8);
    const promise = pool.decode(buf);

    // Simulate worker error
    worker.onerror!({ message: 'crash' } as any);

    await expect(promise).rejects.toThrow('Worker error');
  });

  it('rejects all tasks on destroy', async () => {
    const pool = new WorkerPool(1);
    pool.init();

    const buf1 = new ArrayBuffer(8);
    const buf2 = new ArrayBuffer(8);
    const p1 = pool.decode(buf1);
    const p2 = pool.decode(buf2); // queued (only 1 worker)

    pool.destroy();

    await expect(p1).rejects.toThrow('WorkerPool destroyed');
    await expect(p2).rejects.toThrow('WorkerPool destroyed');
  });

  it('destroy 시 모든 Worker의 terminate가 호출된다', () => {
    const pool = new WorkerPool(3);
    pool.init();

    expect(mockWorkers).toHaveLength(3);

    pool.destroy();

    for (const w of mockWorkers) {
      expect(w.terminate).toHaveBeenCalledOnce();
    }
  });
});
