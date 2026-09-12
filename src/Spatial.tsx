import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { MapContainer, TileLayer, LayersControl, ImageOverlay, CircleMarker, Marker, Polyline, Circle, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { Compass, Ruler, AlertTriangle, Building2, Languages, CircleDot, Move } from "lucide-react";
import type { Community } from "./App";
import { LANG_COLORS } from "./palette";
import { withPrcc, PRCC_TOOLTIP } from "./Prcc";

// Préfixe des fichiers de public/data — vaut "/" en dev, "/HERS/" une fois publié sur GitHub Pages
// (sous-dossier). Permet de garder les mêmes chemins quel que soit l'hébergement.
const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

// ---- Contexte spatial (indice de potentiel) — uniquement des indicateurs mesurés/calculés ----
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

// Coordonnées des bureaux — calées sur le champ « Distance bureau (km) » de la base
// (erreur moyenne < 1 km, sauf Ourossogui recalé par ajustement).
const BUREAUX: Record<string, [number, number]> = {
  Kolda: [12.8939, -14.9414],
  Ourossogui: [15.61, -13.32],
  Tambacounda: [13.7707, -13.6673],
  Thiès: [14.791, -16.9256],
  Basse: [13.3082, -14.2151],
};
const num = (r: Community, k: string) => Number(r[k]);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
// « X communautés (Y %) » — les analyses annoncent le nombre d'abord, le pourcentage entre parenthèses.
const cpt = (k: number, total: number) => `${k} communauté${k > 1 ? "s" : ""} (${pct(k, total).toFixed(0)} %)`;
const keyOf = (r: Community) => String(r._id ?? r["code communaute"] ?? r.Communauté);

// Dispersion déterministe : les points sont des centres de commune, donc empilés.
// ~1 km de bruit reproductible pour rendre les amas lisibles.
function jitter(seed: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 2000) / 2000 - 0.5;
  const b = ((h >>> 11) % 2000) / 2000 - 0.5;
  return [a * 0.018, b * 0.018];
}

type Mode = "statut" | "score" | "langue" | "distance" | "prcc" | "population" | "agri" | "route" | "marche" | "eau" | "ville";

// Distance à une ressource -> couleur (vert = proche/bon, rouge = loin).
function distColor(d: number, b1: number, b2: number, b3: number): string {
  if (!Number.isFinite(d)) return "#d7dee7";
  return d <= b1 ? "#2f9e6f" : d <= b2 ? "#7bbf4f" : d <= b3 ? "#e8a13a" : "#d64550";
}
function colorFor(r: Community, mode: Mode): string {
  if (mode === "statut") return r.selected ? "#176bd1" : "#9aabbe";
  if (mode === "score") { const s = r.score; return s >= 70 ? "#1c4a86" : s >= 55 ? "#3d7ec0" : s >= 40 ? "#7ba7d4" : "#c3d4e6"; }
  if (mode === "langue") return LANG_COLORS[r["Langue normalisée"]] || "#9aabbe";
  if (mode === "distance") { const d = num(r, "Distance bureau (km)"); return d <= 25 ? "#2f9e6f" : d <= 50 ? "#7bbf4f" : d <= 100 ? "#e8a13a" : "#d64550"; }
  if (mode === "prcc") { const y = num(r, "Année Fin PRCC"); return y >= 2024 ? "#1c4a86" : y >= 2019 ? "#3d7ec0" : y >= 2014 ? "#7ba7d4" : "#c3d4e6"; }
  if (mode === "agri") { const v = agriScore(r); return v >= 50 ? "#1c4a86" : v >= 30 ? "#3d7ec0" : v >= 15 ? "#7ba7d4" : "#c3d4e6"; }
  if (mode === "route") { const v = roadAccessScore(r); return v >= 80 ? "#1c4a86" : v >= 60 ? "#3d7ec0" : v >= 40 ? "#7ba7d4" : "#c3d4e6"; }
  if (mode === "marche") return distColor(num(r, "dist_marche_osm_km"), 10, 25, 50);
  if (mode === "eau") return distColor(num(r, "dist_eau_osm_km"), 2, 10, 25);
  if (mode === "ville") return distColor(num(r, "dist_ville_km"), 5, 15, 30);
  const p = num(r, "POPULATION");
  if (!Number.isFinite(p)) return "#d7dee7";
  return p > 8000 ? "#1c4a86" : p > 3000 ? "#3d7ec0" : p > 1000 ? "#7ba7d4" : "#c3d4e6";
}
function legendFor(mode: Mode, langs: string[]): { c: string; l: string }[] {
  if (mode === "statut") return [{ c: "#176bd1", l: "Sélectionnée" }, { c: "#9aabbe", l: "Hors sélection" }];
  if (mode === "score") return [{ c: "#c3d4e6", l: "moins de 40" }, { c: "#7ba7d4", l: "40 à 55" }, { c: "#3d7ec0", l: "55 à 70" }, { c: "#1c4a86", l: "70 et plus" }];
  if (mode === "langue") return langs.map((l) => ({ c: LANG_COLORS[l] || "#9aabbe", l }));
  if (mode === "distance") return [{ c: "#2f9e6f", l: "25 km ou moins" }, { c: "#7bbf4f", l: "25 à 50" }, { c: "#e8a13a", l: "50 à 100" }, { c: "#d64550", l: "plus de 100" }];
  if (mode === "prcc") return [{ c: "#c3d4e6", l: "2013 ou avant" }, { c: "#7ba7d4", l: "2014 à 2018" }, { c: "#3d7ec0", l: "2019 à 2023" }, { c: "#1c4a86", l: "2024 ou après" }];
  if (mode === "agri") return [{ c: "#c3d4e6", l: "moins de 15 %" }, { c: "#7ba7d4", l: "15 à 30 %" }, { c: "#3d7ec0", l: "30 à 50 %" }, { c: "#1c4a86", l: "50 % et plus" }];
  if (mode === "route") return [{ c: "#c3d4e6", l: "éloignée" }, { c: "#7ba7d4", l: "proche" }, { c: "#3d7ec0", l: "très proche" }, { c: "#1c4a86", l: "sur la route" }];
  if (mode === "marche") return [{ c: "#2f9e6f", l: "10 km ou moins" }, { c: "#7bbf4f", l: "10 à 25" }, { c: "#e8a13a", l: "25 à 50" }, { c: "#d64550", l: "plus de 50" }];
  if (mode === "eau") return [{ c: "#2f9e6f", l: "2 km ou moins" }, { c: "#7bbf4f", l: "2 à 10" }, { c: "#e8a13a", l: "10 à 25" }, { c: "#d64550", l: "plus de 25" }];
  if (mode === "ville") return [{ c: "#2f9e6f", l: "5 km ou moins" }, { c: "#7bbf4f", l: "5 à 15" }, { c: "#e8a13a", l: "15 à 30" }, { c: "#d64550", l: "plus de 30" }];
  return [{ c: "#c3d4e6", l: "moins de 1 000" }, { c: "#7ba7d4", l: "1 000 à 3 000" }, { c: "#3d7ec0", l: "3 000 à 8 000" }, { c: "#1c4a86", l: "plus de 8 000" }, { c: "#d7dee7", l: "non renseignée" }];
}

// À quel bucket de légende appartient une communauté, pour un mode donné — sert à filtrer la carte
// (et donc l'analyse, qui lit toujours mapRows) quand on clique sur une entrée de la légende.
function bucketLabelFor(r: Community, mode: Mode, langs: string[]): string {
  if (mode === "langue") return r["Langue normalisée"] || "Non renseignée";
  const color = colorFor(r, mode);
  return legendFor(mode, langs).find((x) => x.c === color)?.l ?? "";
}

// Valeur brute du mode courant, pour l'infobulle d'un point sur la carte (« la donnée sous les yeux »).
function modeValue(r: Community, mode: Mode): string | null {
  const km = (f: string) => { const v = Number(r[f]); return Number.isFinite(v) ? `${v.toFixed(1)} km` : "donnée absente"; };
  if (mode === "marche") return `marché le plus proche : ${km("dist_marche_osm_km")}`;
  if (mode === "eau") return `point d'eau le plus proche : ${km("dist_eau_osm_km")}`;
  if (mode === "ville") return `ville la plus proche : ${km("dist_ville_km")}`;
  if (mode === "distance") { const v = num(r, "Distance bureau (km)"); return Number.isFinite(v) ? `bureau : ${v.toFixed(0)} km` : null; }
  if (mode === "score") return `score : ${r.score}/100`;
  if (mode === "population") { const v = num(r, "POPULATION"); return Number.isFinite(v) ? `population : ${v.toLocaleString("fr-FR")}` : "population : n/d"; }
  if (mode === "agri") { const v = Number(r["pct_cultures_5km"]); return Number.isFinite(v) ? `cultures dans 5 km : ${v.toFixed(0)} %` : null; }
  if (mode === "route") { const v = Number(r["dist_route_km"]); return Number.isFinite(v) ? `route la plus proche : ${v.toFixed(1)} km` : null; }
  if (mode === "prcc") { const v = num(r, "Année Fin PRCC"); return Number.isFinite(v) ? `fin PRCC : ${v.toFixed(0)}` : null; }
  return null;
}

// Fonds de carte proposés dans le sélecteur de couches (aucune clé requise).
// NB : les tuiles Google (lyrs=…) ne sont pas officiellement supportées hors API Google — usage à titre pratique.
export const BASEMAPS: { name: string; url: string; attribution: string; subdomains?: string; maxNativeZoom?: number }[] = [
  { name: "OpenStreetMap", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors" },
  { name: "Carto clair", url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap, &copy; CARTO", subdomains: "abcd" },
  { name: "Esri Imagery (satellite)", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Imagerie &copy; Esri, Maxar, Earthstar Geographics", maxNativeZoom: 19 },
  { name: "Esri Topo", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", attribution: "&copy; Esri", maxNativeZoom: 19 },
  { name: "OpenTopoMap", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenTopoMap (CC-BY-SA)", maxNativeZoom: 17 },
  { name: "Google Plan", url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", attribution: "&copy; Google" },
  { name: "Google Satellite", url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", attribution: "&copy; Google" },
  { name: "Google Hybride", url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", attribution: "&copy; Google" },
  { name: "Google Relief", url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", attribution: "&copy; Google" },
];

// Occupation du sol classée — ESA WorldCover 2021, image statique locale (public/data/worldcover_senegal_gambie.png).
// bounds = [[latSud, lonOuest], [latNord, lonEst]] de l'emprise de l'image.
const LANDCOVER_BOUNDS: [[number, number], [number, number]] = [[12.1995, -17.6008], [16.8258, -11.2999]];

// --- Mode correction de position : envoi vers un Google Sheet (Apps Script Web App) + sauvegarde locale ---
const CORRECTIONS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbz368CZ9huD-OLWTw3ip-VKx-v-sZhYddNGezpjhOHraThkiPp7aJdV7Fw7A6DuS_xtEg/exec";
const CORRECTIONS_KEY = "hers_corrections_v1";
type Correction = { code: string; communaute: string; lat: number; lon: number; oldLat: number; oldLon: number; ts: number };
// Deux icônes : discrète pour les points "juste déplaçables" (l'immense majorité — pas d'erreur
// connue, on garde juste la main pour corriger au besoin), voyante seulement pour ceux déjà corrigés.
// Avant : tout le monde recevait la même icône rouge vif → en mode correction, la carte se couvrait
// de centaines de gros points rouges superposés, illisible.
const dragIcon = L.divIcon({
  className: "hers-drag-icon",
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
const dragIconPlain = L.divIcon({
  className: "hers-drag-icon is-plain",
  html: '<span></span>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function MapView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [map, center[0], center[1], zoom]);
  return null;
}

// Couche routes impérative : évite le bug "il faut cliquer deux fois" du <GeoJSON> de react-leaflet
// (le prop data n'est lu qu'au montage). Ici la couche est (re)créée dès que data change.
function RoadsLayer({ data }: { data: any }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const layer = L.geoJSON(data, {
      style: (f: any) => {
        const major = f && f.properties && (f.properties.c === "motorway" || f.properties.c === "trunk");
        return { color: major ? "#c0392b" : "#e67e22", weight: major ? 2.2 : 1.2, opacity: 0.7 };
      },
    }).addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, data]);
  return null;
}

// Couche de points d'intérêt OSM (villes / marchés / points d'eau) en overlay, rendu canvas
// (jusqu'à ~3 000 points pour l'eau) et création impérative comme RoadsLayer.
const EAU_LABEL: Record<string, string> = { river: "Cours d'eau", water: "Plan d'eau", well: "Puits", spring: "Source", tap: "Point d'eau" };
function PoiLayer({ data, kind }: { data: any; kind: "villes" | "marches" | "eau" }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const canvas = L.canvas({ padding: 0.5 });
    const layer = L.geoJSON(data, {
      pointToLayer: (f: any, latlng: L.LatLng) => {
        const p = f.properties || {};
        let style: L.CircleMarkerOptions;
        if (kind === "villes") {
          const city = p.kind === "city";
          style = { renderer: canvas, radius: city ? 4.5 : 3, color: "#31405a", weight: 1, fillColor: "#7c8aa0", fillOpacity: 0.9 };
        } else if (kind === "marches") {
          style = { renderer: canvas, radius: 3.6, color: "#8a4406", weight: 1, fillColor: "#f0821e", fillOpacity: 0.92 };
        } else if (p.kind === "river") {
          style = { renderer: canvas, radius: 1.3, weight: 0, fillColor: "#5aa9d6", fillOpacity: 0.5 };
        } else if (p.kind === "well") {
          style = { renderer: canvas, radius: 2.8, color: "#1e5f88", weight: 1, fillColor: "#3d8fc0", fillOpacity: 0.95 };
        } else if (p.kind === "spring") {
          style = { renderer: canvas, radius: 3, color: "#1e5f88", weight: 1, fillColor: "#59c1e8", fillOpacity: 0.95 };
        } else {
          style = { renderer: canvas, radius: 2.6, color: "#2f7fb5", weight: 0.8, fillColor: "#8fc7e4", fillOpacity: 0.8 };
        }
        const m = L.circleMarker(latlng, style);
        const label = p.name || (kind === "marches" ? "Marché" : kind === "villes" ? "Ville" : EAU_LABEL[p.kind] || "Point d'eau");
        m.bindTooltip(String(label));
        return m;
      },
    }).addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, data, kind]);
  return null;
}

// ---- Analyse en 4 temps (Observation → Interprétation → Implication → À retenir) des deux ----
// ---- outils "Distance autour d'un bureau" et "Communautés éloignées". Tout est recalculé   ----
// ---- à chaque changement de filtre — aucune phrase figée, aucun texte non vérifié.          ----
const CRIT_LABELS: Record<string, string> = {
  dist: "la distance au bureau",
  dens: "la concentration de communautés voisines",
  recent: "la récence de fin du PRCC",
};

function avgScore(arr: Community[], key: string): number | null {
  const vals = arr.map((r) => r.scores?.[key]).filter((v): v is number => v !== null && v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function avgField(arr: Community[], field: string): number | null {
  const vals = arr.map((r) => Number(r[field])).filter((v) => Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// Compare deux groupes sur les critères actifs (dist/dens/recent par défaut) et renvoie le(s) plus déterminant(s),
// avec leur valeur brute lisible. Ne renvoie que des écarts réellement calculés — jamais une affirmation par défaut.
// `keys` permet d'exclure un critère tautologique : pour "Communautés éloignées", le groupe "far" est PAR
// DÉFINITION celui qui a le plus mauvais score de distance (c'est le critère de découpage lui-même) — le
// comparer produirait toujours "distance" comme facteur dominant, avec un écart dans le mauvais sens (les
// éloignées ne sont jamais meilleures que le reste sur ce critère), donc une phrase de "compensation" fausse.
function compareGroups(
  groupA: Community[],
  groupB: Community[],
  keys: ("dist" | "dens" | "recent")[] = ["dist", "dens", "recent"],
): { key: "dist" | "dens" | "recent"; gap: number; detailA: number; detailB: number }[] {
  const fieldFor: Record<string, string> = { dist: "Distance bureau (km)", dens: "Autres communautés dans 25 km", recent: "Année Fin PRCC" };
  return keys
    .map((key) => {
      const aScore = avgScore(groupA, key), bScore = avgScore(groupB, key);
      if (aScore === null || bScore === null) return null;
      const detailA = avgField(groupA, fieldFor[key]);
      const detailB = avgField(groupB, fieldFor[key]);
      if (detailA === null || detailB === null) return null;
      return { key, gap: aScore - bScore, detailA, detailB };
    })
    .filter((x): x is { key: "dist" | "dens" | "recent"; gap: number; detailA: number; detailB: number } => x !== null)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

function formatDetail(key: string, detailA: number, detailB: number, labelA: string, labelB: string): string {
  if (key === "dist") return `distance moyenne au bureau : ${detailA.toFixed(0)} km (${labelA}) contre ${detailB.toFixed(0)} km (${labelB})`;
  if (key === "dens") return `${detailA.toFixed(1)} voisines en moyenne dans 25 km (${labelA}) contre ${detailB.toFixed(1)} (${labelB})`;
  return `PRCC terminé en moyenne en ${detailA.toFixed(0)} (${labelA}) contre ${detailB.toFixed(0)} (${labelB})`;
}

// ---- Analyse contextuelle sous la carte, par mode de coloration. Toujours calculée sur les communautés
// RÉELLEMENT affichées (mapRows), jamais sur `all` — sinon le texte ne correspondrait plus à ce que l'écran montre.
function analyseCarte(mode: Mode, rows: Community[]): { observation: string; lecture: string; retenir: string } | null {
  const n = rows.length;
  if (n === 0) return null;

  if (mode === "statut") {
    const s = rows.filter((r) => r.selected).length;
    const distSel = avgField(rows.filter((r) => r.selected), "Distance bureau (km)");
    const distNon = avgField(rows.filter((r) => !r.selected), "Distance bureau (km)");
    return {
      observation: `${s} communautés affichées sont sélectionnées sur ${n} (${pct(s, n).toFixed(0)} %).`,
      lecture: distSel !== null && distNon !== null
        ? `Les communautés sélectionnées affichées sont en moyenne à ${distSel.toFixed(0)} km d'un bureau, contre ${distNon.toFixed(0)} km pour les non sélectionnées. La distance reste un facteur visible dans ce sous-ensemble.`
        : "Pas assez de données pour comparer les deux groupes sur ce sous-ensemble.",
      retenir: "Ce mode montre la répartition spatiale brute de la sélection. Utile pour repérer visuellement des zones de concentration ou de vide.",
    };
  }

  if (mode === "score") {
    const haut = rows.filter((r) => r.score >= 70).length;
    const bas = rows.filter((r) => r.score < 40).length;
    const moyen = n - haut - bas;
    const basSel = rows.filter((r) => r.score < 40 && r.selected).length;
    const sV = basSel > 1 ? "s" : "";
    return {
      observation: `Sur ${n} communautés affichées, ${cpt(haut, n)} ont un score d'au moins 70, ${cpt(moyen, n)} entre 40 et 70, et ${cpt(bas, n)} un score inférieur à 40.`,
      lecture: basSel > 0
        ? `${basSel} communauté${sV} retenue${sV} ${basSel > 1 ? "ont" : "a"} un score inférieur à 40. Ce n'est pas une anomalie : le classement se fait séparément pour le Sénégal et la Gambie, avec un nombre de places fixé par pays. Une communauté à score modéré est donc retenue si elle fait partie des mieux classées de son pays. Pour savoir ce qui la fait entrer, ouvrir sa fiche : on y voit son rang et le détail de son score.`
        : "Aucune communauté à score inférieur à 40 n'est retenue dans ce sous-ensemble : le score et la sélection concordent ici.",
      retenir: "Le score sert à classer les communautés, pas à leur donner une note de qualité. Un score bas retenu n'est pas un problème en soi : c'est le rang dans le pays qui décide.",
    };
  }

  if (mode === "langue") {
    const parLangue: Record<string, number> = {};
    rows.forEach((r) => { const l = String(r["Langue normalisée"] || "").trim(); if (l) parLangue[l] = (parLangue[l] || 0) + 1; });
    const langs = Object.entries(parLangue).sort((a, b) => b[1] - a[1]);
    const nb = langs.length;
    const lecture = "La langue n'est pas un critère de sélection. Cette carte montre seulement la répartition des langues dans les communautés affichées, et non leur représentation dans la sélection.";
    const retenir = "Cette information est utile pour préparer les équipes d'animation et de formation selon les langues présentes. Pour comparer la répartition linguistique de la sélection avec celle de la base, voir « Profil de la sélection ».";
    if (nb === 0) return { observation: "Aucune information linguistique disponible dans la vue actuelle.", lecture, retenir };
    const [topNom, topCount] = langs[0];
    return {
      observation: `${nb} langue${nb > 1 ? "s apparaissent" : " apparaît"} parmi les ${n} communautés affichées. ${topNom} est la plus fréquente : ${cpt(topCount, n)}.`,
      lecture,
      retenir,
    };
  }

  if (mode === "distance") {
    const b1 = rows.filter((r) => num(r, "Distance bureau (km)") <= 25).length;
    const b4 = rows.filter((r) => num(r, "Distance bureau (km)") > 100).length;
    return {
      observation: `Sur ${n} communautés affichées, ${cpt(b1, n)} sont à moins de 25 km d'un bureau et ${cpt(b4, n)} à plus de 100 km.`,
      lecture: b4 / n > 0.15
        ? `Une part notable de ce sous-ensemble (${b4} communauté${b4 > 1 ? "s" : ""}) est éloignée d'un bureau. C'est un enjeu potentiel pour la supervision et les déplacements des équipes.`
        : "La majorité de ce sous-ensemble reste à une distance raisonnable d'un bureau, favorable à la supervision.",
      retenir: "Ces communautés éloignées ne sont pas nécessairement à écarter. Voir l'outil « Communautés éloignées » pour savoir ce qui compense leur distance dans le score.",
    };
  }

  if (mode === "prcc") {
    // On compte sur les communautés qui ont une date de fin renseignée — sinon une valeur manquante
    // (NaN) retombe silencieusement dans la classe la plus ancienne et fausse la répartition.
    const withYear = rows.filter((r) => Number.isFinite(num(r, "Année Fin PRCC")));
    const m = withYear.length;
    if (m === 0) return {
      observation: "Aucune date de fin de PRCC renseignée dans la vue actuelle.",
      lecture: "La date de fin du PRCC sert à distinguer les communautés selon l'ancienneté de leur expérience avec le programme et fait partie des critères du classement.",
      retenir: "Pour voir comment cette dimension se retrouve dans la sélection, voir « Profil de la sélection ». Le poids de ce critère est réglable dans « Vue d'ensemble » (détaillé dans « Méthode »).",
    };
    const yr = (r: Community) => num(r, "Année Fin PRCC");
    const av2014 = withYear.filter((r) => yr(r) < 2014).length;
    const p1418 = withYear.filter((r) => yr(r) >= 2014 && yr(r) < 2019).length;
    const p1923 = withYear.filter((r) => yr(r) >= 2019 && yr(r) < 2024).length;
    const dep2024 = withYear.filter((r) => yr(r) >= 2024).length;
    const sansDate = n - m;
    return {
      observation: `Sur ${m} communautés affichées avec une date de fin de PRCC renseignée : ${cpt(av2014, m)} avant 2014, ${cpt(p1418, m)} entre 2014 et 2018, ${cpt(p1923, m)} entre 2019 et 2023, et ${cpt(dep2024, m)} depuis 2024.${sansDate > 0 ? ` ${sansDate} communauté${sansDate > 1 ? "s" : ""} sans date renseignée.` : ""}`,
      lecture: "La base rassemble des communautés à des niveaux de récence de PRCC très différents. La date de fin sert à les distinguer et fait partie des critères qui établissent le classement.",
      retenir: "La date de fin du PRCC aide à différencier les communautés selon l'ancienneté de leur expérience avec le programme. Pour voir comment cette dimension se retrouve dans la sélection et comparer les retenues aux autres, voir « Profil de la sélection ». Le poids de ce critère est réglable dans « Vue d'ensemble » (détaillé dans « Méthode »).",
    };
  }

  if (mode === "population") {
    const avecDonnee = rows.filter((r) => r.POPULATION !== null && r.POPULATION !== undefined).length;
    return {
      observation: `Sur ${n} communautés affichées, ${cpt(avecDonnee, n)} ont une donnée de population disponible.`,
      lecture: avecDonnee / n < 0.7
        ? "Cette couverture incomplète est la raison pour laquelle la population n'est pas utilisée comme critère de score actuellement : l'inclure pénaliserait injustement les communautés sans donnée."
        : "La couverture est correcte sur ce sous-ensemble, mais la population reste à 0 % de pondération dans le score global pour rester cohérente sur l'ensemble de la base.",
      retenir: "Les zones grises sur la carte dans ce mode signalent une absence de donnée, pas une population nulle.",
    };
  }

  if (mode === "agri") {
    // Dénominateur = uniquement les communautés qui ont la donnée (sinon une valeur manquante
    // retombe silencieusement dans « < 15 % » et fausse les parts).
    const avecPct = rows.filter((r) => Number.isFinite(Number(r["pct_cultures_5km"])));
    const m = avecPct.length;
    const retenir = "Cet indicateur n'entre pas dans le score de sélection. Il sert à mieux comprendre le contexte territorial et peut aider à repérer des zones intéressantes pour de futures activités ou des sites de démonstration.";
    const lecture = "La présence de terres cultivées autour des communautés varie d'un territoire à l'autre. Cette carte permet d'identifier les zones où l'activité agricole est déjà davantage présente à proximité. Il s'agit d'un indicateur de contexte territorial, et non d'une mesure complète du potentiel agricole : d'autres facteurs comme les sols, l'eau ou l'accès au marché peuvent également intervenir.";
    if (m === 0) return { observation: "Aucune donnée de terres cultivées disponible dans la vue actuelle.", lecture, retenir };
    const v = (r: Community) => Number(r["pct_cultures_5km"]);
    const bas = avecPct.filter((r) => v(r) < 15).length;
    const moyen = avecPct.filter((r) => v(r) >= 15 && v(r) < 30).length;
    const fort = avecPct.filter((r) => v(r) >= 30).length;
    const sansDonnee = n - m;
    return {
      observation: `Parmi les communautés affichées disposant de la donnée : ${cpt(bas, m)} ont moins de 15 % de terres cultivées dans un rayon de 5 km, ${cpt(moyen, m)} entre 15 et 30 %, et ${cpt(fort, m)} au moins 30 % (données satellitaires).${sansDonnee > 0 ? ` ${sansDonnee} communauté${sansDonnee > 1 ? "s ne disposent" : " ne dispose"} pas de cette donnée.` : ""}`,
      lecture,
      retenir,
    };
  }

  if (mode === "route") {
    // Dénominateur = communautés ayant dist_route_km ; les manquantes sont comptées à part
    // et ne doivent pas gonfler artificiellement une classe.
    const avecDist = rows.filter((r) => Number.isFinite(Number(r["dist_route_km"])));
    const m = avecDist.length;
    const lecture = "Cet indicateur situe chaque communauté par rapport à la route la plus proche. Il donne une première lecture de l'accessibilité géographique, mais ne renseigne pas à lui seul sur l'état des routes, leur praticabilité selon les saisons ou le temps réel nécessaire pour se déplacer.";
    const retenir = "L'accès à une route est un indicateur de contexte territorial et n'entre pas dans le score de sélection actuel. Les communautés situées à plus de 3 km d'une route constituent toutefois un groupe à considérer pour la planification des déplacements et des activités de terrain.";
    if (m === 0) return { observation: "Aucune donnée de distance à une route disponible dans la vue actuelle.", lecture, retenir };
    const d = (r: Community) => Number(r["dist_route_km"]);
    const proche = avecDist.filter((r) => d(r) <= 1).length;
    const loin = avecDist.filter((r) => d(r) > 3).length;
    const sansDonnee = n - m;
    return {
      observation: `Sur ${m} communautés affichées${sansDonnee > 0 ? " disposant de la donnée" : ""}, ${cpt(proche, m)} se situent à moins d'1 km d'une route (données OpenStreetMap), et ${cpt(loin, m)} à plus de 3 km.${sansDonnee > 0 ? ` ${sansDonnee} communauté${sansDonnee > 1 ? "s ne disposent" : " ne dispose"} pas de cette donnée.` : ""}`,
      lecture,
      retenir,
    };
  }

  // --- Modes « distance à une ressource » (OpenStreetMap, à vol d'oiseau) : marché, eau, ville.
  //     Données de contexte uniquement — n'entrent pas dans le score de sélection.
  //     On ne parle jamais d'« accès » ni d'« éloignement » (une ressource peut exister sans être
  //     cartographiée), seulement de distance « à ce qui est identifié dans les données disponibles ».
  if (mode === "marche" || mode === "eau" || mode === "ville") {
    const cfg = {
      marche: {
        field: "dist_marche_osm_km", proche: 10, loin: 50,
        nom: "un marché identifié dans les données disponibles",
        lecture: "La proximité d'un marché identifié varie selon les communautés. Cette distance donne une première indication de l'accès géographique aux marchés, mais elle peut être surestimée dans les zones rurales où les marchés hebdomadaires ou locaux sont peu ou pas cartographiés.",
        retenir: "Cet indicateur est un élément de contexte territorial et n'entre pas dans le score de sélection actuel. Il peut aider à repérer les communautés nécessitant une vérification locale de leur accès réel aux marchés.",
      },
      eau: {
        field: "dist_eau_osm_km", proche: 2, loin: 25,
        nom: "un point d'eau identifié dans les données disponibles (rivière, plan d'eau, puits ou forage)",
        lecture: "La distance à un point d'eau identifié varie selon les communautés. Ce repère regroupe des ressources très différentes (rivière, plan d'eau, puits, forage) qui n'ont pas toutes la même utilité au quotidien. Une distance élevée ne signifie pas qu'une communauté n'a pas accès à l'eau : certains puits, forages ou points d'eau locaux peuvent ne pas figurer dans les données.",
        retenir: "Cet indicateur est un élément de contexte territorial et n'entre pas dans le score de sélection actuel. Les communautés situées à plus de 25 km d'un point d'eau identifié peuvent constituer un groupe à vérifier localement, notamment lorsque l'accès à l'eau est important pour les activités envisagées.",
      },
      ville: {
        field: "dist_ville_km", proche: 5, loin: 30,
        nom: "une ville identifiée",
        lecture: "La distance à la ville la plus proche varie selon les communautés. Cette information donne une première indication de leur proximité des pôles urbains, mais une distance faible ne garantit pas à elle seule l'accès aux services, aux transports ou aux marchés.",
        retenir: "Cet indicateur est un élément de contexte territorial et n'entre pas dans le score de sélection actuel. Il peut aider à identifier les communautés les plus éloignées des pôles urbains, notamment pour anticiper les besoins liés à l'organisation des formations et des déplacements.",
      },
    }[mode];
    const avec = rows.filter((r) => Number.isFinite(Number(r[cfg.field])));
    const m = avec.length;
    if (m === 0) return null;
    const val = (r: Community) => Number(r[cfg.field]);
    const nProche = avec.filter((r) => val(r) <= cfg.proche).length;
    const nLoin = avec.filter((r) => val(r) > cfg.loin).length;
    const sansDonnee = n - m;
    return {
      observation: `Sur ${m} communautés affichées${sansDonnee > 0 ? " disposant de la donnée" : ""}, ${cpt(nProche, m)} se situent à moins de ${cfg.proche} km d'${cfg.nom}, et ${cpt(nLoin, m)} à plus de ${cfg.loin} km.${sansDonnee > 0 ? ` ${sansDonnee} communauté${sansDonnee > 1 ? "s ne disposent" : " ne dispose"} pas de cette donnée.` : ""}`,
      lecture: cfg.lecture,
      retenir: cfg.retenir,
    };
  }

  return null;
}

// Encadré d'analyse repliable : fermé par défaut pour alléger la page — l'interprétation
// reste à un clic. Titre = résumé de ce qu'on trouve dedans.
function Analyse({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"sp-analyse" + (open ? " open" : "")}>
      <button type="button" className="sp-analyse-head" onClick={() => setOpen((v) => !v)}>
        <span>💡 {title}</span>
        <span className="sp-analyse-caret">{open ? "Masquer ▾" : "Voir l'analyse ▸"}</span>
      </button>
      {open && <div className="sp-analyse-body">{children}</div>}
    </div>
  );
}

export default function Spatial({ all, rows, onSelect, onBureau }: {
  all: Community[];
  rows: Community[];
  onSelect: (r: Community) => void;
  onBureau: (b: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("statut");
  // Buckets de légende masqués pour le mode de coloration courant (Score, Langue, Distance, etc.) —
  // remis à zéro à chaque changement de mode pour éviter qu'un filtre "< 40" reste actif en passant sur "Langue".
  const [hiddenBuckets, setHiddenBuckets] = useState<Set<string>>(new Set());
  useEffect(() => { setHiddenBuckets(new Set()); }, [mode]);
  const [spBureau, setSpBureau] = useState("Kolda");
  const [radius, setRadius] = useState(50);
  const [radiusOn, setRadiusOn] = useState(false);
  // Kolda/50 km ne sont que des valeurs de départ techniques (il faut bien initialiser le state) — tant que
  // l'utilisateur n'a rien choisi lui-même, aucun chip ne doit paraître sélectionné ni afficher de résultat.
  const [radiusTouched, setRadiusTouched] = useState(false);
  const [farThresh, setFarThresh] = useState(100);
  const [isolateFar, setIsolateFar] = useState(false);
  // Même logique que radiusTouched : 100 km n'est qu'une valeur de départ, pas un choix de l'utilisateur.
  const [farTouched, setFarTouched] = useState(false);
  const [showSel, setShowSel] = useState(true);
  const [showUnsel, setShowUnsel] = useState(true);
  const [roadsData, setRoadsData] = useState<any>(null);
  const [showRoads, setShowRoads] = useState(false);
  const [showLandcover, setShowLandcover] = useState(false);
  // Couches de points OSM en overlay — chargées à la demande (le fichier eau fait ~360 Ko).
  const [poi, setPoi] = useState<{ villes: any; marches: any; eau: any }>({ villes: null, marches: null, eau: null });
  const [showVilles, setShowVilles] = useState(false);
  const [showMarches, setShowMarches] = useState(false);
  const [showEau, setShowEau] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false); // panneau « Couches à superposer » replié par défaut
  const [correctionMode, setCorrectionMode] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, Correction>>(() => {
    try { return JSON.parse(localStorage.getItem(CORRECTIONS_KEY) || "{}"); } catch { return {}; }
  });
  useEffect(() => { fetch(`${DATA_BASE}roads_major.geojson`).then((r) => r.json()).then(setRoadsData).catch(() => {}); }, []);
  useEffect(() => {
    ([["villes", showVilles], ["marches", showMarches], ["eau", showEau]] as ["villes" | "marches" | "eau", boolean][])
      .forEach(([k, on]) => {
        if (on && !poi[k]) fetch(`${DATA_BASE}poi_${k}.geojson`).then((r) => r.json()).then((d) => setPoi((prev) => ({ ...prev, [k]: d }))).catch(() => {});
      });
  }, [showVilles, showMarches, showEau, poi]);

  // Comparaison avec les positions de « Tableau Public » (autre extraction de la base Tostan).
  const [tableauData, setTableauData] = useState<Record<string, { lat: number; lon: number }>>({});
  const [showTableauCompare, setShowTableauCompare] = useState(false);
  useEffect(() => {
    fetch(`${DATA_BASE}tableau_coords.json`)
      .then((r) => r.json())
      .then((arr: any[]) => {
        const map: Record<string, { lat: number; lon: number }> = {};
        arr.forEach((t) => {
          if (t && Number.isFinite(t.lat_tab) && Number.isFinite(t.lon_tab)) map[t.code] = { lat: t.lat_tab, lon: t.lon_tab };
        });
        setTableauData(map);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(corrections)); } catch { /* quota / private */ } }, [corrections]);

  function saveCorrection(r: Community, lat: number, lon: number) {
    const code = String(r["code communaute"] ?? r._id ?? r.Communauté);
    const existing = corrections[code];
    const oldLat = existing ? existing.oldLat : Number(r["Latitude référence"]);
    const oldLon = existing ? existing.oldLon : Number(r["Longitude référence"]);
    setCorrections((prev) => ({ ...prev, [code]: { code, communaute: r.Communauté, lat, lon, oldLat, oldLon, ts: Date.now() } }));
    // Envoi au Google Sheet. mode:"no-cors" → réponse illisible côté navigateur (Apps Script sans en-têtes CORS),
    // l'écriture fonctionne quand même ; les erreurs réseau sont ignorées. Le bouton d'export CSV reste le filet local.
    try {
      fetch(CORRECTIONS_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ code_communaute: code, communaute: r.Communauté, lat, lon, oldLat, oldLon }),
      }).catch(() => {});
    } catch { /* fetch indisponible */ }
  }

  function downloadCorrections() {
    const list = Object.values(corrections);
    if (!list.length) return;
    const csv = "code_communaute,communaute,lat,lon,oldLat,oldLon,date\n" +
      list.map((c) => [c.code, `"${String(c.communaute).replace(/"/g, '""')}"`, c.lat, c.lon, c.oldLat, c.oldLon, new Date(c.ts).toISOString()].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "corrections_positions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const sel = useMemo(() => all.filter((r) => r.selected), [all]);
  const nonsel = useMemo(() => all.filter((r) => !r.selected), [all]);
  const langList = useMemo(() => Array.from(new Set(all.map((r) => r["Langue normalisée"]))).sort(), [all]);

  const far = useMemo(() => sel.filter((r) => num(r, "Distance bureau (km)") > farThresh), [sel, farThresh]);
  const inRadius = useMemo(
    () => all.filter((r) => r.Bureau === spBureau && num(r, "Distance bureau (km)") <= radius),
    [all, spBureau, radius],
  );

  const farSet = useMemo(() => new Set(far.map(keyOf)), [far]);
  const inRadiusSet = useMemo(() => new Set(inRadius.map(keyOf)), [inRadius]);
  // Le filtre Sélectionnée / Hors sélection s'applique toujours, quel que soit le mode de
  // coloration choisi (comme dans « Vue d'ensemble ») — ce n'est plus réservé au mode "statut".
  const statusRows = useMemo(
    () => rows.filter((r) => (r.selected ? showSel : showUnsel)),
    [rows, showSel, showUnsel],
  );
  // Dès qu'un bureau + rayon est choisi, la carte se recentre sur ce sous-ensemble — sinon le
  // choix d'un bureau n'avait aucun effet visible, seul le cercle de contour apparaissait.
  const mapRows = useMemo(() => {
    let out = statusRows;
    if (radiusTouched) out = out.filter((r) => inRadiusSet.has(keyOf(r)));
    if (isolateFar) out = out.filter((r) => farSet.has(keyOf(r)));
    // Filtre par légende (Score, Distance, Langue, etc.) — "statut" a déjà son propre système de
    // filtre (showSel/showUnsel) dans la légende flottante de la carte, pas de doublon ici pour lui.
    if (mode !== "statut" && hiddenBuckets.size > 0) out = out.filter((r) => !hiddenBuckets.has(bucketLabelFor(r, mode, langList)));
    return out;
  }, [statusRows, radiusTouched, inRadiusSet, isolateFar, farSet, mode, hiddenBuckets, langList]);

  const center: [number, number] = radiusOn ? BUREAUX[spBureau] : [14.0, -14.6];
  const zoom = radiusOn ? (radius <= 25 ? 9 : radius <= 60 ? 8 : 7) : 6;

  // Couche des points communautés — mémoïsée : sans cela, chaque case à cocher du panneau
  // latéral reconstruit ~800 marqueurs et Leaflet « avale » le clic (il faut recliquer).
  const markerLayer = useMemo(
    () =>
      mapRows
        .filter((r) => Number.isFinite(num(r, "Latitude référence")))
        .map((r, i) => {
          const [dx, dy] = jitter(keyOf(r) + i);
          const code = String(r["code communaute"] ?? r._id ?? r.Communauté);
          const corr = corrections[code];
          const pos: [number, number] = corr
            ? [corr.lat, corr.lon]
            : [num(r, "Latitude référence") + dx, num(r, "Longitude référence") + dy];
          return (
            <Fragment key={keyOf(r) + i}>
              {correctionMode ? (
                <Marker
                  position={pos}
                  draggable
                  icon={corr ? dragIcon : dragIconPlain}
                  eventHandlers={{
                    dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); saveCorrection(r, +ll.lat.toFixed(6), +ll.lng.toFixed(6)); },
                    click: () => onSelect(r),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -8]}>{r.Communauté}{corr ? " · corrigée" : ""}</Tooltip>
                </Marker>
              ) : (
                <CircleMarker
                  center={pos}
                  radius={r.selected ? 5 : 3.5}
                  pathOptions={{
                    color: corr && correctionMode ? "#e11d48" : colorFor(r, mode),
                    fillColor: corr && correctionMode ? "#e11d48" : colorFor(r, mode),
                    weight: corr && correctionMode ? 2 : r.selected ? 1.5 : 1,
                    fillOpacity: r.selected ? 0.85 : 0.5,
                  }}
                  eventHandlers={{ click: () => onSelect(r) }}
                >
                  {(() => { const mv = modeValue(r, mode); return (
                    <Tooltip direction="top" offset={[0, -4]}>{r.Communauté}{mv ? ` · ${mv}` : ""}</Tooltip>
                  ); })()}
                </CircleMarker>
              )}
              {showTableauCompare && (() => {
                const t = tableauData[code];
                if (!t) return null;
                // Écart réel : toujours sur les coordonnées brutes (non décalées), c'est la seule mesure qui compte.
                const curLat = num(r, "Latitude référence"), curLon = num(r, "Longitude référence");
                const distKm = 111 * Math.sqrt((t.lat - curLat) ** 2 + (t.lon - curLon) ** 2);
                // Affichage : on applique au point Tableau le MÊME décalage de lisibilité (dx, dy) qu'au point courant
                // (même logique que `pos` ci-dessus). Sans ça, deux communautés à coordonnées identiques (fréquent :
                // ~45 % de la base partage un point avec au moins une autre) semblaient "diverger" alors que les deux
                // sources s'accordent parfaitement — l'écart venait uniquement de la dispersion anti-chevauchement.
                const tPos: [number, number] = corr ? [t.lat, t.lon] : [t.lat + dx, t.lon + dy];
                return (
                  <>
                    <CircleMarker center={tPos} radius={4} pathOptions={{ color: "#8e44ad", weight: 1.5, fillOpacity: 0.7 }}>
                      <Tooltip>{`${r.Communauté} (Tableau) · écart réel ${distKm.toFixed(1)} km`}</Tooltip>
                    </CircleMarker>
                    {distKm > 0.5 && (
                      <Polyline positions={[pos, tPos]} pathOptions={{ color: "#8e44ad", weight: 1, opacity: 0.4, dashArray: "4 4" }} />
                    )}
                  </>
                );
              })()}
            </Fragment>
          );
        }),
    // saveCorrection est volontairement hors deps : il est recréé à chaque rendu mais son
    // comportement ne dépend que de `corrections`, déjà listé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapRows, mode, corrections, correctionMode, showTableauCompare, tableauData, onSelect],
  );

  const distBuckets = [
    { l: "moins de 25 km", n: sel.filter((r) => num(r, "Distance bureau (km)") < 25).length },
    { l: "25 à 50 km", n: sel.filter((r) => { const d = num(r, "Distance bureau (km)"); return d >= 25 && d < 50; }).length },
    { l: "50 à 100 km", n: sel.filter((r) => { const d = num(r, "Distance bureau (km)"); return d >= 50 && d < 100; }).length },
    { l: "plus de 100 km", n: sel.filter((r) => num(r, "Distance bureau (km)") >= 100).length },
  ];
  const distMax = Math.max(1, ...distBuckets.map((b) => b.n));

  const flag = (d: number) => (d < -3 ? "#d64550" : d > 3 ? "#176bd1" : "#2f9e6f");
  const ling = langList
    .map((l) => {
      const b = all.filter((r) => r["Langue normalisée"] === l).length;
      const s = sel.filter((r) => r["Langue normalisée"] === l).length;
      const bs = pct(b, all.length), ss = pct(s, sel.length);
      return { l, b, s, bs, ss, delta: ss - bs };
    })
    .sort((a, b) => b.b - a.b);

  const grp = (g: Community[]) => ({
    score: avg(g.map((r) => r.score)),
    dist: avg(g.map((r) => num(r, "Distance bureau (km)"))),
    recent: pct(g.filter((r) => num(r, "Année Fin PRCC") >= 2020).length, g.length),
    pop: avg(g.filter((r) => Number.isFinite(num(r, "POPULATION"))).map((r) => num(r, "POPULATION"))),
    popN: g.filter((r) => Number.isFinite(num(r, "POPULATION"))).length,
    langs: new Set(g.map((r) => r["Langue normalisée"])).size,
    dens: avg(g.map((r) => num(r, "Autres communautés dans 25 km"))),
  });
  const gS = grp(sel), gN = grp(nonsel);

  const byBureau = Object.keys(BUREAUX)
    .map((b) => {
      const g = all.filter((r) => r.Bureau === b);
      const s = g.filter((r) => r.selected);
      return { b, n: g.length, s: s.length, rate: pct(s.length, g.length), dist: avg(g.map((r) => num(r, "Distance bureau (km)"))), langs: new Set(g.map((r) => r["Langue normalisée"])).size, pays: g[0]?.Pays as string | undefined };
    })
    .sort((a, b) => b.n - a.n);

  const byRegion = Array.from(new Set(all.map((r) => r.Région)))
    .map((rg) => {
      const g = all.filter((r) => r.Région === rg);
      const s = g.filter((r) => r.selected).length;
      return { rg, n: g.length, s, rate: pct(s, g.length), pays: g[0]?.Pays as string | undefined };
    })
    .sort((a, b) => b.n - a.n);

  const snPop = all.filter((r) => r.Pays === "Sénégal" && r.POPULATION != null).length;
  const snTot = all.filter((r) => r.Pays === "Sénégal").length;
  const gmPop = all.filter((r) => r.Pays === "Gambie" && r.POPULATION != null).length;
  const gmTot = all.filter((r) => r.Pays === "Gambie").length;
  const centroid = all.filter((r) => r["Méthode localisation"]?.startsWith("Centroïde des communautés voisines")).length;
  const codeKnown = all.filter((r) => r["code communaute"]).length;

  const att: { c: string; t: string }[] = [];
  const under = ling.filter((x) => x.delta < -5);
  if (under.length) under.forEach((x) => att.push({ c: "#d64550", t: `${x.l} sous-représentée : ${x.s} communauté${x.s > 1 ? "s" : ""} retenue${x.s > 1 ? "s" : ""} (${x.ss.toFixed(0)} % de la sélection) contre ${x.b} dans la base (${x.bs.toFixed(0)} %), soit un écart de ${Math.abs(x.delta).toFixed(0)} points.` }));
  else att.push({ c: "#2f9e6f", t: "La langue n'est pas un critère de sélection. Ce contrôle vérifie que les autres critères (distance, densité, récence) n'introduisent pas, par effet indirect, un déséquilibre linguistique involontaire. Résultat actuel : chaque langue garde une part quasi identique dans la sélection et dans la base (écart de 5 points de pourcentage ou moins pour toutes)." });
  const farShare = pct(far.length, sel.length);
  if (farShare >= 15) att.push({ c: "#e8a13a", t: `${far.length} communautés retenues (${farShare.toFixed(0)} %) sont à plus de ${farThresh} km d'un bureau.` });
  const gambiaSel = sel.filter((r) => r.Pays === "Gambie").length;
  att.push({ c: "#d64550", t: `Population indisponible pour la Gambie : ${gambiaSel} communautés retenues concernées.` });
  const snMissing = sel.filter((r) => r.Pays === "Sénégal" && r.POPULATION == null).length;
  if (snMissing) att.push({ c: "#e8a13a", t: `Population manquante pour ${snMissing} communautés sénégalaises retenues.` });
  const topB = byBureau.slice().sort((a, b) => b.s - a.s)[0];
  if (topB) {
    // Même seuil (5 points) que l'analyse territoriale de la section "Par bureau" : comparaison
    // au sein du même pays, pas contre la sélection binationale (voir ce bloc pour le détail du biais évité).
    const totalBasePays = all.filter((r) => r.Pays === topB.pays).length;
    const totalSelPays = sel.filter((r) => r.Pays === topB.pays).length;
    const topBEcart = pct(topB.s, totalSelPays) - pct(topB.n, totalBasePays);
    const qualif = Math.abs(topBEcart) > 5 ? " (à noter)" : " (cohérent avec sa part dans la base)";
    att.push({ c: "#176bd1", t: `Concentration : le bureau de ${topB.b} regroupe ${topB.s} communautés retenues (${pct(topB.s, sel.length).toFixed(0)} % de la sélection)${qualif}.` });
  }
  att.push({ c: "#2f9e6f", t: `Score moyen des retenues ${gS.score.toFixed(1)} contre ${gN.score.toFixed(1)} hors sélection, soit un écart de ${(gS.score - gN.score).toFixed(1)} points.` });

  const segs: [Mode, string][] = [["statut", "Statut"], ["score", "Score"], ["langue", "Langue"], ["distance", "Distance bureau"], ["prcc", "Fin PRCC"], ["population", "Population"], ["agri", "Potentiel agricole"], ["route", "Accès route"], ["marche", "Marché proche"], ["eau", "Point d'eau proche"], ["ville", "Ville proche"]];

  return (
    <section className="sp">
      <nav className="sp-nav">
        <a href="#sp-synthese">Synthèse</a>
        <a href="#sp-carte">Carte &amp; distances</a>
        <a href="#sp-profil">Profil de la sélection</a>
        <a href="#sp-bureaux">Par bureau / région</a>
        <a href="#sp-qualite">Points d'attention &amp; qualité</a>
      </nav>
      <div className="sp-facts" id="sp-synthese">
        <div className="stat"><span>Communautés analysées</span><strong>{all.length}</strong><small>Sénégal + Gambie</small></div>
        <div className="stat"><span>Sélectionnées</span><strong>{sel.length}</strong><small>{pct(sel.length, all.length).toFixed(0)} % de la base</small></div>
        <div className="stat"><span>Bureaux</span><strong>5</strong><small>de coordination</small></div>
        <div className="stat"><span>Langues</span><strong>{langList.length}</strong><small>normalisées</small></div>
        <div className="stat"><span>Distance moyenne</span><strong>{gS.dist.toFixed(0)} km</strong><small>communautés retenues</small></div>
        {(() => { const k = sel.filter((r) => num(r, "Distance bureau (km)") > 100).length; return (
          <div className="stat"><span>Retenues à plus de 100 km</span><strong>{k}</strong><small>éloignées d'un bureau ({pct(k, sel.length).toFixed(0)} % de la sélection)</small></div>
        ); })()}
      </div>

      <div className="grid" id="sp-carte">
        <div className="map-card" style={{ gridRow: "auto" }}>
          <div className="card-head"><div><h2>Carte analytique</h2><span>{mapRows.length} communautés affichées</span></div></div>
          <div className="map-wrap">
            <MapContainer center={center} zoom={zoom} scrollWheelZoom>
              <MapView center={center} zoom={zoom} />
              <LayersControl position="topright">
                {BASEMAPS.map((b, i) => (
                  <LayersControl.BaseLayer key={b.name} name={b.name} checked={i === 0}>
                    <TileLayer url={b.url} attribution={b.attribution} subdomains={b.subdomains ?? "abc"} maxNativeZoom={b.maxNativeZoom} />
                  </LayersControl.BaseLayer>
                ))}
              </LayersControl>
              {showLandcover && (
                <ImageOverlay url={`${DATA_BASE}worldcover_senegal_gambie.png`} bounds={LANDCOVER_BOUNDS} opacity={0.75} attribution="ESA WorldCover 2021" />
              )}
              {showRoads && roadsData && <RoadsLayer data={roadsData} />}
              {showVilles && poi.villes && <PoiLayer data={poi.villes} kind="villes" />}
              {showMarches && poi.marches && <PoiLayer data={poi.marches} kind="marches" />}
              {showEau && poi.eau && <PoiLayer data={poi.eau} kind="eau" />}
              {markerLayer}
              {Object.entries(BUREAUX).map(([b, c]) => (
                <CircleMarker key={b} center={c} radius={7} pathOptions={{ color: "#0c1b33", weight: 2, fillColor: "#ffd166", fillOpacity: 1 }}>
                  <Tooltip>{`Bureau ${b}`}</Tooltip>
                </CircleMarker>
              ))}
              {radiusOn && <Circle center={BUREAUX[spBureau]} radius={radius * 1000} pathOptions={{ color: "#176bd1", weight: 1.5, fillOpacity: 0.06 }} />}
            </MapContainer>
            {/* Filtre Statut : toujours actif, quel que soit le mode de coloration — même légende flottante que « Vue d'ensemble ». */}
            <div className="map-legend">
              <button type="button" className={showSel ? "" : "off"} onClick={() => setShowSel((v) => !v)}><i style={{ background: "#176bd1" }} />Sélectionnée</button>
              <button type="button" className={showUnsel ? "" : "off"} onClick={() => setShowUnsel((v) => !v)}><i style={{ background: "#9aabbe" }} />Hors sélection</button>
            </div>
          </div>
          <div className="seg-below">
            <div className="seg">
              {segs.map(([m, l]) => <button key={m} className={mode === m ? "on" : ""} title={m === "prcc" ? PRCC_TOOLTIP : undefined} onClick={() => setMode(m)}>{l}</button>)}
            </div>
            {mode !== "statut" && (
              <div className="legend-row">
                {legendFor(mode, langList).map((x) => (
                  <button
                    type="button"
                    key={x.l}
                    className={hiddenBuckets.has(x.l) ? "off" : ""}
                    onClick={() => setHiddenBuckets((prev) => {
                      const next = new Set(prev);
                      if (next.has(x.l)) next.delete(x.l); else next.add(x.l);
                      return next;
                    })}
                  >
                    <i style={{ background: x.c }} />{x.l}
                  </button>
                ))}
                {mode === "population" && <span style={{ color: "#a8752a" }}>· Gambie non disponible</span>}
              </div>
            )}
            {showLandcover && (
              <div className="legend-row" style={{ marginTop: 6 }}>
                <span><i style={{ background: "#006400" }} />Forêt</span>
                <span><i style={{ background: "#ffbb22" }} />Arbustes</span>
                <span><i style={{ background: "#ffff4c" }} />Prairie</span>
                <span><i style={{ background: "#f096ff" }} />Cultures</span>
                <span><i style={{ background: "#fa0000" }} />Bâti</span>
                <span><i style={{ background: "#b4b4b4" }} />Sol nu</span>
                <span><i style={{ background: "#0064c8" }} />Eau</span>
                <span><i style={{ background: "#0096a0" }} />Zone humide</span>
              </div>
            )}
            {(() => {
              const analyse = analyseCarte(mode, mapRows);
              if (!analyse) return null;
              return (
                <Analyse title={<>Analyse du mode « {segs.find(([m]) => m === mode)?.[1]} »</>}>
                  <p><b>Observation :</b> {analyse.observation}</p>
                  <p><b>Ce que ça veut dire :</b> {analyse.lecture}</p>
                  <p className="sp-retenir">🎯 <b>À retenir :</b> {analyse.retenir}</p>
                </Analyse>
              );
            })()}
            {/* Analyses en 4 temps des deux outils du panneau latéral — affichées sous la carte plutôt que sur le côté. */}
            {radiusTouched && inRadius.length > 0 && (() => {
              const retenues = inRadius.filter((r) => r.selected);
              const horsSel = inRadius.filter((r) => !r.selected);
              const tauxLocal = pct(retenues.length, inRadius.length);

              let interpretation: string;
              if (tauxLocal >= 85) {
                interpretation = `À cette distance, presque toutes les communautés sont retenues (${retenues.length} sur ${inRadius.length}, ${tauxLocal.toFixed(0)} %). C'est normal et attendu : plus une communauté est proche d'un bureau, plus elle marque de points sur ce critère, qui compte pour 45 % du score total. Ce taux élevé ne signale donc pas un problème : il montre simplement que le modèle fonctionne comme prévu.`;
              } else if (tauxLocal >= 50) {
                interpretation = `${retenues.length} des ${inRadius.length} communautés de cette zone sont retenues (${tauxLocal.toFixed(0)} %). La proximité ne suffit donc pas seule ici : d'autres critères (concentration de voisines, récence du PRCC) font aussi la différence.`;
              } else {
                interpretation = `Seulement ${retenues.length} des ${inRadius.length} communautés de cette zone sont retenues (${tauxLocal.toFixed(0)} %), malgré leur proximité du bureau. Cela signifie que d'autres critères du score (concentration de voisines, récence du PRCC) pèsent plus lourd que la distance pour ces communautés précises.`;
              }

              let pourquoi: string | null = null;
              if (horsSel.length > 0 && retenues.length > 0) {
                const gaps = compareGroups(retenues, horsSel);
                if (gaps.length > 0) {
                  const top = gaps[0];
                  const detail = formatDetail(top.key, top.detailA, top.detailB, "retenues", "non retenues");
                  pourquoi = `Le critère le plus discriminant ici est ${CRIT_LABELS[top.key]}, ${detail}.`;
                }
              }

              return (
                <Analyse title={<>Analyse du périmètre : {spBureau}, {radius} km</>}>
                  <p><b>Observation :</b> dans un rayon de {radius} km autour de {spBureau}, {inRadius.length} communautés sont rattachées, dont {retenues.length} retenues ({tauxLocal.toFixed(0)} %) et {horsSel.length} non retenues.</p>
                  <p><b>Ce que ça veut dire :</b> {interpretation}</p>
                  {pourquoi && <p><b>Différence entre les deux groupes :</b> {pourquoi}</p>}
                  <p className="sp-retenir">🎯 <b>À retenir :</b> pour savoir si une région entière est sur- ou sous-représentée dans la sélection, consultez plutôt l'onglet « Par bureau / région », qui compare des zones administratives complètes plutôt qu'un rayon choisi librement ici.</p>
                </Analyse>
              );
            })()}
            {farTouched && far.length > 0 && (() => {
              const resteSelection = sel.filter((r) => !farSet.has(keyOf(r)));
              // "dist" toujours exclu : far est PAR DÉFINITION le groupe "distance > seuil", donc plus
              // mauvais que le reste sur ce critère par construction — le citer comme "explication de leur
              // maintien" est backwards (leur distance est justement pire, pas meilleure). Voir compareGroups.
              const gaps = compareGroups(far, resteSelection, ["dens", "recent"]);
              const partSel = pct(far.length, sel.length);

              // Seuils minimums, en unités réelles, pour qu'un écart soit assez parlant pour être cité.
              // g.gap > 0 est requis : un critère où les éloignées sont MOINS bonnes que le reste (ex. moins
              // de voisines à proximité) n'explique en rien leur maintien dans la sélection — ça ne fait
              // qu'ajouter un autre point faible à celui déjà connu (la distance elle-même).
              const seuils: Record<string, number> = { dist: 15, dens: 3, recent: 3 };
              const gapSignificatif = gaps.find((g) => g.gap > 0 && Math.abs(g.detailA - g.detailB) >= seuils[g.key]);

              let pourquoi: string;
              if (gapSignificatif) {
                const detail = formatDetail(gapSignificatif.key, gapSignificatif.detailA, gapSignificatif.detailB, "communautés éloignées retenues", "reste de la sélection");
                pourquoi = `Le critère qui explique le plus leur maintien dans la sélection est ${CRIT_LABELS[gapSignificatif.key]}, ${detail}.`;
              } else {
                pourquoi = "Aucun critère ne se détache clairement : l'écart avec le reste de la sélection reste faible sur la distance, la concentration de voisines et la récence du PRCC. Leur sélection résulte d'une combinaison de petits avantages plutôt que d'un seul facteur déterminant.";
              }

              return (
                <Analyse title={<>Analyse des communautés éloignées (plus de {farThresh} km)</>}>
                  <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Porte sur les 803 communautés retenues, tous bureaux et pays confondus. Indépendant du bureau choisi ci-dessus dans « Distance autour d'un bureau ».</p>
                  <p><b>Observation :</b> {far.length} communautés retenues ({partSel.toFixed(1)} % de la sélection) se situent à plus de {farThresh} km de leur bureau de coordination.</p>
                  <p><b>Ce que ça veut dire :</b> {partSel < 15
                    ? "cette proportion reste limitée : la grande majorité de la sélection se situe à une distance plus favorable pour la supervision."
                    : "cette proportion est notable : une part significative de la sélection sera plus coûteuse à superviser sur le plan logistique."}</p>
                  <p><b>Pourquoi ces communautés sont-elles quand même retenues :</b> {pourquoi}</p>
                  <p className="sp-retenir">🎯 <b>À retenir pour l'équipe terrain :</b> ces communautés ne doivent pas nécessairement être écartées, mais prévoir des déplacements et une supervision adaptés à leur éloignement.</p>
                </Analyse>
              );
            })()}
          </div>
        </div>

        <div className="side-card">
          <div className="sp-tool">
            <h4><Compass size={14} /> Distance autour d'un bureau</h4>
            <div className="chips">
              {Object.keys(BUREAUX).map((b) => (
                <button
                  key={b}
                  className={radiusTouched && spBureau === b ? "on" : ""}
                  onClick={() => {
                    // Recliquer sur le bureau déjà actif désélectionne (sinon impossible de revenir à "aucun choix").
                    if (radiusTouched && spBureau === b) { setRadiusTouched(false); setRadiusOn(false); }
                    else { setSpBureau(b); setRadiusOn(true); setRadiusTouched(true); }
                  }}
                >{b}</button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 6 }}>
              {[10, 25, 50, 75, 100].map((k) => (
                <button
                  key={k}
                  className={radiusTouched && radius === k ? "on" : ""}
                  onClick={() => {
                    if (radiusTouched && radius === k) { setRadiusTouched(false); setRadiusOn(false); }
                    else { setRadius(k); setRadiusOn(true); setRadiusTouched(true); }
                  }}
                >{k} km</button>
              ))}
            </div>
            <input type="range" min={5} max={150} step={5} value={radius} onChange={(e) => { setRadius(Number(e.target.value)); setRadiusOn(true); setRadiusTouched(true); }} />
            <label className="toggle" style={{ display: "flex", gap: 7 }}><input type="checkbox" checked={radiusOn} onChange={(e) => { setRadiusOn(e.target.checked); if (e.target.checked) setRadiusTouched(true); }} /> Tracer le rayon sur la carte</label>
            <div className={"sp-layers" + (layersOpen ? " open" : "")}>
              <button type="button" className="sp-layers-head" onClick={() => setLayersOpen((v) => !v)}>
                <span>Couches à superposer sur la carte{(() => { const n = [showRoads, showVilles, showMarches, showEau, showLandcover].filter(Boolean).length; return n > 0 ? <span className="sp-layers-count">{n}</span> : null; })()}</span>
                <span className="sp-layers-caret">{layersOpen ? "Masquer ▾" : "Afficher ▸"}</span>
              </button>
              {layersOpen && (
                <div className="sp-layers-body">
                  <label className="toggle"><input type="checkbox" checked={showRoads} onChange={(e) => setShowRoads(e.target.checked)} /> <i style={{ background: "#e67e22" }} /> Routes principales (OSM)</label>
                  <label className="toggle"><input type="checkbox" checked={showVilles} onChange={(e) => setShowVilles(e.target.checked)} /> <i style={{ background: "#7c8aa0" }} /> Villes <span className="muted">(269)</span></label>
                  <label className="toggle"><input type="checkbox" checked={showMarches} onChange={(e) => setShowMarches(e.target.checked)} /> <i style={{ background: "#f0821e" }} /> Marchés <span className="muted">(441)</span></label>
                  <label className="toggle"><input type="checkbox" checked={showEau} onChange={(e) => setShowEau(e.target.checked)} /> <i style={{ background: "#3d8fc0" }} /> Points d'eau <span className="muted">(≈ 3 000)</span></label>
                  {showEau && <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>Cours d'eau (petits points clairs), plans d'eau, puits et sources. Couverture OpenStreetMap partielle pour les puits et les marchés ruraux.</p>}
                  <label className="toggle"><input type="checkbox" checked={showLandcover} onChange={(e) => setShowLandcover(e.target.checked)} /> <i style={{ background: "#5a9e5a" }} /> Occupation du sol classée (satellite)</label>
                </div>
              )}
            </div>
            <label className="toggle" style={{ display: "flex", gap: 7, marginTop: 6 }}>
              <input type="checkbox" checked={showTableauCompare} onChange={(e) => setShowTableauCompare(e.target.checked)} />
              Comparer avec Tableau Public
            </label>
            {showTableauCompare && <p className="muted" style={{ fontSize: 12 }}>Tableau Public : une autre extraction de la même base de données, utilisée ici comme second regard sur les coordonnées. Points violets = position dans Tableau Public. Une ligne relie chaque communauté à sa position actuelle si l'écart dépasse 500 m.</p>}
            <label className="toggle" style={{ display: "flex", gap: 7, marginTop: 6 }}><input type="checkbox" checked={correctionMode} onChange={(e) => setCorrectionMode(e.target.checked)} /> <Move size={13} /> Mode correction de position{Object.keys(corrections).length > 0 && <span style={{ marginLeft: 4, color: "#e11d48", fontWeight: 700 }}>{Object.keys(corrections).length}</span>}</label>
            {correctionMode && <p className="muted" style={{ marginTop: 4 }}>Glissez un point (rouge) vers sa vraie position. Chaque correction est enregistrée automatiquement et transmise à l'équipe data.</p>}
            {Object.keys(corrections).length > 0 && <button className="linkbtn" onClick={downloadCorrections}>⬇ Télécharger mes {Object.keys(corrections).length} correction(s) (CSV)</button>}
            {radiusTouched ? (
              <>
                <div className="sp-result">
                  <div><b>{inRadius.length}</b>rattachées à {spBureau}, dans {radius} km</div>
                  <div><b>{inRadius.filter((r) => r.selected).length}</b>retenues</div>
                  <div><b>{inRadius.filter((r) => !r.selected).length}</b>hors sélection</div>
                </div>
                <button className="linkbtn" onClick={() => { setRadiusTouched(false); setRadiusOn(false); }}>✕ Réinitialiser (voir toutes les communautés)</button>
              </>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>Choisissez un bureau et un rayon ci-dessus pour voir le résultat.</p>
            )}
          </div>

          <div className="sp-tool">
            <h4><AlertTriangle size={14} /> Communautés éloignées</h4>
            <p className="muted" style={{ marginTop: -4, marginBottom: 8, fontSize: 12 }}>Tous bureaux et pays confondus. Ne dépend pas du bureau choisi ci-dessus.</p>
            <input type="range" min={25} max={200} step={25} value={farThresh} onChange={(e) => { setFarThresh(Number(e.target.value)); setFarTouched(true); }} />
            <p className="muted">Seuil : plus de <b>{farThresh} km</b> du bureau de rattachement</p>
            {farTouched ? (
              <>
                <div className="sp-result">
                  <div><b>{far.length}</b>communautés retenues éloignées</div>
                  <div><b>{pct(far.length, sel.length).toFixed(0)} %</b>de la sélection</div>
                </div>
                <button className="linkbtn" onClick={() => { setFarTouched(false); setIsolateFar(false); }}>✕ Réinitialiser</button>
              </>
            ) : (
              <p className="muted">Bougez le curseur ci-dessus pour voir le résultat.</p>
            )}
            <label className="toggle" style={{ display: "flex", gap: 7 }}><input type="checkbox" checked={isolateFar} onChange={(e) => { setIsolateFar(e.target.checked); if (e.target.checked) setFarTouched(true); }} /> Isoler ces communautés sur la carte</label>
          </div>
        </div>
      </div>

      <div className="sp-two" id="sp-profil">
        <div className="chart-card">
          <div className="card-title"><Ruler size={16} /> Distance des communautés retenues aux bureaux</div>
          {distBuckets.map((b) => (
            <div className="barrow" key={b.l} style={{ gridTemplateColumns: "88px 1fr 34px" }}>
              <span>{b.l}</span><div><i style={{ width: `${(b.n / distMax) * 100}%` }} /></div><b>{b.n}</b>
            </div>
          ))}
          <p className="footnote" style={{ padding: "8px 0 0" }}>Sur {sel.length} communautés retenues · distance au bureau de rattachement.</p>
        </div>

        <div className="chart-card">
          <div className="card-title"><Languages size={16} /> Représentation linguistique</div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Langue</th><th>Base</th><th>Sél.</th><th>Part base</th><th>Part sél.</th><th>Écart</th></tr></thead>
              <tbody>
                {ling.map((x) => (
                  <tr key={x.l}>
                    <td className="name">{x.l}</td><td>{x.b}</td><td>{x.s}</td>
                    <td>{x.bs.toFixed(1)} %</td><td>{x.ss.toFixed(1)} %</td>
                    <td><span style={{ color: flag(x.delta), fontWeight: 700 }}>{x.delta > 0 ? "+" : ""}{x.delta.toFixed(1)} %</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="card-head"><div><h2>Sélectionnées vs hors sélection</h2><span>Le classement produit-il un profil distinct&nbsp;?</span></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Critère</th><th>Sélectionnées</th><th>Hors sélection</th></tr></thead>
            <tbody>
              <tr><td className="name">Score moyen</td><td><b>{gS.score.toFixed(1)}</b></td><td>{gN.score.toFixed(1)}</td></tr>
              <tr><td className="name">Distance moyenne au bureau</td><td><b>{gS.dist.toFixed(0)} km</b></td><td>{gN.dist.toFixed(0)} km</td></tr>
              <tr><td className="name">{withPrcc("PRCC terminé en 2020 ou après")}</td><td><b>{gS.recent.toFixed(0)} %</b></td><td>{gN.recent.toFixed(0)} %</td></tr>
              <tr><td className="name">Communautés proches (25 km), en moyenne</td><td><b>{gS.dens.toFixed(1)}</b></td><td>{gN.dens.toFixed(1)}</td></tr>
              <tr><td className="name">Population moyenne <small>(Sénégal)</small></td><td><b>{gS.pop ? Math.round(gS.pop).toLocaleString("fr-FR") : "n/d"}</b> <small>n={gS.popN}</small></td><td>{gN.pop ? Math.round(gN.pop).toLocaleString("fr-FR") : "n/d"} <small>n={gN.popN}</small></td></tr>
              <tr><td className="name">Langues distinctes</td><td><b>{gS.langs}</b></td><td>{gN.langs}</td></tr>
            </tbody>
          </table>
        </div>
        {(() => {
          const ecartScore = gS.score - gN.score;
          const popPct = pct(snPop, snTot);

          return (
            <div style={{ margin: "0 16px 16px" }}>
              <Analyse title="Analyse comparative">
                <p><b>Observation :</b> les {sel.length} communautés sélectionnées ont un score moyen de {gS.score.toFixed(1)}, contre {gN.score.toFixed(1)} pour les {nonsel.length} non sélectionnées, soit un écart de {ecartScore.toFixed(1)} points.</p>
                <p><b>Ce que ça veut dire :</b> les deux groupes présentent des profils différents. Les communautés sélectionnées sont en moyenne plus proches des bureaux de coordination ({gS.dist.toFixed(0)} km contre {gN.dist.toFixed(0)} km), ont plus souvent un PRCC terminé en 2020 ou après ({gS.recent.toFixed(0)} % contre {gN.recent.toFixed(0)} %), et comptent davantage de communautés voisines dans un rayon de 25 km ({gS.dens.toFixed(1)} contre {gN.dens.toFixed(1)}).</p>
                <p><b>Implication :</b> le classement produit donc une sélection nettement différenciée. Ces différences correspondent aux critères utilisés dans le calcul du score (distance au bureau, récence du PRCC, concentration locale). La sélection présente donc un profil nettement différent d'une sélection aléatoire.</p>
                <p className="sp-retenir">🎯 <b>À retenir :</b> la ligne « Population moyenne » de ce tableau ne concerne que le Sénégal et seulement les communautés où cette donnée existe ({snPop} sur {snTot}, soit {popPct.toFixed(0)} % de la base sénégalaise). Elle ne doit pas être lue comme un indicateur du poids réel de la population dans le score : ce critère est pondéré à 0 % par défaut (réglable dans l'onglet Vue d'ensemble), et la donnée manque en plus pour toute la Gambie.</p>
              </Analyse>
            </div>
          );
        })()}
      </div>

      <div className="sp-two" id="sp-bureaux">
        <div className="table-card">
          <div className="card-head"><div><h2>Par bureau</h2><span>Clic sur une ligne = filtrer la plateforme</span></div></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Bureau</th><th>Comm.</th><th>Retenues</th><th>Taux</th><th>Dist. moy.</th><th>Langues</th></tr></thead>
              <tbody>
                {byBureau.map((x) => (
                  <tr key={x.b} onClick={() => onBureau(x.b)}>
                    <td className="name">{x.b}</td><td>{x.n}</td><td>{x.s}</td><td>{x.rate.toFixed(0)} %</td><td>{x.dist.toFixed(0)} km</td><td>{x.langs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(() => {
            // Comparaison au sein du MÊME pays uniquement : les quotas de sélection sont fixés séparément
            // par pays (642 SN / 161 GM), comparer au total binational fausserait tout écart impliquant
            // Basse (100 % de la base gambienne à elle seule) — même correctif que pour "Distance autour d'un bureau".
            const avecEcart = byBureau
              .filter((b) => b.pays)
              .map((b) => {
                const totalBasePays = all.filter((r) => r.Pays === b.pays).length;
                const totalSelPays = sel.filter((r) => r.Pays === b.pays).length;
                const partSelection = pct(b.s, totalSelPays);
                const partBase = pct(b.n, totalBasePays);
                return { ...b, totalBasePays, totalSelPays, partSelection, partBase, ecart: partSelection - partBase };
              });
            if (!avecEcart.length) return null;
            const plusEcarte = avecEcart.reduce((max, x) => (Math.abs(x.ecart) > Math.abs(max.ecart) ? x : max), avecEcart[0]);

            const pBase = plusEcarte.partBase.toFixed(0), pSel = plusEcarte.partSelection.toFixed(0), ecartAbs = Math.abs(plusEcarte.ecart).toFixed(0);
            let lecture: string;
            if (Math.abs(plusEcarte.ecart) < 5) {
              lecture = `Sur 100 communautés éligibles au ${plusEcarte.pays}, ${pBase} viennent de la zone de ${plusEcarte.b}, et sur 100 communautés retenues, à peu près autant (${pSel}). Aucun bureau ne s'écarte nettement de sa part de départ.`;
            } else if (plusEcarte.ecart > 0) {
              lecture = `Sur 100 communautés éligibles au ${plusEcarte.pays}, ${pBase} viennent de la zone de ${plusEcarte.b}. Mais sur 100 communautés retenues au ${plusEcarte.pays}, ${pSel} en viennent : sa part augmente de ${ecartAbs} points entre le départ et l'arrivée. Sa part dans la sélection est donc supérieure à son poids dans la base de départ.`;
            } else {
              lecture = `Sur 100 communautés éligibles au ${plusEcarte.pays}, ${pBase} viennent de la zone de ${plusEcarte.b}. Mais sur 100 communautés retenues au ${plusEcarte.pays}, seulement ${pSel} en viennent : sa part diminue de ${ecartAbs} points entre le départ et l'arrivée. Sa part dans la sélection est donc inférieure à son poids dans la base de départ.`;
            }

            return (
              <div style={{ margin: "0 16px 16px" }}>
                <Analyse title="Analyse territoriale">
                  <p><b>Observation :</b> la zone de {plusEcarte.b} compte {plusEcarte.n} communautés éligibles au {plusEcarte.pays}, soit {pBase} % de la base. Elle représente {plusEcarte.s} des {plusEcarte.totalSelPays} communautés retenues au {plusEcarte.pays}, soit {pSel} % de la sélection.</p>
                  <p><b>Ce que ça veut dire :</b> {lecture}</p>
                  <p><b>Implication :</b> cet écart peut être lié aux caractéristiques prises en compte par le classement, notamment la distance au bureau, la récence du PRCC et la concentration locale. Il ne signifie pas nécessairement un déséquilibre : il permet surtout de vérifier si la répartition obtenue correspond aux choix attendus pour le programme.</p>
                  <p className="sp-retenir">🎯 <b>À retenir :</b> cette comparaison se fait toujours entre communautés d'un même pays (jamais Sénégal contre Gambie directement). Elle permet d'identifier les zones dont la part dans la sélection diffère de leur poids dans la base de départ ; un écart important peut ensuite être approfondi dans le détail du classement.</p>
                </Analyse>
              </div>
            );
          })()}
        </div>

        <div className="table-card">
          <div className="card-head"><div><h2>Par région</h2><span>{byRegion.length} régions</span></div></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Région</th><th>Base</th><th>Retenues</th><th>Taux</th></tr></thead>
              <tbody>
                {byRegion.map((x) => (
                  <tr key={x.rg}><td className="name">{x.rg}</td><td>{x.n}</td><td>{x.s}</td><td>{x.rate.toFixed(0)} %</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {(() => {
            // Même correctif que "Par bureau" : comparaison au sein du pays de la région, jamais au total binational.
            const avecEcart = byRegion
              .filter((r) => r.pays && r.n >= 10) // régions à très faible effectif ignorées, non significatives
              .map((r) => {
                const totalBasePays = all.filter((x) => x.Pays === r.pays).length;
                const totalSelPays = sel.filter((x) => x.Pays === r.pays).length;
                const partSelection = pct(r.s, totalSelPays);
                const partBase = pct(r.n, totalBasePays);
                return { ...r, totalBasePays, totalSelPays, partSelection, partBase, ecart: partSelection - partBase };
              });
            if (!avecEcart.length) return null;
            const plusEcartee = avecEcart.reduce((max, x) => (Math.abs(x.ecart) > Math.abs(max.ecart) ? x : max), avecEcart[0]);

            const rBase = plusEcartee.partBase.toFixed(0), rSel = plusEcartee.partSelection.toFixed(0), rEcart = Math.abs(plusEcartee.ecart).toFixed(0);
            return (
              <div style={{ margin: "0 16px 16px" }}>
                <Analyse title="Analyse régionale">
                  <p><b>Observation :</b> la région {plusEcartee.rg} compte {plusEcartee.n} communautés éligibles au {plusEcartee.pays}, soit {rBase} % de la base. Elle représente {plusEcartee.s} des {plusEcartee.totalSelPays} communautés retenues au {plusEcartee.pays}, soit {rSel} % de la sélection.</p>
                  <p><b>Ce que ça veut dire :</b> {Math.abs(plusEcartee.ecart) < 5
                  ? `Sa part reste à peu près la même entre les communautés éligibles (${rBase} %) et celles retenues (${rSel} %) : pas de déséquilibre notable.`
                  : plusEcartee.ecart > 0
                    ? `Sur 100 communautés éligibles au ${plusEcartee.pays}, ${rBase} viennent de cette région ; sur 100 retenues, ${rSel} en viennent, soit ${rEcart} points de plus que dans la base.`
                    : `Sur 100 communautés éligibles au ${plusEcartee.pays}, ${rBase} viennent de cette région ; sur 100 retenues, seulement ${rSel} en viennent, soit ${rEcart} points de moins que dans la base.`}</p>
                  <p><b>Implication :</b> cet écart peut être lié aux caractéristiques prises en compte par le classement, notamment la distance au bureau, la récence du PRCC et la concentration locale. Il ne signifie pas nécessairement un déséquilibre : il permet surtout de vérifier si la répartition obtenue correspond aux choix attendus pour le programme.</p>
                  <p className="sp-retenir">🎯 <b>À retenir :</b> cette lecture compare toujours les communautés à l'intérieur d'un même pays, jamais entre Sénégal et Gambie directement. Les régions avec moins de 10 communautés dans la base (comme Janjangburreh ici) ne sont pas retenues pour cette comparaison : avec un effectif aussi réduit, le taux de sélection peut être très élevé ou très faible sans que cela soit significatif. Les écarts importants peuvent ensuite être approfondis dans le détail du classement.</p>
                </Analyse>
              </div>
            );
          })()}
        </div>
      </div>

      {/* « Lecture générale » a été déplacée dans l'onglet Vue d'ensemble (rail de droite) : elle y suit
          les filtres et la pondération en direct, et c'est la première page que voient les lecteurs. */}

      <div className="sp-two" id="sp-qualite">
        <div className="chart-card">
          <div className="card-title"><CircleDot size={16} /> Points d'attention</div>
          {(() => {
            const nCritiques = att.filter((a) => a.c === "#d64550").length;
            const nAttention = att.filter((a) => a.c === "#e8a13a").length;
            // Tout ce qui n'est ni rouge ni orange compte comme "sans problème identifié" — y compris
            // les entrées bleues informatives (ex. concentration par bureau). Somme = att.length TOUJOURS,
            // sinon le diagnostic global et la liste détaillée ci-dessous peuvent se contredire silencieusement.
            const nOk = att.length - nCritiques - nAttention;

            let diagnostic: { emoji: string; titre: string; couleur: string };
            if (nCritiques > 0) diagnostic = { emoji: "🔴", titre: "À vérifier avant validation", couleur: "#d64550" };
            else if (nAttention > 0) diagnostic = { emoji: "🟠", titre: "À surveiller", couleur: "#e8a13a" };
            else diagnostic = { emoji: "🟢", titre: "Situation maîtrisée", couleur: "#2f9e6f" };

            return (
              <div className="sp-diagnostic" style={{ borderColor: diagnostic.couleur }}>
                <span className="sp-diagnostic-emoji">{diagnostic.emoji}</span>
                <div>
                  <b style={{ color: diagnostic.couleur }}>{diagnostic.titre}</b>
                  <p>{nCritiques} point(s) critique(s), {nAttention} à surveiller, {nOk} sans problème identifié. Détail ci-dessous.</p>
                </div>
              </div>
            );
          })()}
          {att.map((a, i) => <div className="att" key={i}><i style={{ background: a.c }} /><span>{a.t}</span></div>)}
        </div>

        <div className="chart-card">
          <div className="card-title"><Building2 size={16} /> Qualité des données</div>
          {[
            { l: "Population (Sénégal)", n: snPop, d: snTot, c: "#2f9e6f" },
            { l: "Population (Gambie)", n: gmPop, d: gmTot, c: gmPop ? "#2f9e6f" : "#d64550" },
            { l: "Coordonnées présentes", n: all.length, d: all.length, c: "#2f9e6f" },
            { l: "Position jugée fiable", n: all.filter((r) => r["Méthode localisation"]?.startsWith("Localité vérifiée") || r["Méthode localisation"]?.startsWith("Position restaurée")).length, d: all.length, c: "#2f9e6f" },
            { l: "Dont position au niveau du village précis (sous-ensemble le plus strict)", n: all.filter((r) => r["Méthode localisation"]?.startsWith("Localité vérifiée")).length, d: all.length, c: "#2f9e6f" },
            { l: "PRCC terminé en 2009 ou après (critère officiel)", n: all.filter((r) => Number(r["Année Fin PRCC"]) >= 2009).length, d: all.length, c: "#2f9e6f" },
            { l: "Code communauté", n: codeKnown, d: all.length, c: "#e8a13a" },
          ].map((q) => (
            <div className="q-row" key={q.l}>
              <span>{withPrcc(q.l)}</span>
              <div className="track"><i style={{ width: `${pct(q.n, q.d)}%`, background: q.c }} /></div>
              <b>{q.n}/{q.d}</b>
            </div>
          ))}
          <p className="footnote" style={{ padding: "6px 0 0" }}>Pour {centroid} communautés, la position a été estimée à partir de villages voisins déjà vérifiés. Légèrement moins précise qu'une vérification individuelle.</p>
        </div>
      </div>
    </section>
  );
}
