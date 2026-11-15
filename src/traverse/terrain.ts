import { fromArrayBuffer } from "geotiff";

import { loadDem, type Dem } from "../fieldatlas/dem";
import { isGale, type Site } from "./sites";

export type { Site } from "./sites";
export { CURATED_SITES, siteFromPoint, siteName } from "./sites";

export type TerrainLayers = {
  optical: string;
  terrain: string;
  hillshade: string;
  slope: string;
  geology: string;
};

export type SiteTerrain = {
  site: Site;
  dem: Dem;
  imageUrl: string;
  layers: TerrainLayers;
  bounds: [[number, number], [number, number]];
  grade: "field" | "recon";
  gradeLabel: string;
  note: string;
  rangeKm: number;
};

export const RECON_RANGES = [25, 50, 100, 200] as const;
export type ReconRange = (typeof RECON_RANGES)[number];

const TREK = "https://trek.nasa.gov/mars/trekarcgis/rest/services";
const DEG_M = 59_274; // Mars circumference / 360
const cache = new Map<string, Promise<SiteTerrain>>();

function reconBBox(
  lon: number,
  lat: number,
  rangeKm: number,
): [number, number, number, number] {
  const latHalf = (rangeKm * 1000) / DEG_M;
  const lonHalf = Math.min(
    2.0,
    latHalf / Math.max(Math.cos((lat * Math.PI) / 180), 0.25),
  );
  const south = Math.max(-89.2, lat - latHalf);
  const north = Math.min(89.2, lat + latHalf);
  let west = lon - lonHalf;
  let east = lon + lonHalf;
  // Keep windows on one side of the antimeridian; shift the centre if needed.
  if (west < -180) {
    const shift = -180 - west;
    west += shift;
    east += shift;
  }
  if (east > 180) {
    const shift = east - 180;
    west -= shift;
    east -= shift;
  }
  return [west, south, east, north];
}

function exportUrl(
  service: string,
  bbox: [number, number, number, number],
  size: number,
) {
  const [west, south, east, north] = bbox;
  return `${TREK}/${service}/ImageServer/exportImage?bbox=${west},${south},${east},${north}&bboxSR=104905&imageSR=104905&size=${size},${size}&format=tiff&pixelType=F32&f=image`;
}

function rasterUrl(
  service: string,
  bbox: [number, number, number, number],
  size: number,
) {
  const [west, south, east, north] = bbox;
  return `${TREK}/${service}/ImageServer/exportImage?bbox=${west},${south},${east},${north}&bboxSR=104905&imageSR=104905&size=${size},${size}&format=jpg&f=image`;
}

function geologyUrl(
  bbox: [number, number, number, number],
  size: number,
) {
  const [west, south, east, north] = bbox;
  return `${TREK}/SIM3292_Global_Geology/MapServer/export?bbox=${west},${south},${east},${north}&bboxSR=104905&imageSR=104905&size=${size},${size}&format=png32&transparent=true&f=image`;
}

function slopeDataUrl(dem: Dem): string {
  const { width, height, pixelSizeM } = dem.meta;
  const step = Math.max(1, Math.floor(width / 512));
  const w = Math.max(1, Math.floor(width / step));
  const h = Math.max(1, Math.floor(height / step));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, x * step);
      const sy = Math.min(height - 1, y * step);
      const x0 = Math.max(0, sx - 1);
      const x1 = Math.min(width - 1, sx + 1);
      const y0 = Math.max(0, sy - 1);
      const y1 = Math.min(height - 1, sy + 1);
      const dzdx =
        (dem.data[sy * width + x1] - dem.data[sy * width + x0]) /
        (2 * pixelSizeM[0] * step);
      const dzdy =
        (dem.data[y1 * width + sx] - dem.data[y0 * width + sx]) /
        (2 * pixelSizeM[1] * step);
      const slope = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
      const p = (y * w + x) * 4;
      if (slope >= 20) {
        image.data[p] = 212;
        image.data[p + 1] = 91;
        image.data[p + 2] = 75;
        image.data[p + 3] = 170;
      } else if (slope >= 12) {
        image.data[p] = 217;
        image.data[p + 1] = 164;
        image.data[p + 2] = 65;
        image.data[p + 3] = 130;
      } else if (slope >= 6) {
        image.data[p] = 230;
        image.data[p + 1] = 214;
        image.data[p + 2] = 170;
        image.data[p + 3] = 55;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

async function fetchRecon(site: Site, rangeKm: number): Promise<SiteTerrain> {
  const bbox = reconBBox(site.lon, site.lat, rangeKm);
  const [west, south, east, north] = bbox;
  const demSize = rangeKm <= 60 ? 512 : rangeKm <= 120 ? 768 : 1024;
  const imageSize = rangeKm <= 30 ? 1024 : rangeKm <= 80 ? 1536 : 2048;
  const demRes = await fetch(
    exportUrl(
      "Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw",
      bbox,
      demSize,
    ),
  );
  if (!demRes.ok) throw new Error(`DEM request failed (${demRes.status})`);
  const buffer = await demRes.arrayBuffer();
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  const source = rasters[0] as unknown as Float32Array;
  const width = image.getWidth();
  const height = image.getHeight();
  const data = new Int16Array(width * height);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < source.length; i++) {
    const value = source[i];
    const clean = Number.isFinite(value) && value > -12_000 ? value : -4_000;
    data[i] = Math.round(clean);
    if (clean < min) min = clean;
    if (clean > max) max = clean;
  }
  const lonM =
    ((east - west) * DEG_M * Math.cos((site.lat * Math.PI) / 180)) / width;
  const latM = ((north - south) * DEG_M) / height;
  const dem: Dem = {
    meta: {
      bbox,
      width,
      height,
      pixelSizeM: [Math.abs(lonM), Math.abs(latM)],
      min,
      max,
      verticalDatum: "Mars areoid (MOLA/HRSC blend)",
      heightOffsetM: 0,
      source: `NASA/JPL Mars Trek MOLA/HRSC 200 m DEM · ${rangeKm} km range`,
    },
    data,
  };
  const layers: TerrainLayers = {
    optical: rasterUrl("Mars_Viking_MDIM21_ClrMosaic_global_232m", bbox, imageSize),
    terrain: rasterUrl(
      "Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp",
      bbox,
      imageSize,
    ),
    hillshade: rasterUrl(
      "Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw",
      bbox,
      imageSize,
    ),
    geology: geologyUrl(bbox, imageSize),
    slope: slopeDataUrl(dem),
  };
  return {
    site,
    dem,
    imageUrl: layers.optical,
    layers,
    bounds: [
      [south, west],
      [north, east],
    ],
    grade: "recon",
    gradeLabel: "MOLA 200 m · RECON",
    note: `Regional reconnaissance terrain · ${rangeKm} km radius. Rover route; not boulder-scale.`,
    rangeKm,
  };
}

async function fetchGale(site: Site): Promise<SiteTerrain> {
  const dem = await loadDem();
  const layers: TerrainLayers = {
    optical: "/data/gale/hirise.jpg",
    terrain: "/data/gale/hillshade.webp",
    hillshade: "/data/gale/hillshade.webp",
    slope: "/data/gale/slope.png",
    geology: "/data/gale/geology.png",
  };
  return {
    site,
    dem,
    imageUrl: layers.optical,
    layers,
    bounds: [
      [dem.meta.bbox[1], dem.meta.bbox[0]],
      [dem.meta.bbox[3], dem.meta.bbox[2]],
    ],
    grade: "field",
    gradeLabel: "HIRISE 1 m · FIELD",
    note: "HiRISE stereo terrain. Field window fixed at the Gale DEM footprint.",
    rangeKm: 0,
  };
}

export function fetchSiteTerrain(
  site: Site,
  rangeKm: number = 50,
): Promise<SiteTerrain> {
  const gale = isGale(site);
  const key = gale
    ? "gale"
    : `recon-${site.lon.toFixed(3)}-${site.lat.toFixed(3)}-${rangeKm}`;
  if (cache.has(key)) return cache.get(key)!;
  const promise = gale ? fetchGale(site) : fetchRecon(site, rangeKm);
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}
