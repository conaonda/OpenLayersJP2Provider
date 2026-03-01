import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat, transformExtent } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import { RangeTileProvider } from './range-tile-provider';
import { createJP2TileLayer } from './source';
import { createDebugPanel } from './debug-panel';
import 'ol/ol.css';

// Register common Korean CRS definitions
proj4.defs('EPSG:5174', '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43');
proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:5181', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:5186', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:32631', '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32652', '+proj=utm +zone=52 +datum=WGS84 +units=m +no_defs');
register(proj4);

async function main() {
  const params = new URLSearchParams(window.location.search);
  const jp2Url = params.get('jp2') || '/sample.jp2';

  console.log('Initializing JP2 tile-based viewer...');
  const provider = new RangeTileProvider(jp2Url);
  const { layer: jp2Layer, info, projection, extent, resolutions } = await createJP2TileLayer(provider);
  console.log(`JP2 ready: ${info.width}x${info.height}, maxDecodeLevel=${info.maxDecodeLevel}`);

  if (info.geoInfo) {
    console.log(`Geo: EPSG:${info.geoInfo.epsgCode}, extent=[${extent}]`);
  }

  const maxZoom = Math.log2(info.tileWidth / 256);

  // OSM base layer (always in EPSG:3857)
  const osmLayer = new TileLayer({ source: new OSM() });

  const hasGeo = !!info.geoInfo;

  if (hasGeo) {
    // Geographic mode: OSM base + JP2 overlay, map in EPSG:3857
    const map = new Map({
      target: 'map',
      layers: [osmLayer, jp2Layer],
      view: new View({
        center: fromLonLat([127.0, 37.5]),
        zoom: 5,
      }),
    });
    // fit after map renders so it has valid size
    const mapExtent = transformExtent(extent, projection, 'EPSG:3857');
    setTimeout(() => {
      map.getView().fit(mapExtent, { padding: [50, 50, 50, 50] });
    }, 0);
    createDebugPanel(map, info);
  } else {
    // Pixel mode: no base map
    const map = new Map({
      target: 'map',
      layers: [jp2Layer],
      view: new View({
        projection,
        center: [info.width / 2, info.height / 2],
        zoom: 0,
        maxZoom,
        extent,
      }),
    });
    createDebugPanel(map, info);
  }
}

main().catch((err) => console.error('Failed to initialize JP2 viewer:', err));
