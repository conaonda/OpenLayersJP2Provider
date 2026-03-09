import type { DecodeRequest, DecodeResponse } from './decode-worker';

interface PendingTask {
  resolve: (resp: DecodeResponse) => void;
  reject: (err: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{ request: DecodeRequest; resolve: (r: DecodeResponse) => void; reject: (e: Error) => void }> = [];
  private busy = new Set<Worker>();
  private pending = new Map<number, PendingTask>();
  private activeTask = new Map<Worker, number>();
  private nextId = 0;

  constructor(private size: number = Math.min(navigator.hardwareConcurrency || 4, 4)) {}

  init() {
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(new URL('./decode-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<DecodeResponse>) => {
        const resp = e.data;
        const task = this.pending.get(resp.id);
        if (task) {
          this.pending.delete(resp.id);
          task.resolve(resp);
        }
        this.activeTask.delete(worker);
        this.busy.delete(worker);
        this.dispatch();
      };
      worker.onerror = (e) => {
        console.error('Worker error:', e);
        const taskId = this.activeTask.get(worker);
        if (taskId != null) {
          const task = this.pending.get(taskId);
          if (task) {
            this.pending.delete(taskId);
            task.reject(new Error(`Worker error: ${e.message || 'unknown error'}`));
          }
          this.activeTask.delete(worker);
        }
        this.busy.delete(worker);
        this.dispatch();
      };
      this.workers.push(worker);
    }
  }

  decode(codestream: ArrayBuffer, decodeLevel?: number, minValue?: number, maxValue?: number): Promise<DecodeResponse> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const request: DecodeRequest = { id, codestream, decodeLevel, minValue, maxValue };
      this.queue.push({ request, resolve, reject });
      this.dispatch();
    });
  }

  computeStats(codestream: ArrayBuffer, decodeLevel?: number): Promise<DecodeResponse> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const request: DecodeRequest = { id, codestream, decodeLevel, statsOnly: true };
      this.queue.push({ request, resolve, reject });
      this.dispatch();
    });
  }

  private dispatch() {
    while (this.queue.length > 0) {
      const idle = this.workers.find(w => !this.busy.has(w));
      if (!idle) break;
      const task = this.queue.shift()!;
      this.busy.add(idle);
      this.pending.set(task.request.id, { resolve: task.resolve, reject: task.reject });
      this.activeTask.set(idle, task.request.id);
      idle.postMessage(task.request, [task.request.codestream]);
    }
  }

  destroy() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const task of this.queue) {
      task.reject(new Error('WorkerPool destroyed'));
    }
    this.queue = [];
    for (const task of this.pending.values()) {
      task.reject(new Error('WorkerPool destroyed'));
    }
    this.pending.clear();
    this.activeTask.clear();
    this.busy.clear();
  }
}
