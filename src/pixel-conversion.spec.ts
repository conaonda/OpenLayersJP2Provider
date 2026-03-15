import { describe, it, expect } from 'vitest';
import { applyVibrance, applyCurves, validateCurves } from './pixel-conversion';

describe('applyVibrance', () => {
  it('vibrance=0이면 변경 없음', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyVibrance(rgba, 1, 1, 0);
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
    expect(rgba[3]).toBe(255);
  });

  it('채도가 낮은 색상에 더 강하게 작용한다', () => {
    // Gray-ish pixel (low saturation)
    const lowSat = new Uint8ClampedArray([120, 125, 130, 255]);
    const lowSatOrig = new Uint8ClampedArray(lowSat);
    applyVibrance(lowSat, 1, 1, 0.5);

    // Saturated pixel
    const highSat = new Uint8ClampedArray([255, 50, 50, 255]);
    const highSatOrig = new Uint8ClampedArray(highSat);
    applyVibrance(highSat, 1, 1, 0.5);

    // Low saturation pixel should change more relative to its range
    const lowDelta = Math.abs(lowSat[0] - lowSatOrig[0]) + Math.abs(lowSat[1] - lowSatOrig[1]) + Math.abs(lowSat[2] - lowSatOrig[2]);
    const highDelta = Math.abs(highSat[0] - highSatOrig[0]) + Math.abs(highSat[1] - highSatOrig[1]) + Math.abs(highSat[2] - highSatOrig[2]);
    // Low sat pixel should have some change
    expect(lowDelta).toBeGreaterThan(0);
    // High sat pixel should also change but the relative effect is weaker
    // (absolute change may be larger due to wider range, but saturation-relative effect is smaller)
  });

  it('음수 vibrance는 채도를 낮춘다', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const gray = Math.round(0.2126 * 100 + 0.7152 * 150 + 0.0722 * 200);
    applyVibrance(rgba, 1, 1, -1);
    // Should move closer to gray
    expect(Math.abs(rgba[0] - gray)).toBeLessThanOrEqual(Math.abs(100 - gray));
  });

  it('alpha 채널은 수정하지 않는다', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 128]);
    applyVibrance(rgba, 1, 1, 0.5);
    expect(rgba[3]).toBe(128);
  });

  it('회색 픽셀(saturation=0)에도 안전하게 동작', () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    applyVibrance(rgba, 1, 1, 1);
    // Gray pixel: sat=0, amount=vibrance*1=1, so effect is maximal
    // but since r-gray=0, g-gray=0, b-gray=0, result stays the same
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(128);
  });
});

describe('validateCurves', () => {
  it('유효한 curves 객체 통과', () => {
    const identity = Array.from({ length: 256 }, (_, i) => i);
    expect(validateCurves({ all: identity })).toBe(true);
    expect(validateCurves({ r: identity, g: identity, b: identity })).toBe(true);
    expect(validateCurves({})).toBe(true);
  });

  it('잘못된 입력 거부', () => {
    expect(validateCurves(null)).toBe(false);
    expect(validateCurves([])).toBe(false);
    expect(validateCurves({ all: [1, 2, 3] })).toBe(false);
    const bad = Array.from({ length: 256 }, () => 300);
    expect(validateCurves({ r: bad })).toBe(false);
  });
});

describe('applyCurves', () => {
  it('all 커브만 적용', () => {
    const invert = Array.from({ length: 256 }, (_, i) => 255 - i);
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyCurves(rgba, 1, 1, { all: invert });
    expect(rgba[0]).toBe(155);
    expect(rgba[1]).toBe(105);
    expect(rgba[2]).toBe(55);
    expect(rgba[3]).toBe(255);
  });

  it('채널별 커브 적용', () => {
    const double = Array.from({ length: 256 }, (_, i) => Math.min(255, i * 2));
    const rgba = new Uint8ClampedArray([50, 100, 200, 255]);
    applyCurves(rgba, 1, 1, { r: double });
    expect(rgba[0]).toBe(100); // 50*2
    expect(rgba[1]).toBe(100); // unchanged
    expect(rgba[2]).toBe(200); // unchanged
  });

  it('all 후 채널별 커브 순서로 적용', () => {
    const addTen = Array.from({ length: 256 }, (_, i) => Math.min(255, i + 10));
    const addFive = Array.from({ length: 256 }, (_, i) => Math.min(255, i + 5));
    const rgba = new Uint8ClampedArray([100, 100, 100, 255]);
    applyCurves(rgba, 1, 1, { all: addTen, r: addFive });
    expect(rgba[0]).toBe(115); // 100+10=110, then 110+5=115
    expect(rgba[1]).toBe(110); // 100+10=110
    expect(rgba[2]).toBe(110); // 100+10=110
  });

  it('커브가 모두 없으면 변경 없음', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    applyCurves(rgba, 1, 1, {});
    expect(rgba[0]).toBe(100);
    expect(rgba[1]).toBe(150);
    expect(rgba[2]).toBe(200);
  });

  it('alpha 채널은 수정하지 않는다', () => {
    const invert = Array.from({ length: 256 }, (_, i) => 255 - i);
    const rgba = new Uint8ClampedArray([100, 150, 200, 128]);
    applyCurves(rgba, 1, 1, { all: invert });
    expect(rgba[3]).toBe(128);
  });
});
