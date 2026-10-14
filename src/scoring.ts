import type { Community } from "./App";

// POPULATION est un champ partiellement manquant (valeur `null`) — Number(null)===0 est un nombre "fini",
// donc un simple Number.isFinite(Number(...)) traiterait à tort "population inconnue" comme "population = 0".
export const hasPop = (r: any) =>
  r.POPULATION !== null && r.POPULATION !== undefined && r.POPULATION !== "" && Number.isFinite(Number(r.POPULATION));

export const DEFAULT_WEIGHTS = { pop: 0, dist: 45, dens: 20, recent: 35, isol: 0 };
export type Weights = typeof DEFAULT_WEIGHTS;

// Rang percentile d'une valeur DANS UN TABLEAU DÉJÀ TRIÉ (recherche binaire).
// scoreAll appelle ceci une fois par ligne et par critère (≈5 × 1372 fois) : trier le tableau
// à chaque appel (ancienne version) coûtait O(n² log n) et faisait "caler" l'appli à chaque
// glissement de curseur de pondération. Trier une fois par critère, puis chercher, est en O(n log n).
export function rankOf(sorted: number[], value: number, higher = true): number {
  if (!sorted.length) return 0;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] >= value) hi = mid; else lo = mid + 1; }
  const p = lo / (sorted.length - 1 || 1);
  return (higher ? p : 1 - p) * 100;
}

export function scoreAll(rows: Record<string, any>[], w: Weights): Community[] {
  return (["Sénégal", "Gambie"] as const).flatMap((country) => {
    const base = rows.filter((r) => r.Pays === country);
    const nums = (k: string) => base.map((r) => Number(r[k])).filter(Number.isFinite).sort((a, b) => a - b);
    const pop = base.filter(hasPop).map((r) => Number(r.POPULATION)).sort((a, b) => a - b);
    const dist = nums("Distance bureau (km)"), dens = nums("Autres communautés dans 25 km"),
      fin = nums("Année Fin PRCC"), isol = nums("dist_non_prcc_osm_km");
    return base.map((r) => {
      const items = [
        ["pop", hasPop(r) ? rankOf(pop, Number(r.POPULATION), true) : undefined, w.pop],
        ["dist", Number.isFinite(Number(r["Distance bureau (km)"])) ? rankOf(dist, Number(r["Distance bureau (km)"]), false) : undefined, w.dist],
        ["dens", Number.isFinite(Number(r["Autres communautés dans 25 km"])) ? rankOf(dens, Number(r["Autres communautés dans 25 km"]), true) : undefined, w.dens],
        ["recent", Number.isFinite(Number(r["Année Fin PRCC"])) ? rankOf(fin, Number(r["Année Fin PRCC"]), true) : undefined, w.recent],
        ["isol", Number.isFinite(Number(r["dist_non_prcc_osm_km"])) ? rankOf(isol, Number(r["dist_non_prcc_osm_km"]), false) : undefined, w.isol],
      ] as [string, number | undefined, number][];
      const avail = items.filter((x) => x[1] !== undefined), den = avail.reduce((s, x) => s + x[2], 0),
        totalW = items.reduce((s, x) => s + x[2], 0),
        score = den ? avail.reduce((s, x) => s + (x[1]! / 100 * x[2]), 0) / den * 100 : 0;
      return {
        ...r, score, coverage: totalW ? Math.round(den / totalW * 100) : 0,
        scores: Object.fromEntries(items.map((x) => [x[0], x[1] === undefined ? null : x[1] / 100 * x[2]])),
      };
    }).sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }) as Community);
  }) as Community[];
}
