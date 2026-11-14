import React from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/ibm-plex-sans/latin-300.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "leaflet/dist/leaflet.css";
import "./styles/index.css";

import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
