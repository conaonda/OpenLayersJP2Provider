# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] — Sprint 15

### Added
- **`JP2LayerOptions.attributions`**: OpenLayers TileImage 소스에 저작권/출처 정보 전달 옵션 추가 (closes #64, PR #66)
  - 타입: `string | string[]`
  - OpenLayers TileImage 소스의 `attributions` 옵션에 그대로 전달
- **`JP2LayerOptions.bands`**: 다중 채널 이미지에서 특정 밴드를 RGB에 매핑하는 옵션 추가 (closes #65, PR #66)
  - 타입: `[r: number, g: number, b: number]` (0-based 인덱스)
  - 예: `[3, 2, 1]` — 4채널 이미지에서 적외선 합성 표현
  - `componentCount` 범위 초과 시 경고 후 기본 매핑 유지
  - `componentCount >= 3`인 경우에만 적용

---

## [Unreleased] — Sprint 14

### Added
- **`JP2LayerOptions.colormap`**: 단채널(grayscale) 이미지에 적용할 컬러맵 함수 옵션 추가 (closes #57, PR #60)
  - 시그니처: `(value: number) => [r: number, g: number, b: number]`
  - 0~255 픽셀 값을 RGB로 변환, 단채널 이미지(`componentCount === 1`)에만 적용
- **`JP2LayerOptions.onTileLoadStart`**: 타일 로드 시작 시 호출되는 콜백 옵션 추가 (closes #58, PR #61)
  - 시그니처: `(info: { col, row, decodeLevel }) => void`
  - `sem.acquire()` 이후, `provider.getTile()` 직전에 호출 — 타일 생명주기 추적 완성
- **`RangeTileProvider` `maxConcurrency` 옵션**: 디코딩 워커 풀 크기 제어 옵션 추가 (closes #59, PR #62)
  - `new RangeTileProvider(url, { maxConcurrency: 4 })` 형태로 WorkerPool 크기 직접 지정
  - 미지정 시 WorkerPool 기본값 유지

---

## [Unreleased] — Sprint 13

### Added
- **`JP2LayerOptions.requestHeaders`**: `createJP2TileLayer`에 커스텀 HTTP 헤더 옵션 추가 (closes #53, PR #55)
  - URL 문자열로 호출 시 내부 생성되는 `RangeTileProvider`에 자동 전달
  - `TileProvider` 객체 직접 전달 시에는 무시됨 (프로바이더에서 직접 설정 필요)
- **`createJP2TileLayer` URL 문자열 오버로드**: 첫 번째 인자로 URL string을 직접 전달 가능 (PR #55)
  - `createJP2TileLayer('path/to/file.jp2', { requestHeaders: { Authorization: 'Bearer token' } })`
  - 내부에서 `RangeTileProvider`를 자동 생성, `minValue`/`maxValue`/`requestHeaders` 옵션 전달

### Fixed
- **`RangeTileProvider._decodeTile` requestHeaders 누락 버그**: `_decodeTile` 호출 시 `requestHeaders`가 전달되지 않던 버그 수정 (PR #55)

---

## [Unreleased] — Sprint 12

### Added
- **`RangeTileProviderOptions.requestHeaders`**: `RangeTileProvider` 생성자에 커스텀 HTTP 헤더 옵션 추가 (closes #51, PR #52)
  - 생성자 시그니처: `new RangeTileProvider(url, { requestHeaders: Record<string, string> })`
  - 모든 Range 요청에 지정된 헤더 포함 (인증 토큰, CORS 등)

---

## [Unreleased] — Sprint 11

### Added
- **`JP2LayerOptions.tileLoadTimeout`**: 개별 타일 로드 타임아웃 옵션 추가 (closes #48)
  - 지정된 시간(ms) 초과 시 `Error('Tile load timeout')` throw
  - 타임아웃 오류도 기존 `tileRetryCount` 재시도 로직에 포함
  - 미지정 시 기존 동작과 동일 (타임아웃 없음)

---

## [Unreleased] — Sprint 10

### Added
- **`JP2LayerOptions.onProgress`**: 타일 로드 진행률 콜백 옵션 추가 (closes #44, PR #46)
  - 콜백 시그니처: `(info: { loaded: number; total: number; failed: number }) => void`
  - `loaded + failed === total` 조건으로 렌더링 완료 시점 감지 가능
  - 프로그레스 바 등 UI 구현에 활용 가능
- **`JP2LayerOptions.initialOpacity`**: 레이어 생성 시 초기 투명도 설정 옵션 추가 (closes #45, PR #46)
  - 범위: 0.0 ~ 1.0 (범위 밖 값은 자동 클램프)
  - 기본값: `1.0` (완전 불투명)

---

## [Unreleased] — Sprint 9

### Added
- **`JP2LayerOptions.onTileLoad`**: 타일 디코딩 성공 시 호출되는 콜백 옵션 추가 (closes #41, PR #42)
  - 콜백 시그니처: `(info: { col, row, decodeLevel }) => void`
  - `onTileError`와 대칭적인 인터페이스 제공, 로딩 진행률 UI 구현에 활용 가능

---

## [Unreleased] — Sprint 8

### Added
- **`JP2LayerOptions.onTileError`**: 모든 재시도 소진 후 최종 실패 시 호출되는 콜백 옵션 추가 (closes #39, PR #39)
  - 콜백 시그니처: `(info: { col, row, decodeLevel, error }) => void`
- **`JP2LayerOptions.tileRetryDelay`**: 재시도 초기 delay 옵션 추가 (기본값: 500ms) (closes #39, PR #39)
  - exponential backoff 적용: `delay * 2^attempt`
- **`JP2LayerOptions.tileRetryMaxDelay`**: 재시도 최대 delay 상한 옵션 추가 (기본값: 5000ms) (closes #39, PR #39)

---

## [Unreleased] — Sprint 7

### Added
- **`JP2LayerOptions.minValue` / `maxValue`**: 픽셀 정규화 최소/최대값 옵션 추가 (closes #32, PR #34)
  - 16비트 이미지 등 사용자 정의 정규화 범위 지정 가능
  - 미지정 시 자동 계산(픽셀 데이터 min/max 추론) 폴백 동작
- **`JP2LayerOptions.tileRetryCount`**: 타일 로드 실패 시 자동 재시도 옵션 추가 (closes #33, PR #35)
  - 기본값: `0` (재시도 없음), 양의 정수로 재시도 횟수 지정

---

## [Unreleased] — Sprint 6

### Added
- **`JP2LayerResult.destroy()`**: `createJP2TileLayer()`가 반환하는 결과에 `destroy()` 메서드 추가 (closes #28, PR #30)
  - `destroy()` 호출 시 내부 `TileProvider.destroy()` → `WorkerPool.destroy()` 연쇄 호출로 WebWorker 풀 해제
- **`RangeTileProvider` `cacheTTL` 옵션**: 생성자 옵션에 `cacheTTL` 추가 (closes #29, PR #30)
  - `new RangeTileProvider(url, { cacheTTL: ms })` 형태로 IndexedDB 캐시 TTL 커스텀 설정 가능
  - 기본값은 기존과 동일한 24시간

---

## [Unreleased] — Sprint 5

### Added
- **`JP2Decoder` public export**: `JP2Decoder` 클래스와 `DecodeResult` 타입을 공개 API로 export (#25, PR #25)
  - 소비자가 직접 JP2 파일을 디코딩할 수 있도록 `JP2Decoder` 직접 인스턴스화 지원
- **`JP2LayerOptions`**: `createJP2TileLayer()` 두 번째 인자로 옵션 객체 추가 (#26, PR #26)
  - `maxConcurrentTiles`: 동시 타일 로드 최대 수 (기본값: 4)
  - `projectionResolver`: EPSG 코드에 대한 proj4 문자열을 반환하는 커스텀 resolver

---

## [Unreleased] — Sprint 4

### Added
- **Vite lib mode 빌드**: `vite.config.ts` lib 모드 설정, `package.json` entry points 구성 (#21)
  - `dist/openlayers-jp2provider.js` (ESM), `dist/openlayers-jp2provider.umd.cjs` (UMD) 번들 생성
  - `package.json`에 `main`, `module`, `exports` 필드 추가

---

## [Unreleased] — Sprint 3

### Fixed
- **debug-logger**: `debugError()` 함수 추가 — `console.error`도 `setDebug()`로 제어 (#15, PR #17)
  - `source.ts`와 `worker-pool.ts`의 `console.error`를 `debugError()`로 교체
  - 모든 로그/경고/에러 출력이 `setDebug(false)`(기본값)에서 완전히 억제됨

### Added
- **Public API**: `src/index.ts` 라이브러리 진입점 추가 (#16, PR #18)
  - `setDebug`, `createJP2TileLayer`, `RangeTileProvider` 및 관련 타입 export
  - 라이브러리 소비자가 `import { setDebug } from 'openlayers-jp2provider'`로 디버그 모드 제어 가능

---

## [Unreleased] — Sprint 2

### Fixed
- **Types**: `SharedArrayBuffer`/`ArrayBuffer` 타입 호환 에러 수정 — strict 모드 tsc 에러 4개 제거 (#12)
  - `decode-worker.ts`: `ArrayBufferLike`를 `new Uint8Array()`로 감싸 복사
  - `decoder.ts`: `as ArrayBuffer` 캐스팅 적용

### Refactored
- **debug-logger**: `setDebug(true/false)`로 런타임 로그 제어 가능한 `debug-logger.ts` 모듈 추가 (#13)
  - 라이브러리 코드의 `console.log`/`console.warn`을 `debugLog`/`debugWarn`으로 교체
  - 프로덕션 빌드에서 기본적으로 콘솔 출력 없음 (`setDebug` 기본값 `false`)
  - 실제 에러는 `console.error` 유지
  - 데모(`main.ts`)에서 `setDebug(true)` 호출로 `[JP2]` 프리픽스 로그 출력

---

## [Unreleased] — Sprint 1

### Fixed
- **WorkerPool**: `onerror` 핸들러에서 처리 중이던 pending task를 `reject()`하도록 수정 (#5)
  - 워커별 활성 task ID를 추적하는 `activeTask` Map 추가
  - `destroy()` 호출 시 큐 대기 task 및 pending task 모두 reject 처리

### Refactored
- **codestream-builder**: `buildTileCodestream()` 유틸 함수를 `codestream-builder.ts`에 추출 (#6)
  - `decoder.ts`, `range-tile-provider.ts`에서 중복된 SIZ 패치 + EOC 조립 로직 제거
  - `decoder.ts`의 미사용 `tilesX` 파라미터 제거

### Added
- **IndexedDB TTL 캐시**: JP2 타일 인덱스 캐시에 TTL 및 URL 기반 무효화 추가 (#7)
  - `CachedIndex`에 `cachedAt` 타임스탬프 추가, 기본 TTL 24시간
  - TTL 만료 시 자동 삭제 후 재파싱
  - `RangeTileProvider.invalidateCache(url)` 정적 메서드로 수동 무효화 지원
  - IDB 버전 2로 마이그레이션 (기존 store 자동 재생성)
