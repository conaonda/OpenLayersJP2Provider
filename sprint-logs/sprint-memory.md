# Sprint Memory — conaonda/OpenLayersJP2Provider

## 기술 스택 & 아키텍처 결정
- IndexedDB 타일 인덱스 캐시: IDB_VERSION 2, TTL + URL 기반 무효화 적용
- WebWorker 풀: activeTask 맵으로 워커별 pending 작업 추적 (오류 시 reject 보장)
- buildTileCodestream: range-tile-provider.ts와 decoder.ts 공통 함수로 추출
- debug-logger.ts: setDebug()/debugLog()/debugWarn()/debugError() 모듈로 프로덕션 로그 조건화, 기본값 silent
- src/index.ts: 라이브러리 public API entry point — setDebug, JP2TileSource 등 export
- package.json main/module/types 필드와 vite.config.ts lib.entry 모두 src/index.ts로 통일 (PR #21)

## 반복 패턴 & 주의사항
- 동일 작성자 PR은 GitHub 정책상 공식 approve 불가 → 리뷰 코멘트로 대체
- range-tile-provider.ts를 동시에 수정하는 PR은 머지 순서에 따라 충돌 가능
- module-private 함수는 단위 테스트 불가 → 공개 API 경유 검증으로 대체
- fake-indexeddb를 devDependency로 추가하여 IDB 테스트 환경 구성
- 선행 PR 머지 후 후행 PR이 충돌 상태가 될 수 있음 → rebase 후 force-with-lease push 필요
- main.ts는 데모 진입점이므로 console.error 교체 대상에서 제외

## 기술 부채 목록
- [x] tsc 타입 에러 4개 잔존 (SharedArrayBuffer/ArrayBuffer 호환성) — PR #12로 해결
- [x] setDebug()를 라이브러리 public API로 export — PR #18로 해결
- [x] package.json main 필드와 vite.config.ts lib.entry를 src/index.ts로 업데이트 — PR #21로 해결
- [ ] decoder.ts의 decodeTile()은 현재 미사용 상태이나 public API로 유지 중

## 최근 3개 스프린트 요약
### Sprint 4 (2026-03-10)
- 완료: PR #21(chore/19), PR #20(docs/sprint-3) 머지, 이슈 #19 닫힘
- 발견된 문제: 없음

### Sprint 3 (2026-03-10)
- 완료: PR #17(fix/15), PR #18(feat/16), PR #14(docs/sprint-2) 머지, 이슈 #15 #16 닫힘
- 발견된 문제: package.json/vite.config.ts 빌드 설정이 src/index.ts를 가리키지 않음 → 이슈 #19 생성
