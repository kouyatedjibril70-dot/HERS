import { Prcc } from "./Prcc";

// Page « Méthode » : document de référence expliquant le choix des critères de sélection.
// Contenu statique — aucune logique de données, aucun calcul.
export default function Method({ onGoDashboard }: { onGoDashboard: () => void }) {
  return (
    <section className="method">
      <div className="method-doc">
        <p className="method-eyebrow">Document de référence</p>
        <h1>Méthode de sélection des communautés</h1>
        <p className="method-lead">
          Comment, à partir des données disponibles, la plateforme désigne les communautés à consulter en
          priorité — un objectif de 642 au Sénégal et 161 en Gambie, soit 803 au total.
        </p>

        <h2>1. En bref</h2>
        <p>
          Chaque communauté reçoit une <b>note sur 100</b>, calculée à partir de trois critères. Les communautés
          sont ensuite classées par note, <b>séparément pour le Sénégal et pour la Gambie</b>, et on retient les
          mieux classées de chaque pays jusqu'à atteindre l'objectif fixé par le programme.
        </p>

        <h2>2. Les critères et leur poids</h2>
        <div className="method-table">
          <table>
            <thead><tr><th>Critère</th><th>Poids</th><th>Ce qui est « bon »</th></tr></thead>
            <tbody>
              <tr><td>Distance au bureau de coordination</td><td><b>45 %</b></td><td>Plus la communauté est proche de son bureau, mieux c'est — la supervision est plus simple et moins coûteuse.</td></tr>
              <tr><td>Récence de la fin du <Prcc /></td><td><b>35 %</b></td><td>Plus le <Prcc /> s'est terminé récemment, mieux c'est — les structures de gouvernance villageoises sont encore actives.</td></tr>
              <tr><td>Concentration de communautés voisines</td><td><b>20 %</b></td><td>Plus il y a d'autres communautés dans un rayon de 25 km, mieux c'est — on peut regrouper les consultations.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Un quatrième critère, la <b>Population</b>, existe dans le modèle mais est <b>volontairement à 0 %</b> aujourd'hui :</p>
        <div className="callout">
          <b>Population</b>
          <span>La donnée manque pour toute la Gambie et environ 40 % du Sénégal. L'inclure pénaliserait injustement les communautés sans chiffre.</span>
        </div>
        <p>
          La durée du <Prcc /> n'est <b>pas</b> un critère : tous les <Prcc /> durent 3 ans. Les quelques valeurs
          de 1 ou 2 ans qui apparaissent dans la base sont des erreurs de saisie, pas de vraies différences.
        </p>

        <h2>3. De la valeur brute à la note</h2>
        <ol>
          <li>
            Pour chaque critère, on ne regarde pas la valeur brute mais la <b>position relative</b> de la communauté
            par rapport à toutes les autres de son pays : est-elle parmi les 10 % les plus proches d'un bureau ? les
            50 % ? les 90 % ? Cela donne un nombre de 0 à 100 par critère.
          </li>
          <li>La note finale est la <b>moyenne de ces positions, pondérée</b> par les poids ci-dessus (45 / 35 / 20).</li>
          <li>
            Si une donnée manque pour une communauté, le critère concerné est simplement <b>retiré de sa moyenne</b> —
            la communauté n'est pas pénalisée. La fiche de détail affiche « Couverture des critères : X % » pour
            indiquer quelle part du calcul a réellement pu être faite.
          </li>
        </ol>

        <h2>4. De la note à la sélection</h2>
        <ul>
          <li>On trie les communautés par note, <b>le Sénégal d'un côté, la Gambie de l'autre</b> — jamais mélangés, car les deux pays ont des données et des objectifs différents.</li>
          <li>On retient les <b>642 premières du Sénégal</b> et les <b>161 premières de la Gambie</b>.</li>
          <li>Ces deux nombres sont des <b>objectifs fixés par le programme</b>, pas un résultat du calcul.</li>
          <li>Conséquence : changer les poids modifie <b>quelles</b> communautés entrent dans le classement de tête, jamais <b>combien</b>. Le total reste 803.</li>
          <li>Les poids sont <b>réglables en direct</b> dans l'onglet « Vue d'ensemble » : on peut tester d'autres scénarios et voir la sélection se recalculer.</li>
        </ul>

        <h2>5. Indicateurs de contexte (hors score)</h2>
        <p>
          Affichés sur la carte de l'onglet « Analyse spatiale » et dans la fiche de chaque communauté, mais
          <b> n'entrant pas dans le calcul du score</b> :
        </p>
        <h3>Potentiel agricole</h3>
        <p>
          Autour de chaque communauté, on trace un cercle de <b>5 km de rayon</b>. On le superpose à une carte
          d'occupation du sol par satellite (ESA WorldCover 2021, où chaque parcelle de ~10 m est classée : culture,
          forêt, bâti, eau…). La valeur affichée est la <b>proportion de ce cercle classée en « cultures »</b>.
          Plus le chiffre est élevé, plus il y a d'activité agricole autour du village.
        </p>
        <h3>Accès route, accès marché, proximité eau</h3>
        <p>
          À partir d'OpenStreetMap (cartographie communautaire ouverte), on mesure pour chaque communauté la
          <b> distance à vol d'oiseau jusqu'à la route, au marché et au point d'eau les plus proches</b>. Chaque
          distance est convertie en note sur 100 : 0 km = 100, et au-delà d'un seuil = 0 (5 km pour la route,
          25 km pour le marché, 30 km pour l'eau).
        </p>
        <p>
          Tous ces indicateurs sont des <b>mesures réelles</b> — aucune valeur inventée ou provisoire.
        </p>

        <h2>6. Ce qu'il faut garder en tête</h2>
        <ul>
          <li>La population n'est pas disponible pour la Gambie (100 %) et manque pour environ 40 % du Sénégal — d'où son poids à 0 %.</li>
          <li>Environ 8 communautés restent positionnées par estimation (moyenne de villages voisins vérifiés) ; pour celles-là, les indicateurs qui dépendent de la position sont approximatifs.</li>
          <li>« Accès route » est une distance à vol d'oiseau, pas un temps de trajet réel (état de la piste, saison des pluies, cours d'eau à franchir ne sont pas pris en compte).</li>
          <li>La note est un <b>outil de classement relatif</b>, pas une note de qualité absolue : deux communautés de pays différents avec la même note peuvent avoir un statut différent, puisque le classement est fait pays par pays.</li>
          <li>Le critère « Distance au bureau » pesant 45 %, il est normal qu'une zone proche d'un bureau ait un fort taux de sélection — ce n'est pas un déséquilibre, c'est le modèle qui fonctionne comme prévu.</li>
        </ul>

        <p className="method-foot">
          Cette page décrit la mécanique du choix. Les chiffres exacts (nombre de communautés, objectifs, poids)
          peuvent évoluer et se règlent dans l'onglet <button className="linkbtn" onClick={onGoDashboard}>Vue d'ensemble</button>.
        </p>
      </div>
    </section>
  );
}
