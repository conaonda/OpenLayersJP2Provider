# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
