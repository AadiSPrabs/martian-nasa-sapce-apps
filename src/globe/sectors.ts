import * as Cesium from "cesium";

import type { GlobePlace, HoverInfo } from "./types";

const MARS = Cesium.Ellipsoid.MARS;
const BASE = "/data/globe";

type Callbacks = {
  onHover: (hover: HoverInfo | null) => void;
  onSelect: (place: GlobePlace) => void;
};

type Feature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
};

type Collection = { type: "FeatureCollection"; features: Feature[] };

const REGION_LINE = Cesium.Color.fromCssColorString("#F4F1EA").withAlpha(0.28);
const REGION_LINE_HOVER = Cesium.Color.fromCssColorString("#E08A6A").withAlpha(0.98);
const LABEL_REST = Cesium.Color.fromCssColorString("#F4F1EA").withAlpha(0.78);
const LABEL_HOVER = Cesium.Color.fromCssColorString("#E08A6A");

const TIER1_REGIONS = new Set([
  "Tharsis Volcanic Region",
  "Valles Marineris",
  "Hellas Planitia",
  "Elysium Planitia",
  "Syrtis Major",
  "Planum Boreum",
]);

const MOBILE_REGIONS = new Set([
  "Planum Boreum",
  "Valles Marineris",
]);

let labelsEnabled = true;
let refreshLabels: (() => void) | null = null;

type HitArea = {
  place: GlobePlace;
  entity: Cesium.Entity;
  rings: number[][][];
  bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number };
};

async function loadCollection(name: string): Promise<Collection> {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return (await res.json()) as Collection;
}

function toPositions(ring: number[][]): Cesium.Cartesian3[] {
  const flat: number[] = [];
  for (const [lon, lat] of ring) flat.push(lon, lat);
  return Cesium.Cartesian3.fromDegreesArray(flat, MARS);
}

function toHierarchy(rings: number[][][]): Cesium.PolygonHierarchy | null {
  if (!rings.length || rings[0].length < 3) return null;
  const outer = toPositions(rings[0]);
  const holes = rings
    .slice(1)
    .filter((r) => r.length >= 3)
    .map((r) => new Cesium.PolygonHierarchy(toPositions(r)));
  return new Cesium.PolygonHierarchy(outer, holes);
}

function placeFromEntity(entity: Cesium.Entity): GlobePlace | null {
  const props = entity.properties as unknown as Record<
    string,
    { getValue: () => unknown }
  > | null;
  if (!props) return null;
  const kind = props.kind?.getValue?.() as GlobePlace["kind"] | undefined;
  if (!kind || !["region", "quad", "feature", "landing"].includes(kind)) {
    return null;
  }
  return {
    id: String(props.id?.getValue?.() ?? entity.id),
    name: String(props.name?.getValue?.() ?? entity.name ?? ""),
    kind,
    lon: Number(props.lon?.getValue?.() ?? 0),
    lat: Number(props.lat?.getValue?.() ?? 0),
    code: props.code ? String(props.code.getValue?.()) : undefined,
    mission: props.mission ? String(props.mission.getValue?.()) : undefined,
    year: props.year ? Number(props.year.getValue?.()) : undefined,
    color: props.color ? String(props.color.getValue?.()) : undefined,
  };
}

function labelFor(
  place: GlobePlace,
  options: {
    font: string;
    color: Cesium.Color;
    y: number;
    far: number;
    text?: string;
  },
): Cesium.LabelGraphics {
  return new Cesium.LabelGraphics({
    text: options.text ?? place.name.toUpperCase(),
    font: options.font,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    fillColor: options.color,
    outlineColor: Cesium.Color.BLACK.withAlpha(0.9),
    outlineWidth: 3,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    pixelOffset: new Cesium.Cartesian2(0, options.y),
    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, options.far),
    disableDepthTestDistance: 0,
    eyeOffset: new Cesium.Cartesian3(0, 0, -50000),
  });
}

function bboxOf(rings: number[][][]) {
  let minLon = 999;
  let maxLon = -999;
  let minLat = 90;
  let maxLat = -90;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

function ringContains(lon: number, lat: number, ring: number[][], shift: boolean) {
  let inside = false;
  const x = shift && lon < 0 ? lon + 360 : lon;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = ring[i][0];
    let xj = ring[j][0];
    if (shift) {
      if (xi < 0) xi += 360;
      if (xj < 0) xj += 360;
    }
    const yi = ring[i][1];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function areaContains(area: HitArea, lon: number, lat: number): boolean {
  const { bbox } = area;
  if (lat < bbox.minLat || lat > bbox.maxLat) return false;
  const shift = bbox.maxLon - bbox.minLon > 180;
  const x = shift && lon < 0 ? lon + 360 : lon;
  if (!shift && (x < bbox.minLon || x > bbox.maxLon)) return false;
  return area.rings.some((ring) => ringContains(lon, lat, ring, shift));
}

export async function mountSectors(
  viewer: Cesium.Viewer,
  callbacks: Callbacks,
): Promise<() => void> {
  const [regions, quads, features, landings, traverses] = await Promise.all([
    loadCollection("regions.geojson"),
    loadCollection("quads.geojson"),
    loadCollection("features.geojson"),
    loadCollection("landing-sites.geojson"),
    loadCollection("traverses.geojson"),
  ]);

  const entities: Cesium.Entity[] = [];
  const hitAreas: HitArea[] = [];
  const regionLabels: Array<{ entity: Cesium.Entity; tier1: boolean; mobile: boolean }> = [];
  const featureLabels: Cesium.Entity[] = [];
  const landingLabels: Cesium.Entity[] = [];
  const quadEntities: Cesium.Entity[] = [];
  const regionNames = new Set(regions.features.map((f) => String(f.properties.name)));

  for (const f of regions.features) {
    const p = f.properties as Record<string, unknown>;
    if (f.geometry.type !== "Polygon") continue;
    const rings = f.geometry.coordinates as number[][][];
    const hierarchy = toHierarchy(rings);
    if (!hierarchy) continue;
    const place: GlobePlace = {
      id: String(p.id),
      name: String(p.name),
      kind: "region",
      lon: Number(p.lon ?? 0),
      lat: Number(p.lat ?? 0),
    };
    const entity = viewer.entities.add({
      id: place.id,
      name: place.name,
      properties: place,
      position: Cesium.Cartesian3.fromDegrees(place.lon, place.lat, 0, MARS),
      polygon: {
        hierarchy,
        show: false,
        fill: false,
        outline: true,
        outlineColor: REGION_LINE,
        outlineWidth: 1,
        height: 1000,
        arcType: Cesium.ArcType.GEODESIC,
      },
      label: labelFor(place, {
        font: "500 10px 'IBM Plex Mono', monospace",
        color: LABEL_REST,
        y: -9,
        far: 20_000_000,
      }),
    });
    entities.push(entity);
    regionLabels.push({
      entity,
      tier1: TIER1_REGIONS.has(place.name),
      mobile: MOBILE_REGIONS.has(place.name),
    });
    hitAreas.push({
      place,
      entity,
      rings,
      bbox: bboxOf(rings),
    });
  }

  // Quadrangles are a secondary sector system, off by default.
  for (const f of quads.features) {
    const p = f.properties as Record<string, unknown>;
    if (f.geometry.type !== "Polygon") continue;
    const rings = f.geometry.coordinates as number[][][];
    const hierarchy = toHierarchy(rings);
    if (!hierarchy) continue;
    const entity = viewer.entities.add({
      id: String(p.id),
      name: String(p.name),
      properties: { ...p, kind: "quad" },
      show: false,
      position: Cesium.Cartesian3.fromDegrees(
        Number(p.lon ?? 0),
        Number(p.lat ?? 0),
        0,
        MARS,
      ),
      polygon: {
        hierarchy,
        show: false,
        fill: false,
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#8FA9B3").withAlpha(0.38),
        outlineWidth: 1,
        height: 1000,
        arcType: Cesium.ArcType.GEODESIC,
      },
      label: labelFor(
        {
          id: String(p.id),
          name: String(p.name),
          kind: "quad",
          lon: Number(p.lon ?? 0),
          lat: Number(p.lat ?? 0),
        },
        {
          font: "500 9px 'IBM Plex Mono', monospace",
          color: Cesium.Color.fromCssColorString("#8FA9B3").withAlpha(0.8),
          y: -7,
          far: 5_000_000,
        },
      ),
    });
    entities.push(entity);
    quadEntities.push(entity);
  }

  for (const f of features.features) {
    const p = f.properties as Record<string, unknown>;
    if (f.geometry.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates as number[];
    const place: GlobePlace = {
      id: String(p.id),
      name: String(p.name),
      kind: "feature",
      lon,
      lat,
      template: p.template ? String(p.template) : undefined,
    };
    const entity = viewer.entities.add({
      id: place.id,
      name: place.name,
      properties: place,
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0, MARS),
      point: {
        pixelSize: 4,
        color: Cesium.Color.fromCssColorString("#D9A441"),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
        outlineWidth: 1,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9_000_000),
      },
      label: regionNames.has(place.name)
        ? undefined
        : labelFor(place, {
            font: "500 11px 'IBM Plex Sans', sans-serif",
            color: Cesium.Color.fromCssColorString("#F4F1EA").withAlpha(0.86),
            y: -8,
            far: 16_000_000,
          }),
    });
    entities.push(entity);
    if (entity.label) featureLabels.push(entity);
  }

  for (const f of landings.features) {
    const p = f.properties as Record<string, unknown>;
    if (f.geometry.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates as number[];
    const place: GlobePlace = {
      id: String(p.id),
      name: String(p.mission ?? p.name),
      kind: "landing",
      lon,
      lat,
      mission: String(p.mission ?? ""),
      year: Number(p.year ?? 0),
      color: String(p.color ?? "#D9A441"),
    };
    const color = Cesium.Color.fromCssColorString(place.color ?? "#D9A441");
    const entity = viewer.entities.add({
      id: place.id,
      name: place.name,
      properties: place,
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0, MARS),
      point: {
        pixelSize: 7,
        color,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.9),
        outlineWidth: 1.5,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12_000_000),
      },
      label: labelFor(place, {
        font: "500 10px 'IBM Plex Mono', monospace",
        color: Cesium.Color.fromCssColorString("#F4F1EA").withAlpha(0.92),
        y: -10,
        far: 15_000_000,
        text: (place.mission ?? place.name).toUpperCase(),
      }),
    });
    entities.push(entity);
    landingLabels.push(entity);
  }

  for (const f of traverses.features) {
    const p = f.properties as Record<string, unknown>;
    const coords =
      f.geometry.type === "LineString"
        ? (f.geometry.coordinates as number[][])
        : [];
    if (coords.length < 2) continue;
    const flat: number[] = [];
    for (const [lon, lat] of coords) flat.push(lon, lat);
    const color = Cesium.Color.fromCssColorString(String(p.color ?? "#D9A441"));
    const entity = viewer.entities.add({
      id: String(p.id),
      name: `${p.mission} traverse`,
      properties: { ...p, kind: "traverse" },
      show: true,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(flat, MARS),
        width: 2.4,
        material: color,
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: true,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12_000_000),
      },
    });
    entities.push(entity);
  }

  let selectedEntity: Cesium.Entity | null = null;

  const setRest = (entity: Cesium.Entity) => {
    if (entity.polygon) {
      if (entity !== selectedEntity) entity.polygon.show = new Cesium.ConstantProperty(false);
      entity.polygon.outlineColor = new Cesium.ConstantProperty(REGION_LINE);
    }
    if (entity.label) {
      entity.label.fillColor = new Cesium.ConstantProperty(LABEL_REST);
    }
  };

  const setHover = (entity: Cesium.Entity) => {
    if (entity.polygon) {
      entity.polygon.show = new Cesium.ConstantProperty(true);
      entity.polygon.outlineColor = new Cesium.ConstantProperty(REGION_LINE_HOVER);
    }
    if (entity.label) {
      entity.label.fillColor = new Cesium.ConstantProperty(LABEL_HOVER);
    }
  };

  const setLabelShow = (entity: Cesium.Entity, show: boolean) => {
    const label = entity.label;
    if (!label) return;
    if (label.show?.getValue?.() !== show) {
      label.show = new Cesium.ConstantProperty(show);
    }
  };

  const updateLabelVisibility = () => {
    const height = viewer.camera.positionCartographic.height;
    const planet = height > 6_000_000;
    const local = height <= 2_500_000;
    const compact = window.innerWidth < 640;
    for (const { entity, tier1, mobile } of regionLabels) {
      setLabelShow(entity, labelsEnabled && (planet ? (compact ? mobile : tier1) : !local));
    }
    for (const entity of featureLabels) {
      setLabelShow(entity, labelsEnabled && !compact && height <= 6_000_000);
    }
    for (const entity of landingLabels) {
      setLabelShow(entity, labelsEnabled && !compact && height <= 5_000_000);
    }
    viewer.scene.requestRender();
  };

  let labelFrame = 0;
  const scheduleLabelUpdate = () => {
    if (labelFrame) return;
    labelFrame = window.requestAnimationFrame(() => {
      labelFrame = 0;
      updateLabelVisibility();
    });
  };

  const onResize = () => scheduleLabelUpdate();
  window.addEventListener("resize", onResize);

  viewer.camera.percentageChanged = 0.02;
  viewer.camera.changed.addEventListener(scheduleLabelUpdate);
  refreshLabels = updateLabelVisibility;
  updateLabelVisibility();

  const hitTest = (position: Cesium.Cartesian2): GlobePlace | null => {
    const picked = viewer.scene.pick(position);
    if (picked?.id instanceof Cesium.Entity) {
      const place = placeFromEntity(picked.id);
      if (place) return place;
    }

    const ray = viewer.camera.getPickRay(position);
    if (!ray) return null;
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
    if (!cartesian) return null;
    const carto = Cesium.Cartographic.fromCartesian(cartesian, MARS);
    if (!carto) return null;
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);

    for (const area of hitAreas) {
      if (areaContains(area, lon, lat)) return area.place;
    }
    return null;
  };

  const entityForPlace = (place: GlobePlace): Cesium.Entity | null => {
    const area = hitAreas.find((a) => a.place.id === place.id);
    if (area) return area.entity;
    return (
      entities.find((e) => {
        const props = e.properties as unknown as Record<
          string,
          { getValue: () => unknown }
        > | null;
        return String(props?.id?.getValue?.() ?? "") === place.id;
      }) ?? null
    );
  };

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  let hoveredEntity: Cesium.Entity | null = null;
  let lastMove = 0;

  const clearHover = () => {
    if (hoveredEntity) {
      setRest(hoveredEntity);
      viewer.scene.requestRender();
    }
    hoveredEntity = null;
    viewer.scene.canvas.style.cursor = "";
  };

  handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    const now = performance.now();
    if (now - lastMove < 32) return;
    lastMove = now;

    const place = hitTest(movement.endPosition);
    const entity = place ? entityForPlace(place) : null;

    if (hoveredEntity && hoveredEntity !== entity) {
      setRest(hoveredEntity);
      viewer.scene.requestRender();
    }
    hoveredEntity = entity;

    if (place) {
      if (entity) setHover(entity);
      viewer.scene.canvas.style.cursor = "pointer";
      viewer.scene.requestRender();
      callbacks.onHover({
        ...place,
        x: movement.endPosition.x,
        y: movement.endPosition.y,
      });
    } else {
      viewer.scene.canvas.style.cursor = "";
      callbacks.onHover(null);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const place = hitTest(click.position);
    if (!place) return;
    const entity = entityForPlace(place);
    if (entity) {
      if (selectedEntity && selectedEntity !== entity) setRest(selectedEntity);
      selectedEntity = entity;
      setHover(entity);
      viewer.scene.requestRender();
    }

    const altitude =
      place.kind === "region"
        ? 2_000_000
        : place.kind === "quad"
          ? 1_600_000
          : place.kind === "landing"
            ? 380_000
            : 1_200_000;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(place.lon, place.lat, altitude, MARS),
      duration: 1.6,
      orientation: {
        heading: 0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
    });
    callbacks.onSelect(place);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return () => {
    clearHover();
    if (labelFrame) window.cancelAnimationFrame(labelFrame);
    refreshLabels = null;
    window.removeEventListener("resize", onResize);
    viewer.camera.changed.removeEventListener(scheduleLabelUpdate);
    handler.destroy();
    for (const entity of entities) viewer.entities.remove(entity);
  };
}

export function setQuadVisibility(viewer: Cesium.Viewer, visible: boolean) {
  for (const entity of viewer.entities.values) {
    const props = entity.properties as unknown as Record<
      string,
      { getValue: () => unknown }
    > | null;
    if (props?.kind?.getValue?.() === "quad") {
      entity.show = visible;
      if (entity.polygon) {
        entity.polygon.show = new Cesium.ConstantProperty(false);
      }
    }
  }
  viewer.scene.requestRender();
}

export function setTraversesVisible(viewer: Cesium.Viewer, visible: boolean) {
  for (const entity of viewer.entities.values) {
    const props = entity.properties as unknown as Record<
      string,
      { getValue: () => unknown }
    > | null;
    if (props?.kind?.getValue?.() === "traverse") {
      entity.show = visible;
    }
  }
  viewer.scene.requestRender();
}

export function setLabelsVisible(viewer: Cesium.Viewer, visible: boolean) {
  labelsEnabled = visible;
  refreshLabels?.();
  viewer.scene.requestRender();
}

export function flyToPlace(viewer: Cesium.Viewer, place: GlobePlace) {
  const altitude =
    place.kind === "region"
      ? 2_000_000
      : place.kind === "quad"
        ? 1_600_000
        : place.kind === "landing"
          ? 380_000
          : 1_200_000;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(place.lon, place.lat, altitude, MARS),
    duration: 1.5,
    orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
  });
}
