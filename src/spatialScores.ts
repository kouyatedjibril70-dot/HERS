import type { Community } from "./App";

// Extrait de Spatial.tsx : un fichier qui exporte à la fois un composant par défaut et des fonctions/
// constantes casse le Fast Refresh de Vite (observé en dev : rechargement complet au lieu d'un hot-reload
// à chaque modification). Ces indicateurs de contexte spatial (pas de score de sélection) vivent donc ici.

// « Accès marché » et « Proximité eau » ont été retirés : dans la chaîne de données actuelle ce
// ne sont pas des mesures fiables (confirmé par l'auteur de la préparation des données).

// Potentiel agricole : donnée RÉELLE (ESA WorldCover, % terres cultivées dans un rayon de 5 km)
export function agriScore(r: Community): number {
  const v = Number(r["pct_cultures_5km"]);
  return Number.isFinite(v) ? v : 50; // 50 = neutre si absent pour une communauté
}
export function accessScore(r: Community): number {
  const d = Number(r["Distance bureau (km)"]);
  if (!Number.isFinite(d)) return 50;
  return Math.max(0, 100 - d / 2.6);
}
// Accès route : donnée RÉELLE (OSM, distance à la route la plus proche en km)
export function roadAccessScore(r: Community): number {
  const d = Number(r["dist_route_km"]);
  if (!Number.isFinite(d)) return 50;
  return Math.max(0, 100 - d * 20); // 0 km -> 100, 5 km -> 0
}
export function concScore(r: Community): number {
  const n = Number(r["Autres communautés dans 25 km"]);
  return Number.isFinite(n) ? Math.min(100, (n / 100) * 100) : 50;
}
export function indiceSpatial(r: Community): number {
  // Poids re-normalisés après retrait de marché (0,20) et eau (0,15) : 0,65 -> 1.
  return 0.40 * accessScore(r) + 0.45 * agriScore(r) + 0.15 * concScore(r);
}

export const BASEMAPS: { name: string; url: string; attribution: string; subdomains?: string; maxNativeZoom?: number }[] = [
  { name: "OpenStreetMap", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors" },
  { name: "Esri Imagery (satellite)", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Imagerie &copy; Esri, Maxar, Earthstar Geographics", maxNativeZoom: 19 },
  { name: "Esri Topo", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", attribution: "&copy; Esri", maxNativeZoom: 19 },
  { name: "OpenTopoMap", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenTopoMap (CC-BY-SA)", maxNativeZoom: 17 },
  { name: "Google Plan", url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", attribution: "&copy; Google" },
  { name: "Google Satellite", url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", attribution: "&copy; Google" },
  { name: "Google Hybride", url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", attribution: "&copy; Google" },
  { name: "Google Relief", url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", attribution: "&copy; Google" },
];
