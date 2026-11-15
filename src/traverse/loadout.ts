export type LoadoutItem = {
  id: string;
  name: string;
  massKg: number;
  detail: string;
  tool?: string;
  benefit: string;
};

export const LOADOUT_ITEMS: LoadoutItem[] = [
  {
    id: "spare-o2",
    name: "Spare O2",
    massKg: 2.2,
    detail: "+1.2 h suit reserve",
    benefit: "Emergency reserve for the sampling stop",
  },
  {
    id: "spare-battery",
    name: "Spare battery",
    massKg: 2.8,
    detail: "+18% rover power",
    benefit: "Extends the rover reserve",
  },
  {
    id: "radiation-vest",
    name: "Radiation vest",
    massKg: 4.2,
    detail: "−35% dose",
    benefit: "Better for solar-event days",
  },
  {
    id: "drill",
    name: "Geology drill",
    massKg: 4.5,
    detail: "Unlocks rock sampling",
    tool: "drill",
    benefit: "Required for the slope-break sample",
  },
  {
    id: "spectrometer",
    name: "Spectrometer",
    massKg: 2.6,
    detail: "Unlocks spectral scans",
    tool: "spectrometer",
    benefit: "Adds a science variant at the target",
  },
  {
    id: "sample-bags",
    name: "Sample bags",
    massKg: 0.4,
    detail: "+4 sample slots",
    tool: "sample-bags",
    benefit: "Required to bring samples home",
  },
  {
    id: "comms-relay",
    name: "Comms relay",
    massKg: 3.5,
    detail: "Clears one comms shadow",
    benefit: "Useful outside the direct-to-Earth window",
  },
  {
    id: "thermal-shell",
    name: "Thermal shell",
    massKg: 1.8,
    detail: "+2 h thermal window",
    benefit: "Extends dusk/dawn traverses",
  },
];

export type Loadout = Record<string, boolean>;

export const DEFAULT_LOADOUT: Loadout = {
  "sample-bags": true,
  "spare-o2": true,
};

export function getLoadoutTotals(loadout: Loadout) {
  const active = LOADOUT_ITEMS.filter((item) => loadout[item.id]);
  const massKg = active.reduce((sum, item) => sum + item.massKg, 0);
  const tools = active.map((item) => item.tool).filter((tool): tool is string => Boolean(tool));
  const sampleSlots = 2 + (loadout["sample-bags"] ? 4 : 0);
  const powerBonus = loadout["spare-battery"] ? 18 : 0;
  const shielding = loadout["radiation-vest"] ? 0.65 : 1;
  return { active, massKg, tools, sampleSlots, powerBonus, shielding };
}

export function hasTool(loadout: Loadout, tool?: string) {
  if (!tool) return true;
  return getLoadoutTotals(loadout).tools.includes(tool);
}
