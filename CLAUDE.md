# OpenLayersJP2Provider — 프로젝트 지침

## 프로젝트 개요
OpenLayers 기반 JP2(JPEG 2000) 타일 뷰어 라이브러리.
Range 요청으로 JP2 파일을 타일 단위로 부분 디코딩하여 OpenLayers 지도에 오버레이한다.

## 기술 스택
- **언어**: TypeScript
- **번들러**: Vite
- **지도**: OpenLayers (ol)
- **JP2 디코더**: @abasb75/openjpeg (WebAssembly)
- **좌표 변환**: proj4
- **단위 테스트**: Vitest
- **E2E 테스트**: Playwright

## 디렉토리 구조
```
src/
  main.ts              # 데모 진입점
  source.ts            # OL TileSource 생성
  range-tile-provider.ts  # HTTP Range 요청으로 JP2 타일 데이터 조회
  tile-provider.ts     # 타일 프로바이더 인터페이스
  decoder.ts           # JP2 디코딩 오케스트레이터
  decode-worker.ts     # WebWorker: openjpeg 디코딩 실행
  worker-pool.ts       # WebWorker 풀 관리
  jp2-parser.ts        # JP2/JPEG2000 파일 파싱
  pixel-conversion.ts  # 픽셀 데이터 변환 유틸리티
  debug-panel.ts       # 개발용 디버그 패널
tests/
  osm-jp2.spec.ts      # Playwright E2E 테스트
```

## 명령어
```bash
npm run dev    # 개발 서버 (Vite)
npm run build  # TypeScript 컴파일 + Vite 빌드
npm test       # Vitest 단위 테스트
npx playwright test  # E2E 테스트
```

## 컨벤션

### 커밋
Conventional Commits: `<type>(<scope>): <subject>`
- type: feat, fix, docs, style, refactor, test, chore
- subject: 50자 이내, 명령형, 소문자 시작, 마침표 없음

### 브랜치
- `main` — 프로덕션
- `feature/이슈번호-설명`, `fix/이슈번호-설명`
- main에서 분기, PR로만 머지

### 코드 스타일
- TypeScript strict 모드
- 빌드 전 `tsc` 타입 오류 없음 확인
- 단위 테스트: `npm test` 통과

## 에이전트 행동 규칙

### 필수
- 모든 작업은 이슈에서 시작한다
- 이슈 번호를 브랜치명과 커밋에 포함한다
- PR 생성 시 `closes #이슈번호`로 연결한다
- 변경 전 기존 코드를 먼저 읽고 이해한다
- `npm test` 통과 후 PR 제출

### 금지
- main에 직접 push 금지
- 기존 테스트 삭제/무력화 금지
- `--no-verify`, `--force` 플래그 사용 금지
