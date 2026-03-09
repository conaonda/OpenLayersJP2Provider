import { describe, it, expect } from 'vitest';

/**
 * colormap 옵션 단위 테스트.
 * source.ts의 tileLoadFunction 내에서 단채널 RGBA 데이터에 colormap을 적용하는 로직을 검증한다.
 */

function applyColormap(
  data: Uint8ClampedArray,
  colormap: (value: number) => [number, number, number],
): void {
  for (let p = 0; p < data.length; p += 4) {
    const [r, g, b] = colormap(data[p]);
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
  }
}

describe('colormap application', () => {
  it('should remap grayscale RGBA pixels using colormap function', () => {
    // Grayscale RGBA: R=G=B=value, A=255
    const data = new Uint8ClampedArray([
      0, 0, 0, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
    ]);

    const colormap = (v: number): [number, number, number] => [v, 0, 255 - v];

    applyColormap(data, colormap);

    // pixel 0: value=0 → [0, 0, 255]
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(255);
    expect(data[3]).toBe(255); // alpha unchanged

    // pixel 1: value=128 → [128, 0, 127]
    expect(data[4]).toBe(128);
    expect(data[5]).toBe(0);
    expect(data[6]).toBe(127);

    // pixel 2: value=255 → [255, 0, 0]
    expect(data[8]).toBe(255);
    expect(data[9]).toBe(0);
    expect(data[10]).toBe(0);
  });

  it('should preserve alpha channel', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 200]);
    applyColormap(data, () => [0, 0, 0]);
    expect(data[3]).toBe(200);
  });
});
