import { sampleDem, slopeDem } from "../fieldatlas/dem";
import type { Site, SiteTerrain } from "./terrain";

export type Target = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  elev: number;
  kind: "panorama" | "sample" | "ridge" | "curated";
  description: string;
  tool?: string;
  priority: "Must" | "Should" | "Could";
  image?: string | null;
};

type Waypoint = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  description: string;
  image: string | null;
  role: string;
};

export async function buildTargets(
  terrain: SiteTerrain,
  site: Site,
): Promise<Target[]> {
  if (terrain.grade === "field") {
    try {
      const response = await fetch("/data/gale/waypoints.json");
      const waypoints = (await response.json()) as Waypoint[];
      const chosen = waypoints.filter((w) =>
        ["vera_rubin_ridge", "hematite_hotspot"].includes(w.id),
      );
      if (chosen.length) {
        return chosen.map((w, index) => ({
          id: w.id,
          name: w.name,
          lon: w.lon,
          lat: w.lat,
          elev: sampleDem(terrain.dem, w.lon, w.lat) ?? 0,
          kind: "curated",
          description: w.description,
          tool: w.id === "hematite_hotspot" ? "drill" : "sample-bags",
          priority: index === chosen.length - 1 ? "Must" : "Should",
          image: w.image,
        }));
      }
    } catch {
      // Fall through to generated targets.
    }
  }

  const { meta } = terrain.dem;
  const [west, south, east, north] = meta.bbox;
  let high = { elev: -Infinity, lon: site.lon, lat: site.lat };
  let steep = { slope: -1, lon: site.lon + 0.04, lat: site.lat - 0.04 };
  const stride = Math.max(2, Math.floor(terrain.dem.meta.width / 90));
  for (let y = 0; y < meta.height; y += stride) {
    for (let x = 0; x < meta.width; x += stride) {
      const lon = west + ((x + 0.5) / meta.width) * (east - west);
      const lat = north - ((y + 0.5) / meta.height) * (north - south);
      const elev = sampleDem(terrain.dem, lon, lat);
      if (elev != null && elev > high.elev) high = { elev, lon, lat };
      const slope = slopeDem(terrain.dem, lon, lat);
      if (slope > steep.slope) steep = { slope, lon, lat };
    }
  }

  const fallbackDistance = Math.min(
    0.08,
    Math.max(0.015, (east - west) * 0.22),
  );
  if (Math.abs(high.lon - site.lon) < 0.005 && Math.abs(high.lat - site.lat) < 0.005) {
    high = { elev: high.elev, lon: site.lon + fallbackDistance, lat: site.lat + 0.01 };
  }
  if (Math.abs(steep.lon - site.lon) < 0.005 && Math.abs(steep.lat - site.lat) < 0.005) {
    steep = { slope: steep.slope, lon: site.lon - fallbackDistance, lat: site.lat - 0.01 };
  }

  return [
    {
      id: "generated-high",
      name: "Local high point",
      lon: high.lon,
      lat: high.lat,
      elev: high.elev,
      kind: "panorama",
      description:
        "Generated field objective: highest sampled point in this terrain window. Panorama and sample cache.",
      tool: "sample-bags",
      priority: "Must",
    },
    {
      id: "generated-ridge",
      name: "Slope break",
      lon: steep.lon,
      lat: steep.lat,
      elev: sampleDem(terrain.dem, steep.lon, steep.lat) ?? 0,
      kind: "ridge",
      description:
        "Generated field objective: steepest sampled slope break. Ridge transect and structural measurement.",
      tool: "drill",
      priority: "Should",
    },
  ];
}
