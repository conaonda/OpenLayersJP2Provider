# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
