import { useState } from "react";
import type { Viewer } from "cesium";
import { X } from "lucide-react";

import { setQuadVisibility, setTraversesVisible } from "../globe/sectors";

type LayersPanelProps = {
  viewer: Viewer | null;
  onClose: () => void;
};

export function LayersPanel({ viewer, onClose }: LayersPanelProps) {
  const [quads, setQuads] = useState(false);
  const [traverses, setTraverses] = useState(true);

  return (
    <aside className="layers-panel" aria-label="Map layers">
      <div className="layers-head">
        <span>Layers</span>
        <button type="button" onClick={onClose} aria-label="Close layers">
          <X size={14} strokeWidth={1.7} />
        </button>
      </div>

      <div className="layers-body">
        <label className="layers-row locked">
          <input type="checkbox" checked readOnly />
          <i />
          <span>
            <b>Sector regions</b>
            <small>34 named regions · hover to reveal</small>
          </span>
        </label>

        <label className="layers-row">
          <input
            type="checkbox"
            checked={quads}
            onChange={(e) => {
              setQuads(e.target.checked);
              if (viewer) setQuadVisibility(viewer, e.target.checked);
            }}
          />
          <i />
          <span>
            <b>MC quadrangles</b>
            <small>30 cartographic sectors</small>
          </span>
        </label>

        <label className="layers-row">
          <input
            type="checkbox"
            checked={traverses}
            onChange={(e) => {
              setTraverses(e.target.checked);
              if (viewer) setTraversesVisible(viewer, e.target.checked);
            }}
          />
          <i />
          <span>
            <b>Rover traverses</b>
            <small>Curiosity · Perseverance · Spirit · Opportunity</small>
          </span>
        </label>

        <label className="layers-row locked">
          <input type="checkbox" checked readOnly />
          <i />
          <span>
            <b>Labels</b>
            <small>Zoom-managed · regions → features → sites</small>
          </span>
        </label>

        <div className="layers-note">
          HiRISE detail is available at Gale Crater. The rest of the globe uses the Viking 232 m/px mosaic.
        </div>
      </div>
    </aside>
  );
}
