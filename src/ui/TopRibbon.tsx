import {
  Box,
  CircleHelp,
  Flag,
  Layers,
  Route,
  Ruler,
  Share2,
  Tag,
} from "lucide-react";

import { SearchBox } from "../search/SearchBox";
import type { GlobePlace } from "../globe/types";

type TopRibbonProps = {
  onSearchSelect?: (place: GlobePlace) => void;
  onPlan?: () => void;
  onLayers?: () => void;
  onLabels?: () => void;
  labelsOn?: boolean;
  onShare?: () => void;
  onMissions?: () => void;
};

export function TopRibbon({
  onSearchSelect,
  onPlan,
  onLayers,
  onLabels,
  labelsOn,
  onShare,
  onMissions,
}: TopRibbonProps) {
  return (
    <header className="ribbon">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-word">GROUNDTRUTH</span>
      </div>

      <SearchBox onSelect={onSearchSelect} />

      <nav className="tabs" aria-label="Mode">
        <button className="tab active" type="button">
          Explore
        </button>
        <button className="tab" type="button" onClick={onPlan}>
          Plan
        </button>
      </nav>

      <span className="divider" />

      <nav className="tools" aria-label="Explore tools">
        <button className="tool" type="button" onClick={onLayers}>
          <Layers size={15} strokeWidth={1.6} />
          <span>Layers</span>
        </button>
        <button className={`tool ${labelsOn ? "active" : ""}`} type="button" onClick={onLabels}>
          <Tag size={15} strokeWidth={1.6} />
          <span>Labels</span>
        </button>
        <button
          className="tool"
          type="button"
          disabled
          title="Measure tool is not enabled in this build"
        >
          <Ruler size={15} strokeWidth={1.6} />
          <span>Measure</span>
        </button>
        <button
          className="tool"
          type="button"
          disabled
          title="Use the 2D control at bottom-right"
        >
          <Box size={15} strokeWidth={1.6} />
          <span>2D / 3D</span>
        </button>
      </nav>

      <span className="spacer" />

      <button className="plan-btn" type="button" onClick={onPlan}>
        <Route size={14} strokeWidth={1.7} />
        Plan traverse
      </button>
      <button className="ghost" type="button" onClick={onMissions}>
        <Flag size={14} strokeWidth={1.6} />
        <span>Missions</span>
      </button>
      <button className="ghost" type="button" onClick={onShare}>
        <Share2 size={14} strokeWidth={1.6} />
        <span>Share</span>
      </button>
      <button className="ghost round" type="button" aria-label="Help">
        <CircleHelp size={14} strokeWidth={1.6} />
      </button>
    </header>
  );
}
