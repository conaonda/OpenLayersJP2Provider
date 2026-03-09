import { describe, it, expect, vi } from 'vitest';

/**
 * source.ts의 onProgress 진행률 카운팅 로직과 initialOpacity 클램프 로직을
 * 독립적으로 추출하여 테스트한다.
 */

// --- onProgress 헬퍼 ---

interface ProgressState {
  total: number;
  loaded: number;
  failed: number;
}

function createProgressTracker(
  onProgress?: (info: { loaded: number; total: number; failed: number }) => void,
) {
  const state: ProgressState = { total: 0, loaded: 0, failed: 0 };

  const emit = () => {
    if (onProgress) {
      onProgress({ loaded: state.loaded, total: state.total, failed: state.failed });
    }
  };

  const onTileQueued = () => {
    state.total++;
    emit();
  };

  const onTileSuccess = () => {
    state.loaded++;
    emit();
  };

  const onTileFailure = () => {
    state.failed++;
    emit();
  };

  return { state, onTileQueued, onTileSuccess, onTileFailure };
}

// --- initialOpacity 클램프 헬퍼 ---
function clampOpacity(value: number | undefined): number {
  return Math.max(0, Math.min(1, value ?? 1.0));
}

// ============================================================
describe('onProgress 진행률 카운팅 로직', () => {
  it('타일이 큐에 추가되면 total이 증가하고 onProgress가 호출된다', () => {
    const onProgress = vi.fn();
    const { onTileQueued } = createProgressTracker(onProgress);

    onTileQueued();

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ loaded: 0, total: 1, failed: 0 });
  });

  it('타일 로드 성공 시 loaded가 증가하고 onProgress가 호출된다', () => {
    const onProgress = vi.fn();
    const { onTileQueued, onTileSuccess } = createProgressTracker(onProgress);

    onTileQueued();
    onTileSuccess();

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 1, total: 1, failed: 0 });
  });

  it('타일 로드 실패 시 failed가 증가하고 onProgress가 호출된다', () => {
    const onProgress = vi.fn();
    const { onTileQueued, onTileFailure } = createProgressTracker(onProgress);

    onTileQueued();
    onTileFailure();

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 0, total: 1, failed: 1 });
  });

  it('여러 타일에서 loaded + failed = total이 된다', () => {
    const onProgress = vi.fn();
    const { onTileQueued, onTileSuccess, onTileFailure } = createProgressTracker(onProgress);

    onTileQueued(); // total=1
    onTileQueued(); // total=2
    onTileQueued(); // total=3
    onTileSuccess(); // loaded=1
    onTileSuccess(); // loaded=2
    onTileFailure(); // failed=1

    const last = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(last.total).toBe(3);
    expect(last.loaded + last.failed).toBe(3);
  });

  it('onProgress가 없으면 호출 없이 정상 동작한다', () => {
    const { state, onTileQueued, onTileSuccess } = createProgressTracker(undefined);

    expect(() => {
      onTileQueued();
      onTileSuccess();
    }).not.toThrow();

    expect(state.total).toBe(1);
    expect(state.loaded).toBe(1);
  });

  it('큐 추가 직후 total이 증가한 상태로 onProgress가 먼저 호출된다', () => {
    const calls: Array<{ loaded: number; total: number; failed: number }> = [];
    const onProgress = vi.fn((info) => calls.push({ ...info }));
    const { onTileQueued } = createProgressTracker(onProgress);

    onTileQueued();

    // sem.acquire() 이전에 total++이 되어야 한다 (Reviewer 지적: 의도된 설계)
    expect(calls[0].total).toBe(1);
    expect(calls[0].loaded).toBe(0);
  });
});

// ============================================================
describe('initialOpacity 클램프 로직', () => {
  it('undefined이면 기본값 1.0을 반환한다', () => {
    expect(clampOpacity(undefined)).toBe(1.0);
  });

  it('0.5이면 그대로 반환한다', () => {
    expect(clampOpacity(0.5)).toBe(0.5);
  });

  it('0.0이면 그대로 반환한다', () => {
    expect(clampOpacity(0.0)).toBe(0.0);
  });

  it('1.0이면 그대로 반환한다', () => {
    expect(clampOpacity(1.0)).toBe(1.0);
  });

  it('음수(-0.5)이면 0으로 클램프된다', () => {
    expect(clampOpacity(-0.5)).toBe(0);
  });

  it('1보다 큰 값(1.5)이면 1로 클램프된다', () => {
    expect(clampOpacity(1.5)).toBe(1);
  });

  it('극단값 -Infinity는 0으로 클램프된다', () => {
    expect(clampOpacity(-Infinity)).toBe(0);
  });

  it('극단값 Infinity는 1로 클램프된다', () => {
    expect(clampOpacity(Infinity)).toBe(1);
  });
});
