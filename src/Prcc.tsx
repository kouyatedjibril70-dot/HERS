// Glossaire partagé pour le sigle PRCC — un seul endroit à mettre à jour si la définition change.
// Fichier séparé (plutôt que placé dans App.tsx) pour éviter une dépendance circulaire avec Spatial.tsx,
// qui a aussi besoin d'expliquer PRCC et importe déjà des types depuis App.tsx.
const PRCC_TITLE = "Le programme communautaire mené par Tostan dans ces villages avant HERS";

export function Prcc() {
  return (
    <abbr title={PRCC_TITLE} style={{ textDecoration: "underline dotted", cursor: "help" }}>
      PRCC
    </abbr>
  );
}

// Pour un libellé dynamique qui peut contenir "PRCC" en toutes lettres (ex. "Récence PRCC",
// "Durée PRCC") : remplace l'occurrence par le composant <Prcc/> sans toucher au reste du texte.
// Si "PRCC" n'apparaît pas dans la chaîne, la renvoie inchangée.
export function withPrcc(label: string): React.ReactNode {
  const i = label.indexOf("PRCC");
  if (i === -1) return label;
  return (
    <>
      {label.slice(0, i)}
      <Prcc />
      {label.slice(i + 4)}
    </>
  );
}

export const PRCC_TOOLTIP = PRCC_TITLE;
