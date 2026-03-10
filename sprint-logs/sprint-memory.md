# Sprint Memory — conaonda/OpenLayersJP2Provider

## 기술 스택 & 아키텍처 결정
- IndexedDB 타일 인덱스 캐시: IDB_VERSION 2, TTL + URL 기반 무효화 적용
- WebWorker 풀: activeTask 맵으로 워커별 pending 작업 추적 (오류 시 reject 보장)
- buildTileCodestream: range-tile-provider.ts와 decoder.ts 공통 함수로 추출
- debug-logger.ts: setDebug()/debugLog()/debugWarn() 모듈로 프로덕션 로그 조건화, 기본값 silent
- JP2Decoder, DecodeResult: public API(index.ts)에서 export — 외부 라이브러리 사용자가 직접 디코더 활용 가능
- JP2LayerOptions: createJP2TileLayer에 options 파라미터 추가 (maxConcurrency, projectionResolver)
- JP2LayerResult.destroy(): decoder.destroy() 위임 패턴으로 WebWorker 풀 해제 지원
- RangeTileProvider cacheTTL: 생성자 옵션으로 IndexedDB TTL 커스터마이징 가능 (기본값 유지)
- JP2LayerOptions.minValue/maxValue: 픽셀 정규화 범위 옵션 (미지정 시 자동 계산 폴백)
- JP2LayerOptions.tileRetryCount: 타일 로드 실패 시 재시도 횟수 옵션 (기본값: 0, delay 없음)
- JP2LayerOptions.onProgress: 타일 로드 진행률 콜백 (loaded/total 카운터, sem.acquire() 이전에 total 증가)
- JP2LayerOptions.initialOpacity: 레이어 초기 투명도 옵션 (0~1 클램프 처리)
- JP2LayerOptions.tileLoadTimeout: 타일 로드 타임아웃 옵션 (ms), Promise.race 대신 new Promise + clearTimeout 패턴으로 타이머 누수 방지
- RangeTileProvider.requestHeaders: fetchRange 호출 시 커스텀 HTTP 헤더 병합 옵션, Range 헤더 덮어쓰기 방지 로직 포함 (PR #52)
- JP2LayerOptions.requestHeaders: createJP2TileLayer에서 RangeTileProvider로 헤더 전달 옵션 추가, _decodeTile 버그 수정 포함 (PR #55)
- createJP2TileLayer: URL string 오버로드 추가 — options 없이 url만 전달 가능
- JP2LayerOptions.attributions: OL TileImage에 저작권 표기 전달 옵션 (string | string[])
- JP2LayerOptions.bands: 다중 채널 이미지에서 렌더링할 밴드 인덱스 배열 옵션, 유효 범위 벗어나면 무시
- JP2LayerOptions.visible: 레이어 초기 가시성 옵션 (boolean, 기본값 true), OL TileLayer의 visible 옵션에 전달 (PR #69)
- JP2LayerOptions.zIndex: 레이어 렌더링 순서 옵션 (number), OL TileLayer의 zIndex 옵션에 전달 (PR #72)
- JP2LayerOptions.preload: 저해상도 타일 미리 로드 레벨 옵션 (number), OL TileLayer의 preload 옵션에 전달 (PR #75)

## 반복 패턴 & 주의사항
- 동일 작성자 PR은 GitHub 정책상 공식 approve 불가 → 리뷰 코멘트로 대체
- range-tile-provider.ts를 동시에 수정하는 PR은 머지 순서에 따라 충돌 가능
- module-private 함수는 단위 테스트 불가 → 공개 API 경유 검증으로 대체
- fake-indexeddb를 devDependency로 추가하여 IDB 테스트 환경 구성
- 선행 PR 머지 후 후행 PR이 충돌 상태가 될 수 있음 → rebase 후 force-with-lease push 필요
- docs 브랜치 PR은 feature PR 머지 후 충돌 가능 → sprint 종료 시 통합 문서 PR로 대체 권장

## 기술 부채 목록
- [x] tsc 타입 에러 4개 잔존 (SharedArrayBuffer/ArrayBuffer 호환성) — PR #12로 해결
- [ ] decoder.ts의 decodeTile()은 현재 미사용 상태이나 public API로 유지 중
- [ ] setDebug()를 라이브러리 public API로 export 고려 (현재는 main.ts에서만 호출)
- [x] tileRetryCount 재시도 간 delay 없음 — Sprint 8에서 exponential backoff(onTileError 콜백 포함) PR #39로 해결
- [x] JP2LayerOptions에 requestHeaders 옵션 미포함 — PR #55로 해결 (Sprint 13)

## 최근 3개 스프린트 요약
### Sprint 18 (2026-03-10)
- 완료: PR #75(preload 옵션), PR #73(docs sprint-17) 머지, 이슈 #74 닫힘, 단위 테스트 11개 전체 통과
- 발견된 문제: 없음

### Sprint 17 (2026-03-10)
- 완료: PR #72(zIndex 옵션), PR #70(docs sprint-16) 머지, 이슈 #71 닫힘, 단위 테스트 7개(zIndex) 전체 통과
- 발견된 문제: 없음

### Sprint 16 (2026-03-10)
- 완료: PR #69(visible 옵션), PR #67(docs sprint-15) 머지, 이슈 #68 닫힘, 단위 테스트 118개 전체 통과
- 발견된 문제: docs PR #67이 feature PR 머지 후 충돌 → rebase 후 force-with-lease push로 해결
