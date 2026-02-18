"use client";

import { useEffect, useRef } from "react";
import mapboxgl, { GeoJSONSource, LngLatLike, Marker } from "mapbox-gl";
import { Bar, Game, Team } from "@/lib/types";
import { MAP_DEFAULT_ZOOM } from "@/lib/constants";

import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

interface GameMapProps {
  position: { lat: number; lng: number } | null;
  teams: Record<string, Team>;
  bars: Record<string, Bar>;
  game: Game;
  enabled: boolean;
}

export function GameMap({ position, teams, bars, game, enabled }: GameMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [0, 0],
      zoom: MAP_DEFAULT_ZOOM,
      dragPan: false,
      scrollZoom: false,
      boxZoom: false,
      dragRotate: false,
      touchZoomRotate: false,
      doubleClickZoom: false,
      keyboard: false
    });

    mapRef.current.on("load", () => {
      const map = mapRef.current;
      if (!map) return;
      map.addSource("bars", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "bars-layer",
        type: "circle",
        source: "bars",
        paint: { "circle-color": "#9333ea", "circle-opacity": 0.2, "circle-radius": ["get", "pixelRadius"] }
      });

      map.addSource("game-circle", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "game-circle-layer",
        type: "circle",
        source: "game-circle",
        paint: { "circle-color": "#22c55e", "circle-opacity": 0.18, "circle-radius": ["get", "pixelRadius"] }
      });
    });

    return () => mapRef.current?.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position || !enabled) return;
    map.jumpTo({ center: [position.lng, position.lat] });
  }, [position, enabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const metersToPixels = (meters: number, lat: number, zoom: number) =>
      meters / ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom));

    const barFeatures = Object.values(bars).map((bar) => ({
      type: "Feature",
      properties: { pixelRadius: metersToPixels(bar.radius, bar.lat, map.getZoom()) },
      geometry: { type: "Point", coordinates: [bar.lng, bar.lat] as LngLatLike }
    }));

    const barsSource = map.getSource("bars") as GeoJSONSource;
    barsSource?.setData({ type: "FeatureCollection", features: barFeatures as never[] });

    const gameSource = map.getSource("game-circle") as GeoJSONSource;
    gameSource?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            pixelRadius: metersToPixels(game.circle_radius, game.circle_center_lat, map.getZoom())
          },
          geometry: {
            type: "Point",
            coordinates: [game.circle_center_lng, game.circle_center_lat]
          }
        }
      ] as never[]
    });
  }, [bars, game]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    Object.entries(teams).forEach(([id, team]) => {
      const existing = markersRef.current[id];
      if (existing) {
        existing.setLngLat([team.lng, team.lat]);
      } else {
        const el = document.createElement("div");
        el.className = "h-4 w-4 rounded-full border border-white";
        el.style.backgroundColor = team.color;
        markersRef.current[id] = new mapboxgl.Marker(el).setLngLat([team.lng, team.lat]).addTo(map);
      }
    });
  }, [teams]);

  return <div ref={containerRef} className="h-full w-full" />;
}
