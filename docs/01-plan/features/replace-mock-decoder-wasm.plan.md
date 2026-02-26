# Replace Mock Decoder with Real WASM Library Plan Document

> Version: 1.0.0 | Created: 2026-02-26 | Status: Draft

## 1. Executive Summary
This feature involves replacing the current mock JPEG2000 decoder in the `openlayers-jp2-provider` with a real, high-performance WebAssembly (WASM) library (e.g., OpenJPEG-js or a custom OpenJPEG WASM build). This will enable the provider to decode actual JP2 bitstreams and render real image data.

## 2. Goals and Objectives
- Integrate a production-ready JPEG2000 WASM decoder.
- Implement the actual decoding logic in `JP2Decoder.decode()`.
- Ensure the WASM module is loaded and initialized correctly within the OpenLayers lifecycle.
- Verify decoding with sample JP2 files.

## 3. Scope
### In Scope
- Research and selection of a suitable WASM JP2 library.
- Integration of the library into the project build process (Vite).
- Updating `src/decoder.ts` to interface with the real WASM module.
- Handling memory management (allocation/deallocation) for WASM data exchange.

### Out of Scope
- Performance optimization for massive datasets (beyond basic decoding).
- Multi-spectral band support beyond standard RGBA.

## 4. Success Criteria
| Criterion | Metric | Target |
|-----------|--------|--------|
| Real Decoding | Visual Check | Actual JP2 image content is visible on the map. |
| Initialization | Status Check | `JP2Source` reaches 'ready' state after WASM load. |
| Stability | Error Rate | No crashes or memory leaks during repeated zooming/panning. |

## 5. Timeline
| Milestone | Date | Description |
|-----------|------|-------------|
| Library Research | Day 1 | Evaluate OpenJPEG-js and Kakadu WASM options. |
| Integration | Day 1 | Add WASM library to project and update build config. |
| Implementation | Day 2 | Update `src/decoder.ts` with real decoding logic. |
| Verification | Day 2 | Test with multiple sample JP2 files. |

## 6. Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| WASM File Size | Medium | Use compressed WASM or lazy loading. |
| Performance | High | Profile decoding time and optimize memory buffer reuse. |
| Browser Compatibility | Low | Verify WASM support in target browsers. |
