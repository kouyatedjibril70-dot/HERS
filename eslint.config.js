import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Config volontairement légère : on vérifie ce qui attrape de vrais bugs (hooks React mal utilisés,
// variables inutilisées) sans imposer un style différent de celui déjà en place dans tout le projet.
// no-explicit-any est désactivé : Community = Record<string, any> est un choix assumé (données CSV
// dynamiques), pas une négligence — l'activer noierait les vrais signaux sous des centaines de faux positifs.
export default tseslint.config(
  { ignores: ["dist"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
