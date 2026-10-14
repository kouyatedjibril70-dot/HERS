import { describe, it, expect } from "vitest";
import { rankOf, scoreAll, DEFAULT_WEIGHTS } from "./scoring";

describe("rankOf", () => {
  const sorted = [10, 20, 30, 40, 50];

  it("renvoie 0 pour un tableau vide", () => {
    expect(rankOf([], 10)).toBe(0);
  });

  it("donne ~100 à la plus petite valeur quand higher=true (plus petit = meilleur rang 0, donc score bas)", () => {
    // higher=true : la position dans le tri ascendant détermine directement le score (0 = pire, 100 = meilleur).
    expect(rankOf(sorted, 10, true)).toBe(0);
    expect(rankOf(sorted, 50, true)).toBe(100);
  });

  it("inverse l'échelle quand higher=false (plus petit = meilleur score)", () => {
    expect(rankOf(sorted, 10, false)).toBe(100);
    expect(rankOf(sorted, 50, false)).toBe(0);
  });

  it("est monotone : une valeur plus grande ne donne jamais un score plus petit (higher=true)", () => {
    const scores = sorted.map((v) => rankOf(sorted, v, true));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
  });
});

describe("scoreAll", () => {
  function row(over: Record<string, any>) {
    return {
      Communauté: "x", Pays: "Sénégal",
      "Distance bureau (km)": 10, "Autres communautés dans 25 km": 5,
      "Année Fin PRCC": 2020, "dist_non_prcc_osm_km": 2, POPULATION: null,
      ...over,
    };
  }

  it("un critère à poids 0 n'influence pas le score", () => {
    const rows = [row({ Communauté: "a", "Distance bureau (km)": 5 }), row({ Communauté: "b", "Distance bureau (km)": 500 })];
    const withPop = scoreAll(rows, { ...DEFAULT_WEIGHTS, pop: 50, dist: 0 });
    // pop est null pour toutes les lignes -> critère indisponible pour tout le monde -> scores égaux.
    expect(withPop[0].score).toBeCloseTo(withPop[1].score, 6);
  });

  it("une donnée manquante ne pénalise pas : le critère est retiré de la moyenne de cette ligne", () => {
    const rows = [row({ Communauté: "a", POPULATION: 1000 }), row({ Communauté: "b", POPULATION: null })];
    const scored = scoreAll(rows, { ...DEFAULT_WEIGHTS, pop: 50 });
    const b = scored.find((r) => r.Communauté === "b")!;
    expect(b.coverage).toBeLessThan(100);
    expect(b.scores.pop).toBeNull();
  });

  it("classe par pays séparément et attribue un rang à partir de 1 dans chaque pays", () => {
    const rows = [
      row({ Communauté: "sn1", Pays: "Sénégal", "Distance bureau (km)": 1 }),
      row({ Communauté: "sn2", Pays: "Sénégal", "Distance bureau (km)": 100 }),
      row({ Communauté: "gm1", Pays: "Gambie", "Distance bureau (km)": 1 }),
    ];
    const scored = scoreAll(rows, DEFAULT_WEIGHTS);
    const ranksByCountry = (p: string) => scored.filter((r) => r.Pays === p).map((r) => r.rank).sort();
    expect(ranksByCountry("Sénégal")).toEqual([1, 2]);
    expect(ranksByCountry("Gambie")).toEqual([1]);
  });

  it("une distance au bureau plus faible donne un meilleur (plus haut) score, poids égaux ailleurs", () => {
    const rows = [row({ Communauté: "proche", "Distance bureau (km)": 1 }), row({ Communauté: "loin", "Distance bureau (km)": 200 })];
    const scored = scoreAll(rows, { pop: 0, dist: 100, recent: 0, isol: 0 });
    const proche = scored.find((r) => r.Communauté === "proche")!;
    const loin = scored.find((r) => r.Communauté === "loin")!;
    expect(proche.score).toBeGreaterThan(loin.score);
  });
});
