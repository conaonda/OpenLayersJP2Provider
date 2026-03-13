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
- JP2LayerOptions.zIndex: 레이어 z-인덱스 옵션 (number), OL TileLayer의 zIndex 옵션에 전달 (PR #72)
- JP2LayerOptions.preload: 레이어 프리로드 옵션 (number), OL TileLayer의 preload 옵션에 전달 (PR #75)
- JP2LayerOptions.className: 레이어 CSS 클래스명 옵션 (string), OL TileLayer의 className 옵션에 전달 (PR #78)
- JP2LayerOptions.minZoom/maxZoom: 레이어 표시 줌 레벨 범위 옵션 (number), OL TileLayer의 minZoom/maxZoom 옵션에 전달 (PR #81)
- JP2LayerOptions.maxResolution/minResolution: 레이어 표시 해상도 범위 옵션 (number), OL TileLayer의 maxResolution/minResolution 옵션에 전달 (PR #86)
- JP2LayerOptions.updateWhileAnimating/updateWhileInteracting: 애니메이션·인터랙션 중 타일 업데이트 제어 옵션 (boolean, 기본값 false), OL TileLayer의 동명 옵션에 전달 (PR #89)
- JP2LayerOptions.background: 레이어 배경색 옵션 (BackgroundColor 타입: CSS 색상 문자열 또는 줌 레벨별 함수), OL TileLayer의 background 옵션에 전달 (PR #91)
- JP2LayerOptions.useInterimTilesOnError: 오류 발생 시 임시(저해상도) 타일 표시 옵션 (boolean), OL TileLayer의 useInterimTilesOnError 옵션에 전달 (PR #94)
- JP2LayerOptions.properties: OL Layer의 setProperties()에 전달되는 임의 속성 객체 옵션 (Record<string, unknown>), 레이어에 커스텀 메타데이터 부착 가능 (PR #97)
- JP2LayerOptions.renderBuffer: 뷰포트 경계 바깥으로 미리 렌더링할 픽셀 수 옵션 (number, 기본값 OL 기본값 100), 빠른 패닝 시 타일 공백 감소, OL TileLayer의 renderBuffer 옵션에 전달 (PR #100)
- JP2LayerOptions.interpolate: 타일 렌더링 보간 방식 옵션 (boolean, 기본값 true), false 시 nearest-neighbor 렌더링(픽셀 선명 표시), OL TileLayer의 interpolate 옵션에 전달 (PR #102)
- JP2LayerOptions.cacheTTL: IndexedDB 타일 인덱스 캐시 TTL 옵션 (number, ms), createJP2TileLayer에서 RangeTileProvider로 전달 (PR #105)
- JP2LayerOptions.maxConcurrency: 디코딩 WebWorker 풀 크기 옵션 (number), 기존 maxConcurrentTiles(세마포어)와 별개로 실제 워커 수 제어, createJP2TileLayer에서 WorkerPool로 전달 (PR #108, closes #107)
- JP2LayerOptions.transition: 타일 페이드인 애니메이션 지속 시간 옵션 (number, ms), OL TileLayer의 transition 옵션에 전달, 0이면 애니메이션 비활성화 (PR #110, closes #109)
- JP2LayerOptions.cacheSize: 레이어 내부 인메모리 타일 캐시 크기 옵션 (number, 기본값 OL 기본값 512), TileImage 소스의 cacheSize 옵션에 전달, 대용량 JP2에서 재디코딩 방지 (PR #113, closes #112)
- JP2LayerOptions.wrapX: 타일 소스의 경도 방향(X축) 반복 렌더링 여부 옵션 (boolean, 기본값 OL 기본값 true), TileImage 소스의 wrapX 옵션에 전달 (PR #116, closes #115)
- JP2LayerOptions.extent: 레이어 렌더링 지리 범위 옵션 ([minX, minY, maxX, maxY]), geographic mode에서 JP2 파일의 extent를 대체하며 pixel mode에서는 TileLayer extent로 전달, OL 소스 extent와 구분하여 layerExtent로 처리 (PR #118, closes #117)

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
### Sprint 34 (2026-03-14)
- 완료: PR #118(extent 옵션) 머지, 이슈 #117 닫힘, JSDoc 보강 후 머지, 단위 테스트 242개 전체 통과
- 발견된 문제: extent 옵션 JSDoc 누락 → 리뷰어 피드백 반영하여 상세 문서 추가 후 머지

### Sprint 32 (2026-03-14)
- 완료: PR #113(cacheSize 옵션) 머지, PR #111(docs sprint-31) 충돌 해결 후 머지, 이슈 #112 닫힘, 단위 테스트 50개 전체 통과
- 발견된 문제: docs PR #111이 feature PR 머지 후 충돌 → rebase로 해결

### Sprint 31 (2026-03-13)
- 완료: PR #110(transition 옵션) 머지, 이슈 #109 닫힘, 단위 테스트 11개 전체 통과
- 발견된 문제: 없음
