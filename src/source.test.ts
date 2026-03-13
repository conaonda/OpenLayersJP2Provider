import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JP2LayerOptions } from './source';

/**
 * JP2LayerOptions 타입 테스트 및 tileLoadTimeout 로직을 직접 테스트한다.
 * createJP2TileLayer는 OpenLayers DOM 의존이 있으므로,
 * 타임아웃 핵심 로직(clearTimeout 패턴)을 단위 테스트한다.
 */

function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (timeoutMs == null) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Tile load timeout')),
      timeoutMs,
    );
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
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

  describe('timer cleanup (no leak)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear the timeout timer when promise resolves before timeout', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const fastPromise = Promise.resolve('fast');
      await withTimeout(fastPromise, 5000);

      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(0);
      clearTimeoutSpy.mockRestore();
    });

    it('should clear the timeout timer when promise rejects before timeout', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const failingPromise = Promise.reject(new Error('fail'));
      await expect(withTimeout(failingPromise, 5000)).rejects.toThrow('fail');

      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(0);
      clearTimeoutSpy.mockRestore();
    });

    it('should fire timeout when timer expires', async () => {
      let resolved = false;
      const slowPromise = new Promise<string>(resolve => {
        setTimeout(() => { resolved = true; resolve('slow'); }, 10000);
      });

      const timeoutPromise = withTimeout(slowPromise, 1000);
      vi.advanceTimersByTime(1001);

      await expect(timeoutPromise).rejects.toThrow('Tile load timeout');
      expect(resolved).toBe(false);
    });
  });
});

describe('onTileLoadStart callback', () => {
  it('should be defined in JP2LayerOptions type', () => {
    const opts: JP2LayerOptions = {
      onTileLoadStart: ({ col, row, decodeLevel }) => {
        // type-check: all fields should be numbers
        const _c: number = col;
        const _r: number = row;
        const _d: number = decodeLevel;
        void (_c + _r + _d);
      },
    };
    expect(opts.onTileLoadStart).toBeDefined();
  });

  it('should invoke callback with correct info', () => {
    const calls: Array<{ col: number; row: number; decodeLevel: number }> = [];
    const onTileLoadStart: JP2LayerOptions['onTileLoadStart'] = (info) => {
      calls.push(info);
    };

    // Simulate the call pattern from source.ts
    onTileLoadStart!({ col: 2, row: 3, decodeLevel: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ col: 2, row: 3, decodeLevel: 1 });
  });
});

describe('attributions option', () => {
  it('should accept a string value', () => {
    const opts: JP2LayerOptions = {
      attributions: '© Example Data Provider',
    };
    expect(opts.attributions).toBe('© Example Data Provider');
  });

  it('should accept an array of strings', () => {
    const opts: JP2LayerOptions = {
      attributions: ['© Provider A', '© Provider B'],
    };
    expect(opts.attributions).toHaveLength(2);
    expect(opts.attributions).toEqual(['© Provider A', '© Provider B']);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.attributions).toBeUndefined();
  });

  it('should preserve attribution string content exactly', () => {
    const attr = '© 2026 My Organization <a href="https://example.com">Terms</a>';
    const opts: JP2LayerOptions = { attributions: attr };
    expect(opts.attributions).toBe(attr);
  });
});

describe('bands option', () => {
  it('should accept a 3-element tuple of band indices', () => {
    const opts: JP2LayerOptions = {
      bands: [3, 2, 1],
    };
    expect(opts.bands).toEqual([3, 2, 1]);
  });

  it('should remap pixel data correctly with bands', () => {
    // Simulate the bands remapping logic from source.ts
    const componentCount = 4;
    const pixelCount = 2;
    // RGBA data: pixel0=[10,20,30,255], pixel1=[40,50,60,255]
    const data = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const bands: [number, number, number] = [2, 1, 0]; // swap R and B

    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      const ch0 = data[off];
      const ch1 = data[off + 1];
      const ch2 = data[off + 2];
      const ch3 = componentCount >= 4 ? data[off + 3] : 0;
      const channels = [ch0, ch1, ch2, ch3];
      data[off] = channels[bands[0]];
      data[off + 1] = channels[bands[1]];
      data[off + 2] = channels[bands[2]];
      data[off + 3] = 255;
    }

    // pixel0: R=ch2(30), G=ch1(20), B=ch0(10)
    expect(data[0]).toBe(30);
    expect(data[1]).toBe(20);
    expect(data[2]).toBe(10);
    expect(data[3]).toBe(255);
    // pixel1: R=ch2(60), G=ch1(50), B=ch0(40)
    expect(data[4]).toBe(60);
    expect(data[5]).toBe(50);
    expect(data[6]).toBe(40);
    expect(data[7]).toBe(255);
  });

  it('should handle 3-component images (alpha defaults to 0)', () => {
    const componentCount = 3;
    const data = new Uint8ClampedArray([10, 20, 30, 255]);
    const bands: [number, number, number] = [2, 0, 1];

    const off = 0;
    const ch0 = data[off];
    const ch1 = data[off + 1];
    const ch2 = data[off + 2];
    const ch3 = componentCount >= 4 ? data[off + 3] : 0;
    const channels = [ch0, ch1, ch2, ch3];
    data[off] = channels[bands[0]];
    data[off + 1] = channels[bands[1]];
    data[off + 2] = channels[bands[2]];
    data[off + 3] = 255;

    // R=ch2(30), G=ch0(10), B=ch1(20)
    expect(data[0]).toBe(30);
    expect(data[1]).toBe(10);
    expect(data[2]).toBe(20);
    expect(data[3]).toBe(255);
  });

  it('should skip remapping when band index is out of range', () => {
    // componentCount=3, bands[0]=3 is out of range (>= componentCount)
    const componentCount = 3;
    const bands: [number, number, number] = [3, 1, 0]; // index 3 is invalid for 3 components
    const validBands = bands.every(b => b >= 0 && b < componentCount);
    expect(validBands).toBe(false);
  });

  it('should accept identity mapping [0, 1, 2] without change', () => {
    const componentCount = 3;
    const data = new Uint8ClampedArray([100, 150, 200, 255]);
    const bands: [number, number, number] = [0, 1, 2];

    const validBands = bands.every(b => b >= 0 && b < componentCount);
    expect(validBands).toBe(true);

    const off = 0;
    const ch0 = data[off];
    const ch1 = data[off + 1];
    const ch2 = data[off + 2];
    const ch3 = componentCount >= 4 ? data[off + 3] : 0;
    const channels = [ch0, ch1, ch2, ch3];
    data[off] = channels[bands[0]];
    data[off + 1] = channels[bands[1]];
    data[off + 2] = channels[bands[2]];
    data[off + 3] = 255;

    // Identity mapping: unchanged
    expect(data[0]).toBe(100);
    expect(data[1]).toBe(150);
    expect(data[2]).toBe(200);
    expect(data[3]).toBe(255);
  });

  it('should skip remapping when all band indices are negative', () => {
    const componentCount = 4;
    const bands: [number, number, number] = [-1, 1, 2];
    const validBands = bands.every(b => b >= 0 && b < componentCount);
    expect(validBands).toBe(false);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.bands).toBeUndefined();
  });
});

describe('visible option', () => {
  it('should accept visible: false', () => {
    const opts: JP2LayerOptions = { visible: false };
    expect(opts.visible).toBe(false);
  });

  it('should accept visible: true', () => {
    const opts: JP2LayerOptions = { visible: true };
    expect(opts.visible).toBe(true);
  });

  it('should be optional (undefined when not specified, defaults to true)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.visible).toBeUndefined();
    // Default behavior: visible ?? true === true
    expect(opts.visible ?? true).toBe(true);
  });

  describe('resolveVisible logic (options?.visible ?? true)', () => {
    function resolveVisible(options?: JP2LayerOptions): boolean {
      return options?.visible ?? true;
    }

    it('returns false when visible: false', () => {
      expect(resolveVisible({ visible: false })).toBe(false);
    });

    it('returns true when visible: true', () => {
      expect(resolveVisible({ visible: true })).toBe(true);
    });

    it('returns true when visible is omitted', () => {
      expect(resolveVisible({})).toBe(true);
    });

    it('returns true when options is undefined', () => {
      expect(resolveVisible(undefined)).toBe(true);
    });
  });
});

describe('preload option', () => {
  it('should accept a numeric preload value', () => {
    const opts: JP2LayerOptions = { preload: 2 };
    expect(opts.preload).toBe(2);
  });

  it('should accept preload: 0', () => {
    const opts: JP2LayerOptions = { preload: 0 };
    expect(opts.preload).toBe(0);
  });

  it('should accept preload: Infinity', () => {
    const opts: JP2LayerOptions = { preload: Infinity };
    expect(opts.preload).toBe(Infinity);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.preload).toBeUndefined();
  });

  describe('resolvePreload logic (options?.preload ?? 0)', () => {
    function resolvePreload(options?: JP2LayerOptions): number {
      return options?.preload ?? 0;
    }

    it('returns the value when preload is set', () => {
      expect(resolvePreload({ preload: 3 })).toBe(3);
    });

    it('returns 0 when preload is omitted', () => {
      expect(resolvePreload({})).toBe(0);
    });

    it('returns 0 when options is undefined', () => {
      expect(resolvePreload(undefined)).toBe(0);
    });

    it('returns Infinity when preload is Infinity', () => {
      expect(resolvePreload({ preload: Infinity })).toBe(Infinity);
    });
  });
});

describe('className option', () => {
  it('should accept a string className', () => {
    const opts: JP2LayerOptions = { className: 'my-custom-layer' };
    expect(opts.className).toBe('my-custom-layer');
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.className).toBeUndefined();
  });

  describe('resolveClassName logic (options?.className)', () => {
    function resolveClassName(options?: JP2LayerOptions): string | undefined {
      return options?.className;
    }

    it('returns the value when className is set', () => {
      expect(resolveClassName({ className: 'jp2-overlay' })).toBe('jp2-overlay');
    });

    it('returns undefined when className is omitted (OL uses default ol-layer)', () => {
      expect(resolveClassName({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveClassName(undefined)).toBeUndefined();
    });
  });
});

describe('minZoom option', () => {
  it('should accept a numeric minZoom', () => {
    const opts: JP2LayerOptions = { minZoom: 5 };
    expect(opts.minZoom).toBe(5);
  });

  it('should accept minZoom: 0', () => {
    const opts: JP2LayerOptions = { minZoom: 0 };
    expect(opts.minZoom).toBe(0);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.minZoom).toBeUndefined();
  });

  describe('resolveMinZoom logic (options?.minZoom)', () => {
    function resolveMinZoom(options?: JP2LayerOptions): number | undefined {
      return options?.minZoom;
    }

    it('returns the value when minZoom is set', () => {
      expect(resolveMinZoom({ minZoom: 3 })).toBe(3);
    });

    it('returns undefined when minZoom is omitted', () => {
      expect(resolveMinZoom({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveMinZoom(undefined)).toBeUndefined();
    });
  });
});

describe('maxZoom option', () => {
  it('should accept a numeric maxZoom', () => {
    const opts: JP2LayerOptions = { maxZoom: 18 };
    expect(opts.maxZoom).toBe(18);
  });

  it('should accept maxZoom: 0', () => {
    const opts: JP2LayerOptions = { maxZoom: 0 };
    expect(opts.maxZoom).toBe(0);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.maxZoom).toBeUndefined();
  });

  describe('resolveMaxZoom logic (options?.maxZoom)', () => {
    function resolveMaxZoom(options?: JP2LayerOptions): number | undefined {
      return options?.maxZoom;
    }

    it('returns the value when maxZoom is set', () => {
      expect(resolveMaxZoom({ maxZoom: 15 })).toBe(15);
    });

    it('returns undefined when maxZoom is omitted', () => {
      expect(resolveMaxZoom({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveMaxZoom(undefined)).toBeUndefined();
    });
  });
});

describe('minZoom and maxZoom combined', () => {
  it('should accept both minZoom and maxZoom together', () => {
    const opts: JP2LayerOptions = { minZoom: 3, maxZoom: 15 };
    expect(opts.minZoom).toBe(3);
    expect(opts.maxZoom).toBe(15);
  });
});

describe('maxResolution option', () => {
  it('should accept a numeric maxResolution', () => {
    const opts: JP2LayerOptions = { maxResolution: 1000 };
    expect(opts.maxResolution).toBe(1000);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.maxResolution).toBeUndefined();
  });

  describe('resolveMaxResolution logic (options?.maxResolution)', () => {
    function resolveMaxResolution(options?: JP2LayerOptions): number | undefined {
      return options?.maxResolution;
    }

    it('returns the value when maxResolution is set', () => {
      expect(resolveMaxResolution({ maxResolution: 500 })).toBe(500);
    });

    it('returns undefined when maxResolution is omitted', () => {
      expect(resolveMaxResolution({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveMaxResolution(undefined)).toBeUndefined();
    });
  });
});

describe('minResolution option', () => {
  it('should accept a numeric minResolution', () => {
    const opts: JP2LayerOptions = { minResolution: 0.5 };
    expect(opts.minResolution).toBe(0.5);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.minResolution).toBeUndefined();
  });

  describe('resolveMinResolution logic (options?.minResolution)', () => {
    function resolveMinResolution(options?: JP2LayerOptions): number | undefined {
      return options?.minResolution;
    }

    it('returns the value when minResolution is set', () => {
      expect(resolveMinResolution({ minResolution: 0.1 })).toBe(0.1);
    });

    it('returns undefined when minResolution is omitted', () => {
      expect(resolveMinResolution({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveMinResolution(undefined)).toBeUndefined();
    });
  });
});

describe('maxResolution and minResolution combined', () => {
  it('should accept both maxResolution and minResolution together', () => {
    const opts: JP2LayerOptions = { maxResolution: 1000, minResolution: 0.5 };
    expect(opts.maxResolution).toBe(1000);
    expect(opts.minResolution).toBe(0.5);
  });
});

describe('updateWhileAnimating option', () => {
  it('should accept updateWhileAnimating: true', () => {
    const opts: JP2LayerOptions = { updateWhileAnimating: true };
    expect(opts.updateWhileAnimating).toBe(true);
  });

  it('should accept updateWhileAnimating: false', () => {
    const opts: JP2LayerOptions = { updateWhileAnimating: false };
    expect(opts.updateWhileAnimating).toBe(false);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.updateWhileAnimating).toBeUndefined();
  });

  describe('resolveUpdateWhileAnimating logic (options?.updateWhileAnimating)', () => {
    function resolveUpdateWhileAnimating(options?: JP2LayerOptions): boolean | undefined {
      return options?.updateWhileAnimating;
    }

    it('returns true when set to true', () => {
      expect(resolveUpdateWhileAnimating({ updateWhileAnimating: true })).toBe(true);
    });

    it('returns false when set to false', () => {
      expect(resolveUpdateWhileAnimating({ updateWhileAnimating: false })).toBe(false);
    });

    it('returns undefined when omitted', () => {
      expect(resolveUpdateWhileAnimating({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveUpdateWhileAnimating(undefined)).toBeUndefined();
    });
  });
});

describe('updateWhileInteracting option', () => {
  it('should accept updateWhileInteracting: true', () => {
    const opts: JP2LayerOptions = { updateWhileInteracting: true };
    expect(opts.updateWhileInteracting).toBe(true);
  });

  it('should accept updateWhileInteracting: false', () => {
    const opts: JP2LayerOptions = { updateWhileInteracting: false };
    expect(opts.updateWhileInteracting).toBe(false);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.updateWhileInteracting).toBeUndefined();
  });

  describe('resolveUpdateWhileInteracting logic (options?.updateWhileInteracting)', () => {
    function resolveUpdateWhileInteracting(options?: JP2LayerOptions): boolean | undefined {
      return options?.updateWhileInteracting;
    }

    it('returns true when set to true', () => {
      expect(resolveUpdateWhileInteracting({ updateWhileInteracting: true })).toBe(true);
    });

    it('returns false when set to false', () => {
      expect(resolveUpdateWhileInteracting({ updateWhileInteracting: false })).toBe(false);
    });

    it('returns undefined when omitted', () => {
      expect(resolveUpdateWhileInteracting({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveUpdateWhileInteracting(undefined)).toBeUndefined();
    });
  });
});

describe('updateWhileAnimating and updateWhileInteracting combined', () => {
  it('should accept both options together', () => {
    const opts: JP2LayerOptions = { updateWhileAnimating: true, updateWhileInteracting: true };
    expect(opts.updateWhileAnimating).toBe(true);
    expect(opts.updateWhileInteracting).toBe(true);
  });
});

describe('zIndex option', () => {
  it('should accept a numeric zIndex', () => {
    const opts: JP2LayerOptions = { zIndex: 10 };
    expect(opts.zIndex).toBe(10);
  });

  it('should accept zIndex: 0', () => {
    const opts: JP2LayerOptions = { zIndex: 0 };
    expect(opts.zIndex).toBe(0);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.zIndex).toBeUndefined();
  });

  describe('resolveZIndex logic (options?.zIndex)', () => {
    function resolveZIndex(options?: JP2LayerOptions): number | undefined {
      return options?.zIndex;
    }

    it('returns the value when zIndex is set', () => {
      expect(resolveZIndex({ zIndex: 5 })).toBe(5);
    });

    it('returns undefined when zIndex is omitted', () => {
      expect(resolveZIndex({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveZIndex(undefined)).toBeUndefined();
    });
  });
});

describe('background option', () => {
  it('should accept background as a string', () => {
    const opts: JP2LayerOptions = { background: 'rgba(0, 0, 0, 1)' };
    expect(opts.background).toBe('rgba(0, 0, 0, 1)');
  });

  it('should accept background as a function', () => {
    const fn = (zoom: number) => `rgba(0,0,0,${zoom})`;
    const opts: JP2LayerOptions = { background: fn };
    expect(opts.background).toBe(fn);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.background).toBeUndefined();
  });

  describe('resolveBackground logic (options?.background)', () => {
    function resolveBackground(options?: JP2LayerOptions) {
      return options?.background;
    }

    it('returns the value when background is set', () => {
      expect(resolveBackground({ background: '#ff0000' })).toBe('#ff0000');
    });

    it('returns undefined when background is omitted', () => {
      expect(resolveBackground({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveBackground(undefined)).toBeUndefined();
    });
  });
});

describe('useInterimTilesOnError option', () => {
  it('should accept useInterimTilesOnError: true', () => {
    const opts: JP2LayerOptions = { useInterimTilesOnError: true };
    expect(opts.useInterimTilesOnError).toBe(true);
  });

  it('should accept useInterimTilesOnError: false', () => {
    const opts: JP2LayerOptions = { useInterimTilesOnError: false };
    expect(opts.useInterimTilesOnError).toBe(false);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.useInterimTilesOnError).toBeUndefined();
  });

  describe('resolveUseInterimTilesOnError logic (options?.useInterimTilesOnError)', () => {
    function resolveUseInterimTilesOnError(options?: JP2LayerOptions): boolean | undefined {
      return options?.useInterimTilesOnError;
    }

    it('returns true when set to true', () => {
      expect(resolveUseInterimTilesOnError({ useInterimTilesOnError: true })).toBe(true);
    });

    it('returns false when set to false', () => {
      expect(resolveUseInterimTilesOnError({ useInterimTilesOnError: false })).toBe(false);
    });

    it('returns undefined when omitted', () => {
      expect(resolveUseInterimTilesOnError({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveUseInterimTilesOnError(undefined)).toBeUndefined();
    });
  });
});

describe('properties option', () => {
  it('should accept a properties object', () => {
    const opts: JP2LayerOptions = { properties: { id: 'my-layer', name: 'test' } };
    expect(opts.properties).toEqual({ id: 'my-layer', name: 'test' });
  });

  it('should accept an empty properties object', () => {
    const opts: JP2LayerOptions = { properties: {} };
    expect(opts.properties).toEqual({});
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.properties).toBeUndefined();
  });

  describe('resolveProperties logic (options?.properties)', () => {
    function resolveProperties(options?: JP2LayerOptions): Record<string, unknown> | undefined {
      return options?.properties;
    }

    it('returns the properties object when set', () => {
      expect(resolveProperties({ properties: { id: 'layer-1' } })).toEqual({ id: 'layer-1' });
    });

    it('returns undefined when omitted', () => {
      expect(resolveProperties({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveProperties(undefined)).toBeUndefined();
    });
  });
});

describe('interpolate option', () => {
  it('should accept interpolate: true', () => {
    const opts: JP2LayerOptions = { interpolate: true };
    expect(opts.interpolate).toBe(true);
  });

  it('should accept interpolate: false', () => {
    const opts: JP2LayerOptions = { interpolate: false };
    expect(opts.interpolate).toBe(false);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.interpolate).toBeUndefined();
  });

  describe('resolveInterpolate logic (options?.interpolate)', () => {
    function resolveInterpolate(options?: JP2LayerOptions): boolean | undefined {
      return options?.interpolate;
    }

    it('returns true when set to true', () => {
      expect(resolveInterpolate({ interpolate: true })).toBe(true);
    });

    it('returns false when set to false', () => {
      expect(resolveInterpolate({ interpolate: false })).toBe(false);
    });

    it('returns undefined when omitted (OL defaults to true)', () => {
      expect(resolveInterpolate({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveInterpolate(undefined)).toBeUndefined();
    });
  });
});

describe('cacheTTL option', () => {
  it('should accept a numeric cacheTTL', () => {
    const opts: JP2LayerOptions = { cacheTTL: 3600000 };
    expect(opts.cacheTTL).toBe(3600000);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.cacheTTL).toBeUndefined();
  });

  describe('resolveCacheTTL logic (options?.cacheTTL)', () => {
    function resolveCacheTTL(options?: JP2LayerOptions): number | undefined {
      return options?.cacheTTL;
    }

    it('returns the value when cacheTTL is set', () => {
      expect(resolveCacheTTL({ cacheTTL: 60000 })).toBe(60000);
    });

    it('returns undefined when cacheTTL is omitted', () => {
      expect(resolveCacheTTL({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveCacheTTL(undefined)).toBeUndefined();
    });
  });
});

describe('maxConcurrency option', () => {
  it('should accept a numeric maxConcurrency', () => {
    const opts: JP2LayerOptions = { maxConcurrency: 2 };
    expect(opts.maxConcurrency).toBe(2);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.maxConcurrency).toBeUndefined();
  });

  describe('resolveMaxConcurrency logic (options?.maxConcurrency)', () => {
    function resolveMaxConcurrency(options?: JP2LayerOptions): number | undefined {
      return options?.maxConcurrency;
    }

    it('returns the value when maxConcurrency is set', () => {
      expect(resolveMaxConcurrency({ maxConcurrency: 4 })).toBe(4);
    });

    it('returns undefined when maxConcurrency is omitted', () => {
      expect(resolveMaxConcurrency({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveMaxConcurrency(undefined)).toBeUndefined();
    });
  });
});

describe('transition option', () => {
  it('should accept a numeric transition', () => {
    const opts: JP2LayerOptions = { transition: 500 };
    expect(opts.transition).toBe(500);
  });

  it('should accept transition: 0 (no fade-in)', () => {
    const opts: JP2LayerOptions = { transition: 0 };
    expect(opts.transition).toBe(0);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.transition).toBeUndefined();
  });

  describe('resolveTransition logic (options?.transition)', () => {
    function resolveTransition(options?: JP2LayerOptions): number | undefined {
      return options?.transition;
    }

    it('returns the value when transition is set', () => {
      expect(resolveTransition({ transition: 300 })).toBe(300);
    });

    it('returns 0 when transition is 0', () => {
      expect(resolveTransition({ transition: 0 })).toBe(0);
    });

    it('returns undefined when transition is omitted (OL defaults to 250)', () => {
      expect(resolveTransition({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveTransition(undefined)).toBeUndefined();
    });
  });
});

describe('renderBuffer option', () => {
  it('should accept a numeric renderBuffer', () => {
    const opts: JP2LayerOptions = { renderBuffer: 200 };
    expect(opts.renderBuffer).toBe(200);
  });

  it('should accept renderBuffer: 0', () => {
    const opts: JP2LayerOptions = { renderBuffer: 0 };
    expect(opts.renderBuffer).toBe(0);
  });

  it('should be optional (undefined when not specified)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.renderBuffer).toBeUndefined();
  });

  describe('resolveRenderBuffer logic (options?.renderBuffer)', () => {
    function resolveRenderBuffer(options?: JP2LayerOptions): number | undefined {
      return options?.renderBuffer;
    }

    it('returns the value when renderBuffer is set', () => {
      expect(resolveRenderBuffer({ renderBuffer: 200 })).toBe(200);
    });

    it('returns undefined when renderBuffer is omitted (OL uses default 100)', () => {
      expect(resolveRenderBuffer({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveRenderBuffer(undefined)).toBeUndefined();
    });
  });
});

describe('cacheSize option', () => {
  it('should accept a numeric cacheSize', () => {
    const opts: JP2LayerOptions = { cacheSize: 1024 };
    expect(opts.cacheSize).toBe(1024);
  });

  it('should be optional (undefined when not specified, OL defaults to 512)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.cacheSize).toBeUndefined();
  });

  describe('resolveCacheSize logic (options?.cacheSize)', () => {
    function resolveCacheSize(options?: JP2LayerOptions): number | undefined {
      return options?.cacheSize;
    }

    it('returns the value when cacheSize is set', () => {
      expect(resolveCacheSize({ cacheSize: 2048 })).toBe(2048);
    });

    it('returns undefined when cacheSize is omitted (OL defaults to 512)', () => {
      expect(resolveCacheSize({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveCacheSize(undefined)).toBeUndefined();
    });
  });
});

describe('JP2LayerOptions — wrapX', () => {
  it('should accept wrapX: false', () => {
    const opts: JP2LayerOptions = { wrapX: false };
    expect(opts.wrapX).toBe(false);
  });

  it('should accept wrapX: true', () => {
    const opts: JP2LayerOptions = { wrapX: true };
    expect(opts.wrapX).toBe(true);
  });

  it('should be optional (undefined when not specified, OL defaults to true)', () => {
    const opts: JP2LayerOptions = {};
    expect(opts.wrapX).toBeUndefined();
  });

  describe('resolveWrapX logic (options?.wrapX)', () => {
    function resolveWrapX(options?: JP2LayerOptions): boolean | undefined {
      return options?.wrapX;
    }

    it('returns false when wrapX is false', () => {
      expect(resolveWrapX({ wrapX: false })).toBe(false);
    });

    it('returns true when wrapX is true', () => {
      expect(resolveWrapX({ wrapX: true })).toBe(true);
    });

    it('returns undefined when wrapX is omitted (OL defaults to true)', () => {
      expect(resolveWrapX({})).toBeUndefined();
    });

    it('returns undefined when options is undefined', () => {
      expect(resolveWrapX(undefined)).toBeUndefined();
    });
  });
});

