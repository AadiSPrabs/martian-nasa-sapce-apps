export type Site = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  kind: "curated" | "custom" | "landing" | "feature";
  parent?: string;
};

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

const GALE: [number, number, number, number] = [137.32, -4.76, 137.46, -4.6];

export function isGale(site: Site) {
  return (
    site.lon >= GALE[0] &&
    site.lon <= GALE[2] &&
    site.lat >= GALE[1] &&
    site.lat <= GALE[3]
  );
}
