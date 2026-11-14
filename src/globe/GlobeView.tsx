import { useEffect, useRef } from "react";
import * as Cesium from "cesium";

import { mountSectors } from "./sectors";
import type { GlobePlace, HoverInfo } from "./types";

const MARS = Cesium.Ellipsoid.MARS;
Cesium.Ellipsoid.default = MARS;

type GlobeViewProps = {
  onReady?: () => void;
  onHover?: (hover: HoverInfo | null) => void;
  onSelect?: (place: GlobePlace) => void;
  onViewer?: (viewer: Cesium.Viewer | null) => void;
};

export function GlobeView({
  onReady,
  onHover,
  onSelect,
  onViewer,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
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
    });

    const credit = viewer.cesiumWidget.creditContainer as HTMLElement | undefined;
    if (credit) credit.style.display = "none";

    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#2a1a14");
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.fog.enabled = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    viewer.scene.requestRenderMode = false;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 350_000;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30_000_000;

    // Cesium's Camera is created with the WGS84 ellipsoid. At Mars-scale
    // close views its cartographic conversion recurses inside the Earth
    // ellipsoid, so bind the camera to Mars explicitly.
    (viewer.camera as unknown as { _ellipsoid: Cesium.Ellipsoid })._ellipsoid = MARS;

    viewer.scene.skyBox = new Cesium.SkyBox({
      sources: {
        positiveX: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_px.jpg"),
        negativeX: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_mx.jpg"),
        positiveY: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_py.jpg"),
        negativeY: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_my.jpg"),
        positiveZ: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_pz.jpg"),
        negativeZ: Cesium.buildModuleUrl("Assets/Textures/SkyBox/tycho2t3_80_mz.jpg"),
      },
    });
    viewer.scene.skyBox.show = true;

    const imagery = new Cesium.SingleTileImageryProvider({
      url: "/data/globe/mars-viking-4k.jpg",
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      tileWidth: 4096,
      tileHeight: 2048,
    });
    viewer.imageryLayers.addImageryProvider(imagery);

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-70, 5, 3.1 * 3_396_190, MARS),
      orientation: {
        heading: 0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0,
      },
    });
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

    const readyTimer = window.setTimeout(() => {
      viewer.scene.requestRender();
      readyRef.current?.();
    }, 1400);
    const renderTimer = window.setTimeout(() => viewer.scene.requestRender(), 400);

    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      window.clearTimeout(renderTimer);
      sectorCleanup?.();
      viewerRef.current = null;
      viewerCallbackRef.current?.(null);
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  return <div ref={containerRef} className="globe-canvas" />;
}
