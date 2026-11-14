export type DemMeta = {
  bbox: [number, number, number, number];
  width: number;
  height: number;
  pixelSizeM: [number, number];
  min: number;
  max: number;
  verticalDatum: string;
  heightOffsetM: number;
  source: string;
};

export type Dem = {
  meta: DemMeta;
  data: Int16Array;
};

export async function loadDem(): Promise<Dem> {
  const [metaRes, binRes] = await Promise.all([
    fetch("/data/gale/dem.json"),
    fetch("/data/gale/dem.bin"),
  ]);
  if (!metaRes.ok || !binRes.ok) throw new Error("Could not load Gale DEM");
  const meta = (await metaRes.json()) as DemMeta;
  const buffer = await binRes.arrayBuffer();
  return { meta, data: new Int16Array(buffer) };
}

export function sampleDem(dem: Dem, lon: number, lat: number): number | null {
  const { bbox, width, height } = dem.meta;
  const [west, south, east, north] = bbox;
  const fx = ((lon - west) / (east - west)) * (width - 1);
  const fy = ((north - lat) / (north - south)) * (height - 1);
  if (fx < 0 || fy < 0 || fx > width - 1 || fy > height - 1) return null;

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const v00 = dem.data[y0 * width + x0];
  const v10 = dem.data[y0 * width + x1];
  const v01 = dem.data[y1 * width + x0];
  const v11 = dem.data[y1 * width + x1];

  return (
    v00 * (1 - tx) * (1 - ty) +
    v10 * tx * (1 - ty) +
    v01 * (1 - tx) * ty +
    v11 * tx * ty
  );
}

export function slopeDem(dem: Dem, lon: number, lat: number): number {
  const { bbox, width, height, pixelSizeM } = dem.meta;
  const dLon = (bbox[2] - bbox[0]) / width;
  const dLat = (bbox[3] - bbox[1]) / height;
  const left = sampleDem(dem, lon - dLon, lat);
  const right = sampleDem(dem, lon + dLon, lat);
  const down = sampleDem(dem, lon, lat - dLat);
  const up = sampleDem(dem, lon, lat + dLat);
  if (left === null || right === null || down === null || up === null) return 0;
  const dzdx = (right - left) / (2 * pixelSizeM[0]);
  const dzdy = (up - down) / (2 * pixelSizeM[1]);
  return (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
}

export function elevationRange(dem: Dem, lon: number, lat: number, radiusDeg = 0.004) {
  let min = Infinity;
  let max = -Infinity;
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const e = sampleDem(
        dem,
        lon + (i / steps - 0.5) * radiusDeg,
        lat + (j / steps - 0.5) * radiusDeg,
      );
      if (e != null) {
        min = Math.min(min, e);
        max = Math.max(max, e);
      }
    }
  }
  return Number.isFinite(min) ? { min, max } : null;
}
