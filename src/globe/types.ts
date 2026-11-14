export type GlobeKind = "region" | "quad" | "feature" | "landing" | "traverse";

export type GlobePlace = {
  id: string;
  name: string;
  kind: GlobeKind;
  lon: number;
  lat: number;
  code?: string;
  mission?: string;
  year?: number;
  color?: string;
  template?: string;
};

export type HoverInfo = GlobePlace & {
  x: number;
  y: number;
};
