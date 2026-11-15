import { fromArrayBuffer } from "geotiff";

import { loadDem, type Dem } from "../fieldatlas/dem";

export type Site = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  kind: "curated" | "custom" | "landing" | "feature";
  parent?: string;
};

export type SiteTerrain = {
  site: Site;
  dem: Dem;
  imageUrl: string;
  bounds: [[number, number], [number, number]];
  grade: "field" | "recon";
  gradeLabel: string;
  note: string;
};

const TREK = "https://trek.nasa.gov/mars/trekarcgis/rest/services";
const GALE: [number, number, number, number] = [137.32, -4.76, 137.46, -4.6];
const DEG_M = 59_274; // Mars circumference / 360
const cache = new Map<string, Promise<SiteTerrain>>();

export const CURATED_SITES: Site[] = [
  { id: "gale", name: "Gale Crater", lon: 137.39, lat: -4.68, kind: "curated" },
  { id: "jezero", name: "Jezero Crater", lon: 77.45, lat: 18.44, kind: "curated" },
  {
    id: "olympus",
    name: "Olympus Mons",
    lon: -133.8,
    lat: 18.65,
    kind: "feature",
  },
  {
    id: "valles",
    name: "Valles Marineris",
    lon: -70.0,
    lat: -10.0,
    kind: "feature",
  },
  {
    id: "hellas",
    name: "Hellas Planitia",
    lon: 70.0,
    lat: -42.0,
    kind: "feature",
  },
  {
    id: "elysium",
    name: "Elysium Planitia",
    lon: 147.0,
    lat: 25.0,
    kind: "feature",
  },
];

export function siteName(lon: number, lat: number) {
  return `Site ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"} · ${Math.abs(
    lat,
  ).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
}

export function siteFromPoint(lon: number, lat: number): Site {
  return {
    id: `custom-${lon.toFixed(4)}-${lat.toFixed(4)}`,
    name: siteName(lon, lat),
    lon,
    lat,
    kind: "custom",
  };
}

export function isGale(site: Site) {
  return (
    site.lon >= GALE[0] &&
    site.lon <= GALE[2] &&
    site.lat >= GALE[1] &&
    site.lat <= GALE[3]
  );
}

function reconBBox(lon: number, lat: number): [number, number, number, number] {
  const latHalf = 0.35;
  const lonHalf = Math.min(1.2, 0.35 / Math.max(Math.cos((lat * Math.PI) / 180), 0.25));
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

function exportUrl(service: string, bbox: [number, number, number, number], size: number) {
  const [west, south, east, north] = bbox;
  return `${TREK}/${service}/ImageServer/exportImage?bbox=${west},${south},${east},${north}&bboxSR=104905&imageSR=104905&size=${size},${size}&format=tiff&pixelType=F32&f=image`;
}

function imageUrl(service: string, bbox: [number, number, number, number], size: number) {
  const [west, south, east, north] = bbox;
  return `${TREK}/${service}/ImageServer/exportImage?bbox=${west},${south},${east},${north}&bboxSR=104905&imageSR=104905&size=${size},${size}&format=jpg&f=image`;
}

async function fetchRecon(site: Site): Promise<SiteTerrain> {
  const bbox = reconBBox(site.lon, site.lat);
  const [west, south, east, north] = bbox;
  const demUrl = exportUrl(
    "Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw",
    bbox,
    512,
  );
  const demRes = await fetch(demUrl);
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
  const lonM = ((east - west) * DEG_M * Math.cos((site.lat * Math.PI) / 180)) / width;
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
      source: "NASA/JPL Mars Trek MOLA/HRSC 200 m DEM",
    },
    data,
  };
  return {
    site,
    dem,
    imageUrl: imageUrl(
      "Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp",
      bbox,
      1024,
    ),
    bounds: [
      [south, west],
      [north, east],
    ],
    grade: "recon",
    gradeLabel: "MOLA 200 m · RECON",
    note: "Regional reconnaissance terrain. Rover route; not boulder-scale.",
  };
}

async function fetchGale(site: Site): Promise<SiteTerrain> {
  const dem = await loadDem();
  return {
    site,
    dem,
    imageUrl: "/data/gale/hirise.jpg",
    bounds: [
      [dem.meta.bbox[1], dem.meta.bbox[0]],
      [dem.meta.bbox[3], dem.meta.bbox[2]],
    ],
    grade: "field",
    gradeLabel: "HIRISE 1 m · FIELD",
    note: "HiRISE stereo terrain. Full rover field traverse with sample stops.",
  };
}

export function fetchSiteTerrain(site: Site): Promise<SiteTerrain> {
  const gale = isGale(site);
  const key = gale ? "gale" : `recon-${site.lon.toFixed(3)}-${site.lat.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key)!;
  const promise = gale ? fetchGale(site) : fetchRecon(site);
  cache.set(key, promise);
  promise.catch(() => cache.delete(key));
  return promise;
}
