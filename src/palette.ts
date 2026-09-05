// Couleur signature par entité (light mode institutionnel HERS).
export const ZONE_COLORS = {
  base: "#94a3b8",       // slate-400
  Sénégal: "#16a34a",    // vert
  Gambie: "#1e40af",     // bleu institutionnel
  selection: "#1e40af",  // bleu institutionnel (communautés retenues)
} as const;

// Couleurs de langue partagées entre le tableau de bord et l'analyse spatiale.
export const LANG_COLORS: Record<string, string> = {
  Pulaar: "#3b82f6",
  Mandingue: "#8b5cf6",
  Wolof: "#f59e0b",
  Diola: "#fb7185",
  Sérahulé: "#14b8a6",
  Oniyan: "#fb923c",
  Soninké: "#64748b",
};
