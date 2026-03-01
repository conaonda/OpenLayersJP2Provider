import Map from 'ol/Map';
import { toLonLat } from 'ol/proj';
import type { TileProviderInfo } from './tile-provider';

const STYLE = `
.debug-panel {
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: #0f0;
  font-family: monospace;
  font-size: 11px;
  padding: 10px 14px;
  border-radius: 6px;
  z-index: 9999;
  max-width: 420px;
  line-height: 1.5;
  pointer-events: auto;
  user-select: text;
}
.debug-panel.hidden { display: none; }
.debug-panel table { border-collapse: collapse; }
.debug-panel td { padding: 1px 6px 1px 0; white-space: nowrap; }
.debug-panel td:first-child { color: #aaa; }
.debug-panel .section { color: #ff0; margin-top: 6px; margin-bottom: 2px; font-weight: bold; }
.debug-panel .close-btn {
  position: absolute; top: 4px; right: 8px;
  cursor: pointer; color: #888; font-size: 14px;
}
.debug-panel .close-btn:hover { color: #fff; }
`;

function fmt(n: number | undefined, digits = 2): string {
  return n == null ? '—' : n.toFixed(digits);
}

export function createDebugPanel(map: Map, info: TileProviderInfo): void {
  // Inject styles
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  // Create panel
  const panel = document.createElement('div');
  panel.className = 'debug-panel hidden';
  document.body.appendChild(panel);

  const view = map.getView();
  const projCode = view.getProjection().getCode();
  const isPixelMode = projCode === 'jp2-image';

  // State
  let cursorView = [0, 0] as [number, number];
  let cursorLonLat = [0, 0] as [number, number];
  let zoom = view.getZoom() ?? 0;
  let resolution = view.getResolution() ?? 0;
  let center = view.getCenter() ?? [0, 0];
  let extent = view.calculateExtent(map.getSize());
  let layers = buildLayerList();

  function buildLayerList(): string[] {
    const result: string[] = [];
    map.getLayers().forEach((l) => {
      const name = l.get('name') || l.constructor.name;
      const vis = l.getVisible() ? '✓' : '✗';
      const op = (l.getOpacity() * 100).toFixed(0);
      result.push(`${vis} ${name} (${op}%)`);
    });
    return result;
  }

  function render() {
    const geoSection = info.geoInfo
      ? `<div class="section">JP2 Geo</div>
         <table>
           <tr><td>EPSG</td><td>${info.geoInfo.epsgCode}</td></tr>
           <tr><td>Origin</td><td>${fmt(info.geoInfo.originX, 4)}, ${fmt(info.geoInfo.originY, 4)}</td></tr>
           <tr><td>Pixel Scale</td><td>${fmt(info.geoInfo.pixelScaleX, 6)}, ${fmt(info.geoInfo.pixelScaleY, 6)}</td></tr>
         </table>`
      : '';

    panel.innerHTML = `
      <span class="close-btn" id="debug-close">&times;</span>
      <div class="section">Cursor</div>
      <table>
        <tr><td>View (${projCode})</td><td>${fmt(cursorView[0], 2)}, ${fmt(cursorView[1], 2)}</td></tr>
        ${isPixelMode ? '' : `<tr><td>Lon/Lat</td><td>${fmt(cursorLonLat[0], 6)}, ${fmt(cursorLonLat[1], 6)}</td></tr>`}
      </table>
      <div class="section">View</div>
      <table>
        <tr><td>Projection</td><td>${projCode}${isPixelMode ? ' (pixel)' : ''}</td></tr>
        <tr><td>Zoom</td><td>${fmt(zoom, 3)}</td></tr>
        <tr><td>Resolution</td><td>${fmt(resolution, 6)} ${isPixelMode ? 'px/px' : 'units/px'}</td></tr>
        <tr><td>Center</td><td>${fmt(center[0], 2)}, ${fmt(center[1], 2)}</td></tr>
        <tr><td>Extent</td><td>${extent.map((v) => fmt(v, 1)).join(', ')}</td></tr>
      </table>
      <div class="section">Layers</div>
      <table>${layers.map((l) => `<tr><td colspan="2">${l}</td></tr>`).join('')}</table>
      <div class="section">JP2 Image</div>
      <table>
        <tr><td>Size</td><td>${info.width} × ${info.height}</td></tr>
        <tr><td>Tile</td><td>${info.tileWidth} × ${info.tileHeight}</td></tr>
        <tr><td>Grid</td><td>${info.tilesX} × ${info.tilesY}</td></tr>
        <tr><td>MaxDecodeLevel</td><td>${info.maxDecodeLevel}</td></tr>
        <tr><td>Components</td><td>${info.componentCount}</td></tr>
      </table>
      ${geoSection}
    `;
    panel.querySelector('#debug-close')!.addEventListener('click', toggle);
  }

  function toggle() {
    panel.classList.toggle('hidden');
  }

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'D' || e.key === 'd') toggle();
  });

  // Pointer move
  map.on('pointermove', (e) => {
    cursorView = e.coordinate as [number, number];
    if (!isPixelMode) {
      try {
        const ll = toLonLat(e.coordinate, projCode);
        cursorLonLat = ll as [number, number];
      } catch {
        cursorLonLat = [0, 0];
      }
    }
    if (!panel.classList.contains('hidden')) render();
  });

  // View changes
  view.on('change:resolution', () => {
    zoom = view.getZoom() ?? 0;
    resolution = view.getResolution() ?? 0;
    extent = view.calculateExtent(map.getSize());
    if (!panel.classList.contains('hidden')) render();
  });

  view.on('change:center', () => {
    center = view.getCenter() ?? [0, 0];
    extent = view.calculateExtent(map.getSize());
    if (!panel.classList.contains('hidden')) render();
  });

  // Layer changes
  map.getLayers().on('change:length', () => {
    layers = buildLayerList();
    if (!panel.classList.contains('hidden')) render();
  });
  map.getLayers().forEach((l) => {
    l.on('change:visible', () => {
      layers = buildLayerList();
      if (!panel.classList.contains('hidden')) render();
    });
    l.on('change:opacity', () => {
      layers = buildLayerList();
      if (!panel.classList.contains('hidden')) render();
    });
  });

  render();
}
