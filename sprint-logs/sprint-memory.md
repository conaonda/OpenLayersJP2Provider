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
- [ ] tileRetryCount 재시도 간 delay 없음 — 향후 exponential backoff 개선 고려

## 최근 3개 스프린트 요약
### Sprint 7 (2026-03-10)
- 완료: PR #34(minValue/maxValue), PR #35(tileRetryCount), PR #36(docs sprint 6+7) 머지, 이슈 #32 #33 닫힘
- 발견된 문제: PR #35가 #34 머지 후 충돌 → rebase로 해결, docs PR #31이 feature 커밋 포함으로 충돌 → 닫고 #36으로 통합

### Sprint 6 (2026-03-10)
- 완료: PR #30(feat/28-destroy-method) 머지, 이슈 #28 #29 닫힘, 단위 테스트 40개 전체 통과
- 발견된 문제: docs PR #27이 PR #30 머지 후 충돌 → 닫음, Sprint 7 문서 PR에서 통합

### Sprint 5 (2026-03-10)
- 완료: PR #25(feat/23-export-jp2decoder-decoderesult), PR #26(feat/24-create-jp2tilelayer-options) 머지, 이슈 #23 #24 닫힘
- 발견된 문제: docs PR #22가 충돌 상태로 머지 불가 → 닫고 sprint-5 문서 PR에서 통합 예정
