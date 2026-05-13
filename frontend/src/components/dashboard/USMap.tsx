/**
 * 🗺️ COMPOSANT CARTE INTERACTIVE - Visualisation géographique des accidents
 * 
 * Ce composant affiche une carte des États-Unis avec des cercles proportionnels
 * représentant le nombre et la sévérité des accidents par ville.
 * 
 * 🎯 Objectifs :
 * - Visualiser la répartition géographique des accidents
 * - Identifier les zones à risque (grands cercles rouges/oranges)
 * - Permettre l'exploration interactive (zoom, pan, clic)
q
 * 
 * 🗺️ Technologie : Leaflet
 * - Bibliothèque de cartographie open-source 
 * - Tuiles OpenStreetMap (gratuites, sans clé API)
 * 
 * 
 * 🔄 Cycle de vie du composant :
 * 1. Montage → Crée la carte avec tuiles dark/light
 * 2. Réception des données cities → Dessine tous les cercles
 * 3. Changement de thème → Remplace les tuiles (dark ↔ light)
 * 4. Changement de filtres → Nouveaux cercles (via props)
 * 5. Démontage → Nettoie la carte et les événements
 * 
 * 🖱️ Interactions utilisateur :
 * - Zoom avant/arrière (boutons +/ -)
 * - Déplacement de la carte (drag & drop)
 * - Clic sur un cercle → Popup avec détails :
 *   · Nom de la ville et état
 *   · Nombre total d'accidents
 *   · Gravité moyenne 
 * 
 */


import React, { useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { MapCity } from "../../pages/types/dashboard.types";
import type { T } from "../../pages/themes/dashboard.themes";
import { TILE_DARK, TILE_LIGHT, TILE_ATTR, SEV_OPTIONS } from "../../pages/constants/dashboard.constants";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

interface USMapProps {
  cities: MapCity[];
  t: T;
  isDark: boolean;
}

export const USMap: React.FC<USMapProps> = ({ cities, t, isDark }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);

  const fmt = (n: number) => n?.toLocaleString() ?? "0";
  const sevColor = (avg: number) => {
    if (!avg && avg !== 0) return "#64748b";
    if (avg < 1.75) return "#34d399";
    if (avg < 2.5) return "#f59e0b";
    if (avg < 3.25) return "#fb923c";
    return "#f43f5e";
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [38.5, -96], zoom: 4, zoomSnap: 0.5, scrollWheelZoom: false });
    tileRef.current = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(map);
    groupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; tileRef.current = null; groupRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    mapRef.current.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(mapRef.current);
    tileRef.current.bringToBack();
  }, [isDark]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    if (!cities.length) return;
    const maxCount = Math.max(...cities.map(c => c.count), 1);
    cities.forEach(city => {
      if (!city.lat || !city.lng) return;
      const radius = Math.max(5, Math.min(24, (city.count / maxCount) ** 0.55 * 24));
      const color = sevColor(city.avg_severity);
      const popup = `
        <div style="font-family:'IBM Plex Mono',monospace;padding:10px 14px;min-width:160px;background:${t.popupBg};color:${t.textBase};border-radius:10px;">
          <div style="font-family:'Syne',sans-serif;font-size:13px;font-weight:700;color:${t.textStrong};margin-bottom:8px;">${city.city}, ${city.state}</div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:${t.textMuted};margin-bottom:3px;"><span>Accidents</span><strong style="color:${t.textBase}">${fmt(city.count)}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:${t.textMuted};"><span>Avg severity</span><strong style="color:${color}">${city.avg_severity?.toFixed(2) ?? "N/A"}</strong></div>
        </div>`;
      L.circleMarker([city.lat, city.lng] as L.LatLngExpression, {
        radius, fillColor: color,
        color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)",
        weight: 1, fillOpacity: 0.55, opacity: 0.9,
      }).bindPopup(popup, { className: "db-leaflet-popup", maxWidth: 220 }).addTo(group);
    });
  }, [cities, isDark, t]);

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, color: t.textStrong }}>zones à risque d’accidents</span>
      </div>
      <div style={{ borderRadius: 12, overflow: "hidden" }}>
        <div ref={containerRef} style={{ width: "100%", height: 400, background: t.mapBg }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, fontSize: 11, color: t.textMuted, flexWrap: "wrap" }}>
        {SEV_OPTIONS.map(s => (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
        <span style={{ color: t.textFaint }}>·</span>
        <span style={{ color: t.textFaint }}>Taille des cercles = nombre d’accidents · Couleur = gravité moyenne</span>
      </div>
    </div>
  );
};