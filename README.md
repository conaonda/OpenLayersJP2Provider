# OpenLayersJP2Provider

OpenLayers 기반 JPEG 2000(JP2) 타일 뷰어 라이브러리.

HTTP Range 요청으로 JP2 파일을 타일 단위로 부분 디코딩하여 OpenLayers 지도에 오버레이합니다.

## 주요 기능

- JP2 파일의 타일 인덱스를 IndexedDB에 캐시 (TTL: 24시간)
- HTTP Range 요청으로 필요한 타일만 다운로드
- WebAssembly(openjpeg) 기반 JP2 디코딩
- WebWorker 풀을 통한 병렬 디코딩
- GeoTIFF GeoInfo 기반 좌표 변환 (proj4)

## 설치 및 실행

```bash
npm install
npm run dev    # 개발 서버 (Vite)
npm run build  # 빌드
npm test       # 단위 테스트 (Vitest)
npx playwright test  # E2E 테스트
```

## 주요 모듈

| 파일 | 설명 |
|------|------|
| `src/source.ts` | OpenLayers TileSource 생성 |
| `src/range-tile-provider.ts` | HTTP Range 요청으로 JP2 타일 데이터 조회, IndexedDB 캐시 관리 |
| `src/codestream-builder.ts` | JP2 단일 타일 codestream 조립 유틸리티 |
| `src/decoder.ts` | JP2 디코딩 오케스트레이터 |
| `src/decode-worker.ts` | WebWorker: openjpeg 디코딩 실행 |
| `src/worker-pool.ts` | WebWorker 풀 관리 |
| `src/jp2-parser.ts` | JP2/JPEG2000 파일 파싱 |
| `src/pixel-conversion.ts` | 픽셀 데이터 변환 유틸리티 |
| `src/debug-logger.ts` | 조건부 디버그 로거 (`setDebug`로 on/off) |
| `src/index.ts` | 라이브러리 공개 API 진입점 |

## API

### `createJP2TileLayer`

```typescript
// TileProvider 객체 전달
const result = await createJP2TileLayer(provider, options);

// URL 문자열 직접 전달 (내부에서 RangeTileProvider 자동 생성)
const result = await createJP2TileLayer('path/to/file.jp2', options);
```

#### 옵션 (`JP2LayerOptions`)

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `maxConcurrentTiles` | `number` | `4` | 동시 타일 로드 최대 수 |
| `projectionResolver` | `(epsgCode: number) => Promise<string \| null>` | epsg.io fetch | EPSG 코드에 대한 proj4 문자열 resolver |
| `minValue` | `number` | 자동 계산 | 픽셀 정규화 최소값 (16비트 이미지용) |
| `maxValue` | `number` | 자동 계산 | 픽셀 정규화 최대값 (16비트 이미지용) |
| `tileRetryCount` | `number` | `0` | 타일 로드 실패 시 재시도 횟수 |
| `tileRetryDelay` | `number` | `500` | 재시도 초기 delay (ms). exponential backoff 적용: `delay * 2^attempt` |
| `tileRetryMaxDelay` | `number` | `5000` | 재시도 최대 delay 상한 (ms) |
| `onTileError` | `(info: { col, row, decodeLevel, error }) => void` | - | 모든 재시도 소진 후 최종 실패 시 호출되는 콜백 |
| `onTileLoad` | `(info: { col, row, decodeLevel }) => void` | - | 타일 디코딩 성공 시 호출되는 콜백 |
| `onProgress` | `(info: { loaded, total, failed }) => void` | - | 타일 로드 진행률 콜백 (loaded+failed === total 시 완료) |
| `tileLoadTimeout` | `number` | - | 개별 타일 로드 타임아웃 (ms). 초과 시 `Error('Tile load timeout')` throw. 미지정 시 타임아웃 없음 |
| `initialOpacity` | `number` | `1.0` | 레이어 초기 투명도 (0.0 ~ 1.0) |
| `requestHeaders` | `Record<string, string>` | - | HTTP 요청에 추가할 커스텀 헤더. URL 문자열로 호출 시 `RangeTileProvider`에 전달 |
| `colormap` | `(value: number) => [r, g, b]` | - | 단채널(grayscale) 이미지에 적용할 컬러맵 함수. 0~255 픽셀 값을 RGB로 변환 (`componentCount === 1`에만 적용) |
| `colorBalance` | `[number, number, number]` | - | RGB 채널별 색상 균형 조정 `[R, G, B]`. 각 값은 -255~255 범위의 가산 오프셋. 예: `[20, 0, -20]`은 붉은 계열 강조 |
| `exposure` | `number` | `1.0` | 승산 방식 밝기 보정. `1.0`=변화 없음, `>1.0` 밝아짐, `<1.0` 어두워짐. 예: `1.5`는 50% 밝기 증가 |
| `onTileLoadStart` | `(info: { col, row, decodeLevel }) => void` | - | 타일 로드 시작 시 호출되는 콜백 (`sem.acquire` 이후, `getTile` 직전) |
| `attributions` | `string \| string[]` | - | OpenLayers TileImage 소스에 표시할 저작권/출처 정보 |
| `attributionsCollapsible` | `boolean` | `true` | 저작권 표기 패널의 접기 버튼 표시 여부. `false`로 설정 시 항상 펼쳐진 상태로 고정 |
| `bands` | `[r, g, b]` | - | 다중 채널 이미지에서 RGB에 매핑할 밴드 인덱스 (0-based). 예: `[3, 2, 1]`. `componentCount >= 3`에만 적용 |
| `visible` | `boolean` | `true` | 레이어 초기 가시성. `false`로 설정 시 레이어가 숨겨진 상태로 생성됨 |
| `zIndex` | `number` | - | 레이어 렌더링 순서. 숫자가 클수록 위에 렌더링 (OpenLayers 표준 `zIndex` 옵션) |
| `preload` | `number` | `0` | 저해상도 타일 미리 로드 레벨 수. `Infinity`로 전체 피라미드 미리 로드 가능 |
| `className` | `string` | `'ol-layer'` | 레이어 DOM 요소에 적용할 CSS 클래스명. 복수 레이어 CSS 개별 제어에 활용 |
| `minZoom` | `number` | - | 레이어가 표시되는 최소 줌 레벨. 이 레벨 미만에서는 레이어가 숨김 |
| `maxZoom` | `number` | - | 레이어가 표시되는 최대 줌 레벨. 이 레벨 초과 시 레이어가 숨김 |
| `maxResolution` | `number` | - | 레이어가 표시되는 최대 해상도 (map units per pixel). 이 해상도 초과 시 숨김 |
| `minResolution` | `number` | - | 레이어가 표시되는 최소 해상도 (map units per pixel). 이 해상도 미만 시 숨김 |
| `updateWhileAnimating` | `boolean` | `false` | 애니메이션 중 타일 업데이트 여부. `true` 시 패닝/줌 애니메이션 중에도 타일 업데이트 |
| `updateWhileInteracting` | `boolean` | `false` | 인터랙션 중 타일 업데이트 여부. `true` 시 드래그/핀치 줌 중에도 타일 업데이트 |
| `background` | `BackgroundColor` | - | 레이어 배경색. 타일이 없는 영역에 표시할 색상 (CSS 색상 문자열 또는 줌 레벨별 함수) |
| `useInterimTilesOnError` | `boolean` | `true` | 타일 로드 오류 시 임시 타일(하위 해상도) 표시 여부. `false` 시 오류 타일 대신 빈 타일 표시 |
| `properties` | `Record<string, unknown>` | - | 레이어에 설정할 임의의 키-값 속성. `layer.get(key)`로 조회 가능 |
| `renderBuffer` | `number` | `100` | 뷰포트 경계 바깥으로 미리 렌더링할 픽셀 수. 빠른 패닝 시 타일 공백을 줄인다 |
| `interpolate` | `boolean` | `true` | 타일 렌더링 시 보간(interpolation) 방식 제어. `false` 설정 시 nearest-neighbor 보간 적용 (픽셀 선명도 유지) |
| `cacheTTL` | `number` | `86400000` (24시간) | IndexedDB 타일 인덱스 캐시 TTL (밀리초). URL 문자열로 호출 시 `RangeTileProvider`에 전달 |
| `maxConcurrency` | `number` | WorkerPool 기본값 | 디코딩 WebWorker 풀 크기. URL 문자열로 호출 시 `RangeTileProvider`에 전달 |
| `transition` | `number` | `250` | 타일 페이드인 애니메이션 지속 시간 (ms). `0`으로 설정 시 애니메이션 없이 즉시 표시 |
| `cacheSize` | `number` | `512` | 레이어 내부 인메모리 타일 캐시 크기. 대용량 JP2나 고해상도 뷰에서 재디코딩을 줄이려면 값을 늘린다 |
| `wrapX` | `boolean` | `true` | 타일 소스의 경도 방향(X축) 반복 렌더링 여부. `false`로 설정하면 원본 범위 외부에서 타일이 반복 표시되지 않음 |
| `crossOrigin` | `string \| null` | `undefined` | CORS 크로스오리진 설정. 다른 오리진에서 JP2 파일을 서빙할 때 canvas 픽셀 접근을 위해 필요 (예: `'anonymous'`, `'use-credentials'`) |
| `extent` | `[number, number, number, number]` | JP2 파일 범위 | 레이어가 렌더링될 지리 범위 `[minX, minY, maxX, maxY]`. 지정 시 해당 범위 내에서만 타일이 렌더링되며, 좌표는 레이어 투영계 단위를 따름 |
| `tilePixelRatio` | `number` | `1` | HiDPI/Retina 디스플레이용 타일 픽셀 비율. `2`로 설정 시 2배 해상도 타일 요청. `TileImage` 소스의 `tilePixelRatio` 옵션에 전달 |
| `reprojectionErrorThreshold` | `number` | `0.5` | 타일 재투영 시 허용되는 최대 픽셀 오차 임계값. 낮을수록 정확하지만 성능 비용 증가. `TileImage` 소스의 `reprojectionErrorThreshold` 옵션에 전달 |
| `opaque` | `boolean` | `false` | 타일 소스가 불투명함을 렌더러에 알리는 힌트. `true`로 설정하면 하위 레이어 렌더링 생략 최적화 가능. `TileImage` 소스의 `opaque` 옵션에 전달 |
| `tileSize` | `number` | `256` | 디스플레이 타일 크기 (픽셀). 기본값 256. 고해상도 디스플레이나 성능 튜닝에 활용 |
| `nodata` | `number` | `undefined` | 투명하게 처리할 픽셀 값. 지정된 값과 일치하는 픽셀의 알파 채널을 0으로 설정하여 투명하게 렌더링 |
| `nodataTolerance` | `number` | `0` | nodata 값 매칭 허용 오차. `\|pixel - nodata\| <= tolerance` 조건으로 매칭. 16비트→8비트 양자화 오차 보정에 유용 |
| `gamma` | `number` | `1.0` | 픽셀 감마 보정 값. 1보다 크면 밝아지고, 1보다 작으면 어두워짐. `out = 255 × (in/255)^(1/gamma)` 공식 적용 |
| `brightness` | `number` | `0` | 픽셀 밝기 조정 (-1 ~ 1). `out = in + brightness × 255` 공식 적용. 양수면 밝아지고 음수면 어두워짐 |
| `contrast` | `number` | `1.0` | 픽셀 대비 조정. `out = (in - 128) × contrast + 128`. 1보다 크면 대비 증가, 0~1이면 감소 |
| `saturation` | `number` | `1.0` | 픽셀 채도 조정. 0이면 흑백, 1보다 크면 채도 증가 |
| `hue` | `number` | `0` | 색조 회전 각도 (도). 180이면 보색 |
| `invert` | `boolean` | `false` | 픽셀 색상 반전. `out = 255 - in` |
| `threshold` | `number` | `undefined` | luminance 기준 임계값 이진화 (0~255). 지정 시 흑백 변환 |
| `colorize` | `[r, g, b]` | `undefined` | 그레이스케일 이미지 색상화 (각 0~255). luminance 기반 착색 |
| `sharpen` | `number` | `0` | 언샤프 마스킹 선명화 강도 (0.0~1.0). 3×3 가우시안 블러 기반 |
| `blur` | `number` | `0` | 가우시안 블러 스무딩 적용 횟수. 3×3 커널 반복 적용 |
| `sepia` | `number` | `0` | 세피아 톤 효과 강도 (0~1). 0=원본, 1=완전 세피아 |
| `grayscale` | `boolean` | `false` | RGB 이미지를 그레이스케일로 변환. ITU-R BT.709 가중치 사용 |
| `colorMap` | `Array<[r, g, b]>` | `undefined` | 단채널 데이터에 적용할 256엔트리 컬러 룩업 테이블 |
| `posterize` | `number` | `0` | 포스터라이즈 색상 레벨 수 (2~256). 각 RGB 채널의 색상 단계 제한 |
| `vignette` | `number` | `0` | 비네트 효과 강도 (0~1). 이미지 가장자리를 점진적으로 어둡게 처리 |
| `edgeDetect` | `boolean` | `false` | Laplacian 엣지 검출 필터 적용 |
| `emboss` | `boolean` | `false` | 엠보스(양각) 효과 적용 |
| `pixelate` | `number` | `undefined` | 픽셀화(블록 모자이크) 효과의 블록 크기 (px). 2 이상 시 활성화 |
| `channelSwap` | `[r, g, b]` | `undefined` | RGB 채널 순서 변경. 예: `[2,1,0]`은 BGR→RGB 변환 |
| `colorBalance` | `[r, g, b]` | `undefined` | RGB 채널별 색상 균형 조정 (각 -255~255). 각 채널에 가산 |
| `exposure` | `number` | `1.0` | 승산 방식 밝기 보정. `>1.0` 밝아짐, `<1.0` 어두워짐. `out = clamp(in × exposure, 0, 255)` |
| `levels` | `{ inputMin?: number; inputMax?: number }` | `{ inputMin: 0, inputMax: 255 }` | 픽셀 입력 레벨 범위 재매핑. `[inputMin, inputMax]` → `[0, 255]` 선형 재매핑, 범위 밖 값 클램핑 |
| `noise` | `number` | `0` | 랜덤 노이즈 강도 (0~255). 각 RGB 채널에 `[-noise, +noise]` 균등 분포 랜덤값 가산 |
| `tint` | `[r, g, b, strength?]` | - | 색조 오버레이 블렌딩. `[R, G, B, strength]` (strength: 0~1, 기본값 0.5). 원본과 지정 색상 블렌딩 |
| `outputLevels` | `{ outputMin?: number; outputMax?: number }` | `{ outputMin: 0, outputMax: 255 }` | 픽셀 출력 레벨 범위 재매핑. `[0, 255]` → `[outputMin, outputMax]` 선형 재매핑 |
| `temperature` | `number` | `0` | 색 온도 조정 (-100 ~ +100). 양수=난색(주황빛), 음수=한색(파란빛) |
| `flip` | `{ horizontal?: boolean; vertical?: boolean }` | - | 이미지 반전. `horizontal`=좌우 반전, `vertical`=상하 반전 |
| `vibrance` | `number` | `0` | 저채도 색상에 선택적 채도 증폭 (-1 ~ 1). 이미 채도가 높은 색상에는 적게 적용 |
| `curves` | `{ all?: number[]; r?: number[]; g?: number[]; b?: number[] }` | `undefined` | 채널별 톤 커브(256-entry LUT) 적용. `all`은 모든 채널, `r`/`g`/`b`는 개별 채널 |
| `duotone` | `{ shadows: [r,g,b]; highlights: [r,g,b] }` | `undefined` | 두 가지 색상(shadows/highlights) 그라디언트 톤 매핑. 픽셀 휘도에 따라 두 색상 사이를 선형 보간 |
| `dodge` | `number` | `0` | 하이라이트 밝기 증폭(닷지) 효과 (0 ~ 1). 밝은 픽셀일수록 더 많이 밝아짐 |
| `burn` | `number` | `0` | 섀도우 어둡기 증폭(번) 효과 (0 ~ 1). 어두운 픽셀일수록 더 많이 어두워짐 |
| `solarize` | `number` | `128` | 솔라리제이션 효과 임계값 (0~255). 임계값 이상의 채널 값을 반전 |
| `shadowsHighlights` | `{ shadows?: number; highlights?: number }` | `{ shadows: 0, highlights: 0 }` | 섀도우/하이라이트 독립 밝기 조정 (각 -100~100). shadows=어두운 영역, highlights=밝은 영역 |
| `clarity` | `number` | `0` | 로컬 콘트라스트 강화(clarity) 효과 강도 (0~100). 중간 톤 영역의 디테일 선명도 향상 |
| `crossProcess` | `number` | `0` | 크로스 프로세싱 효과 (0 ~ 1). 슬라이드 필름을 네거티브 현상액으로 처리한 것처럼 채널별 S커브/리프트/크러시 적용 |
| `grainFilm` | `number` | `0` | 필름 그레인 텍스처 효과 (0 ~ 1). 어두운 영역에 더 강한 그레인 노이즈 추가로 실제 필름 질감 시뮬레이션 |
| `halftone` | `number` | `0` | 하프톤 점 패턴 효과 (도트 크기, 픽셀 단위). 셀 평균 휘도에 따라 원형 도트 크기 조절, 2 미만이면 변화 없음 |
| `histogramEqualize` | `boolean` | `false` | 각 RGB 채널별 히스토그램 평활화. 저대비 원격탐사 JP2 이미지의 가시성 향상 |
| `colorGrade` | `{ shadows?: [number, number, number]; highlights?: [number, number, number]; balance?: number; strength?: number }` | `undefined` | 섀도우/하이라이트 영역에 독립적 색조를 적용하는 스플릿 토닝 효과 |
| `colorMatrix` | `number[]` | `undefined` | 4×4 선형 색상 변환 행렬 (row-major 16개 원소). 각 픽셀의 [R,G,B,A]에 행렬 곱 적용 후 0~255 클램프. 채널 믹싱·색공간 보정에 활용. 길이가 16이 아니면 무시 |
| `autoContrast` | `boolean` | `false` | 타일별 자동 대비 스트레칭. 각 RGB 채널의 min/max를 0~255로 선형 재매핑하여 대비 자동 최적화 |

#### 반환값 (`JP2LayerResult`)

| 속성 | 타입 | 설명 |
|------|------|------|
| `layer` | `TileLayer<TileImage>` | OpenLayers 레이어 |
| `info` | `TileProviderInfo` | JP2 파일 메타데이터 |
| `projection` | `Projection` | 좌표계 |
| `extent` | `[number, number, number, number]` | 범위 |
| `resolutions` | `number[]` | 해상도 목록 |
| `destroy` | `() => void` | 내부 리소스(WebWorker 풀) 해제 |

```typescript
const { layer, projection, extent, destroy } = await createJP2TileLayer(provider);

// URL 문자열로 간편하게 생성 (requestHeaders와 함께 사용)
const { layer } = await createJP2TileLayer('path/to/file.jp2', {
  requestHeaders: { Authorization: 'Bearer token' },
});

// 사용 완료 후 리소스 해제
destroy();
```

### `RangeTileProvider`

JP2 파일을 Range 요청으로 분할 조회하는 타일 프로바이더.

```typescript
const provider = new RangeTileProvider(url, options);
```

#### 생성자 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `cacheTTL` | `number` | `86400000` (24시간) | IndexedDB 캐시 TTL (밀리초) |
| `requestHeaders` | `Record<string, string>` | - | JP2 파일 fetch 시 추가할 HTTP 헤더 (인증 토큰 등). `Range` 헤더는 항상 마지막에 적용되어 덮어쓸 수 없음 |

```typescript
// TTL을 1시간으로 설정
const provider = new RangeTileProvider(url, { cacheTTL: 60 * 60 * 1000 });

// 인증 헤더 추가
const provider = new RangeTileProvider(url, {
  requestHeaders: { Authorization: 'Bearer <token>' },
});
```

#### 정적 메서드

```typescript
// URL에 해당하는 IndexedDB 캐시를 수동으로 무효화
await RangeTileProvider.invalidateCache(url: string): Promise<void>
```

#### IndexedDB 캐시

- JP2 타일 인덱스를 `jp2-tile-index` DB (버전 2)에 저장
- 기본 TTL: 24시간 (만료 시 자동 삭제 후 재파싱)
- `cacheTTL` 옵션으로 TTL 커스텀 가능
- `invalidateCache(url)`로 수동 무효화 가능

### `WorkerPool`

WebWorker 풀을 통해 JP2 디코딩 작업을 병렬 처리합니다.

- 워커 오류 발생 시 해당 pending task를 `reject()`으로 처리
- `destroy()` 호출 시 큐 대기 및 pending task 모두 reject 처리

### `buildTileCodestream`

```typescript
import { buildTileCodestream } from './codestream-builder';

const codestream = buildTileCodestream(mainHeader, tileData, width, height);
```

SIZ 마커를 패치하고 EOC를 추가하여 단일 타일 JP2 codestream을 조립합니다.

### `setDebug` / `debugLog` / `debugWarn`

```typescript
import { setDebug } from './debug-logger';

setDebug(true);  // [JP2] 프리픽스로 콘솔 출력 활성화
setDebug(false); // 콘솔 출력 비활성화 (기본값)
```

- 기본값 `false` — 프로덕션 빌드에서 콘솔 출력 없음
- `setDebug(true)` 호출 후 라이브러리 내부의 `debugLog`/`debugWarn`이 `[JP2]` 프리픽스와 함께 출력됨
- 실제 오류(`console.error`)도 `setDebug(false)`에서 억제됨 (sprint 3부터)

### Public API (`src/index.ts`)

라이브러리로 사용 시 `src/index.ts`를 통해 공개 API를 import합니다.

```typescript
import { setDebug, createJP2TileLayer, RangeTileProvider, JP2Decoder } from 'openlayers-jp2provider';
import type {
  JP2LayerResult,
  JP2LayerOptions,
  TileProvider,
  TileProviderInfo,
  GeoInfo,
  DecodeResult,
} from 'openlayers-jp2provider';

// 디버그 로그 활성화
setDebug(true);

// JP2 레이어 생성 (커스텀 TTL 및 동시 로드 수 설정)
const provider = new RangeTileProvider('path/to/file.jp2', { cacheTTL: 60 * 60 * 1000 });
const { layer, projection, extent, destroy } = await createJP2TileLayer(provider, {
  maxConcurrentTiles: 8,
});

// 사용 완료 후 리소스 해제
destroy();

// JP2Decoder 직접 사용
const decoder = new JP2Decoder();
const result: DecodeResult = await decoder.decode(jp2Data);
```
