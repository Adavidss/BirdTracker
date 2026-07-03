// Minimal typings for the leaflet.heat plugin (no official @types package).
// The plugin patches L with heatLayer when imported for its side effect.

import type * as L from "leaflet";

declare module "leaflet" {
  type HeatLatLngTuple = [number, number, number?];

  interface HeatMapOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  function heatLayer(latlngs: HeatLatLngTuple[], options?: HeatMapOptions): L.Layer;
}
