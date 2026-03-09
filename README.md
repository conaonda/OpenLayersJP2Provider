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
