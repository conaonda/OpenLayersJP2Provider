let enabled = false;

/**
 * 디버그 로깅 활성화 여부를 설정한다.
 * 기본값은 `false`로, 프로덕션 환경에서 콘솔 출력을 억제한다.
 *
 * @param value - `true`이면 `[JP2]` 프리픽스로 콘솔 출력 활성화
 */
export function setDebug(value: boolean): void {
  enabled = value;
}

/**
 * 디버그 모드가 활성화된 경우 `[JP2]` 프리픽스와 함께 `console.log`를 호출한다.
 */
export function debugLog(...args: unknown[]): void {
  if (enabled) console.log('[JP2]', ...args);
}

/**
 * 디버그 모드가 활성화된 경우 `[JP2]` 프리픽스와 함께 `console.warn`을 호출한다.
 */
export function debugWarn(...args: unknown[]): void {
  if (enabled) console.warn('[JP2]', ...args);
}

export function debugError(...args: unknown[]): void {
  if (enabled) console.error('[JP2]', ...args);
}
