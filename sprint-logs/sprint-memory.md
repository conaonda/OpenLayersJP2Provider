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

## 최근 3개 스프린트 요약
### Sprint 11 (2026-03-10)
- 완료: PR #49(tileLoadTimeout), PR #47(docs sprint-10) 머지, 이슈 #48 닫힘, 단위 테스트 84개 전체 통과
- 발견된 문제: Promise.race 패턴에서 setTimeout 타이머 누수 — new Promise + clearTimeout 패턴으로 수정 (PR #49 재커밋)

### Sprint 10 (2026-03-10)
- 완료: PR #46(onProgress/initialOpacity), PR #43(docs sprint-9) 머지, 이슈 #44 #45 닫힘, 단위 테스트 77개 전체 통과
- 발견된 문제: progressTotal이 sem.acquire() 이전에 증가 — 의도된 설계로 허용, 카운터 리셋 없음 — 현재 사용 패턴상 무관

### Sprint 9 (2026-03-10)
- 완료: PR #42(onTileLoad), PR #40(docs sprint-8) 머지, 이슈 #41 닫힘
- 발견된 문제: 없음
