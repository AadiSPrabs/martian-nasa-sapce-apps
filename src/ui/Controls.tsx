import { useEffect, useState } from "react";
import type { Viewer } from "cesium";
import { Cartesian3, Ellipsoid, Math as CesiumMath } from "cesium";
import { Home, Maximize2, Minus, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

const MARS = Ellipsoid.MARS;
const HOME_HEIGHT = 3.1 * 3_396_190;

function goHome(viewer: Viewer) {
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(-70, 5, HOME_HEIGHT, MARS),
    orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
  });
}

export function Controls({ viewer }: { viewer: Viewer | null }) {
  const [heading, setHeading] = useState(0);
  const [is2d, setIs2d] = useState(false);

  useEffect(() => {
    if (!viewer) return;
    const update = () => {
      setHeading(((viewer.camera.heading * 180) / Math.PI + 360) % 360);
    };
    viewer.camera.changed.addEventListener(update);
    update();
    return () => {
      viewer.camera.changed.removeEventListener(update);
    };
  }, [viewer]);

  const zoom = (direction: "in" | "out") => {
    if (!viewer) return;
    const height = viewer.camera.positionCartographic.height;
    const amount = Math.max(20_000, height * 0.4);
    if (direction === "in") viewer.camera.zoomIn(amount);
    else viewer.camera.zoomOut(amount);
  };

  const toggle2d = () => {
    if (!viewer) return;
    if (is2d) {
      viewer.scene.morphTo3D(1);
      setIs2d(false);
    } else {
      viewer.scene.morphTo2D(1);
      setIs2d(true);
    }
  };

  return (
    <div className="hud-right">
      <button
        className="compass"
        type="button"
        aria-label="Reset north"
        title="Reset north"
        onClick={() => {
          if (!viewer) return;
          viewer.camera.setView({
            orientation: {
              heading: 0,
              pitch: viewer.camera.pitch,
              roll: 0,
            },
          });
        }}
      >
        <span className="compass-n">N</span>
        <span
          className="compass-needle"
          style={{ transform: `rotate(${-heading}deg)` }}
        />
        <span className="compass-cap" />
      </button>

      <div className="control-stack">
        <div className="control-row">
          <button className="ctrl" type="button" aria-label="Zoom in" onClick={() => zoom("in")}>
            <Plus size={15} strokeWidth={1.7} />
          </button>
          <button className="ctrl" type="button" aria-label="Zoom out" onClick={() => zoom("out")}>
            <Minus size={15} strokeWidth={1.7} />
          </button>
        </div>
        <div className="control-row">
          <button
            className="ctrl"
            type="button"
            aria-label="Reset view"
            onClick={() => viewer && goHome(viewer)}
          >
            <Home size={15} strokeWidth={1.6} />
          </button>
          <button
            className="ctrl ctrl-text"
            type="button"
            aria-label="Toggle 2D and 3D"
            onClick={toggle2d}
          >
            {is2d ? "3D" : "2D"}
          </button>
        </div>
        <div className="control-row">
          <button
            className="ctrl"
            type="button"
            aria-label="Enter fullscreen"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen();
            }}
          >
            <Maximize2 size={15} strokeWidth={1.6} />
          </button>
          <button
            className="ctrl"
            type="button"
            aria-label="Reset north"
            onClick={() => viewer?.camera.setView({ orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 } })}
          >
            <RotateCcw size={15} strokeWidth={1.6} />
          </button>
        </div>
        <div className="control-row">
          <button className="ctrl" type="button" aria-label="Layer settings">
            <SlidersHorizontal size={15} strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </div>
  );
}
