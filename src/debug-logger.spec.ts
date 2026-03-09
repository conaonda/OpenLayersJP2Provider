import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setDebug, debugLog, debugWarn } from './debug-logger';

describe('debug-logger', () => {
  beforeEach(() => {
    setDebug(false);
    vi.restoreAllMocks();
  });

  it('기본 상태에서 debugLog는 콘솔 출력 없음', () => {
    const spy = vi.spyOn(console, 'log');
    debugLog('test message');
    expect(spy).not.toHaveBeenCalled();
  });

  it('기본 상태에서 debugWarn은 콘솔 출력 없음', () => {
    const spy = vi.spyOn(console, 'warn');
    debugWarn('test warning');
    expect(spy).not.toHaveBeenCalled();
  });

  it('setDebug(true) 후 debugLog는 [JP2] 프리픽스로 출력', () => {
    const spy = vi.spyOn(console, 'log');
    setDebug(true);
    debugLog('hello', 'world');
    expect(spy).toHaveBeenCalledWith('[JP2]', 'hello', 'world');
  });

  it('setDebug(true) 후 debugWarn은 [JP2] 프리픽스로 출력', () => {
    const spy = vi.spyOn(console, 'warn');
    setDebug(true);
    debugWarn('something wrong');
    expect(spy).toHaveBeenCalledWith('[JP2]', 'something wrong');
  });

  it('setDebug(true) 후 setDebug(false)로 다시 억제', () => {
    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');
    setDebug(true);
    setDebug(false);
    debugLog('no output');
    debugWarn('no output');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
