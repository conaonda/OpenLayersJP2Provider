let enabled = false;

export function setDebug(value: boolean): void {
  enabled = value;
}

export function debugLog(...args: unknown[]): void {
  if (enabled) console.log('[JP2]', ...args);
}

export function debugWarn(...args: unknown[]): void {
  if (enabled) console.warn('[JP2]', ...args);
}

export function debugError(...args: unknown[]): void {
  if (enabled) console.error('[JP2]', ...args);
}
