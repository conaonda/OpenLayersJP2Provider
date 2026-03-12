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
| `onTileLoadStart` | `(info: { col, row, decodeLevel }) => void` | - | 타일 로드 시작 시 호출되는 콜백 (`sem.acquire` 이후, `getTile` 직전) |
| `attributions` | `string \| string[]` | - | OpenLayers TileImage 소스에 표시할 저작권/출처 정보 |
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
