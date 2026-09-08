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

type Mode = "statut" | "score" | "langue" | "distance" | "prcc" | "population" | "agri" | "route";

function colorFor(r: Community, mode: Mode): string {
  if (mode === "statut") return r.selected ? "#176bd1" : "#9aabbe";
  if (mode === "score") { const s = r.score; return s >= 70 ? "#1c4a86" : s >= 55 ? "#3d7ec0" : s >= 40 ? "#7ba7d4" : "#c3d4e6"; }
  if (mode === "langue") return LANG_COLORS[r["Langue normalisée"]] || "#9aabbe";
  if (mode === "distance") { const d = num(r, "Distance bureau (km)"); return d <= 25 ? "#2f9e6f" : d <= 50 ? "#7bbf4f" : d <= 100 ? "#e8a13a" : "#d64550"; }
  if (mode === "prcc") { const y = num(r, "Année Fin PRCC"); return y >= 2024 ? "#1c4a86" : y >= 2019 ? "#3d7ec0" : y >= 2014 ? "#7ba7d4" : "#c3d4e6"; }
  if (mode === "agri") { const v = agriScore(r); return v >= 50 ? "#1c4a86" : v >= 30 ? "#3d7ec0" : v >= 15 ? "#7ba7d4" : "#c3d4e6"; }
  if (mode === "route") { const v = roadAccessScore(r); return v >= 80 ? "#1c4a86" : v >= 60 ? "#3d7ec0" : v >= 40 ? "#7ba7d4" : "#c3d4e6"; }
  const p = num(r, "POPULATION");
  if (!Number.isFinite(p)) return "#d7dee7";
  return p > 8000 ? "#1c4a86" : p > 3000 ? "#3d7ec0" : p > 1000 ? "#7ba7d4" : "#c3d4e6";
}
function legendFor(mode: Mode, langs: string[]): { c: string; l: string }[] {
  if (mode === "statut") return [{ c: "#176bd1", l: "Sélectionnée" }, { c: "#9aabbe", l: "Hors sélection" }];
  if (mode === "score") return [{ c: "#c3d4e6", l: "< 40" }, { c: "#7ba7d4", l: "40 – 55" }, { c: "#3d7ec0", l: "55 – 70" }, { c: "#1c4a86", l: "≥ 70" }];
  if (mode === "langue") return langs.map((l) => ({ c: LANG_COLORS[l] || "#9aabbe", l }));
  if (mode === "distance") return [{ c: "#2f9e6f", l: "≤ 25 km" }, { c: "#7bbf4f", l: "25 – 50" }, { c: "#e8a13a", l: "50 – 100" }, { c: "#d64550", l: "> 100" }];
  if (mode === "prcc") return [{ c: "#c3d4e6", l: "≤ 2013" }, { c: "#7ba7d4", l: "2014 – 2018" }, { c: "#3d7ec0", l: "2019 – 2023" }, { c: "#1c4a86", l: "≥ 2024" }];
  if (mode === "agri") return [{ c: "#c3d4e6", l: "< 15 %" }, { c: "#7ba7d4", l: "15 – 30 %" }, { c: "#3d7ec0", l: "30 – 50 %" }, { c: "#1c4a86", l: "≥ 50 %" }];
  if (mode === "route") return [{ c: "#c3d4e6", l: "éloignée" }, { c: "#7ba7d4", l: "proche" }, { c: "#3d7ec0", l: "très proche" }, { c: "#1c4a86", l: "sur la route" }];
  return [{ c: "#c3d4e6", l: "< 1 000" }, { c: "#7ba7d4", l: "1 000 – 3 000" }, { c: "#3d7ec0", l: "3 000 – 8 000" }, { c: "#1c4a86", l: "> 8 000" }, { c: "#d7dee7", l: "n/d" }];
}

// À quel bucket de légende appartient une communauté, pour un mode donné — sert à filtrer la carte
// (et donc l'analyse, qui lit toujours mapRows) quand on clique sur une entrée de la légende.
function bucketLabelFor(r: Community, mode: Mode, langs: string[]): string {
  if (mode === "langue") return r["Langue normalisée"] || "—";
  const color = colorFor(r, mode);
  return legendFor(mode, langs).find((x) => x.c === color)?.l ?? "";
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
        ? `Les communautés sélectionnées affichées sont en moyenne à ${distSel.toFixed(0)} km d'un bureau, contre ${distNon.toFixed(0)} km pour les non sélectionnées — la distance reste un facteur visible dans ce sous-ensemble.`
        : "Pas assez de données pour comparer les deux groupes sur ce sous-ensemble.",
      retenir: "Ce mode montre la répartition spatiale brute de la sélection — utile pour repérer visuellement des zones de concentration ou de vide.",
    };
  }

  if (mode === "score") {
    const haut = rows.filter((r) => r.score >= 70).length;
    const bas = rows.filter((r) => r.score < 40).length;
    const basSel = rows.filter((r) => r.score < 40 && r.selected).length;
    return {
      observation: `${pct(haut, n).toFixed(0)} % des communautés affichées ont un score ≥ 70, et ${pct(bas, n).toFixed(0)} % ont un score < 40.`,
      lecture: basSel > 0
        ? `${basSel} communauté(s) à score relativement faible (< 40) sont malgré tout sélectionnées. Cela s'explique par le classement séparé par pays : une communauté est retenue si elle fait partie des mieux classées de son pays, pas selon un seuil de score absolu commun.`
        : "Aucune communauté à score faible n'est sélectionnée dans ce sous-ensemble — le score absolu et le statut de sélection sont ici cohérents.",
      retenir: "Le score sert à classer les communautés entre elles, pas à fixer une note absolue de qualité — deux communautés de pays différents avec le même score peuvent avoir un statut différent.",
    };
  }

  if (mode === "langue") {
    const parLangue: Record<string, number> = {};
    rows.forEach((r) => { const l = r["Langue normalisée"] || "—"; parLangue[l] = (parLangue[l] || 0) + 1; });
    const top = Object.entries(parLangue).sort((a, b) => b[1] - a[1])[0];
    return {
      observation: `${Object.keys(parLangue).length} langue(s) représentée(s) parmi les communautés affichées. La plus fréquente est ${top[0]} (${pct(top[1], n).toFixed(0)} %).`,
      lecture: "Cette répartition reflète la composition linguistique du sous-ensemble affiché, sans lien avec le score — la langue n'est pas un critère de sélection.",
      retenir: "Utile pour anticiper les besoins de couverture linguistique des équipes d'animation dans cette zone, pas pour évaluer la qualité de la sélection.",
    };
  }

  if (mode === "distance") {
    const b1 = rows.filter((r) => num(r, "Distance bureau (km)") <= 25).length;
    const b4 = rows.filter((r) => num(r, "Distance bureau (km)") > 100).length;
    return {
      observation: `${pct(b1, n).toFixed(0)} % des communautés affichées sont à moins de 25 km d'un bureau ; ${pct(b4, n).toFixed(0)} % sont à plus de 100 km.`,
      lecture: b4 / n > 0.15
        ? "Une part notable de ce sous-ensemble est éloignée d'un bureau — un enjeu potentiel pour la supervision et les déplacements des équipes."
        : "La majorité de ce sous-ensemble reste à une distance raisonnable d'un bureau, favorable à la supervision.",
      retenir: "Ces communautés éloignées ne sont pas nécessairement à écarter — voir l'outil « Communautés éloignées » pour savoir ce qui compense leur distance dans le score.",
    };
  }

  if (mode === "prcc") {
    const recent = rows.filter((r) => num(r, "Année Fin PRCC") >= 2019).length;
    const partRecent = pct(recent, n);
    return {
      observation: `${partRecent.toFixed(0)} % des communautés affichées ont terminé leur PRCC en 2019 ou après.`,
      // Conditionné sur la vraie proportion observée : le mode "toujours cohérent" d'origine affirmait
      // "proportion élevée" même quand elle ne l'était pas sur le sous-ensemble filtré.
      lecture: partRecent >= 50
        ? `Une majorité de ce sous-ensemble (${partRecent.toFixed(0)} %) a un PRCC récent — cohérent avec le critère du projet qui privilégie les communautés dont les structures de gouvernance sont encore actives.`
        : `Seule une minorité de ce sous-ensemble (${partRecent.toFixed(0)} %) a un PRCC récent — la récence est donc hétérogène ici, malgré son poids de 35 % dans le score.`,
      retenir: "La récence du PRCC pèse 35 % du score actuel — c'est l'un des critères les plus déterminants de la sélection.",
    };
  }

  if (mode === "population") {
    const avecDonnee = rows.filter((r) => r.POPULATION !== null && r.POPULATION !== undefined).length;
    return {
      observation: `${pct(avecDonnee, n).toFixed(0)} % des communautés affichées ont une donnée de population disponible.`,
      lecture: avecDonnee / n < 0.7
        ? "Cette couverture incomplète est la raison pour laquelle la population n'est pas utilisée comme critère de score actuellement — l'inclure pénaliserait injustement les communautés sans donnée."
        : "La couverture est correcte sur ce sous-ensemble, mais la population reste à 0 % de pondération dans le score global pour rester cohérente sur l'ensemble de la base.",
      retenir: "Les zones grises sur la carte dans ce mode signalent une absence de donnée, pas une population nulle.",
    };
  }

  if (mode === "agri") {
    const fort = rows.filter((r) => Number(r["pct_cultures_5km"]) >= 30).length;
    const partFort = pct(fort, n);
    return {
      observation: `${partFort.toFixed(0)} % des communautés affichées ont plus de 30 % de terres cultivées dans un rayon de 5 km (donnée satellite).`,
      lecture: partFort >= 50
        ? `La majorité de ce sous-ensemble (${partFort.toFixed(0)} %) a un potentiel agricole élevé à proximité — un profil favorable pour les activités horticoles visées par le programme HERS, indépendamment du score de sélection.`
        : `Seule une minorité de ce sous-ensemble (${partFort.toFixed(0)} %) a un potentiel agricole élevé à proximité — ce profil territorial varie fortement d'une communauté à l'autre dans ce groupe.`,
      retenir: "Ce critère n'entre pas dans le score de sélection actuel — il sert à qualifier le profil territorial des communautés, notamment pour le choix de futurs sites de démonstration.",
    };
  }

  if (mode === "route") {
    const bonAcces = rows.filter((r) => Number(r["dist_route_km"]) <= 1).length;
    const partBonAcces = pct(bonAcces, n);
    return {
      observation: `${partBonAcces.toFixed(0)} % des communautés affichées sont à moins d'1 km d'une route praticable (carte communautaire en ligne).`,
      lecture: partBonAcces >= 50
        ? `La majorité de ce sous-ensemble (${partBonAcces.toFixed(0)} %) bénéficie d'un bon accès routier — un atout pour l'acheminement des intrants agricoles et l'accès aux marchés, pertinent pour le volet chaînes de valeur horticoles du programme.`
        : `Seule une minorité de ce sous-ensemble (${partBonAcces.toFixed(0)} %) est à moins d'1 km d'une route — l'accès routier est donc hétérogène dans ce groupe.`,
      retenir: "Comme pour le potentiel agricole, cette donnée est informative mais n'entre pas dans le score de sélection actuel.",
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
  const [correctionMode, setCorrectionMode] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, Correction>>(() => {
    try { return JSON.parse(localStorage.getItem(CORRECTIONS_KEY) || "{}"); } catch { return {}; }
  });
  useEffect(() => { fetch(`${DATA_BASE}roads_major.geojson`).then((r) => r.json()).then(setRoadsData).catch(() => {}); }, []);

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
                />
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
                      <Tooltip>{`${r.Communauté} (Tableau) — écart réel ${distKm.toFixed(1)} km`}</Tooltip>
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
    { l: "< 25 km", n: sel.filter((r) => num(r, "Distance bureau (km)") < 25).length },
    { l: "25 – 50 km", n: sel.filter((r) => { const d = num(r, "Distance bureau (km)"); return d >= 25 && d < 50; }).length },
    { l: "50 – 100 km", n: sel.filter((r) => { const d = num(r, "Distance bureau (km)"); return d >= 50 && d < 100; }).length },
    { l: "> 100 km", n: sel.filter((r) => num(r, "Distance bureau (km)") >= 100).length },
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
  if (under.length) under.forEach((x) => att.push({ c: "#d64550", t: `${x.l} sous-représentée : ${x.ss.toFixed(0)} % de la sélection contre ${x.bs.toFixed(0)} % de la base (écart de ${Math.abs(x.delta).toFixed(0)} %).` }));
  else att.push({ c: "#2f9e6f", t: "La langue n'est pas un critère de sélection — ce contrôle vérifie que les autres critères (distance, densité, récence) n'introduisent pas, par effet indirect, un déséquilibre linguistique involontaire. Résultat actuel : chaque langue garde une part quasi identique dans la sélection et dans la base (écart de 5 % ou moins pour toutes)." });
  const farShare = pct(far.length, sel.length);
  if (farShare >= 15) att.push({ c: "#e8a13a", t: `${far.length} communautés retenues (${farShare.toFixed(0)} %) sont à plus de ${farThresh} km d'un bureau.` });
  const gambiaSel = sel.filter((r) => r.Pays === "Gambie").length;
  att.push({ c: "#d64550", t: `Population indisponible pour la Gambie — ${gambiaSel} communautés retenues concernées.` });
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
  att.push({ c: "#2f9e6f", t: `Score moyen des retenues ${gS.score.toFixed(1)} contre ${gN.score.toFixed(1)} hors sélection — écart de ${(gS.score - gN.score).toFixed(1)} points.` });

  const segs: [Mode, string][] = [["statut", "Statut"], ["score", "Score"], ["langue", "Langue"], ["distance", "Distance bureau"], ["prcc", "Fin PRCC"], ["population", "Population"], ["agri", "Potentiel agricole"], ["route", "Accès route"]];

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
        <div className="stat"><span>Retenues &gt; 100 km</span><strong>{pct(sel.filter((r) => num(r, "Distance bureau (km)") > 100).length, sel.length).toFixed(0)} %</strong><small>éloignées d'un bureau</small></div>
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
                <Analyse title={<>Analyse — mode « {segs.find(([m]) => m === mode)?.[1]} »</>}>
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
                interpretation = `À cette distance, presque toutes les communautés sont retenues (${tauxLocal.toFixed(0)} %). C'est normal et attendu : plus une communauté est proche d'un bureau, plus elle marque de points sur ce critère, qui compte pour 45 % du score total. Ce taux élevé ne signale donc pas un problème — il montre simplement que le modèle fonctionne comme prévu.`;
              } else if (tauxLocal >= 50) {
                interpretation = `Un peu plus de la moitié des communautés de cette zone sont retenues (${tauxLocal.toFixed(0)} %). La proximité ne suffit donc pas seule ici — d'autres critères (concentration de voisines, récence du PRCC) font aussi la différence.`;
              } else {
                interpretation = `Seulement ${tauxLocal.toFixed(0)} % des communautés de cette zone sont retenues, malgré leur proximité du bureau. Cela signifie que d'autres critères du score (concentration de voisines, récence du PRCC) pèsent plus lourd que la distance pour ces communautés précises.`;
              }

              let pourquoi: string | null = null;
              if (horsSel.length > 0 && retenues.length > 0) {
                const gaps = compareGroups(retenues, horsSel);
                if (gaps.length > 0) {
                  const top = gaps[0];
                  const detail = formatDetail(top.key, top.detailA, top.detailB, "retenues", "non retenues");
                  pourquoi = `Ce qui distingue le plus les deux groupes ici : ${CRIT_LABELS[top.key]} — ${detail}.`;
                }
              }

              return (
                <Analyse title={<>Analyse du périmètre — {spBureau}, {radius} km</>}>
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
                pourquoi = `Ce qui explique le plus leur maintien dans la sélection : ${CRIT_LABELS[gapSignificatif.key]} — ${detail}.`;
              } else {
                pourquoi = "Aucun critère ne se détache clairement : l'écart avec le reste de la sélection reste faible sur la distance, la concentration de voisines et la récence du PRCC. Leur sélection résulte d'une combinaison de petits avantages plutôt que d'un seul facteur déterminant.";
              }

              return (
                <Analyse title={<>Analyse — communautés éloignées (&gt; {farThresh} km)</>}>
                  <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Porte sur les 803 communautés retenues, tous bureaux et pays confondus — indépendant du bureau choisi ci-dessus dans « Distance autour d'un bureau ».</p>
                  <p><b>Observation :</b> {far.length} communautés retenues ({partSel.toFixed(1)} % de la sélection) se situent à plus de {farThresh} km de leur bureau de coordination.</p>
                  <p><b>Ce que ça veut dire :</b> {partSel < 15
                    ? "cette proportion reste limitée — la grande majorité de la sélection se situe à une distance plus favorable pour la supervision."
                    : "cette proportion est notable — une part significative de la sélection sera plus coûteuse à superviser sur le plan logistique."}</p>
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
            <label className="toggle" style={{ display: "flex", gap: 7, marginTop: 6 }}><input type="checkbox" checked={showRoads} onChange={(e) => setShowRoads(e.target.checked)} /> Afficher les routes principales (OSM)</label>
            <label className="toggle" style={{ display: "flex", gap: 7, marginTop: 6 }}>
              <input type="checkbox" checked={showTableauCompare} onChange={(e) => setShowTableauCompare(e.target.checked)} />
              Comparer avec Tableau Public
            </label>
            {showTableauCompare && <p className="muted" style={{ fontSize: 12 }}>Tableau Public : une autre extraction de la même base de données, utilisée ici comme second regard sur les coordonnées. Points violets = position dans Tableau Public. Une ligne relie chaque communauté à sa position actuelle si l'écart dépasse 500 m.</p>}
            <label className="toggle" style={{ display: "flex", gap: 7, marginTop: 6 }}><input type="checkbox" checked={showLandcover} onChange={(e) => setShowLandcover(e.target.checked)} /> Occupation du sol classée (imagerie satellite)</label>
            <label className="toggle" style={{ display: "flex", gap: 7, marginTop: 6 }}><input type="checkbox" checked={correctionMode} onChange={(e) => setCorrectionMode(e.target.checked)} /> <Move size={13} /> Mode correction de position{Object.keys(corrections).length > 0 && <span style={{ marginLeft: 4, color: "#e11d48", fontWeight: 700 }}>{Object.keys(corrections).length}</span>}</label>
            {correctionMode && <p className="muted" style={{ marginTop: 4 }}>Glissez un point (rouge) vers sa vraie position — chaque correction est enregistrée automatiquement et transmise à l'équipe data.</p>}
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
            <p className="muted" style={{ marginTop: -4, marginBottom: 8, fontSize: 12 }}>Tous bureaux et pays confondus — ne dépend pas du bureau choisi ci-dessus.</p>
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
              <tr><td className="name">Communautés proches (25 km) — moyenne</td><td><b>{gS.dens.toFixed(1)}</b></td><td>{gN.dens.toFixed(1)}</td></tr>
              <tr><td className="name">Population moyenne <small>(Sénégal)</small></td><td><b>{gS.pop ? Math.round(gS.pop).toLocaleString("fr-FR") : "—"}</b> <small>n={gS.popN}</small></td><td>{gN.pop ? Math.round(gN.pop).toLocaleString("fr-FR") : "—"} <small>n={gN.popN}</small></td></tr>
              <tr><td className="name">Langues distinctes</td><td><b>{gS.langs}</b></td><td>{gN.langs}</td></tr>
            </tbody>
          </table>
        </div>
        {(() => {
          const gaps = compareGroups(sel, nonsel);
          const top = gaps[0];
          const ecartScore = gS.score - gN.score;

          let quiExplique: string;
          if (top) {
            const detail = formatDetail(top.key, top.detailA, top.detailB, "sélectionnées", "hors sélection");
            quiExplique = `Le critère qui différencie le plus les deux groupes est ${CRIT_LABELS[top.key]} — ${detail}.`;
          } else {
            quiExplique = "Aucun critère ne se détache nettement à lui seul — la différence entre les deux groupes vient d'une combinaison de plusieurs critères.";
          }

          const negligeables = gaps.filter((g) => g !== top && Math.abs(g.gap) < 3);
          const mentionNegligeable = negligeables.length > 0
            ? ` À l'inverse, ${negligeables.map((g) => CRIT_LABELS[g.key]).join(" et ")} ${negligeables.length > 1 ? "influencent" : "influence"} peu la composition finale de la sélection — l'écart entre les deux groupes y est faible.`
            : "";

          const popPct = pct(snPop, snTot);

          return (
            <div style={{ margin: "0 16px 16px" }}>
              <Analyse title="Analyse comparative">
                <p><b>Observation :</b> les communautés sélectionnées ont un score moyen de {gS.score.toFixed(1)}, contre {gN.score.toFixed(1)} pour les non sélectionnées — un écart de {ecartScore.toFixed(1)} points.</p>
                <p><b>Ce que ça veut dire :</b> {quiExplique}{mentionNegligeable}</p>
                <p><b>Implication :</b> le classement produit bien une sélection différenciée, cohérente avec les critères retenus (distance, concentration locale, récence du PRCC) — ce n'est pas un tirage proche du hasard.</p>
                <p className="sp-retenir">🎯 <b>À retenir :</b> la ligne « Population moyenne » de ce tableau ne concerne que le Sénégal et seulement les communautés où cette donnée existe ({popPct.toFixed(0)} % de la base sénégalaise) — elle ne doit pas être lue comme un indicateur de poids réel dans le score, puisque la population ne compte actuellement pour rien dans le calcul du score (réglage modifiable dans l'onglet Vue d'ensemble).</p>
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
                return { ...b, partSelection, partBase, ecart: partSelection - partBase };
              });
            if (!avecEcart.length) return null;
            const plusEcarte = avecEcart.reduce((max, x) => (Math.abs(x.ecart) > Math.abs(max.ecart) ? x : max), avecEcart[0]);

            const pBase = plusEcarte.partBase.toFixed(0), pSel = plusEcarte.partSelection.toFixed(0), ecartAbs = Math.abs(plusEcarte.ecart).toFixed(0);
            let lecture: string;
            if (Math.abs(plusEcarte.ecart) < 5) {
              lecture = `Sur 100 communautés éligibles au ${plusEcarte.pays}, ${pBase} viennent de la zone de ${plusEcarte.b} — et sur 100 communautés retenues, à peu près autant (${pSel}). Aucun bureau ne s'écarte nettement de sa part de départ.`;
            } else if (plusEcarte.ecart > 0) {
              lecture = `Sur 100 communautés éligibles au ${plusEcarte.pays}, ${pBase} viennent de la zone de ${plusEcarte.b}. Mais sur 100 communautés retenues au ${plusEcarte.pays}, ${pSel} en viennent — sa part augmente de ${ecartAbs} points entre le départ et l'arrivée. La zone de ${plusEcarte.b} obtient donc plus de places que ce que son nombre de communautés éligibles laisserait attendre.`;
            } else {
              lecture = `Sur 100 communautés éligibles au ${plusEcarte.pays}, ${pBase} viennent de la zone de ${plusEcarte.b}. Mais sur 100 communautés retenues au ${plusEcarte.pays}, seulement ${pSel} en viennent — sa part diminue de ${ecartAbs} points entre le départ et l'arrivée. La zone de ${plusEcarte.b} obtient donc moins de places que ce que son nombre de communautés éligibles laisserait attendre.`;
            }

            return (
              <div style={{ margin: "0 16px 16px" }}>
                <Analyse title="Analyse territoriale">
                  <p><b>Observation :</b> la zone de {plusEcarte.b} représente {pBase} % des communautés éligibles au {plusEcarte.pays}, et {pSel} % des communautés retenues au {plusEcarte.pays}.</p>
                  <p><b>Ce que ça veut dire :</b> {lecture}</p>
                  <p><b>Implication :</b> obtenir plus (ou moins) de places que son poids de départ n'est pas nécessairement un problème — cela peut refléter une réalité de terrain (communautés vraiment plus proches, plus récentes ou plus concentrées dans cette zone). Mais un écart important mérite d'être confirmé comme un choix assumé plutôt qu'un effet de bord du score.</p>
                  <p className="sp-retenir">🎯 <b>À retenir :</b> cette comparaison se fait toujours entre communautés d'un même pays (jamais Sénégal contre Gambie directement) — c'est la bonne façon de repérer un déséquilibre, contrairement à un simple taux de sélection local qui varie surtout avec la distance choisie sur la carte.</p>
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
                return { ...r, partSelection, partBase, ecart: partSelection - partBase };
              });
            if (!avecEcart.length) return null;
            const plusEcartee = avecEcart.reduce((max, x) => (Math.abs(x.ecart) > Math.abs(max.ecart) ? x : max), avecEcart[0]);

            const rBase = plusEcartee.partBase.toFixed(0), rSel = plusEcartee.partSelection.toFixed(0), rEcart = Math.abs(plusEcartee.ecart).toFixed(0);
            return (
              <div style={{ margin: "0 16px 16px" }}>
                <Analyse title="Analyse régionale">
                  <p><b>Observation :</b> la région {plusEcartee.rg} représente {rBase} % des communautés éligibles au {plusEcartee.pays}, et {rSel} % des communautés retenues au {plusEcartee.pays}.</p>
                  <p><b>Ce que ça veut dire :</b> {Math.abs(plusEcartee.ecart) < 5
                  ? `Sa part reste à peu près la même entre les communautés éligibles (${rBase} %) et celles retenues (${rSel} %) — pas de déséquilibre notable.`
                  : plusEcartee.ecart > 0
                    ? `Sur 100 communautés éligibles au ${plusEcartee.pays}, ${rBase} viennent de cette région ; sur 100 retenues, ${rSel} en viennent — ${rEcart} points de plus qu'attendu.`
                    : `Sur 100 communautés éligibles au ${plusEcartee.pays}, ${rBase} viennent de cette région ; sur 100 retenues, seulement ${rSel} en viennent — ${rEcart} points de moins qu'attendu.`}</p>
                  <p className="sp-retenir">🎯 <b>À retenir :</b> les régions avec moins de 10 communautés dans la base ne sont pas incluses dans cette comparaison — un écart sur un petit effectif n'est pas significatif. La comparaison se fait aussi au sein du même pays, jamais entre Sénégal et Gambie directement.</p>
                </Analyse>
              </div>
            );
          })()}
        </div>
      </div>

      {(() => {
        const tauxSelection = pct(sel.length, all.length);
        const distMoy = gS.dist;
        const partEloignee = pct(sel.filter((r) => num(r, "Distance bureau (km)") > 100).length, sel.length);

        let lecture: string;
        if (partEloignee < 10) {
          lecture = `La sélection représente ${tauxSelection.toFixed(0)} % de la base analysée, avec une distance moyenne de ${distMoy.toFixed(0)} km au bureau. Seule une petite minorité (${partEloignee.toFixed(0)} %) se trouve à plus de 100 km — le profil global reste favorable à la supervision.`;
        } else if (partEloignee < 25) {
          lecture = `La sélection représente ${tauxSelection.toFixed(0)} % de la base analysée, avec une distance moyenne de ${distMoy.toFixed(0)} km au bureau. Une minorité notable (${partEloignee.toFixed(0)} %) se trouve à plus de 100 km et mérite une attention particulière lors de la planification de la supervision.`;
        } else {
          lecture = `La sélection représente ${tauxSelection.toFixed(0)} % de la base analysée, avec une distance moyenne de ${distMoy.toFixed(0)} km au bureau. Une part importante (${partEloignee.toFixed(0)} %) se trouve à plus de 100 km — la logistique de supervision devra être pensée en conséquence dès la planification.`;
        }

        return (
          <Analyse title="Lecture générale">
            <p>{lecture}</p>
            <p className="sp-retenir">🎯 <b>Implication :</b> le profil de la sélection combine priorisation spatiale et faisabilité opérationnelle. Les arbitrages éventuels doivent porter en priorité sur les communautés éloignées (voir « Communautés éloignées ») et les zones de forte concentration (voir « Par bureau / région »).</p>
          </Analyse>
        );
      })()}

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
                  <p>{nCritiques} point(s) critique(s), {nAttention} à surveiller, {nOk} sans problème identifié — détail ci-dessous.</p>
                </div>
              </div>
            );
          })()}
          {att.map((a, i) => <div className="att" key={i}><i style={{ background: a.c }} /><span>{a.t}</span></div>)}
        </div>

        <div className="chart-card">
          <div className="card-title"><Building2 size={16} /> Qualité des données</div>
          {[
            { l: "Population — Sénégal", n: snPop, d: snTot, c: "#2f9e6f" },
            { l: "Population — Gambie", n: gmPop, d: gmTot, c: gmPop ? "#2f9e6f" : "#d64550" },
            { l: "Coordonnées présentes", n: all.length, d: all.length, c: "#2f9e6f" },
            { l: "Position jugée fiable", n: all.filter((r) => r["Méthode localisation"]?.startsWith("Localité vérifiée") || r["Méthode localisation"]?.startsWith("Position restaurée")).length, d: all.length, c: "#2f9e6f" },
            { l: "Dont position au niveau du village précis (sous-ensemble le plus strict)", n: all.filter((r) => r["Méthode localisation"]?.startsWith("Localité vérifiée")).length, d: all.length, c: "#2f9e6f" },
            { l: "PRCC terminé ≥ 2009 (critère officiel)", n: all.filter((r) => Number(r["Année Fin PRCC"]) >= 2009).length, d: all.length, c: "#2f9e6f" },
            { l: "Code communauté", n: codeKnown, d: all.length, c: "#e8a13a" },
          ].map((q) => (
            <div className="q-row" key={q.l}>
              <span>{withPrcc(q.l)}</span>
              <div className="track"><i style={{ width: `${pct(q.n, q.d)}%`, background: q.c }} /></div>
              <b>{q.n}/{q.d}</b>
            </div>
          ))}
          <p className="footnote" style={{ padding: "6px 0 0" }}>Pour {centroid} communautés, la position a été estimée à partir de villages voisins déjà vérifiés — légèrement moins précise qu'une vérification individuelle.</p>
        </div>
      </div>
    </section>
  );
}
