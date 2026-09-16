import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages sert le site depuis le sous-dossier /HERS/ (https://…github.io/HERS/), alors que
// Cloudflare Pages le sert depuis la racine de son propre domaine (…pages.dev/). CF_PAGES est une
// variable d'environnement posée automatiquement par Cloudflare pendant son build : elle permet de
// distinguer les deux sans rien casser côté GitHub Pages. En dev local, on reste à la racine "/".
export default defineConfig(({ command }) => ({
  base: command === "build" && !process.env.CF_PAGES ? "/HERS/" : "/",
  plugins: [react()],
}));
