# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] — Sprint 67

### Added
- **`JP2LayerOptions.pencilSketch`**: 연필 스케치 효과 옵션 추가 (closes #249, PR #251)
  - 타입: `boolean | { intensity?: number; blendMode?: 'multiply' | 'screen' }`, 기본값: `undefined`
  - 그레이스케일→반전→블러→Dodge 블렌드 기반 연필 스케치 효과
  - intensity: 효과 강도 (기본값 1.0), blendMode: 블렌드 모드 ('multiply' 또는 'screen', 기본값 'multiply')
  - `pixel-conversion.ts`의 `applyPencilSketch()` 함수로 처리
  - 적용 순서: motionBlur 이후
- **`JP2LayerOptions.oilPaint`**: 유화 페인팅 효과 옵션 추가 (closes #250, PR #251)
  - 타입: `boolean | { radius?: number; levels?: number }`, 기본값: `undefined`
  - 커널 내 밝기 양자화 기반 유화 페인팅 효과
  - radius: 커널 반경 (기본값 4), levels: 밝기 양자화 레벨 (기본값 8)
  - `pixel-conversion.ts`의 `applyOilPaint()` 함수로 처리
  - 적용 순서: pencilSketch 이후

---

## [Unreleased] — Sprint 65

### Added
- **`JP2LayerOptions.unsharpMask`**: 언샤프 마스크(엣지 선명화) 옵션 추가 (closes #241, PR #243)
  - 타입: `{ amount?: number; radius?: number; threshold?: number }`, 기본값: `undefined`
  - amount: 선명화 강도 (0~5, 기본값 1), radius: 블러 반경 (1~10, 기본값 1), threshold: 적용 최소 차이값 (0~255, 기본값 0)
  - `pixel-conversion.ts`의 `applyUnsharpMask()` 함수로 처리
  - 적용 순서: median 이후, sepia 이전
- **`JP2LayerOptions.bloom`**: 블룸(밝은 영역 발광) 효과 옵션 추가 (closes #242, PR #243)
  - 타입: `{ threshold?: number; intensity?: number; radius?: number }`, 기본값: `undefined`
  - threshold: 발광 적용 최소 밝기 (0~255, 기본값 200), intensity: 발광 강도 (0~1, 기본값 0.5), radius: 발광 반경 (1~10, 기본값 2)
  - `pixel-conversion.ts`의 `applyBloom()` 함수로 처리
  - 적용 순서: unsharpMask 이후, sepia 이전

---

## [Unreleased] — Sprint 64

### Changed
- **`JP2LayerOptions.median`**: 파라미터를 반경(`number`) → `number | { kernelSize: number }` 형태로 변경 (closes #237, PR #239)
  - 타입: `number | { kernelSize: number }`, 기본값: `undefined`
  - `number` 전달 시 kernelSize로 직접 사용, `{ kernelSize }` 객체 형태도 지원
  - kernelSize: 홀수 3~11, 짝수 입력 시 +1 자동 처리, 범위 밖이면 클램프
  - 가장자리 픽셀(경계)은 연산 건너뜀(skip boundary) 처리로 아티팩트 방지

### Tests
- **`applyChromaKey()` tolerance**: 경계값(0, 0.1), 기본값(undefined), 넓은 범위 테스트 추가 (closes #236, PR #239)

---

## [Unreleased] — Sprint 63

### Added
- **`JP2LayerOptions.chromaKey`**: 크로마키(배경색 투명 처리) 옵션 추가 (closes #233, PR #235)
  - 타입: `{ color: [number, number, number]; tolerance?: number }`, 기본값: `undefined`
  - 지정한 RGB 색상과 유클리드 거리 기반으로 픽셀을 투명 처리 (크로마키 효과)
  - tolerance: 색상 허용 오차 (유클리드 거리, 기본값: 0)
  - `pixel-conversion.ts`의 `applyChromaKey()` 함수로 처리
  - 적용 순서: nodata 이후 (파이프라인 초기 단계)
- **`JP2LayerOptions.median`**: 중앙값 필터 옵션 추가 (closes #234, PR #235)
  - 타입: `number` (필터 반경 1~5), 기본값: `undefined` → Sprint 64에서 API 변경
  - 중앙값 필터로 salt-and-pepper 노이즈 제거, 엣지 보존
  - `pixel-conversion.ts`의 `applyMedian()` 함수로 처리
  - 적용 순서: blur 이후

---

## [Unreleased] — Sprint 61

### Added
- **`JP2LayerOptions.histogramEqualize`**: 히스토그램 평활화 옵션 추가 (closes #225, PR #227)
  - 타입: `boolean`, 기본값: `false`
  - 각 RGB 채널별 히스토그램 평활화로 저대비 원격탐사 JP2 이미지의 가시성 향상
  - `pixel-conversion.ts`의 `applyHistogramEqualize()` 함수로 처리
  - 적용 순서: halftone 이후
- **`JP2LayerOptions.colorGrade`**: 스플릿 토닝(컬러 그레이딩) 옵션 추가 (closes #226, PR #227)
  - 타입: `{ shadows?: [number, number, number]; highlights?: [number, number, number]; balance?: number; strength?: number }`, 기본값: `undefined`
  - 섀도우/하이라이트 영역에 독립적 색조를 적용하는 스플릿 토닝 효과
  - balance: 섀도우-하이라이트 균형 (-1~1), strength: 효과 강도 (0~1)
  - `pixel-conversion.ts`의 `applyColorGrade()` 함수로 처리
  - 적용 순서: histogramEqualize 이후 (마지막 단계)

---

## [Unreleased] — Sprint 60

### Fixed
- **`applyCrossProcess()`**: 출력 픽셀 값 클램핑 누락 수정 (closes #221, PR #220)
  - crossProcess 연산 결과가 0~255 범위를 벗어날 경우 클램핑하지 않아 발생하는 오버플로우 버그 수정
  - R채널 S커브, G채널 리프트, B채널 크러시 연산 후 `Math.max(0, Math.min(255, value))` 적용
- **`applyHalftone()`**: 타일 가장자리 도트 잘림(artifact) 수정 (closes #222, PR #220)
  - 타일 경계에서 셀이 이미지 범위 밖으로 나가는 경우 경계 처리 오류로 인한 가장자리 아티팩트 수정
  - 셀 순회 시 `Math.min(x + dotSize, width)` / `Math.min(y + dotSize, height)` 범위 클램핑 적용

---

## [Unreleased] — Sprint 59

### Added
- **`JP2LayerOptions.crossProcess`**: 크로스 프로세싱 필름 효과 옵션 추가 (closes #217, PR #220)
  - 타입: `number` (0 ~ 1), 기본값: `0` (변화 없음)
  - 슬라이드 필름을 네거티브 현상액으로 처리한 것처럼 채널별 S커브(R)/리프트(G)/크러시(B) 적용
  - `pixel-conversion.ts`의 `applyCrossProcess()` 함수로 처리
  - 적용 순서: solarize 이후 grainFilm 이전
- **`JP2LayerOptions.grainFilm`**: 필름 그레인 텍스처 효과 옵션 추가 (closes #218, PR #220)
  - 타입: `number` (0 ~ 1), 기본값: `0` (변화 없음)
  - 어두운 영역에 더 강한 그레인 노이즈를 추가하여 실제 필름 질감 시뮬레이션
  - `pixel-conversion.ts`의 `applyGrainFilm()` 함수로 처리
  - 적용 순서: crossProcess 이후 halftone 이전
- **`JP2LayerOptions.halftone`**: 하프톤 점 패턴 효과 옵션 추가 (closes #219, PR #220)
  - 타입: `number` (도트 크기, 픽셀 단위), 기본값: `0` (변화 없음, 2 미만이면 적용 안 됨)
  - 이미지를 dotSize×dotSize 셀로 분할, 셀 평균 휘도에 따라 원형 도트 크기 조절
  - 도트 외부 픽셀은 흰색으로 처리하여 인쇄물 하프톤 효과 재현
  - `pixel-conversion.ts`의 `applyHalftone()` 함수로 처리
  - 적용 순서: grainFilm 이후 (마지막 단계)

---

## [Unreleased] — Sprint 58

### Added
- **`JP2LayerOptions.solarize`**: 솔라리제이션 효과 임계값 옵션 추가 (closes #212, PR #215)
  - 타입: `number` (0~255), 기본값: `128`
  - 임계값 이상의 채널 값을 반전시켜 솔라리제이션 예술 효과 적용
  - `pixel-conversion.ts`의 `applySolarize()` 함수로 처리
  - 적용 순서: burn 이후
- **`JP2LayerOptions.shadowsHighlights`**: 섀도우/하이라이트 독립 밝기 조정 옵션 추가 (closes #213, PR #215)
  - 타입: `{ shadows?: number; highlights?: number }` (각 -100~100), 기본값: `{ shadows: 0, highlights: 0 }`
  - shadows: 어두운 영역 밝기 조정 (양수=밝게, 음수=어둡게)
  - highlights: 밝은 영역 밝기 조정 (양수=밝게, 음수=어둡게)
  - `pixel-conversion.ts`의 `applyShadowsHighlights()` 함수로 처리
  - 적용 순서: solarize 이후
- **`JP2LayerOptions.clarity`**: 로컬 콘트라스트 강화(clarity) 효과 옵션 추가 (closes #214, PR #215)
  - 타입: `number` (0~100), 기본값: `0` (변화 없음)
  - 중간 톤 영역의 로컬 콘트라스트를 강화하여 디테일 선명도 향상
  - `pixel-conversion.ts`의 `applyClarity()` 함수로 처리
  - 적용 순서: shadowsHighlights 이후

---

## [Unreleased] — Sprint 57

### Added
- **`JP2LayerOptions.duotone`**: 두 가지 색상(shadows/highlights) 그라디언트 톤 매핑 옵션 추가 (closes #207, PR #210)
  - 타입: `{ shadows: [number, number, number]; highlights: [number, number, number] }`, 기본값: `undefined`
  - 픽셀 휘도(luminance)를 기반으로 어두운 픽셀은 shadows 색상, 밝은 픽셀은 highlights 색상으로 매핑
  - `pixel-conversion.ts`의 `applyDuotone()` 함수로 처리
  - 적용 순서: curves 이후 최종 단계에 적용
- **`JP2LayerOptions.dodge`**: 하이라이트 밝기 증폭(닷지) 효과 옵션 추가 (closes #208, PR #210)
  - 타입: `number` (0 ~ 1), 기본값: `0` (변화 없음)
  - 밝은 픽셀일수록 더 많이 밝아지는 비선형 닷지 효과
  - `pixel-conversion.ts`의 `applyDodge()` 함수로 처리
  - 적용 순서: curves 이후, burn 이전
- **`JP2LayerOptions.burn`**: 섀도우 어둡기 증폭(번) 효과 옵션 추가 (closes #209, PR #210)
  - 타입: `number` (0 ~ 1), 기본값: `0` (변화 없음)
  - 어두운 픽셀일수록 더 많이 어두워지는 비선형 번 효과
  - `pixel-conversion.ts`의 `applyBurn()` 함수로 처리
  - 적용 순서: dodge 이후

---

## [Unreleased] — Sprint 56

### Added
- **`JP2LayerOptions.vibrance`**: 저채도 색상에 선택적 채도 증폭 옵션 추가 (closes #203, PR #205)
  - 타입: `number` (-1 ~ 1), 기본값: `0` (변화 없음)
  - 이미 채도가 높은 색상에는 적게, 채도가 낮은 색상에는 더 많이 적용하는 지능형 채도 조정
  - `pixel-conversion.ts`의 `applyVibrance()`, `validateVibrance()` 함수로 처리
  - 적용 순서: ...saturation → vibrance → hue...
- **`JP2LayerOptions.curves`**: 채널별 톤 커브(256-entry LUT) 적용 옵션 추가 (closes #204, PR #205)
  - 타입: `{ all?: number[]; r?: number[]; g?: number[]; b?: number[] }`, 기본값: `undefined`
  - `all`: 모든 채널에 적용할 256 엔트리 LUT
  - `r`, `g`, `b`: 각 채널에 개별 적용할 256 엔트리 LUT (채널 LUT가 all보다 우선)
  - `pixel-conversion.ts`의 `applyCurves()`, `validateCurves()` 함수로 처리
  - 적용 순서: ...levels → curves → colorMap...

---

## [Unreleased] — Sprint 55

### Added
- **`JP2LayerOptions.outputLevels`**: 픽셀 출력 레벨 범위 재매핑 옵션 추가 (closes #198, PR #201)
  - 타입: `{ outputMin?: number; outputMax?: number }`, 기본값: `{ outputMin: 0, outputMax: 255 }`
  - `[0, 255]`를 `[outputMin, outputMax]` 범위로 선형 재매핑
  - `pixel-conversion.ts`의 `applyOutputLevels()`, `validateOutputLevels()` 함수로 처리
  - outputMin > outputMax인 경우 자동 스왑 처리
- **`JP2LayerOptions.temperature`**: 색 온도 조정 옵션 추가 (closes #199, PR #201)
  - 타입: `number` (-100 ~ +100), 기본값: `0` (변화 없음)
  - 양수=난색(주황빛, R 채널 증가/B 채널 감소), 음수=한색(파란빛, B 채널 증가/R 채널 감소)
  - `pixel-conversion.ts`의 `applyTemperature()` 함수로 처리
  - 적용 순서: ...brightness → contrast → temperature → saturation → hue...
- **`JP2LayerOptions.flip`**: 이미지 반전 옵션 추가 (closes #200, PR #201)
  - 타입: `{ horizontal?: boolean; vertical?: boolean }`, 기본값: `{ horizontal: false, vertical: false }`
  - 수평(좌우) 반전 및/또는 수직(상하) 반전 동시 적용 가능
  - `pixel-conversion.ts`의 `applyFlip()` 함수로 처리
  - 적용 순서: bands → flip (마지막 단계)

---

## [Unreleased] — Sprint 53

### Added
- **`JP2LayerOptions.levels`**: 픽셀 입력 레벨 범위 재매핑 옵션 추가 (closes #186, PR #188)
  - 타입: `{ inputMin?: number; inputMax?: number }`, 기본값: `{ inputMin: 0, inputMax: 255 }`
  - `[inputMin, inputMax]` 범위를 `[0, 255]`로 선형 재매핑, 범위 밖 값은 클램핑
  - `pixel-conversion.ts`의 `applyLevels()` 함수로 처리
  - 적용 순서: ...exposure → levels → noise → colorMap...
- **`JP2LayerOptions.noise`**: 랜덤 노이즈 효과 옵션 추가 (closes #187, PR #189)
  - 타입: `number` (0~255), 기본값: `0` (노이즈 없음)
  - 각 RGB 채널에 `[-noise, +noise]` 균등 분포 랜덤값 가산, 결과 0~255 클램핑
  - 알파 채널 미변경
  - `pixel-conversion.ts`의 `applyNoise()` 함수로 처리
  - 적용 순서: ...levels → noise → colorMap...

---

## [Unreleased] — Sprint 52

### Added
- **`JP2LayerOptions.colorBalance`**: RGB 채널별 독립 색상 균형 조정 옵션 추가 (closes #182, PR #184)
  - 타입: `[number, number, number]` (R, G, B 오프셋, 각 -255 ~ 255), 기본값: `undefined`
  - 각 채널에 오프셋 가산, 결과 0~255 클램핑
  - `pixel-conversion.ts`의 `applyColorBalance()` 함수로 처리
- **`JP2LayerOptions.exposure`**: 승산 방식 밝기 보정 옵션 추가 (closes #183, PR #184)
  - 타입: `number`, 기본값: `1.0` (변화 없음)
  - `>1.0` 밝아짐, `<1.0` 어두워짐. 각 RGB 채널에 `out = clamp(in * exposure, 0, 255)` 적용
  - `pixel-conversion.ts`의 `applyExposure()` 함수로 처리
  - 적용 순서: ...channelSwap → colorBalance → exposure → levels → colorMap...

---

## [Unreleased] — Sprint 51

### Added
- **`JP2LayerOptions.pixelate`**: 픽셀화(블록 모자이크) 효과 옵션 추가 (closes #178, PR #180)
  - 타입: `number` (블록 크기, px), 기본값: 미적용 (2 이상 시 활성화)
  - 각 블록 영역의 평균 색상으로 해당 블록 픽셀들을 채움
  - `pixel-conversion.ts`의 `applyPixelate()` 함수로 처리
- **`JP2LayerOptions.channelSwap`**: RGB 채널 순서 변경 옵션 추가 (closes #179, PR #180)
  - 타입: `[number, number, number]` (소스 채널 인덱스 배열, 예: [2,1,0]은 BGR→RGB)
  - 유효하지 않은 인덱스(0-2 범위 밖)는 무시 처리
  - `pixel-conversion.ts`의 `applyChannelSwap()` 함수로 처리
  - 적용 순서: ...emboss → pixelate → channelSwap → colorMap...

---

## [Unreleased] — Sprint 47

### Added
- **`JP2LayerOptions.grayscale`**: RGB 이미지를 그레이스케일로 변환하는 옵션 추가 (closes #163, PR #165)
  - 타입: `boolean`, 기본값: `false` (변환 없음)
  - ITU-R BT.709 가중치(`R×0.2126 + G×0.7152 + B×0.0722`) 기반 정확한 휘도 변환
  - `pixel-conversion.ts`의 `applyGrayscale()` 함수로 처리
- **`JP2LayerOptions.colorMap`**: 단채널 데이터에 256엔트리 컬러 룩업 테이블을 적용하는 옵션 추가 (closes #164, PR #165)
  - 타입: `Array<[r: number, g: number, b: number]>` (256개 요소), 기본값: `undefined`
  - 단채널(grayscale) RGBA 데이터의 픽셀 값(0~255)을 인덱스로 사용하여 RGB 색상 매핑
  - `pixel-conversion.ts`의 `applyColorMap()` 함수로 처리
  - 적용 순서: nodata → gamma → brightness → contrast → saturation → hue → invert → threshold → colorize → sharpen → grayscale → colormap/bands

---

## [Unreleased] — Sprint 46

### Added
- **`JP2LayerOptions.blur`**: 가우시안 블러 스무딩 옵션 추가 (closes #159, PR #161)
  - 타입: `number`, 기본값: `undefined` (블러 없음)
  - 범위: 양의 정수. 3×3 가우시안 커널을 지정한 횟수만큼 반복 적용
  - `pixel-conversion.ts`의 `applyBlur()` 함수로 처리
- **`JP2LayerOptions.sepia`**: 세피아 톤 효과 옵션 추가 (closes #160, PR #161)
  - 타입: `number`, 기본값: `undefined` (세피아 없음)
  - 범위: `0`~`1`. `0`은 원본, `1`은 완전 세피아, 중간값은 선형 보간
  - ITU-R 세피아 변환 행렬 기반 처리
  - `pixel-conversion.ts`의 `applySepia()` 함수로 처리
  - 적용 순서: nodata → gamma → brightness → contrast → saturation → hue → invert → threshold → colorize → sharpen → blur → sepia → colormap/bands

---

## [Unreleased] — Sprint 45

### Added
- **`JP2LayerOptions.colorize`**: 그레이스케일 이미지 색상화 옵션 추가 (closes #155, PR #157)
  - 타입: `[r: number, g: number, b: number]`, 기본값: `undefined` (색상화 없음)
  - luminance 기반 착색: `out_ch = (lum / 255) * color_ch`
  - `pixel-conversion.ts`의 `applyColorize()` 함수로 처리
- **`JP2LayerOptions.sharpen`**: 언샤프 마스킹 선명화 옵션 추가 (closes #156, PR #157)
  - 타입: `number`, 기본값: `0` (선명화 없음)
  - 권장 범위: `0.0` ~ `1.0`. 3x3 가우시안 블러 기반 언샤프 마스킹 적용
  - 공식: `out = clamp(original + amount * (original - blurred))`
  - `pixel-conversion.ts`의 `applySharpen()` 함수로 처리
  - 적용 순서: nodata → gamma → brightness → contrast → saturation → hue → invert → threshold → colorize → sharpen → colormap/bands

---

## [Unreleased] — Sprint 44

### Added
- **`JP2LayerOptions.invert`**: 픽셀 색상 반전 옵션 추가 (closes #151, PR #153)
  - 타입: `boolean`, 기본값: `false` (반전 없음)
  - `true`로 설정하면 각 RGB 채널을 `255 - value`로 반전 (보색 효과)
  - `pixel-conversion.ts`의 `applyInvert()` 함수로 처리
- **`JP2LayerOptions.threshold`**: 픽셀 임계값 이진화 옵션 추가 (closes #152, PR #153)
  - 타입: `number`, 기본값: `undefined` (이진화 없음)
  - 범위: `0`~`255`. luminance 기준으로 흑백 이진화 처리
  - `pixel-conversion.ts`의 `applyThreshold()` 함수로 처리: luminance ≥ threshold → 255(흰색), 미만 → 0(검정)
  - 적용 순서: nodata → gamma → brightness → contrast → saturation → hue → invert → threshold → colormap/bands

---

## [Unreleased] — Sprint 42

### Added
- **`JP2LayerOptions.brightness`**: 픽셀 밝기 조정 옵션 추가 (closes #143, PR #145)
  - 타입: `number`, 기본값: `0` (조정 없음)
  - 범위: `-1` ~ `1`. 양수면 밝아지고 음수면 어두워짐
  - `pixel-conversion.ts`의 `applyBrightness()` 함수로 처리: `out = in + brightness * 255`
- **`JP2LayerOptions.contrast`**: 픽셀 대비 조정 옵션 추가 (closes #144, PR #145)
  - 타입: `number`, 기본값: `1.0` (조정 없음)
  - `1`보다 크면 대비 증가, `0`~`1`이면 대비 감소, `0`이면 회색
  - `pixel-conversion.ts`의 `applyContrast()` 함수로 처리: `out = (in - 128) * contrast + 128`
  - 적용 순서: nodata → gamma → brightness → contrast → colormap/bands

---

## [Unreleased] — Sprint 41

### Added
- **`JP2LayerOptions.gamma`**: 픽셀 감마 보정 옵션 추가 (closes #140, PR #142)
  - 타입: `number`, 기본값: `1.0` (보정 없음)
  - `1`보다 크면 밝아지고 `1`보다 작으면 어두워짐
  - `pixel-conversion.ts`의 `applyGamma()` 함수로 처리
- **`JP2LayerOptions.nodataTolerance`**: nodata 값 매칭 허용 오차 옵션 추가 (closes #141, PR #142)
  - 타입: `number`, 기본값: `0` (정확히 일치해야 함)
  - `|pixel - nodata| <= tolerance` 조건으로 nodata 판별

---

## [Unreleased] — Sprint 40

### Added
- **`JP2LayerOptions.nodata`**: 투명하게 처리할 픽셀 값 옵션 추가 (closes #136, PR #137)
  - 타입: `number`, 기본값: `undefined`
  - 지정된 값과 일치하는 픽셀의 알파 채널을 0으로 설정하여 투명하게 렌더링
  - `pixel-conversion.ts`의 `applyNodata()` 함수로 처리

---

## [Unreleased] — Sprint 39

### Added
- **`JP2LayerOptions.tileSize`**: 디스플레이 타일 크기 옵션 추가 (closes #133, PR #134)
  - 타입: `number`, 기본값: `256`
  - 기존 `source.ts`의 `DISPLAY_TILE_SIZE` 상수를 대체하여 동적으로 타일 크기 변경 가능
  - `TileGrid` 생성 시 `tileSize` 옵션에 전달

---

## [Unreleased] — Sprint 38

### Added
- **`JP2LayerOptions.reprojectionErrorThreshold`**: 타일 재투영 허용 오차 임계값 옵션 추가 (closes #129, PR #131)
  - 타입: `number`, 기본값: OL 기본값 `0.5`
  - 낮을수록 재투영 정확도가 높아지지만 성능 비용 증가
  - `TileImage` 소스의 `reprojectionErrorThreshold` 옵션에 전달
- **`JP2LayerOptions.opaque`**: 타일 소스 불투명도 힌트 옵션 추가 (closes #130, PR #131)
  - 타입: `boolean`, 기본값: OL 기본값 `false`
  - `true`로 설정하면 렌더러가 하위 레이어 렌더링을 생략하는 최적화 가능
  - `TileImage` 소스의 `opaque` 옵션에 전달

---

## [Unreleased] — Sprint 37

### Added
- **`JP2LayerOptions.attributionsCollapsible`**: 저작권 표기 패널 접기 버튼 표시 여부 옵션 추가 (closes #126, PR #127)
  - 타입: `boolean`, 기본값: `true` (접기 가능)
  - `false`로 설정하면 저작권 패널이 항상 펼쳐진 상태로 고정됨
  - `TileImage` 소스의 `attributionsCollapsible` 옵션에 전달

---

## [Unreleased] — Sprint 36

### Added
- **`JP2LayerOptions.tilePixelRatio`**: HiDPI/Retina 디스플레이를 위한 타일 픽셀 비율 옵션 추가 (closes #124, PR #125)
  - 타입: `number`, 기본값: `1`
  - `TileImage` 소스의 `tilePixelRatio` 옵션에 전달
  - 값을 `2`로 설정하면 Retina 디스플레이에서 2배 해상도 타일을 요청하여 선명한 이미지 렌더링

---

## [Unreleased] — Sprint 35

### Added
- **`JP2LayerOptions.crossOrigin`**: CORS 크로스오리진 설정 옵션 추가 (closes #121)
  - 타입: `string | null`, 기본값: `undefined`
  - 다른 오리진에서 JP2 파일을 서빙할 때 canvas 픽셀 접근(보안 정책)을 위해 필요
  - `'anonymous'`: 자격증명 없이 CORS 요청, `'use-credentials'`: 쿠키/인증 헤더 포함
  - `TileImage` 소스의 `crossOrigin` 옵션에 전달

---

## [Unreleased] — Sprint 34

### Added
- **`JP2LayerOptions.extent`**: 레이어 렌더링 지리 범위를 제한하는 옵션 추가 (closes #117)
  - 타입: `[number, number, number, number]` (`[minX, minY, maxX, maxY]`)
  - 좌표는 레이어가 사용하는 투영계(projection) 단위를 따름
  - Geographic mode에서는 JP2 파일의 extent를 대체, Pixel mode에서도 범위 명시 가능

---

## [Unreleased] — Sprint 33

### Added
- **`JP2LayerOptions.wrapX`**: 타일 소스의 경도 방향(X축) 반복 렌더링을 제어하는 옵션 추가 (closes #115)
  - 타입: `boolean`, 기본값: OL 기본값 `true`
  - `TileImage` 소스의 `wrapX` 옵션에 전달
  - `false`로 설정하면 원본 범위 외부에서 JP2 타일이 반복 표시되지 않음

---

## [Unreleased] — Sprint 32

### Added
- **`JP2LayerOptions.cacheSize`**: 레이어 내부 인메모리 타일 캐시 크기를 제어하는 옵션 추가 (closes #112)
  - 타입: `number`, 기본값: OL 기본값 `512`
  - `TileImage` 소스의 `cacheSize` 옵션에 전달
  - 대용량 JP2 파일이나 고해상도 뷰에서 캐시 부족으로 인한 불필요한 재디코딩 방지

---

## [Unreleased] — Sprint 31

### Added
- **`JP2LayerOptions.transition`**: 타일 페이드인 애니메이션 지속 시간 옵션 추가 (closes #109, PR #110)
  - 타입: `number` (밀리초), 기본값: OL 기본값 `250`
  - `0`으로 설정 시 애니메이션 없이 즉시 표시
  - `createJP2TileLayer` 내부에서 OpenLayers `TileImage` 소스의 `transition` 옵션에 전달

---

## [Unreleased] — Sprint 30

### Added
- **`JP2LayerOptions.maxConcurrency`**: 디코딩 WebWorker 풀 크기를 외부에서 제어하는 옵션 추가 (closes #107)
  - 타입: `number`, 기본값: `WorkerPool` 기본값
  - URL 문자열로 `createJP2TileLayer` 호출 시 `RangeTileProvider`에 전달
  - 기존 `maxConcurrentTiles`(세마포어 제한)와 별개로, 실제 WebWorker 수를 제한

---

## [Unreleased] — Sprint 29

### Added
- **`JP2LayerOptions.cacheTTL`**: `createJP2TileLayer`에 IndexedDB 타일 인덱스 캐시 TTL 옵션 추가 (closes #104, PR #105)
  - 타입: `number` (밀리초), 기본값: `86400000` (24시간)
  - URL 문자열로 호출 시 내부 생성되는 `RangeTileProvider`에 자동 전달
  - `TileProvider` 객체 직접 전달 시에는 무시됨 (프로바이더에서 직접 설정 필요)

---

## [Unreleased] — Sprint 28

### Added
- **`JP2LayerOptions.interpolate`**: 타일 렌더링 시 보간 방식을 제어하는 옵션 추가 (closes #101, PR #102)
  - 타입: `boolean`, 기본값: `true` (OpenLayers TileLayer 기본값, bilinear 보간)
  - `false`로 설정 시 nearest-neighbor 보간 적용 — 픽셀 아트, 위성 이미지 등 선명한 픽셀 경계가 필요한 경우에 유용
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `interpolate` 옵션에 전달

---

## [Unreleased] — Sprint 27

### Added
- **`JP2LayerOptions.renderBuffer`**: 뷰포트 경계 바깥으로 미리 렌더링할 픽셀 수 옵션 추가 (closes #99)
  - 타입: `number`, 기본값: OL 기본값 `100`
  - 빠른 패닝 시 타일 공백을 줄이기 위해 렌더 버퍼 크기를 조정 가능
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `renderBuffer` 옵션에 전달

---

## [Unreleased] — Sprint 26

### Added
- **`JP2LayerOptions.properties`**: 레이어에 임의의 키-값 속성을 설정하는 옵션 추가 (closes #96, PR #97)
  - 타입: `Record<string, unknown>`
  - `layer.get(key)`로 설정한 속성 조회 가능
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `properties` 옵션에 전달

---

## [Unreleased] — Sprint 25

### Added
- **`JP2LayerOptions.useInterimTilesOnError`**: 타일 로드 오류 시 임시 타일(하위 해상도) 표시 여부 옵션 추가 (closes #93, PR #94)
  - 타입: `boolean`, 기본값: `true` (OpenLayers TileLayer 기본값)
  - `false`로 설정 시 타일 오류 발생 시 하위 해상도 타일 대신 빈 타일 표시
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `useInterimTilesOnError` 옵션에 전달

---

## [Unreleased] — Sprint 24

### Added
- **`JP2LayerOptions.background`**: 레이어 배경색 옵션 추가 (closes #90, PR #91)
  - 타입: `BackgroundColor` (CSS 색상 문자열 또는 줌 레벨별 함수)
  - 타일이 없는 영역에 표시할 배경색 지정
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `background` 옵션에 전달

---

## [Unreleased] — Sprint 23

### Added
- **`JP2LayerOptions.updateWhileAnimating`**: 애니메이션 중 타일 업데이트 여부 옵션 추가 (closes #88)
  - 타입: `boolean`, 기본값: `false`
  - `true`로 설정하면 지도 애니메이션(패닝/줌) 중에도 타일을 계속 업데이트
- **`JP2LayerOptions.updateWhileInteracting`**: 인터랙션 중 타일 업데이트 여부 옵션 추가 (closes #88)
  - 타입: `boolean`, 기본값: `false`
  - `true`로 설정하면 사용자 인터랙션(드래그/핀치 줌) 중에도 타일을 계속 업데이트

---

## [Unreleased] — Sprint 22

### Added
- **`JP2LayerOptions.maxResolution`**: 레이어가 표시되는 최대 해상도 옵션 추가 (closes #85, PR #86)
  - 타입: `number` (map units per pixel)
  - 이 해상도 초과 시 레이어가 숨겨짐
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `maxResolution` 옵션에 전달
- **`JP2LayerOptions.minResolution`**: 레이어가 표시되는 최소 해상도 옵션 추가 (closes #85, PR #86)
  - 타입: `number` (map units per pixel)
  - 이 해상도 미만 시 레이어가 숨겨짐
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `minResolution` 옵션에 전달

---

## [Unreleased] — Sprint 20

### Added
- **`JP2LayerOptions.minZoom`**: 레이어가 표시되는 최소 줌 레벨 옵션 추가 (closes #80, PR #81)
  - 타입: `number`
  - 이 레벨 미만의 줌에서는 레이어가 숨겨짐
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `minZoom` 옵션에 전달
- **`JP2LayerOptions.maxZoom`**: 레이어가 표시되는 최대 줌 레벨 옵션 추가 (closes #80, PR #81)
  - 타입: `number`
  - 이 레벨 초과 시 레이어가 숨겨짐
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `maxZoom` 옵션에 전달

---

## [Unreleased] — Sprint 19

### Added
- **`JP2LayerOptions.className`**: 레이어 DOM 요소에 적용할 CSS 클래스명 옵션 추가 (closes #77, PR #78)
  - 타입: `string`, 기본값: OpenLayers 기본값 `'ol-layer'`
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `className` 옵션에 전달
  - 복수 JP2 레이어를 CSS로 개별 제어하거나 커스텀 스타일 적용 시 활용

---

## [Unreleased] — Sprint 18

### Added
- **`JP2LayerOptions.preload`**: 저해상도 타일 미리 로드 레벨 수 옵션 추가 (closes #74, PR #75)
  - 타입: `number`, 기본값: `0` (미리 로드 없음)
  - `Infinity`로 설정 시 전체 피라미드 미리 로드
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `preload` 옵션에 전달
  - 줌 변경 시 저해상도 타일을 먼저 표시하여 빈 타일 영역 감소에 활용

---

## [Unreleased] — Sprint 17

### Added
- **`JP2LayerOptions.zIndex`**: 레이어 렌더링 순서 옵션 추가 (closes #71, PR #72)
  - 타입: `number`
  - 숫자가 클수록 위에 렌더링 (OpenLayers 표준 `zIndex` 옵션과 동일)
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `zIndex` 옵션에 전달
  - 복수 JP2 레이어 간 렌더링 순서 제어에 활용

---

## [Unreleased] — Sprint 16

### Added
- **`JP2LayerOptions.visible`**: 레이어 초기 가시성 옵션 추가 (closes #68, PR #69)
  - 타입: `boolean`, 기본값: `true`
  - `createJP2TileLayer` 내부에서 OpenLayers `TileLayer`의 `visible` 옵션에 전달
  - `false`로 설정 시 레이어가 초기에 숨겨진 상태로 생성됨

---

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
