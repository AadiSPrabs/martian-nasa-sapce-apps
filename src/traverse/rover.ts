import { sampleDem, slopeDem, type Dem } from "../fieldatlas/dem";
import { findPath, getNavGrid, type LonLat } from "../fieldatlas/grid";
import type { Target } from "./targets";

export type RouteProfile = "fastest" | "safest" | "science";

export type RouteStop = {
  target: Target | null;
  lon: number;
  lat: number;
  name: string;
  distanceKm: number;
  dwellMin: number;
};

export type RoverRoute = {
  id: RouteProfile;
  label: string;
  detail: string;
  points: LonLat[];
  stops: RouteStop[];
  distanceKm: number;
  driveHours: number;
  totalHours: number;
  powerPct: number;
  doseMsv: number;
  maxSlope: number;
  turnBackKm: number;
  feasible: boolean;
  warnings: string[];
  risk: "LOW" | "MED" | "HIGH";
  science: number;
};

type LoadoutTotals = {
  massKg: number;
  sampleSlots: number;
  tools: string[];
  powerBonus: number;
  shielding: number;
};

const DEG_M = 59_274;

export function haversineM(a: LonLat, b: LonLat) {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 3_389_500 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function roverSpeed(slope: number) {
  return Math.max(1.2, 7.4 * Math.exp(-0.055 * Math.max(0, slope)));
}

function buildPath(
  dem: Dem,
  start: LonLat,
  via: Target | null,
  target: Target,
  maxSlope: number,
  slopeWeight: number,
) {
  const step = dem.meta.pixelSizeM[0] < 20 ? 4 : 2;
  const grid = getNavGrid(dem, step);
  const waypoints: LonLat[] = [{ lon: start.lon, lat: start.lat }];
  if (via) waypoints.push({ lon: via.lon, lat: via.lat });
  waypoints.push({ lon: target.lon, lat: target.lat });
  const path: LonLat[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const segment = findPath(grid, waypoints[i - 1], waypoints[i], {
      maxSlope,
      slopeWeight,
    });
    if (!segment) return null;
    if (i > 1) segment.shift();
    path.push(...segment);
  }
  return path.length > 1 ? path : null;
}

function summarize(
  profile: RouteProfile,
  label: string,
  detail: string,
  dem: Dem,
  start: LonLat,
  target: Target,
  via: Target | null,
  path: LonLat[],
  loadout: LoadoutTotals,
  solarEvent: boolean,
): RoverRoute {
  let distance = 0;
  let driveHours = 0;
  let maxSlope = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const meters = haversineM(a, b);
    distance += meters;
    const slope = slopeDem(dem, b.lon, b.lat);
    maxSlope = Math.max(maxSlope, slope);
    driveHours += meters / 1000 / roverSpeed(slope);
  }
  const dwellMin = 20 + (via ? 15 : 0);
  const totalHours = driveHours + dwellMin / 60;
  const massPenalty = 1 + Math.min(0.45, loadout.massKg / 85);
  const powerPct = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        100 +
          loadout.powerBonus -
          (distance / 1000) * 2.15 * massPenalty -
          totalHours * 0.8,
      ),
    ),
  );
  const doseMsv = totalHours * 0.026 * loadout.shielding * (solarEvent ? 3 : 1);
  const turnBackKm = Math.max(
    0,
    Math.min(distance / 1000, (powerPct - 18) / (2.15 * massPenalty)),
  );
  const warnings: string[] = [];
  if (powerPct < 22) warnings.push("Power reserve is below 22%.");
  if (totalHours > 9) warnings.push("Traverse exceeds the 9 h rover planning window.");
  if (maxSlope > 22) warnings.push("Route crosses terrain above 22°.");
  if (doseMsv > 0.25) warnings.push("Dose exceeds the 0.25 mSv EVA rule.");
  const risk: RoverRoute["risk"] =
    warnings.length > 1 || maxSlope > 20
      ? "HIGH"
      : warnings.length === 1 || maxSlope > 14
        ? "MED"
        : "LOW";
  const science = target.priority === "Must" ? 2 : 1 + (via ? 1 : 0);
  return {
    id: profile,
    label,
    detail,
    points: path,
    stops: [
      {
        target: null,
        lon: start.lon,
        lat: start.lat,
        name: "Current site",
        distanceKm: 0,
        dwellMin: 0,
      },
      ...(via
        ? [
            {
              target: via,
              lon: via.lon,
              lat: via.lat,
              name: via.name,
              distanceKm: distance / 2000,
              dwellMin: 15,
            },
          ]
        : []),
      {
        target,
        lon: target.lon,
        lat: target.lat,
        name: target.name,
        distanceKm: distance / 1000,
        dwellMin: 20,
      },
    ],
    distanceKm: distance / 1000,
    driveHours,
    totalHours,
    powerPct,
    doseMsv,
    maxSlope,
    turnBackKm,
    feasible: warnings.length === 0,
    warnings,
    risk,
    science,
  };
}

export function planRoverRoutes(
  dem: Dem,
  start: LonLat,
  target: Target,
  via: Target | null,
  loadout: LoadoutTotals,
  solarEvent = false,
): RoverRoute[] {
  const routes: RoverRoute[] = [];

  const fastestPath = buildPath(dem, start, null, target, 25, 0.7);
  if (fastestPath) {
    routes.push(
      summarize(
        "fastest",
        "Fastest",
        "Direct line, higher slope tolerance",
        dem,
        start,
        target,
        null,
        fastestPath,
        loadout,
        solarEvent,
      ),
    );
  }

  let safePath = buildPath(dem, start, null, target, 15, 2.2);
  if (!safePath) safePath = buildPath(dem, start, null, target, 18, 2.0);
  if (!safePath) safePath = buildPath(dem, start, null, target, 22, 1.6);
  if (safePath) {
    routes.push(
      summarize(
        "safest",
        "Safest",
        "Lower-slope line, longer if needed",
        dem,
        start,
        target,
        null,
        safePath,
        loadout,
        solarEvent,
      ),
    );
  }

  const scienceVia = via && via.id !== target.id ? via : null;
  const sciencePath = buildPath(dem, start, scienceVia, target, 20, 1.3);
  if (sciencePath) {
    routes.push(
      summarize(
        "science",
        "Most science",
        scienceVia ? `Detour via ${scienceVia.name}` : "Adds a sampling stop",
        dem,
        start,
        target,
        scienceVia,
        sciencePath,
        loadout,
        solarEvent,
      ),
    );
  }

  return routes;
}

export { DEG_M };
