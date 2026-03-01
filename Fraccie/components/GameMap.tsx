"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { GeoJSONSource, LngLatLike, Marker } from "mapbox-gl";
import { Bar, Game, Team } from "@/lib/types";
import { MAP_DEFAULT_ZOOM } from "@/lib/constants";
import { distanceMeters } from "@/lib/geo";

import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const teamColorFromId = (teamId: string): string => {
  let hash = 0;
  for (let index = 0; index < teamId.length; index += 1) {
    hash = ((hash << 5) - hash + teamId.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 78% 52%)`;
};

const isValidColor = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const EARTH_RADIUS_METERS = 6_378_137;
const BAR_INSIDE_RADIUS_SCALE = 2;

const destinationPoint = (lat: number, lng: number, distanceMeters: number, bearingDegrees: number): [number, number] => {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const destLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const destLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLat)
    );

  return [(destLng * 180) / Math.PI, (destLat * 180) / Math.PI];
};

const buildCircleCoordinates = (lat: number, lng: number, radiusMeters: number, steps = 64): [number, number][] => {
  const points = Array.from({ length: steps }, (_, index) => {
    const bearing = (index / steps) * 360;
    return destinationPoint(lat, lng, radiusMeters, bearing);
  });
  points.push(points[0]);
  return points;
};

interface GameMapProps {
  position: { lat: number; lng: number } | null;
  teams: Record<string, Team>;
  bars: Record<string, Bar>;
  game: Game;
  enabled: boolean;
  interactive?: boolean;
  currentTeamId?: string | null;
  showTeamLabels?: boolean;
}

export function GameMap({ position, teams, bars, game, enabled, interactive = false, currentTeamId, showTeamLabels = false }: GameMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const barPopupRef = useRef<mapboxgl.Popup | null>(null);
  const hasInitialCenterRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zoom, setZoom] = useState(MAP_DEFAULT_ZOOM);

  const createMarkerElement = (labelText?: string) => {
    const root = document.createElement("div");
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.alignItems = "center";

    if (showTeamLabels && labelText) {
      const label = document.createElement("div");
      label.dataset.role = "team-label";
      label.textContent = labelText;
      label.style.fontSize = "10px";
      label.style.fontWeight = "700";
      label.style.lineHeight = "1";
      label.style.padding = "2px 6px";
      label.style.marginBottom = "4px";
      label.style.borderRadius = "999px";
      label.style.background = "var(--color-slate)";
      label.style.color = "var(--color-text-primary)";
      label.style.whiteSpace = "nowrap";
      root.appendChild(label);
    }

    const dot = document.createElement("div");
    dot.dataset.role = "dot";
    dot.style.width = "16px";
    dot.style.height = "16px";
    dot.style.borderRadius = "999px";
    dot.style.border = `1px solid ${getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary')}`;
    root.appendChild(dot);

    return root;
  };

  const paintMarkerElement = (root: HTMLElement, markerColor: string, labelText?: string) => {
    const dot = root.querySelector<HTMLElement>("[data-role='dot']");
    if (dot) {
      dot.style.backgroundColor = markerColor;
    } else {
      root.style.width = "16px";
      root.style.height = "16px";
      root.style.borderRadius = "999px";
      root.style.border = "1px solid #ffffff";
      root.style.backgroundColor = markerColor;
    }

    const existingLabel = root.querySelector<HTMLElement>("[data-role='team-label']");
    if (showTeamLabels && labelText) {
      if (existingLabel) {
        existingLabel.textContent = labelText;
      } else {
        const label = document.createElement("div");
        label.dataset.role = "team-label";
        label.textContent = labelText;
        label.style.fontSize = "10px";
        label.style.fontWeight = "700";
        label.style.lineHeight = "1";
        label.style.padding = "2px 6px";
        label.style.marginBottom = "4px";
        label.style.borderRadius = "999px";
        label.style.background = "var(--color-slate)";
        label.style.color = "var(--color-text-primary)";
        label.style.whiteSpace = "nowrap";
        root.insertBefore(label, root.firstChild);
      }
    } else {
      existingLabel?.remove();
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Groningen bounding box (just outside grachten)
    const groningenBounds: [mapboxgl.LngLatLike, mapboxgl.LngLatLike] = [
      [6.550, 53.209], // SW (lng, lat)
      [6.578, 53.223]  // NE (lng, lat)
    ];
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [6.575, 53.215],
      zoom: MAP_DEFAULT_ZOOM,
      maxZoom: 20,
      minZoom: 12,
      maxBounds: groningenBounds,
      attributionControl: false,
      logoPosition: "top-right",
      dragPan: interactive,
      scrollZoom: interactive,
      boxZoom: interactive,
      dragRotate: interactive,
      touchZoomRotate: interactive,
      doubleClickZoom: interactive,
      keyboard: interactive
    });

    mapRef.current.on("load", () => {
      const map = mapRef.current;
      if (!map) return;
      setZoom(map.getZoom());
      setMapLoaded(true);
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "top-right");
            if (interactive) {
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(
          new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            fitBoundsOptions: { maxZoom: 17 },
            trackUserLocation: false,
            showAccuracyCircle: true,
            showUserLocation: true
          }),
          "top-right"
        );
      }
      map.addSource("game-circle-gradient", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      const getVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const colorPrimary = getVar('--color-primary');
      const colorError = getVar('--color-error');
      const colorSlate = getVar('--color-slate');
      const colorSuccess = getVar('--color-success');
      const colorWarning = getVar('--color-warning');
      const colorAmber = getVar('--color-amber');
      map.addLayer({
        id: "game-circle-fill",
        type: "fill",
        source: "game-circle-gradient",
        filter: ["==", ["get", "kind"], "band"],
        paint: {
          // Use feature color if present, else default to gradient color
          "fill-color": ["coalesce", ["get", "color"], colorPrimary],
          "fill-opacity": ["get", "opacity"]
        }
      });
      map.addLayer({
        id: "game-circle-edge",
        type: "line",
        source: "game-circle-gradient",
        filter: ["==", ["get", "kind"], "edge"],
        paint: {
          "line-color": colorPrimary,
          "line-width": 0,
          "line-opacity": 1
        }
      });

      map.addSource("bars", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "bars-layer",
        type: "circle",
        source: "bars",
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "active"], false],
            colorError,
            ["==", ["get", "inRadius"], false],
            "#000",
            colorSuccess
          ],
          "circle-opacity": [
            "case",
            ["==", ["get", "active"], false],
            0.3,
            ["==", ["get", "inRadius"], false],
            0.12,
            0.28
          ],
          "circle-radius": ["get", "pixelRadius"],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "active"], false],
            colorWarning,
            ["==", ["get", "inRadius"], false],
            "#222",
            colorSuccess
          ],
          "circle-stroke-width": 2
        }
      });

      map.on("zoom", () => {
        setZoom(map.getZoom());
      });
    });

    return () => {
      setMapLoaded(false);
      barPopupRef.current?.remove();
      mapRef.current?.remove();
    };
  }, [interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const toBool = (value: unknown) => value === true || value === "true";

    const onBarClick = (event: any) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;

      const barName = String(feature.properties?.name ?? "Bar");
      const isActive = toBool(feature.properties?.active);
      const inRadius = toBool(feature.properties?.inRadius);
      const coordinates = feature.geometry.coordinates as [number, number];
      let status: string;
      if (!isActive) {
        // Try to get team name from clearedBy property
        const barId = feature.id;
        let teamName = "Unknown";
        if (barId && bars[barId] && bars[barId].clearedBy) {
          const clearedTeamId = bars[barId].clearedBy;
          teamName = teams[clearedTeamId]?.name || `Team-${clearedTeamId?.slice(0, 4)}`;
        }
        status = `Searched by ${teamName}`;
      } else {
        status = inRadius ? "Not searched" : "Out of radius";
      }

      barPopupRef.current?.remove();
      barPopupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: true })
        .setLngLat(coordinates)
        .setHTML(
          `<div style="color:var(--color-background);font-size:14px;line-height:1.35;font-weight:600;min-width:140px;">
            <div style="font-size:16px;margin-bottom:2px;">${barName}</div>
            <div style="color:var(--color-slate);">${status}</div>
          </div>`
        )
        .addTo(map);
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", "bars-layer", onBarClick);
    map.on("mouseenter", "bars-layer", onMouseEnter);
    map.on("mouseleave", "bars-layer", onMouseLeave);

    return () => {
      map.off("click", "bars-layer", onBarClick);
      map.off("mouseenter", "bars-layer", onMouseEnter);
      map.off("mouseleave", "bars-layer", onMouseLeave);
    };
  }, [mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position || !enabled) return;

    if (!interactive) {
      map.jumpTo({ center: [position.lng, position.lat] });
      return;
    }

    if (!hasInitialCenterRef.current) {
      map.jumpTo({ center: [position.lng, position.lat], zoom: Math.max(map.getZoom(), 15) });
      hasInitialCenterRef.current = true;
    }
  }, [position, enabled, interactive]);


  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const metersToPixels = (meters: number, lat: number, zoomLevel: number) =>
      meters / ((78271.51696 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoomLevel));

    const barFeatures = Object.values(bars).flatMap((bar) => {
      if (!bar || typeof bar !== "object") return [];
      if (!Number.isFinite(bar.lat) || !Number.isFinite(bar.lng) || !Number.isFinite(bar.radius)) return [];

      const centerDistanceMeters = distanceMeters(
        game.circle_center_lat,
        game.circle_center_lng,
        bar.lat,
        bar.lng
      );
      const inRadius = centerDistanceMeters <= game.circle_radius;
      const playerDistanceMeters = position ? distanceMeters(position.lat, position.lng, bar.lat, bar.lng) : Number.POSITIVE_INFINITY;
      const playerInsideBarRadius = playerDistanceMeters <= bar.radius;
      const isActiveBar = bar.active !== false;
      const pixelRadius = metersToPixels(bar.radius, bar.lat, zoom) * (isActiveBar && playerInsideBarRadius ? BAR_INSIDE_RADIUS_SCALE : 1);

      return [{
        type: "Feature",
        properties: {
          name: typeof bar.name === "string" ? bar.name : "Bar",
          pixelRadius,
          active: isActiveBar,
          inRadius
        },
        geometry: { type: "Point", coordinates: [bar.lng, bar.lat] as LngLatLike }
      }];
    });

    const barsSource = map.getSource("bars") as GeoJSONSource;
    barsSource?.setData({ type: "FeatureCollection", features: barFeatures as never[] });

    const gradientSource = map.getSource("game-circle-gradient") as GeoJSONSource;
    const gradientStartRatio = 0.9;
    const gradientSteps = 10;
    const minOpacity = 0;
    const maxOpacity = 0.9;

    const gradientFeatures = Array.from({ length: gradientSteps }, (_, index) => {
      const innerRatio = gradientStartRatio + (index / gradientSteps) * (1 - gradientStartRatio);
      const outerRatio = gradientStartRatio + ((index + 1) / gradientSteps) * (1 - gradientStartRatio);
      const innerRadius = game.circle_radius * innerRatio;
      const outerRadius = game.circle_radius * outerRatio;
      const progress = (outerRatio - gradientStartRatio) / (1 - gradientStartRatio);
      const opacity = minOpacity + (maxOpacity - minOpacity) * progress;

      const outerRing = buildCircleCoordinates(game.circle_center_lat, game.circle_center_lng, outerRadius);
      const innerRing =
        innerRadius > 0
          ? buildCircleCoordinates(game.circle_center_lat, game.circle_center_lng, innerRadius).reverse()
          : [];

      return {
        type: "Feature",
        properties: {
          kind: "band",
          opacity,
          color: undefined // use default gradient color
        },
        geometry: {
          type: "Polygon",
          coordinates: innerRing.length ? [outerRing, innerRing] : [outerRing]
        }
      };
    });

    // Add extra donut band from circle_radius to circle_radius + 2km
    const donutOuterRadius = game.circle_radius + 2000;
    const donutOuterRing = buildCircleCoordinates(game.circle_center_lat, game.circle_center_lng, donutOuterRadius);
    const donutInnerRing = buildCircleCoordinates(game.circle_center_lat, game.circle_center_lng, game.circle_radius).reverse();
    const donutFeature = {
      type: "Feature",
      properties: {
        kind: "band",
        opacity: 0.8,
        color: "#000"
      },
      geometry: {
        type: "Polygon",
        coordinates: [donutOuterRing, donutInnerRing]
      }
    };

    const edgeFeature = {
      type: "Feature",
      properties: {
        kind: "edge"
      },
      geometry: {
        type: "LineString",
        coordinates: buildCircleCoordinates(game.circle_center_lat, game.circle_center_lng, game.circle_radius)
      }
    };

    gradientSource?.setData({
      type: "FeatureCollection",
      features: [...gradientFeatures, donutFeature, edgeFeature] as never[]
    });
  }, [bars, game, mapLoaded, zoom, position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const activeIds = new Set<string>();
    const enemyVisibilityEnabled = game.enemy_visibility === true;

    Object.entries(teams).forEach(([teamId, team]) => {
      if (!team || typeof team !== "object") return;
      if (!Number.isFinite(team.lat) || !Number.isFinite(team.lng)) return;

      const isEnemyTeam = currentTeamId ? teamId !== currentTeamId : false;
      if (isEnemyTeam && !enemyVisibilityEnabled) return;

      const memberLocations = team.memberLocations ?? {};

      if (Object.keys(memberLocations).length === 0) {
        const fallbackId = `team:${teamId}`;
        activeIds.add(fallbackId);
        const markerColor = currentTeamId
          ? teamId === currentTeamId
            ? getComputedStyle(document.documentElement).getPropertyValue('--color-success')
            : getComputedStyle(document.documentElement).getPropertyValue('--color-error')
          : isValidColor(team.color)
            ? team.color
            : teamColorFromId(teamId);
        const teamName = typeof team.name === "string" && team.name.trim() ? team.name : `Team-${teamId.slice(0, 4)}`;
        const existing = markersRef.current[fallbackId];
        if (existing) {
          paintMarkerElement(existing.getElement(), markerColor, teamName);
          existing.setLngLat([team.lng, team.lat]);
        } else {
          const el = createMarkerElement(teamName);
          paintMarkerElement(el, markerColor, teamName);
          markersRef.current[fallbackId] = new mapboxgl.Marker(el).setLngLat([team.lng, team.lat]).addTo(map);
        }
        return;
      }

      Object.entries(memberLocations).forEach(([memberId, location]) => {
        if (!location || typeof location !== "object") return;
        if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return;

        const markerId = `${teamId}:${memberId}`;
        activeIds.add(markerId);
        const isTeammate = currentTeamId ? teamId === currentTeamId : false;
        const markerColor = isValidColor(team.color)
          ? team.color
          : teamColorFromId(teamId);
        const teamName = typeof team.name === "string" && team.name.trim() ? team.name : `Team-${teamId.slice(0, 4)}`;
        const memberName = team.memberProfiles?.[memberId]?.name ?? `Player ${memberId.slice(0, 4)}`;
        const popupHtml = isTeammate
          ? `<div style="color:var(--color-background);font-size:14px;line-height:1.35;font-weight:600;min-width:120px;">${memberName}</div>`
          : enemyVisibilityEnabled
            ? `<div style="color:var(--color-background);font-size:14px;line-height:1.35;min-width:140px;"><div style="font-weight:700;">${teamName}</div><div style="font-weight:500;color:var(--color-slate);">${memberName}</div></div>`
            : null;

        const existing = markersRef.current[markerId];
        if (existing) {
          paintMarkerElement(existing.getElement(), markerColor, teamName);
          existing.setLngLat([location.lng, location.lat]);
          existing.setPopup(
            popupHtml
              ? new mapboxgl.Popup({ closeButton: false, closeOnClick: true }).setHTML(popupHtml)
              : null
          );
        } else {
          const el = createMarkerElement(teamName);
          paintMarkerElement(el, markerColor, teamName);
          const marker = new mapboxgl.Marker(el).setLngLat([location.lng, location.lat]);

          if (popupHtml) {
            marker.setPopup(
              new mapboxgl.Popup({ closeButton: false, closeOnClick: true }).setHTML(popupHtml)
            );
          }

          markersRef.current[markerId] = marker.addTo(map);
        }
      });
    });

    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (activeIds.has(id)) return;
      marker.remove();
      delete markersRef.current[id];
    });
  }, [teams, mapLoaded, currentTeamId, game.enemy_visibility, showTeamLabels]);

  return <div ref={containerRef} className="h-full w-full" />;
}
