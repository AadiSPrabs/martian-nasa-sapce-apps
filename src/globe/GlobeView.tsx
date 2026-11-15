import { useEffect, useRef } from "react";
import * as Cesium from "cesium";

import { mountSectors } from "./sectors";
import type { GlobePlace, HoverInfo } from "./types";
import { getMarsSun } from "./mars24";

const MARS = Cesium.Ellipsoid.MARS;
Cesium.Ellipsoid.default = MARS;

const TREK = "https://trek.nasa.gov/mars/trekarcgis/rest/services";

function exportUrl(service: string) {
  return `${TREK}/${service}/ImageServer/exportImage?bbox={westDegrees},{southDegrees},{eastDegrees},{northDegrees}&bboxSR=104905&imageSR=104905&size={width},{height}&format=jpg&f=image`;
}

type GlobeViewProps = {
  onReady?: () => void;
  onHover?: (hover: HoverInfo | null) => void;
  onSelect?: (place: GlobePlace) => void;
  onViewer?: (viewer: Cesium.Viewer | null) => void;
  onSurfaceClick?: (lon: number, lat: number) => void;
  site?: { lon: number; lat: number; name: string };
  sunOn?: boolean;
};

export function GlobeView({
  onReady,
  onHover,
  onSelect,
  onViewer,
  onSurfaceClick,
  site,
  sunOn = true,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const atmosphereRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const sunOnRef = useRef(sunOn);
  const updateAtmosphereRef = useRef<(() => void) | null>(null);
  const surfaceClickRef = useRef(onSurfaceClick);
  const beaconRef = useRef<Cesium.Entity | null>(null);
  sunOnRef.current = sunOn;
  surfaceClickRef.current = onSurfaceClick;
  const readyRef = useRef(onReady);
  const hoverRef = useRef(onHover);
  const selectRef = useRef(onSelect);
  const viewerCallbackRef = useRef(onViewer);
  readyRef.current = onReady;
  hoverRef.current = onHover;
  selectRef.current = onSelect;
  viewerCallbackRef.current = onViewer;

  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Cesium.Viewer(containerRef.current, {
      globe: new Cesium.Globe(MARS),
      terrainProvider: new Cesium.EllipsoidTerrainProvider({ ellipsoid: MARS }),
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: false,
      contextOptions: {
        webgl: {
          antialias: true,
        },
      },
    });

    const credit = viewer.cesiumWidget.creditContainer as HTMLElement | undefined;
    if (credit) credit.style.display = "none";

    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#2a1a14");
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.dynamicAtmosphereLighting = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.atmosphereLightIntensity = 3.0;
    viewer.scene.globe.atmosphereMieCoefficient = new Cesium.Cartesian3(
      9e-6,
      7e-6,
      5e-6,
    );
    viewer.scene.globe.atmosphereRayleighCoefficient = new Cesium.Cartesian3(
      4.2e-6,
      3.0e-6,
      2.0e-6,
    );
    viewer.scene.globe.atmosphereMieScaleHeight = 11_000;
    viewer.scene.globe.atmosphereRayleighScaleHeight = 11_000;
    viewer.scene.globe.atmosphereHueShift = 0.02;
    viewer.scene.globe.atmosphereSaturationShift = -0.1;
    viewer.scene.globe.atmosphereBrightnessShift = 0.04;
    viewer.scene.fog.enabled = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Infinity;
    viewer.scene.globe.maximumScreenSpaceError = 0.9;
    viewer.scene.globe.tileCacheSize = 150;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 300_000;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30_000_000;

    // Cesium's Camera is created with the WGS84 ellipsoid. At Mars-scale
    // close views its cartographic conversion recurses inside the Earth
    // ellipsoid, so bind the camera to Mars explicitly.
    (viewer.camera as unknown as { _ellipsoid: Cesium.Ellipsoid })._ellipsoid = MARS;

    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;

    // A sparse generated starfield. No cubemap seams, just a few distant lights.
    const stars = new Cesium.PointPrimitiveCollection();
    let seed = 0x6d617273;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const starDirections: Cesium.Cartesian3[] = [];
    for (let i = 0; i < 170; i++) {
      const z = rand() * 2 - 1;
      const phi = rand() * Cesium.Math.TWO_PI;
      const r = Math.sqrt(1 - z * z);
      const dir = new Cesium.Cartesian3(r * Math.cos(phi), r * Math.sin(phi), z);
      starDirections.push(dir);
      const warm = rand();
      const color =
        warm > 0.82
          ? Cesium.Color.fromCssColorString("#FFE2BD")
          : warm < 0.16
            ? Cesium.Color.fromCssColorString("#CFE3FF")
            : Cesium.Color.WHITE;
      stars.add({
        position: Cesium.Cartesian3.multiplyByScalar(
          dir,
          1.4e8,
          new Cesium.Cartesian3(),
        ),
        pixelSize: 0.8 + rand() * 1.5,
        color: color.withAlpha(0.55 + rand() * 0.4),
      });
    }
    viewer.scene.primitives.add(stars);

    for (let i = 0; i < 7; i++) {
      const dir = starDirections[i * 17];
      stars.add({
        position: Cesium.Cartesian3.multiplyByScalar(
          dir,
          1.4e8,
          new Cesium.Cartesian3(),
        ),
        pixelSize: 3.4,
        color: Cesium.Color.WHITE.withAlpha(0.95),
      });
    }

    // Real-time Mars sun. Mars24 gives the subsolar point; the directional
    // light and the visible sun sprite both follow it.
    const marsSun = getMarsSun();
    const sunDirection = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.fromDegrees(marsSun.lonEast, marsSun.lat, 0, MARS),
      new Cesium.Cartesian3(),
    );
    const sunEntity = viewer.entities.add({
      id: "mars-sun",
      position: Cesium.Cartesian3.multiplyByScalar(
        sunDirection,
        1.0e8,
        new Cesium.Cartesian3(),
      ),
      billboard: {
        image: "/data/sun.png",
        width: 72,
        height: 72,
        disableDepthTestDistance: 0,
        scaleByDistance: new Cesium.NearFarScalar(1.0e7, 2.2, 1.0e8, 1.0),
      },
    });

    const sunLight = new Cesium.DirectionalLight({
      direction: Cesium.Cartesian3.negate(sunDirection, new Cesium.Cartesian3()),
      intensity: 1.0,
    });
    viewer.scene.light = sunLight;

    const applySun = () => {
      if (viewer.isDestroyed()) return;
      const s = getMarsSun();
      const dir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.fromDegrees(s.lonEast, s.lat, 0, MARS),
        new Cesium.Cartesian3(),
      );
      sunEntity.position = new Cesium.ConstantPositionProperty(
        Cesium.Cartesian3.multiplyByScalar(
          dir,
          1.0e8,
          new Cesium.Cartesian3(),
        ),
      );
      sunLight.direction = Cesium.Cartesian3.negate(
        dir,
        new Cesium.Cartesian3(),
      );
      viewer.scene.requestRender();
    };
    applySun();
    // Cesium can defer the first custom-light uniform update; re-apply once
    // the scene has completed its first frames.
    const sunSettleTimers = [
      window.setTimeout(applySun, 300),
      window.setTimeout(applySun, 1500),
    ];

    viewer.scene.postProcessStages.fxaa.enabled = true;

    const beacon = viewer.entities.add({
      id: "astronaut-beacon",
      position: Cesium.Cartesian3.fromDegrees(
        site?.lon ?? 137.39,
        site?.lat ?? -4.68,
        900,
        MARS,
      ),
      point: {
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString("#E08A6A"),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
        outlineWidth: 2,
        disableDepthTestDistance: 0,
      },
      label: {
        text: `YOU · ${site?.name ?? "GALE CRATER"}`,
        font: "500 10px 'IBM Plex Mono', monospace",
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#0b0d0f").withAlpha(0.76),
        backgroundPadding: new Cesium.Cartesian2(5, 3),
        pixelOffset: new Cesium.Cartesian2(0, -18),
        disableDepthTestDistance: 0,
      },
    });
    beaconRef.current = beacon;

    const surfaceHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    surfaceHandler.setInputAction(
      (movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        const cartesian = viewer.camera.pickEllipsoid(movement.position, MARS);
        if (!cartesian) return;
        const carto = Cesium.Cartographic.fromCartesian(cartesian, MARS);
        if (!carto) return;
        surfaceClickRef.current?.(
          Cesium.Math.toDegrees(carto.longitude),
          Cesium.Math.toDegrees(carto.latitude),
        );
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );

    const imagery = new Cesium.SingleTileImageryProvider({
      url: "/data/globe/mars-viking-relief-4k.jpg",
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      tileWidth: 4096,
      tileHeight: 2048,
    });
    viewer.imageryLayers.addImageryProvider(imagery);

    // Regional LOD: stream native Mars Trek exports when the camera is close
    // enough that the 4K base texture would pixelate.
    const regional = new Cesium.UrlTemplateImageryProvider({
      url: exportUrl("Mars_Viking_MDIM21_ClrMosaic_global_232m"),
      tilingScheme: new Cesium.GeographicTilingScheme({ ellipsoid: MARS }),
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      minimumLevel: 6,
      maximumLevel: 9,
      tileWidth: 512,
      tileHeight: 512,
      enablePickFeatures: false,
    });
    viewer.imageryLayers.addImageryProvider(regional);

    // True HiRISE detail over Gale: the same imagery used by the field atlas.
    const galeDetail = new Cesium.UrlTemplateImageryProvider({
      url: exportUrl("curiosity_hirise_mosaic"),
      tilingScheme: new Cesium.GeographicTilingScheme({ ellipsoid: MARS }),
      rectangle: Cesium.Rectangle.fromDegrees(137.12, -4.93, 137.73, -4.25),
      minimumLevel: 9,
      maximumLevel: 17,
      tileWidth: 512,
      tileHeight: 512,
      enablePickFeatures: false,
    });
    viewer.imageryLayers.addImageryProvider(galeDetail);

    const viewLon = ((marsSun.lonEast + 48 + 540) % 360) - 180;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(viewLon, 5, 3.1 * 3_396_190, MARS),
      orientation: {
        heading: 0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
    });

    // A few brighter "lights" in the sky around the opening view, still fixed
    // in the star frame and occluded by the globe.
    const camDir = Cesium.Cartesian3.normalize(
      viewer.camera.position,
      new Cesium.Cartesian3(),
    );
    const offsets = [
      [0.31, 0.2],
      [0.37, 1.6],
      [0.43, 3.2],
      [0.35, 4.7],
    ];
    const forward = Cesium.Cartesian3.negate(camDir, new Cesium.Cartesian3());
    offsets.forEach(([angle, phase], index) => {
      const dir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(
            forward,
            Math.cos(angle),
            new Cesium.Cartesian3(),
          ),
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(
              viewer.camera.right,
              Math.sin(angle) * Math.cos(phase),
              new Cesium.Cartesian3(),
            ),
            Cesium.Cartesian3.multiplyByScalar(
              viewer.camera.up,
              Math.sin(angle) * Math.sin(phase),
              new Cesium.Cartesian3(),
            ),
            new Cesium.Cartesian3(),
          ),
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
      stars.add({
        position: Cesium.Cartesian3.multiplyByScalar(
          dir,
          1.4e8,
          new Cesium.Cartesian3(),
        ),
        pixelSize: 4.4 + index * 0.4,
        color:
          index % 3 === 0
            ? Cesium.Color.fromCssColorString("#CFE3FF")
            : index % 3 === 1
              ? Cesium.Color.fromCssColorString("#FFE2BD")
              : Cesium.Color.WHITE,
      });
    });

    // Only Gale has submeter imagery. Elsewhere, stop before the 232 m/px
    // regional mosaic is magnified into mush.
    const updateZoomLimit = () => {
      const carto = viewer.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const overGale =
        lon >= 137.12 && lon <= 137.73 && lat >= -4.93 && lat <= -4.25;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = overGale
        ? 2_500
        : 300_000;
      if (!overGale && carto.height < 300_000) {
        viewer.camera.zoomOut(300_000 - carto.height);
      }
    };
    viewer.camera.changed.addEventListener(updateZoomLimit);
    updateZoomLimit();

    const updateAtmosphere = () => {
      const element = atmosphereRef.current;
      if (!element) return;
      if (!sunOnRef.current) {
        element.style.opacity = "0";
        return;
      }
      const center = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        Cesium.Cartesian3.ZERO,
      );
      const edgePoint = Cesium.Cartesian3.multiplyByScalar(
        viewer.camera.right,
        MARS.maximumRadius,
        new Cesium.Cartesian3(),
      );
      const edge = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        edgePoint,
      );
      if (!center || !edge) {
        element.style.opacity = "0";
        return;
      }
      const radius = Cesium.Cartesian2.distance(center, edge);
      const maxDimension = Math.max(
        viewer.scene.canvas.clientWidth,
        viewer.scene.canvas.clientHeight,
      );
      if (radius < 30 || radius > maxDimension * 1.2) {
        element.style.opacity = "0";
        return;
      }
      const size = radius * 2.25;
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;
      element.style.left = `${center.x - size / 2}px`;
      element.style.top = `${center.y - size / 2}px`;
      element.style.opacity = "1";
    };
    viewer.camera.changed.addEventListener(updateAtmosphere);
    updateAtmosphereRef.current = updateAtmosphere;
    updateAtmosphere();

    viewer.scene.requestRender();

    viewer.scene.globe.tileLoadProgressEvent.addEventListener(() => {
      viewer.scene.requestRender();
    });

    viewerRef.current = viewer;
    viewerCallbackRef.current?.(viewer);

    if (import.meta.env.DEV) {
      viewer.scene.renderError.addEventListener((_scene, error) => {
        console.error("[cesium renderError]", error?.stack ?? error);
      });
    }

    if (import.meta.env.DEV) {
      (
        window as unknown as {
          __viewer?: Cesium.Viewer;
          __Cesium?: typeof Cesium;
        }
      ).__viewer = viewer;
      (
        window as unknown as {
          __viewer?: Cesium.Viewer;
          __Cesium?: typeof Cesium;
        }
      ).__Cesium = Cesium;
    }

    let disposed = false;
    let sectorCleanup: (() => void) | undefined;
    // Let the globe texture and first frame paint before fetching/adding the
    // region and traverse entity layer.
    const sectorTimer = window.setTimeout(() => {
      mountSectors(viewer, {
        onHover: (hover) => hoverRef.current?.(hover),
        onSelect: (place) => selectRef.current?.(place),
      })
        .then((cleanup) => {
          if (disposed) {
            cleanup();
            return;
          }
          sectorCleanup = cleanup;
          viewer.scene.requestRender();
          window.setTimeout(() => viewer.scene.requestRender(), 700);
        })
        .catch((err) => console.error("[globe] sector layer failed", err));
    }, 350);

    const readyTimer = window.setTimeout(() => {
      viewer.scene.requestRender();
      readyRef.current?.();
    }, 1400);
    const renderTimer = window.setTimeout(() => viewer.scene.requestRender(), 400);

    const sunTimer = window.setInterval(applySun, 60_000);

    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      window.clearTimeout(renderTimer);
      window.clearInterval(sunTimer);
      sunSettleTimers.forEach((timer) => window.clearTimeout(timer));
      viewer.camera.changed.removeEventListener(updateZoomLimit);
      viewer.camera.changed.removeEventListener(updateAtmosphere);
      updateAtmosphereRef.current = null;
      window.clearTimeout(sectorTimer);
      surfaceHandler.destroy();
      beaconRef.current = null;
      sectorCleanup?.();
      viewerRef.current = null;
      viewerCallbackRef.current?.(null);
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const beacon = beaconRef.current;
    if (!viewer || !beacon || !site) return;
    beacon.position = new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(site.lon, site.lat, 900, MARS),
    );
    if (beacon.label) {
      beacon.label.text = new Cesium.ConstantProperty(`YOU · ${site.name}`);
    }
    viewer.scene.requestRender();
  }, [site]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scene.globe.enableLighting = sunOn;
    viewer.scene.globe.dynamicAtmosphereLighting = sunOn;
    const sun = viewer.entities.getById("mars-sun");
    if (sun) sun.show = sunOn;
    if (!sunOn) {
      if (atmosphereRef.current) atmosphereRef.current.style.opacity = "0";
    } else {
      updateAtmosphereRef.current?.();
    }
    viewer.scene.requestRender();
  }, [sunOn]);

  return (
    <>
      <div ref={containerRef} className="globe-canvas" />
      <div ref={atmosphereRef} className="globe-atmosphere" />
    </>
  );
}
