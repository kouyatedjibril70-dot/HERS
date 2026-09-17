import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Le site est servi depuis la racine de son propre domaine partout : hers.meridiangeo.net (GitHub
// Pages, domaine personnalisé) et hers.kouyatedjibril70.workers.dev (Cloudflare). L'ancien chemin
// /HERS/ (nécessaire uniquement pour l'URL par défaut kouyatedjibril70-dot.github.io/HERS/, plus
// utilisée comme lien principal) n'est donc plus nécessaire.
export default defineConfig(() => ({
  base: "/",
  plugins: [react()],
}));
