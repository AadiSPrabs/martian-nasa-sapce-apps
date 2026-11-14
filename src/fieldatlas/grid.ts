import type { Dem } from "./dem";

export type NavGrid = {
  width: number;
  height: number;
  bbox: [number, number, number, number];
  cellMx: number;
  cellMy: number;
  elevation: Float32Array;
  slope: Float32Array;
  blocked: Uint8Array;
};

export type LonLat = { lon: number; lat: number };

const STEP = 4; // 4 DEM pixels ≈ 23.6 m
const MAX_SLOPE = 25;

const gridCache = new WeakMap<Dem, NavGrid>();

export function getNavGrid(dem: Dem): NavGrid {
  const cached = gridCache.get(dem);
  if (cached) return cached;

  const { bbox, width: dw, height: dh, pixelSizeM } = dem.meta;
  const width = Math.floor(dw / STEP);
  const height = Math.floor(dh / STEP);
  const elevation = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let sy = 0; sy < STEP; sy++) {
        const row = y * STEP + sy;
        if (row >= dh) continue;
        for (let sx = 0; sx < STEP; sx++) {
          const col = x * STEP + sx;
          if (col >= dw) continue;
          sum += dem.data[row * dw + col];
          count++;
        }
      }
      elevation[y * width + x] = count ? sum / count : 0;
    }
  }

  const cellMx = pixelSizeM[0] * ((bbox[2] - bbox[0]) / width) / ((bbox[2] - bbox[0]) / dw);
  const cellMy = pixelSizeM[1] * ((bbox[3] - bbox[1]) / height) / ((bbox[3] - bbox[1]) / dh);
  const slope = new Float32Array(width * height);
  const blocked = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(height - 1, y + 1);
      const dzdx =
        (elevation[y * width + x1] - elevation[y * width + x0]) / (2 * cellMx);
      const dzdy =
        (elevation[y1 * width + x] - elevation[y0 * width + x]) / (2 * cellMy);
      const s = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
      slope[y * width + x] = s;
      blocked[y * width + x] = s > MAX_SLOPE ? 1 : 0;
    }
  }

  const grid = { width, height, bbox, cellMx, cellMy, elevation, slope, blocked };
  gridCache.set(dem, grid);
  return grid;
}

function cellFor(grid: NavGrid, p: LonLat): { x: number; y: number } {
  const [west, south, east, north] = grid.bbox;
  const x = Math.floor(((p.lon - west) / (east - west)) * grid.width);
  const y = Math.floor(((north - p.lat) / (north - south)) * grid.height);
  return {
    x: Math.min(grid.width - 1, Math.max(0, x)),
    y: Math.min(grid.height - 1, Math.max(0, y)),
  };
}

function cellCenter(grid: NavGrid, x: number, y: number): LonLat {
  const [west, south, east, north] = grid.bbox;
  return {
    lon: west + ((x + 0.5) / grid.width) * (east - west),
    lat: north - ((y + 0.5) / grid.height) * (north - south),
  };
}

function nearestOpen(grid: NavGrid, x: number, y: number): { x: number; y: number } {
  if (!grid.blocked[y * grid.width + x]) return { x, y };
  for (let r = 1; r <= 8; r++) {
    let best: { x: number; y: number; s: number } | null = null;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
        const idx = ny * grid.width + nx;
        if (grid.blocked[idx]) continue;
        if (!best || grid.slope[idx] < best.s) best = { x: nx, y: ny, s: grid.slope[idx] };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return { x, y };
}

class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];

  get size() {
    return this.keys.length;
  }

  push(key: number, value: number) {
    this.keys.push(key);
    this.values.push(value);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): { key: number; value: number } | undefined {
    if (!this.keys.length) return undefined;
    const key = this.keys[0];
    const value = this.values[0];
    const lastKey = this.keys.pop()!;
    const lastValue = this.values.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.keys.length && this.keys[l] < this.keys[smallest]) smallest = l;
        if (r < this.keys.length && this.keys[r] < this.keys[smallest]) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return { key, value };
  }

  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.values[a], this.values[b]] = [this.values[b], this.values[a]];
  }
}

export function findPath(
  grid: NavGrid,
  start: LonLat,
  goal: LonLat,
): LonLat[] | null {
  const s = cellFor(grid, start);
  const g = cellFor(grid, goal);
  const startCell = nearestOpen(grid, s.x, s.y);
  const goalCell = nearestOpen(grid, g.x, g.y);
  const startIdx = startCell.y * grid.width + startCell.x;
  const goalIdx = goalCell.y * grid.width + goalCell.x;
  if (startIdx === goalIdx) return [cellCenter(grid, goalCell.x, goalCell.y)];

  const n = grid.width * grid.height;
  const gScore = new Float32Array(n);
  gScore.fill(Infinity);
  const came = new Int32Array(n);
  came.fill(-1);
  const closed = new Uint8Array(n);
  gScore[startIdx] = 0;

  const open = new MinHeap();
  const h = (x: number, y: number) => {
    const dx = (x - goalCell.x) * grid.cellMx;
    const dy = (y - goalCell.y) * grid.cellMy;
    return Math.hypot(dx, dy);
  };
  open.push(h(startCell.x, startCell.y), startIdx);

  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  let iterations = 0;
  while (open.size && iterations++ < 220_000) {
    const item = open.pop();
    if (!item) break;
    const idx = item.value;
    if (closed[idx]) continue;
    closed[idx] = 1;
    if (idx === goalIdx) break;

    const cx = idx % grid.width;
    const cy = Math.floor(idx / grid.width);

    for (const [dx, dy, factor] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      const ni = ny * grid.width + nx;
      if (grid.blocked[ni]) continue;

      const slope = grid.slope[ni];
      const dist = factor * ((grid.cellMx + grid.cellMy) / 2);
      let penalty = 1 + 3 * (slope / 10) ** 2;
      if (slope > 15) penalty *= 1.5;
      if (slope > 20) penalty *= 2;
      const tentative = gScore[idx] + dist * penalty;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = idx;
        open.push(tentative + h(nx, ny), ni);
      }
    }
  }

  if (came[goalIdx] < 0 && goalIdx !== startIdx) return null;

  const path: LonLat[] = [];
  let cur = goalIdx;
  let guard = 0;
  while (cur >= 0 && guard++ < 5000) {
    path.push(cellCenter(grid, cur % grid.width, Math.floor(cur / grid.width)));
    if (cur === startIdx) break;
    cur = came[cur];
  }
  path.reverse();
  return path;
}

export function pathLengthM(grid: NavGrid, path: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = (b.lon - a.lon) * grid.cellMx * 0 + 0;
    const dLat = (b.lat - a.lat) * 111_000;
    const dLon = (b.lon - a.lon) * 111_000 * Math.cos((b.lat * Math.PI) / 180);
    total += Math.hypot(dLon, dLat);
  }
  return total;
}
