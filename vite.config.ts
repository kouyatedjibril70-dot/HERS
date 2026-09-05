import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En production (npm run build → GitHub Pages), le site vit dans le sous-dossier /HERS/ :
// https://kouyatedjibril70-dot.github.io/HERS/
// En dev local (npm run dev), on reste à la racine "/" pour la commodité.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/HERS/" : "/",
  plugins: [react()],
}));
