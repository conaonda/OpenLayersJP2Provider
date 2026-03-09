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

### `RangeTileProvider`

JP2 파일을 Range 요청으로 분할 조회하는 타일 프로바이더.

```typescript
const provider = new RangeTileProvider(url, options);
```

#### 정적 메서드

```typescript
// URL에 해당하는 IndexedDB 캐시를 수동으로 무효화
await RangeTileProvider.invalidateCache(url: string): Promise<void>
```

#### IndexedDB 캐시

- JP2 타일 인덱스를 `jp2-tile-index` DB (버전 2)에 저장
- 기본 TTL: 24시간 (만료 시 자동 삭제 후 재파싱)
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

### `createJP2TileLayer`

```typescript
createJP2TileLayer(provider: TileProvider, options?: JP2LayerOptions): Promise<JP2LayerResult>
```

JP2 타일 레이어를 생성합니다. `options`는 선택적이며, 생략 시 기본값이 적용됩니다.

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `maxConcurrentTiles` | `number` | `4` | 동시 타일 로드 최대 수 |
| `projectionResolver` | `(epsgCode: number) => Promise<string \| null>` | epsg.io fetch | 커스텀 proj4 문자열 resolver |

### `JP2Decoder`

```typescript
import { JP2Decoder } from 'openlayers-jp2provider';
import type { DecodeResult } from 'openlayers-jp2provider';

const decoder = new JP2Decoder();
const result: DecodeResult = await decoder.decode(arrayBuffer);
// result: { data: Uint8ClampedArray, width: number, height: number }
```

### Public API (`src/index.ts`)

라이브러리로 사용 시 `src/index.ts`를 통해 공개 API를 import합니다.

```typescript
import { setDebug, createJP2TileLayer, RangeTileProvider, JP2Decoder } from 'openlayers-jp2provider';
import type { JP2LayerResult, JP2LayerOptions, DecodeResult, TileProvider, TileProviderInfo, GeoInfo } from 'openlayers-jp2provider';

// 디버그 로그 활성화
setDebug(true);

// JP2 레이어 생성 (기본 옵션)
const provider = new RangeTileProvider('path/to/file.jp2');
const { layer, projection, extent } = await createJP2TileLayer(provider);

// JP2 레이어 생성 (커스텀 옵션)
const options: JP2LayerOptions = {
  maxConcurrentTiles: 8,                          // 동시 타일 로드 수 (기본값: 4)
  projectionResolver: async (epsgCode) => {       // 커스텀 proj4 resolver
    const resp = await fetch(`/my-proxy/${epsgCode}.proj4`);
    return resp.text();
  },
};
const { layer: layer2 } = await createJP2TileLayer(provider, options);

// JP2Decoder 직접 사용
const decoder = new JP2Decoder();
const result: DecodeResult = await decoder.decode(arrayBuffer);
```
