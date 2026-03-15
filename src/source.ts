import TileImage from 'ol/source/TileImage';
import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import { Projection, get as getProjection } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import type Tile from 'ol/Tile';
import ImageTile from 'ol/ImageTile';
import type { BackgroundColor } from 'ol/layer/Base';
import type { TileProvider, TileProviderInfo, GeoInfo } from './tile-provider';
import { RangeTileProvider } from './range-tile-provider';
import { debugLog, debugWarn, debugError } from './debug-logger';
import { applyNodata, applyGamma, applyBrightness, applyContrast, applySaturation, applyHue, applyInvert, applyThreshold, applyColorize, applySharpen, applyBlur, applySepia, applyGrayscale, applyColorMap, validateColorMap, applyPosterize, applyVignette, applyEdgeDetect, applyEmboss, applyPixelate, applyChannelSwap, applyColorBalance, applyExposure, applyLevels, validateLevels, applyNoise, applyTint, applyOutputLevels, validateOutputLevels, applyTemperature, applyFlip, applyVibrance, applyCurves, validateCurves } from './pixel-conversion';

async function ensureProjection(
  epsgCode: number,
  resolver?: (epsgCode: number) => Promise<string | null>,
): Promise<void> {
  const code = `EPSG:${epsgCode}`;
  if (getProjection(code)) return;
  try {
    let def: string | null = null;
    if (resolver) {
      def = await resolver(epsgCode);
    } else {
      const resp = await fetch(`https://epsg.io/${epsgCode}.proj4`);
      def = await resp.text();
    }
    if (def && def.trim().startsWith('+')) {
      proj4.defs(code, def.trim());
      register(proj4);
      debugLog(`Registered projection ${code}`);
    }
  } catch (e) {
    debugWarn(`Failed to fetch projection ${code}:`, e);
  }
}

// Semaphore to limit concurrent tile loads
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

const DEFAULT_DISPLAY_TILE_SIZE = 256;

export interface JP2LayerOptions {
  /** 동시 타일 로드 최대 수 (기본값: 4) */
  maxConcurrentTiles?: number;
  /** EPSG 코드에 대한 proj4 문자열을 반환하는 커스텀 resolver (기본값: epsg.io fetch) */
  projectionResolver?: (epsgCode: number) => Promise<string | null>;
  /** 픽셀 정규화 최소값 (16비트 이미지용) */
  minValue?: number;
  /** 픽셀 정규화 최대값 (16비트 이미지용) */
  maxValue?: number;
  /** 타일 로드 실패 시 재시도 횟수 (기본값: 0, 재시도 없음) */
  tileRetryCount?: number;
  /** 재시도 초기 delay (ms, 기본값: 500). exponential backoff 적용: delay * 2^attempt */
  tileRetryDelay?: number;
  /** 재시도 최대 delay 상한 (ms, 기본값: 5000) */
  tileRetryMaxDelay?: number;
  /** 모든 재시도 소진 후 최종 실패 시 호출되는 콜백 */
  onTileError?: (info: { col: number; row: number; decodeLevel: number; error: unknown }) => void;
  /** 타일 디코딩 성공 시 호출되는 콜백 */
  onTileLoad?: (info: { col: number; row: number; decodeLevel: number }) => void;
  /** 타일 로드 진행률 콜백 */
  onProgress?: (info: { loaded: number; total: number; failed: number }) => void;
  /** 개별 타일 로드 타임아웃 (ms). 미지정 시 타임아웃 없음 */
  tileLoadTimeout?: number;
  /** 레이어 초기 투명도 (0.0 ~ 1.0, 기본값: 1.0) */
  initialOpacity?: number;
  /** HTTP 요청에 추가할 커스텀 헤더 (URL 문자열로 호출 시 RangeTileProvider에 전달) */
  requestHeaders?: Record<string, string>;
  /** 단채널(grayscale) 이미지에 적용할 컬러맵 함수. 0~255 값을 [r, g, b]로 변환 */
  colormap?: (value: number) => [r: number, g: number, b: number];
  /** 타일 로드 시작 시 호출되는 콜백 (sem.acquire 이후, getTile 직전) */
  onTileLoadStart?: (info: { col: number; row: number; decodeLevel: number }) => void;
  /** OpenLayers 소스에 표시할 저작권/출처 정보 */
  attributions?: string | string[];
  /** 저작권 표기 패널의 접기 버튼 표시 여부 (기본값: true, 접기 가능) */
  attributionsCollapsible?: boolean;
  /** 다중 채널 이미지에서 RGB에 매핑할 밴드 인덱스 (0-based). 예: [3, 2, 1] */
  bands?: [r: number, g: number, b: number];
  /** 레이어 초기 가시성 (기본값: true) */
  visible?: boolean;
  /** 레이어 렌더링 순서 (숫자가 클수록 위에 렌더링, OpenLayers 표준 옵션) */
  zIndex?: number;
  /** 저해상도 타일 미리 로드 레벨 수 (기본값: 0, 미리 로드 없음). Infinity로 전체 피라미드 미리 로드 가능 */
  preload?: number;
  /** 레이어 DOM 요소에 적용할 CSS 클래스명 (기본값: OpenLayers 기본값 'ol-layer') */
  className?: string;
  /** 레이어가 표시되는 최소 줌 레벨 (이 레벨 미만에서는 숨김) */
  minZoom?: number;
  /** 레이어가 표시되는 최대 줌 레벨 (이 레벨 초과 시 숨김) */
  maxZoom?: number;
  /** 레이어가 표시되는 최대 해상도 (map units per pixel). 이 해상도 초과 시 숨김 */
  maxResolution?: number;
  /** 레이어가 표시되는 최소 해상도 (map units per pixel). 이 해상도 미만 시 숨김 */
  minResolution?: number;
  /** 애니메이션 중 타일 업데이트 여부 (기본값: false) */
  updateWhileAnimating?: boolean;
  /** 인터랙션 중 타일 업데이트 여부 (기본값: false) */
  updateWhileInteracting?: boolean;
  /** 레이어 배경색. 타일이 없는 영역에 표시할 색상 (CSS 색상 문자열 또는 줌 레벨별 함수) */
  background?: BackgroundColor;
  /** 타일 로드 오류 시 임시 타일(하위 해상도) 표시 여부 (기본값: true) */
  useInterimTilesOnError?: boolean;
  /** 레이어에 설정할 임의의 키-값 속성. layer.get(key)로 조회 가능 */
  properties?: Record<string, unknown>;
  /** 뷰포트 경계 바깥으로 미리 렌더링할 픽셀 수 (기본값: OL 기본값 100). 빠른 패닝 시 타일 공백을 줄인다 */
  renderBuffer?: number;
  /** 타일 렌더링 시 보간(interpolation) 방식 제어 (기본값: true). false로 설정하면 nearest-neighbor 보간 적용 */
  interpolate?: boolean;
  /** IndexedDB 타일 인덱스 캐시 TTL (밀리초, 기본값: 24시간). URL 문자열로 호출 시 RangeTileProvider에 전달 */
  cacheTTL?: number;
  /** 디코딩 WebWorker 풀 크기. URL 문자열로 호출 시 RangeTileProvider에 전달 (기본값: WorkerPool 기본값) */
  maxConcurrency?: number;
  /** 타일 페이드인 애니메이션 지속 시간 (ms, 기본값: OL 기본값 250). 0으로 설정하면 즉시 표시 */
  transition?: number;
  /** 레이어 내부 인메모리 타일 캐시 크기 (기본값: OL 기본값 512) */
  cacheSize?: number;
  /** 타일 소스의 경도 방향(X축) 반복 렌더링 여부 (기본값: OL 기본값 true). false로 설정하면 원본 범위 외부에서 타일이 반복 표시되지 않음 */
  wrapX?: boolean;
  /** CORS 크로스오리진 설정. 다른 오리진에서 JP2 파일을 서빙할 때 canvas 픽셀 접근을 위해 필요 (예: 'anonymous', 'use-credentials') */
  crossOrigin?: string | null;
  /**
   * 레이어가 렌더링될 지리 범위 `[minX, minY, maxX, maxY]`.
   * 지정 시 해당 범위 내에서만 타일이 렌더링되며, 범위 바깥의 타일은 표시되지 않는다.
   *
   * - 좌표는 레이어가 사용하는 투영계(projection) 단위를 따른다 (예: EPSG:4326이면 경위도 도(degree)).
   * - Geographic mode(JP2 파일에 지리 정보가 포함된 경우)에서는 이 값이 JP2 파일의 extent를
   *   대체하여 TileLayer의 extent로 사용된다. 미지정 시 JP2 파일에서 계산된 extent가 그대로 적용된다.
   * - Pixel mode(지리 정보 없는 JP2)에서도 TileLayer의 extent를 명시적으로 제한할 수 있다.
   *
   * @example
   * // 한반도 영역만 렌더링 (EPSG:4326)
   * createJP2TileLayer('map.jp2', { extent: [124, 33, 132, 39] });
   */
  extent?: [number, number, number, number];
  /** 타일 이미지 픽셀과 CSS 픽셀의 비율 (기본값: OL 기본값 1). HiDPI/Retina 디스플레이에서 고해상도 타일을 렌더링하려면 2로 설정 */
  tilePixelRatio?: number;
  /** 타일 재투영(reprojection) 시 허용되는 최대 픽셀 오차 임계값 (기본값: OL 기본값 0.5). 낮을수록 정확하지만 성능 비용 증가 */
  reprojectionErrorThreshold?: number;
  /** 타일 소스가 불투명(opaque)함을 렌더러에 알리는 힌트 (기본값: OL 기본값 false). true로 설정하면 하위 레이어 렌더링 생략 최적화 가능 */
  opaque?: boolean;
  /** 디스플레이 타일 크기 (px, 기본값: 256). 512로 설정하면 네트워크 왕복 감소, 128로 설정하면 HiDPI에서 선명도 향상 */
  tileSize?: number;
  /**
   * 투명으로 처리할 픽셀 값 (no-data value).
   * 이 값과 정확히 일치하는 픽셀은 alpha=0으로 설정된다.
   * 다중 채널 이미지: 모든 채널이 nodata 값과 일치할 때만 투명 처리.
   * 배열로 전달 시 여러 값을 동시에 지정 가능.
   */
  nodata?: number | number[];
  /** nodata 값 매칭 허용 오차 (기본값: 0, 정확히 일치해야 함). 지정 시 |pixel - nodata| <= tolerance 조건으로 매칭 */
  nodataTolerance?: number;
  /** 픽셀 감마 보정 값 (기본값: 1.0, 보정 없음). 1보다 크면 밝아지고 1보다 작으면 어두워짐 */
  gamma?: number;
  /** 픽셀 밝기 조정 값 (기본값: 0, 조정 없음). -1 ~ 1 범위. 양수면 밝아지고 음수면 어두워짐 */
  brightness?: number;
  /** 픽셀 대비 조정 값 (기본값: 1.0, 조정 없음). 1보다 크면 대비 증가, 0~1이면 대비 감소, 0이면 회색 */
  contrast?: number;
  /** 픽셀 채도 조정 값 (기본값: 1.0, 조정 없음). 0이면 흑백, 1보다 크면 채도 증가 */
  saturation?: number;
  /** 픽셀 색조 회전 각도 (기본값: 0, 단위: 도). 180이면 보색, ±360은 한 바퀴 회전 */
  hue?: number;
  /** 픽셀 색상 반전 (기본값: false). true로 설정하면 각 RGB 채널을 255 - value로 반전 */
  invert?: boolean;
  /** 픽셀 임계값 이진화 (0~255 범위). 지정 시 luminance 기준으로 흑백 이진화 적용 */
  threshold?: number;
  /** 그레이스케일 이미지 색상화 RGB 값 [r, g, b] (0~255). luminance 기반 착색 적용 */
  colorize?: [number, number, number];
  /** 언샤프 마스킹 선명화 강도 (0.0~1.0, 기본값: 0). 3x3 가우시안 블러 기반 선명화 */
  sharpen?: number;
  /** 가우시안 블러 스무딩 적용 횟수 (기본값: 0, 비활성화). 3×3 커널 반복 적용 */
  blur?: number;
  /** 세피아 톤 효과 강도 (0~1, 기본값: 0). 0=원본, 1=완전 세피아 */
  sepia?: number;
  /** 이미지를 그레이스케일로 변환 (기본값: false). ITU-R BT.709 가중치 사용 */
  grayscale?: boolean;
  /** 단일 밴드 데이터에 적용할 색상 룩업 테이블 (길이 256 배열, 각 요소 [R, G, B]). 밴드 수 > 1이면 무시 */
  colorMap?: Array<[number, number, number]>;
  /** 포스터라이즈 색상 레벨 수 (2~256, 기본값: 0 = 비활성). 각 RGB 채널의 색상 단계를 제한 */
  posterize?: number;
  /** 비네트 효과 강도 (0~1, 기본값: 0 = 비활성). 이미지 가장자리를 점진적으로 어둡게 처리 */
  vignette?: number;
  /** Laplacian 엣지 검출 필터 적용 (기본값: false) */
  edgeDetect?: boolean;
  /** 엠보스(양각) 효과 적용 (기본값: false) */
  emboss?: boolean;
  /** 픽셀화(블록 모자이크) 효과의 블록 크기 (px, 기본값: 미적용). 2 이상이면 해당 크기의 블록으로 이미지를 픽셀화 */
  pixelate?: number;
  /** RGB 채널 순서 변경. [소스R인덱스, 소스G인덱스, 소스B인덱스] (0=R, 1=G, 2=B). 예: [2,1,0]은 BGR→RGB 변환 */
  channelSwap?: [number, number, number];
  /** RGB 채널별 색상 균형 조정 [R, G, B] (각 -255 ~ 255). 각 채널에 가산 적용 */
  colorBalance?: [number, number, number];
  /** 승산 방식 밝기 보정 (기본값: 1.0, 변화 없음). >1.0 밝아짐, <1.0 어두워짐 */
  exposure?: number;
  /** 픽셀 입력 레벨 범위 조정. inputMin~inputMax를 0~255로 선형 재매핑 (기본값: {inputMin: 0, inputMax: 255}) */
  levels?: { inputMin?: number; inputMax?: number };
  /** 랜덤 노이즈 강도 (0~255, 기본값: 0). 각 RGB 채널에 [-noise, +noise] 균등 분포 랜덤값 가산. 권장 범위: 0~50 (50 이상은 이미지 품질 저하가 심함). 255 초과 시 255로 클리핑 */
  noise?: number;
  /** 이미지 전체에 색조 오버레이 적용 [R, G, B, strength] (strength: 0~1, 기본값 0.5). 원본 색상과 지정 색상을 블렌딩 */
  tint?: [number, number, number, number?];
  /** 픽셀 출력 레벨 범위 조정. 0~255를 outputMin~outputMax로 선형 재매핑 (기본값: {outputMin: 0, outputMax: 255}) */
  outputLevels?: { outputMin?: number; outputMax?: number };
  /** 색 온도 조정 (-100~+100, 기본값: 0). 양수=난색(주황빛), 음수=한색(파란빛) */
  temperature?: number;
  /** 이미지 반전. horizontal=좌우 반전, vertical=상하 반전 (기본값: 둘 다 false) */
  flip?: { horizontal?: boolean; vertical?: boolean };
  /** 채도 낮은 색상 선택적 채도 증폭 (기본값: 0, 범위: -1~1). 양수=저채도 색상 강조, 음수=저채도 색상 감소. saturation과 달리 과채도 방지 */
  vibrance?: number;
  /** 톤 커브 조정 — 채널별 입출력 매핑. 각 채널은 256개 요소 배열(index→출력값). all은 공통 커브(채널별보다 먼저 적용) */
  curves?: { r?: number[]; g?: number[]; b?: number[]; all?: number[] };
}

export interface JP2LayerResult {
  layer: TileLayer<TileImage>;
  info: TileProviderInfo;
  projection: Projection;
  extent: [number, number, number, number];
  resolutions: number[];
  /** 내부 리소스(WebWorker 등)를 해제한다 */
  destroy: () => void;
}

/**
 * JP2 파일을 렌더링하는 OpenLayers TileLayer를 생성한다.
 *
 * @param providerOrUrl - `TileProvider` 객체 또는 JP2 파일의 URL 문자열.
 *   URL 문자열을 전달하면 내부에서 `RangeTileProvider`를 자동 생성한다.
 * @param options - 레이어 옵션 (`JP2LayerOptions`)
 * @returns 레이어, 메타데이터, 좌표계, 범위, 해상도, destroy 함수를 포함하는 객체
 *
 * @example
 * // TileProvider 객체 전달
 * const provider = new RangeTileProvider('path/to/file.jp2');
 * const { layer, destroy } = await createJP2TileLayer(provider);
 *
 * @example
 * // URL 문자열 직접 전달 (requestHeaders 포함)
 * const { layer, destroy } = await createJP2TileLayer('path/to/file.jp2', {
 *   requestHeaders: { Authorization: 'Bearer token' },
 * });
 */
export async function createJP2TileLayer(
  providerOrUrl: TileProvider | string,
  options?: JP2LayerOptions,
): Promise<JP2LayerResult> {
  const provider: TileProvider =
    typeof providerOrUrl === 'string'
      ? new RangeTileProvider(providerOrUrl, {
          minValue: options?.minValue,
          maxValue: options?.maxValue,
          requestHeaders: options?.requestHeaders,
          cacheTTL: options?.cacheTTL,
          maxConcurrency: options?.maxConcurrency,
        })
      : providerOrUrl;
  const info = await provider.init();
  const { width, height, tileWidth, tileHeight, tilesX, tilesY, geoInfo } = info;

  const DISPLAY_TILE_SIZE = options?.tileSize ?? DEFAULT_DISPLAY_TILE_SIZE;

  // Compute resolutions in pixel space
  const maxRes = tileWidth / DISPLAY_TILE_SIZE;
  const numLevels = Math.log2(maxRes) + 1;
  const pixelResolutions: number[] = [];
  for (let i = 0; i < numLevels; i++) {
    pixelResolutions.push(maxRes / Math.pow(2, i));
  }

  let extent: [number, number, number, number];
  let resolutions: number[];
  let projection: Projection;

  if (geoInfo) {
    await ensureProjection(geoInfo.epsgCode, options?.projectionResolver);

    // For geographic CRS (e.g. EPSG:4326), origin may have lat/lon order.
    // OpenLayers expects X=lon, Y=lat. Detect and swap if needed.
    let { originX, originY, pixelScaleX, pixelScaleY } = geoInfo;
    const proj = getProjection(`EPSG:${geoInfo.epsgCode}`);
    const isGeographic = proj ? proj.getUnits() === 'degrees' : geoInfo.epsgCode === 4326;
    if (isGeographic) {
      const computedMaxX = originX + width * pixelScaleX;
      const computedMinY = originY - height * pixelScaleY;
      // If Y values are out of latitude range but X values look like latitude, swap
      if ((Math.abs(originY) > 90 || Math.abs(computedMinY) > 90) && Math.abs(originX) <= 90) {
        debugLog('Detected lat/lon axis swap in geo info, correcting...');
        [originX, originY] = [originY, originX];
        [pixelScaleX, pixelScaleY] = [pixelScaleY, pixelScaleX];
      }
    }

    // Geographic mode: compute extent and resolutions in CRS units
    const minX = originX;
    const maxY = originY;
    const maxX = minX + width * pixelScaleX;
    const minY = maxY - height * pixelScaleY;
    extent = [minX, minY, maxX, maxY];

    // Resolutions in CRS units per pixel
    resolutions = pixelResolutions.map(r => r * pixelScaleX);

    const existing = getProjection(`EPSG:${geoInfo.epsgCode}`);
    if (existing) {
      projection = existing as Projection;
    } else {
      projection = new Projection({
        code: `EPSG:${geoInfo.epsgCode}`,
        units: 'm',
        extent,
      });
    }
  } else {
    // Pixel mode (no geo info)
    extent = [0, 0, width, height];
    resolutions = pixelResolutions;
    projection = new Projection({
      code: 'jp2-image',
      units: 'pixels',
      extent,
    });
  }

  const origin: [number, number] = geoInfo
    ? [extent[0], extent[3]] // top-left in CRS
    : [0, height];

  const tileGrid = new TileGrid({
    extent,
    origin,
    resolutions,
    tileSize: [DISPLAY_TILE_SIZE, DISPLAY_TILE_SIZE],
  });

  const sem = new Semaphore(options?.maxConcurrentTiles ?? 4);
  const retryCount = options?.tileRetryCount ?? 0;
  const retryDelay = options?.tileRetryDelay ?? 500;
  const retryMaxDelay = options?.tileRetryMaxDelay ?? 5000;
  const tileLoadTimeout = options?.tileLoadTimeout;
  const onTileError = options?.onTileError;
  const onTileLoad = options?.onTileLoad;
  const onTileLoadStart = options?.onTileLoadStart;
  const onProgress = options?.onProgress;
  const colormap = options?.colormap;
  const nodata = options?.nodata;
  const nodataValues: number[] | undefined = nodata != null
    ? (Array.isArray(nodata) ? nodata : [nodata])
    : undefined;
  const nodataTolerance = options?.nodataTolerance ?? 0;
  const gamma = options?.gamma;
  const brightness = options?.brightness;
  const contrast = options?.contrast;
  const saturation = options?.saturation;
  const hue = options?.hue;
  const invert = options?.invert;
  const threshold = options?.threshold;
  const colorize = options?.colorize;
  const sharpen = options?.sharpen;
  const blur = options?.blur;
  const sepia = options?.sepia;
  const colorMapLUT = options?.colorMap != null && validateColorMap(options.colorMap)
    ? options.colorMap
    : undefined;
  // colorMap takes priority over grayscale for single-band images
  const grayscale = options?.grayscale;
  const posterize = options?.posterize;
  const vignette = options?.vignette;
  const edgeDetect = options?.edgeDetect;
  const emboss = options?.emboss;
  const pixelate = options?.pixelate;
  const channelSwap = options?.channelSwap;
  const colorBalance = options?.colorBalance;
  const exposure = options?.exposure;
  const levels = options?.levels;
  const noise = options?.noise;
  const tint = options?.tint;
  const outputLevels = options?.outputLevels;
  const temperature = options?.temperature;
  const flip = options?.flip;
  const vibrance = options?.vibrance;
  const curvesOpt = options?.curves != null && validateCurves(options.curves)
    ? options.curves
    : undefined;

  // Progress tracking state
  let progressTotal = 0;
  let progressLoaded = 0;
  let progressFailed = 0;

  const emitProgress = () => {
    if (onProgress) {
      onProgress({ loaded: progressLoaded, total: progressTotal, failed: progressFailed });
    }
  };

  const bands = options?.bands;
  const transition = options?.transition;
  const cacheSize = options?.cacheSize;
  const wrapX = options?.wrapX;
  const crossOrigin = options?.crossOrigin;
  const tilePixelRatio = options?.tilePixelRatio;
  const reprojectionErrorThreshold = options?.reprojectionErrorThreshold;
  const opaque = options?.opaque;
  const source = new TileImage({
    projection,
    tileGrid,
    attributions: options?.attributions,
    attributionsCollapsible: options?.attributionsCollapsible,
    transition,
    cacheSize,
    wrapX,
    crossOrigin,
    tilePixelRatio,
    reprojectionErrorThreshold,
    opaque,
    tileUrlFunction: (tileCoord) => {
      const [z, x, y] = tileCoord;
      const subtilesPerAxis = tileWidth / DISPLAY_TILE_SIZE / pixelResolutions[z];

      const jp2Col = Math.floor(x / subtilesPerAxis);
      const jp2Row = Math.floor(y / subtilesPerAxis);
      const subCol = x % subtilesPerAxis;
      const subRow = y % subtilesPerAxis;

      if (jp2Row < 0 || jp2Row >= tilesY || jp2Col < 0 || jp2Col >= tilesX) {
        return undefined;
      }

      const decodeLevel = Math.round(Math.log2(pixelResolutions[z]));

      return `jp2:#col=${jp2Col}&row=${jp2Row}&dl=${decodeLevel}&sc=${subCol}&sr=${subRow}`;
    },
    tileLoadFunction: (tile: Tile, src: string) => {
      const match = src.match(/col=(\d+)&row=(\d+)&dl=(\d+)&sc=(\d+)&sr=(\d+)/);
      if (!match) {
        tile.setState(3);
        return;
      }

      const col = parseInt(match[1], 10);
      const row = parseInt(match[2], 10);
      const decodeLevel = parseInt(match[3], 10);
      const subCol = parseInt(match[4], 10);
      const subRow = parseInt(match[5], 10);

      const imageTile = tile as ImageTile;
      const img = imageTile.getImage() as HTMLImageElement;

      (async () => {
        progressTotal++;
        emitProgress();
        await sem.acquire();
        try {
          if (onTileLoadStart) {
            onTileLoadStart({ col, row, decodeLevel });
          }
          let decoded: Awaited<ReturnType<TileProvider['getTile']>> | undefined;
          let lastErr: unknown;
          for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
              const tilePromise = provider.getTile(col, row, decodeLevel);
              if (tileLoadTimeout != null) {
                decoded = await new Promise<Awaited<ReturnType<TileProvider['getTile']>>>((resolve, reject) => {
                  const timer = setTimeout(
                    () => reject(new Error('Tile load timeout')),
                    tileLoadTimeout,
                  );
                  tilePromise.then(
                    v => { clearTimeout(timer); resolve(v); },
                    e => { clearTimeout(timer); reject(e); },
                  );
                });
              } else {
                decoded = await tilePromise;
              }
              break;
            } catch (err) {
              lastErr = err;
              if (attempt < retryCount) {
                const delay = Math.min(retryDelay * Math.pow(2, attempt), retryMaxDelay);
                debugWarn(`Tile (${col},${row}) load failed (attempt ${attempt + 1}/${retryCount + 1}), retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          if (!decoded) {
            debugError(`Failed to load tile (${col},${row}) sub(${subCol},${subRow}) after ${retryCount + 1} attempts:`, lastErr);
            if (onTileError) {
              onTileError({ col, row, decodeLevel, error: lastErr });
            }
            progressFailed++;
            emitProgress();
            tile.setState(3);
            return;
          }

          if (nodataValues && nodataValues.length > 0) {
            applyNodata(decoded.data, decoded.width, decoded.height, info.componentCount, nodataValues, nodataTolerance);
          }

          if (gamma != null && gamma !== 1.0) {
            applyGamma(decoded.data, decoded.width, decoded.height, gamma);
          }

          if (brightness != null && brightness !== 0) {
            applyBrightness(decoded.data, decoded.width, decoded.height, brightness);
          }

          if (contrast != null && contrast !== 1.0) {
            applyContrast(decoded.data, decoded.width, decoded.height, contrast);
          }

          if (temperature != null && temperature !== 0) {
            applyTemperature(decoded.data, decoded.width, decoded.height, temperature);
          }

          if (saturation != null && saturation !== 1.0) {
            applySaturation(decoded.data, decoded.width, decoded.height, saturation);
          }

          if (vibrance != null && vibrance !== 0) {
            applyVibrance(decoded.data, decoded.width, decoded.height, vibrance);
          }

          if (hue != null && hue !== 0) {
            applyHue(decoded.data, decoded.width, decoded.height, hue);
          }

          if (invert) {
            applyInvert(decoded.data, decoded.width, decoded.height);
          }

          if (threshold != null) {
            applyThreshold(decoded.data, decoded.width, decoded.height, threshold);
          }

          if (colorize) {
            applyColorize(decoded.data, decoded.width, decoded.height, colorize);
          }

          if (sharpen != null && sharpen !== 0) {
            applySharpen(decoded.data, decoded.width, decoded.height, sharpen);
          }

          if (blur != null && blur > 0) {
            applyBlur(decoded.data, decoded.width, decoded.height, blur);
          }

          if (sepia != null && sepia !== 0) {
            applySepia(decoded.data, decoded.width, decoded.height, sepia);
          }

          if (posterize != null && posterize >= 2 && posterize < 256) {
            applyPosterize(decoded.data, decoded.width, decoded.height, posterize);
          }

          if (vignette != null && vignette > 0) {
            applyVignette(decoded.data, decoded.width, decoded.height, vignette);
          }

          if (edgeDetect) {
            applyEdgeDetect(decoded.data, decoded.width, decoded.height);
          }

          if (emboss) {
            applyEmboss(decoded.data, decoded.width, decoded.height);
          }

          if (pixelate != null && pixelate >= 2) {
            applyPixelate(decoded.data, decoded.width, decoded.height, pixelate);
          }

          if (channelSwap) {
            applyChannelSwap(decoded.data, decoded.width, decoded.height, channelSwap);
          }

          if (colorBalance) {
            applyColorBalance(decoded.data, decoded.width, decoded.height, colorBalance);
          }

          if (exposure != null && exposure !== 1.0) {
            applyExposure(decoded.data, decoded.width, decoded.height, exposure);
          }

          if (levels) {
            const validated = validateLevels(levels.inputMin ?? 0, levels.inputMax ?? 255);
            if (validated.swapped) {
              debugWarn(`levels.inputMin > levels.inputMax, swapping values`);
            }
            applyLevels(decoded.data, decoded.width, decoded.height, validated.inputMin, validated.inputMax);
          }

          if (curvesOpt) {
            applyCurves(decoded.data, decoded.width, decoded.height, curvesOpt);
          }

          if (outputLevels) {
            const validated = validateOutputLevels(outputLevels.outputMin ?? 0, outputLevels.outputMax ?? 255);
            if (validated.swapped) {
              debugWarn(`outputLevels.outputMin > outputLevels.outputMax, swapping values`);
            }
            applyOutputLevels(decoded.data, decoded.width, decoded.height, validated.outputMin, validated.outputMax);
          }

          if (noise != null && noise > 0) {
            applyNoise(decoded.data, decoded.width, decoded.height, Math.min(noise, 255));
          }

          if (tint) {
            applyTint(decoded.data, decoded.width, decoded.height, tint[0], tint[1], tint[2], tint[3]);
          }

          if (colorMapLUT && info.componentCount === 1) {
            // colorMap takes priority: skip grayscale for single-band images
            applyColorMap(decoded.data, decoded.width, decoded.height, colorMapLUT);
          } else if (grayscale) {
            applyGrayscale(decoded.data, decoded.width, decoded.height);
          }

          if (colormap && info.componentCount === 1) {
            const d = decoded.data;
            for (let p = 0; p < d.length; p += 4) {
              const [r, g, b] = colormap(d[p]);
              d[p] = r;
              d[p + 1] = g;
              d[p + 2] = b;
            }
          }

          if (bands && info.componentCount >= 3) {
            // Re-decode raw tile with band remapping
            // decoded.data is already RGBA; we need to re-read from the raw decoded buffer
            // Since decodedBufferToRGBA already mapped channels, we apply bands by
            // re-interpreting: the RGBA buffer has channels packed as component-order.
            // For componentCount>=3, pixel i has R=comp0, G=comp1, B=comp2 in decoded.data.
            // We remap so that output R=comp[bands[0]], G=comp[bands[1]], B=comp[bands[2]].
            // We can do this by reading from the raw data if available, but decoded.data
            // is already converted. We need to work with the raw buffer from the provider.
            // Actually, the decoded.data from getTile already has RGBA conversion done.
            // For bands remapping, we need the raw component data.
            // Let's remap using the existing RGBA data as a source of the original channels.
            // With componentCount=3, decoded.data[i*4+0]=ch0, [i*4+1]=ch1, [i*4+2]=ch2.
            // For componentCount=4, decoded.data[i*4+0]=ch0, [i*4+1]=ch1, [i*4+2]=ch2, [i*4+3]=ch3.
            // We can remap in-place by first copying the original channels per pixel.
            const d = decoded.data;
            const pixelCount = decoded.width * decoded.height;
            const validBands = bands.every(b => b >= 0 && b < info.componentCount);
            if (!validBands) {
              debugWarn(`bands indices ${JSON.stringify(bands)} out of range for ${info.componentCount} components, using default mapping`);
            } else {
              for (let i = 0; i < pixelCount; i++) {
                const off = i * 4;
                const ch0 = d[off];
                const ch1 = d[off + 1];
                const ch2 = d[off + 2];
                const ch3 = info.componentCount >= 4 ? d[off + 3] : 0;
                const channels = [ch0, ch1, ch2, ch3];
                d[off] = channels[bands[0]];
                d[off + 1] = channels[bands[1]];
                d[off + 2] = channels[bands[2]];
                d[off + 3] = 255; // alpha
              }
            }
          }

          if (flip && (flip.horizontal || flip.vertical)) {
            applyFlip(decoded.data, decoded.width, decoded.height, !!flip.horizontal, !!flip.vertical);
          }

          if (onTileLoad) {
            onTileLoad({ col, row, decodeLevel });
          }
          progressLoaded++;
          emitProgress();

          const canvas = document.createElement('canvas');
          canvas.width = DISPLAY_TILE_SIZE;
          canvas.height = DISPLAY_TILE_SIZE;
          const ctx = canvas.getContext('2d')!;

          const sx = subCol * DISPLAY_TILE_SIZE;
          const sy = subRow * DISPLAY_TILE_SIZE;
          const sw = Math.min(DISPLAY_TILE_SIZE, decoded.width - sx);
          const sh = Math.min(DISPLAY_TILE_SIZE, decoded.height - sy);

          if (sw > 0 && sh > 0) {
            const fullImage = new ImageData(
              new Uint8ClampedArray(decoded.data.buffer as ArrayBuffer),
              decoded.width,
              decoded.height,
            );

            const subData = ctx.createImageData(sw, sh);
            for (let r = 0; r < sh; r++) {
              const srcOffset = ((sy + r) * decoded.width + sx) * 4;
              const dstOffset = r * sw * 4;
              subData.data.set(
                fullImage.data.subarray(srcOffset, srcOffset + sw * 4),
                dstOffset,
              );
            }
            ctx.putImageData(subData, 0, 0);
          }

          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              img.onload = () => URL.revokeObjectURL(url);
              img.src = url;
            }
          });
        } catch (err) {
          debugError(`Failed to load tile (${col},${row}) sub(${subCol},${subRow}):`, err);
          tile.setState(3);
        } finally {
          sem.release();
        }
      })();
    },
  });

  const opacity = Math.max(0, Math.min(1, options?.initialOpacity ?? 1.0));
  const visible = options?.visible ?? true;

  const zIndex = options?.zIndex;
  const preload = options?.preload ?? 0;
  const className = options?.className;
  const minZoom = options?.minZoom;
  const maxZoom = options?.maxZoom;
  const maxResolution = options?.maxResolution;
  const minResolution = options?.minResolution;
  const updateWhileAnimating = options?.updateWhileAnimating;
  const updateWhileInteracting = options?.updateWhileInteracting;
  const background = options?.background;
  const useInterimTilesOnError = options?.useInterimTilesOnError;
  const properties = options?.properties;
  const renderBuffer = options?.renderBuffer;
  const interpolate = options?.interpolate;

  const layerExtent = options?.extent;
  const layer = geoInfo
    ? new TileLayer({ source, extent: layerExtent, opacity, visible, zIndex, preload, className, minZoom, maxZoom, maxResolution, minResolution, updateWhileAnimating, updateWhileInteracting, background, useInterimTilesOnError, properties, renderBuffer, interpolate })
    : new TileLayer({ source, extent: layerExtent ?? extent, opacity, visible, zIndex, preload, className, minZoom, maxZoom, maxResolution, minResolution, updateWhileAnimating, updateWhileInteracting, background, useInterimTilesOnError, properties, renderBuffer, interpolate });

  const destroy = () => {
    provider.destroy();
  };

  return { layer, info, projection, extent, resolutions, destroy };
}
