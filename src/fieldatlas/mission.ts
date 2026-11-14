export type WaypointData = {
  id: string;
  name: string;
  role: "start" | "science" | "target" | "context";
  lon: number;
  lat: number;
  description: string;
  caption: string;
  image: string | null;
  source: string;
};

export type Objective = {
  id: string;
  title: string;
  detail: string;
  dwellMin: number;
  priority: "Must" | "Should" | "Could";
};

export const ROUTE_IDS = [
  "murray_buttes",
  "bagnold_dunes_south",
  "vera_rubin_ridge",
  "hematite_hotspot",
] as const;

export const ROUTE_MODES = [
  {
    id: "science",
    label: "Full science",
    detail: "4 stops · dune margin + ridge + sample",
    ids: ["murray_buttes", "bagnold_dunes_south", "vera_rubin_ridge", "hematite_hotspot"],
  },
  {
    id: "ridge",
    label: "Ridge line",
    detail: "3 stops · skip the dune margin",
    ids: ["murray_buttes", "vera_rubin_ridge", "hematite_hotspot"],
  },
  {
    id: "direct",
    label: "Direct",
    detail: "2 stops · shortest walk",
    ids: ["murray_buttes", "hematite_hotspot"],
  },
  {
    id: "relay",
    label: "Rover relay",
    detail: "Rover moves to Bagnold · 3 stops",
    ids: ["bagnold_dunes_south", "vera_rubin_ridge", "hematite_hotspot"],
  },
] as const;

export type RouteModeId = (typeof ROUTE_MODES)[number]["id"];

export const OBJECTIVES: Record<string, Objective> = {
  murray_buttes: {
    id: "murray_buttes",
    title: "Depart the rover",
    detail:
      "Airlock cycle, suit check, and departure from the pressurised rover parked below the buttes.",
    dwellMin: 0,
    priority: "Must",
  },
  bagnold_dunes_south: {
    id: "bagnold_dunes_south",
    title: "Dune margin survey",
    detail:
      "Document the southern Bagnold dune margin, slipface geometry, and sand texture at the traverse edge.",
    dwellMin: 25,
    priority: "Should",
  },
  vera_rubin_ridge: {
    id: "vera_rubin_ridge",
    title: "Ridge layering",
    detail:
      "Measure fine-scale layering and fracture orientation on the hematite-rich ridge face; context imaging.",
    dwellMin: 35,
    priority: "Must",
  },
  hematite_hotspot: {
    id: "hematite_hotspot",
    title: "Hematite sample",
    detail:
      "Sample the hematite-cemented substrate at the strongest orbital hematite signal on the traverse.",
    dwellMin: 40,
    priority: "Must",
  },
};

export const GALE_BBOX: [number, number, number, number] = [
  137.32, -4.76, 137.46, -4.6,
];

export const MISSION = {
  id: "hematite-ridge",
  name: "Hematite Ridge",
  site: "Gale Crater · Aeolis Mons",
  crew: 4,
  suitPairs: 2,
  evaLimitHours: 6,
  doseLimitMsv: 0.25,
  baseAltitudeM: -4380,
  targetAltitudeM: -4147,
  description:
    "A four-person surface excursion from the pressurised rover at Murray Buttes to the hematite-rich ridge above the Bagnold dune field. Two suit pairs work the traverse; the rover can reposition to carry tools and samples.",
};
