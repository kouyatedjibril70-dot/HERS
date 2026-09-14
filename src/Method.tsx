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
          priorité, avec un objectif de 642 au Sénégal et 161 en Gambie, soit 803 au total.
        </p>

        <h2>1. En bref</h2>
        <p>
          Chaque communauté reçoit une <b>note sur 100</b>, calculée à partir de trois critères. Les communautés
          sont ensuite classées par note, <b>séparément pour le Sénégal et pour la Gambie</b>, et on retient les
          mieux classées de chaque pays jusqu'à atteindre l'objectif fixé par le programme.
        </p>

        <h2>2. Les critères, en détail</h2>
        <div className="method-table">
          <table>
            <thead><tr><th>Critère</th><th>Poids</th><th>Ce qui est « bon »</th></tr></thead>
            <tbody>
              <tr><td>Distance au bureau de coordination</td><td><b>45 %</b></td><td>Plus la communauté est proche de son bureau, mieux c'est : la supervision est plus simple et moins coûteuse.</td></tr>
              <tr><td>Récence de la fin du <Prcc /></td><td><b>35 %</b></td><td>Plus le <Prcc /> s'est terminé récemment, mieux c'est : les structures de gouvernance villageoises sont encore actives.</td></tr>
              <tr><td>Concentration de communautés voisines</td><td><b>20 %</b></td><td>Plus il y a d'autres communautés dans un rayon de 25 km, mieux c'est : on peut regrouper les consultations.</td></tr>
              <tr><td>Population</td><td><b>0 %</b></td><td>Prévu dans le modèle mais désactivé aujourd'hui : donnée trop incomplète pour être équitable (détail plus bas).</td></tr>
            </tbody>
          </table>
        </div>
        <p className="method-note">Poids par défaut, réglables en direct dans l'onglet <b>Vue d'ensemble</b>, sans toucher au nombre de communautés retenues.</p>

        <p>
          Ce qui suit détaille, critère par critère : pourquoi il a été choisi, pourquoi il pèse ce qu'il pèse, comment
          la valeur brute devient une note sur 100, et surtout <b>d'où vient cette valeur brute</b> et à quel point on
          peut lui faire confiance. Chaque section distingue explicitement ce qui est <b>certain</b> (le calcul, qui
          est du code, vérifiable ligne par ligne) de ce qui a dû être <b>vérifié</b> (la donnée de départ, qui vient
          de sources externes ou d'une base historique).
        </p>
        <p>
          Pour suivre les exemples, on utilise dans les trois premières sections la même communauté réelle : <b>saré
          Madiw</b> (bureau de Kolda). Sa fiche complète est consultable depuis l'onglet « Communautés ».
        </p>

        <h3>Critère 1 : Distance au bureau de coordination (45 points sur 100)</h3>
        <p>
          <b>Pourquoi ce critère ?</b> Le bureau de coordination assure le suivi de terrain : visites de supervision,
          appui aux équipes locales, résolution des problèmes. Une communauté proche de son bureau coûte moins cher à
          suivre dans la durée et permet un accompagnement plus fréquent qu'une communauté à plusieurs heures de piste.
        </p>
        <p>
          <b>Pourquoi 45 points, soit 45 % du score total ?</b> C'est le critère qui pèse le plus lourd, car il
          conditionne directement la capacité du programme à suivre la communauté sur toute sa durée, quel que soit
          par ailleurs son potentiel. Une communauté très reculée reste éligible, ce critère ne l'exclut jamais, mais
          elle est structurellement désavantagée dans le classement, parce que le coût de suivi est réel et récurrent.
        </p>
        <p>
          <b>Comment le chiffre brut devient une note (certain, c'est du calcul).</b> On ne compare pas les distances
          en absolu, mais la <b>position</b> de chaque communauté par rapport à toutes les autres de son pays : si
          elle fait partie des plus proches d'un bureau, elle est proche de 100 points ; si elle est parmi les plus
          éloignées, proche de 0. Ce que ça donne concrètement au Sénégal (1139 communautés) :
        </p>
        <div className="method-table">
          <table>
            <thead><tr><th>Position dans le classement</th><th>Distance bureau correspondante</th><th>Exemple réel</th></tr></thead>
            <tbody>
              <tr><td>Les 10 % les plus proches</td><td>1,2 à 40 km</td><td><b>saré Madiw</b> : 7,2 km <b>soit 99,3 pts</b></td></tr>
              <tr><td>La médiane (milieu du classement)</td><td>environ 107 km</td><td>&nbsp;</td></tr>
              <tr><td>Les 10 % les plus éloignées</td><td>plus de 201 km</td><td>&nbsp;</td></tr>
              <tr><td>La plus éloignée de toutes</td><td>424 km</td><td>&nbsp;</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          <b>D'où vient le chiffre brut « Distance bureau (km) » (vérifié, pas supposé).</b> Ce chiffre est calculé par
          la plateforme elle-même : distance à vol d'oiseau entre les coordonnées GPS de la communauté et celles du
          bureau auquel elle est rattachée. Recalculé indépendamment et comparé au chiffre enregistré pour les 1372
          communautés de la base : <b>correspondance à 100 %, aucun écart.</b>
        </p>

        <h3>Critère 2 : Récence de la fin du <Prcc /> (35 points sur 100)</h3>
        <p>
          <b>Pourquoi ce critère ?</b> Le <Prcc /> est le programme par lequel une communauté est historiquement
          entrée en relation avec le programme. Plus sa fin est récente, plus les comités et relais formés pendant le
          <Prcc /> ont de chances d'être encore actifs, ce qui facilite le démarrage rapide d'un nouveau projet.
        </p>
        <p>
          <b>Pourquoi 35 points, soit 35 % du score total ?</b> C'est le deuxième critère en importance après la
          distance : il reflète la fraîcheur du lien avec le programme, qui conditionne l'effort de re-mobilisation
          nécessaire avant de pouvoir démarrer les activités.
        </p>
        <p>
          <b>Comment le chiffre brut devient une note (certain).</b> Même principe que pour la distance : on compare
          l'année de fin de <Prcc /> de chaque communauté à celle de toutes les autres de son pays.
        </p>
        <div className="method-table">
          <table>
            <thead><tr><th>Position dans le classement</th><th>Année de fin correspondante</th><th>Exemple réel</th></tr></thead>
            <tbody>
              <tr><td>Les 10 % les plus récentes</td><td>2023 ou plus tard</td><td><b>saré Madiw</b> : fin 2023 <b>soit 85,6 pts</b></td></tr>
              <tr><td>La médiane (milieu du classement)</td><td>2012</td><td>&nbsp;</td></tr>
              <tr><td>Les 10 % les plus anciennes</td><td>2010</td><td>&nbsp;</td></tr>
              <tr><td>La plus récente de toutes</td><td>2028 (<Prcc /> en cours, fin prévue)</td><td>&nbsp;</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          <b>D'où vient le chiffre brut (limite honnête à connaître).</b> Contrairement à la distance et à la
          densité, cette donnée est fournie telle quelle dans la base d'origine du programme : elle n'est pas
          calculée par la plateforme, donc elle ne peut pas être recalculée ni vérifiée de façon indépendante. Le
          score utilise uniquement <b>l'année de fin</b> de chaque <Prcc />, qui dure toujours 3 ans par construction
          du programme.
        </p>

        <h3>Critère 3 : Concentration de communautés voisines, rayon 25 km (20 points sur 100)</h3>
        <p>
          <b>Pourquoi ce critère ?</b> Une communauté qui a beaucoup d'autres communautés du programme autour d'elle
          permet de regrouper les déplacements et les visites de suivi : une même tournée de terrain peut couvrir
          plusieurs communautés, ce qui réduit le coût de suivi par communauté.
        </p>
        <p>
          <b>Pourquoi 20 points, soit 20 % du score total ?</b> C'est un critère complémentaire à la distance au
          bureau (accès individuel) et à la récence du <Prcc /> (état du lien avec le programme) : il ajoute une
          dimension d'efficacité de tournée sans dominer le classement.
        </p>
        <p>
          <b>Comment le chiffre brut devient une note (certain).</b> Même principe : la communauté avec le plus de
          voisines dans un rayon de 25 km est proche de 100 points, la plus isolée proche de 0.
        </p>
        <div className="method-table">
          <table>
            <thead><tr><th>Position dans le classement</th><th>Nombre de voisines correspondant</th><th>Exemple réel</th></tr></thead>
            <tbody>
              <tr><td>Les 10 % les plus denses</td><td>60 voisines ou plus</td><td>&nbsp;</td></tr>
              <tr><td>La médiane (milieu du classement)</td><td>26 voisines</td><td><b>saré Madiw</b> : 47 voisines <b>soit 78,9 pts</b></td></tr>
              <tr><td>Les 10 % les plus isolées</td><td>9 voisines ou moins</td><td>&nbsp;</td></tr>
              <tr><td>La plus isolée de toutes</td><td>0 voisine</td><td>&nbsp;</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          <b>D'où vient le chiffre brut « Autres communautés dans 25 km » (vérifié, pas supposé).</b> Ce chiffre était
          déjà présent dans les données avant ce projet, sans script permettant de savoir comment il avait été
          calculé à l'origine. Il a donc été recalculé indépendamment : distance à vol d'oiseau entre chaque paire de
          communautés, à partir des coordonnées actuelles, comptée si elle est de 25 km ou moins. Comparé au chiffre
          enregistré pour les 1372 communautés : <b>correspondance à 100 %, aucun écart.</b> Ça n'a pas toujours été
          le cas : un premier contrôle avait révélé un écart sur 23 % des communautés, concentré sur celles dont la
          position GPS avait été corrigée depuis. Ce champ est désormais recalculé automatiquement à chaque
          correction de position, pour rester exact en continu.
        </p>

        <h3>Critère 4 : Population (0 point sur 100 actuellement, critère prévu mais non activé)</h3>
        <p>
          <b>Pourquoi ce critère existe dans le modèle ?</b> Une communauté plus peuplée offre, en théorie, un bassin
          plus large de bénéficiaires potentiels pour les activités horticoles du programme. C'est un critère
          pertinent en principe, prévu dès la conception de l'outil.
        </p>
        <p>
          <b>Pourquoi 0 point aujourd'hui ?</b> La donnée manque pour une part importante de la base : <b>38 %</b> des
          communautés sénégalaises et <b>37 %</b> des communautés gambiennes n'ont aucun chiffre de population.
          Activer ce critère pénaliserait mécaniquement les communautés sans donnée, sans que ce soit un jugement sur
          leur taille réelle. Le poids reste à 0 % par défaut, mais il est réglable dans l'onglet « Vue d'ensemble » si
          le programme décide un jour de l'activer malgré cette couverture incomplète.
        </p>
        <p>
          <b>Comment le chiffre brut deviendrait une note si le critère était activé (certain, c'est le même
          mécanisme).</b> Même principe de position relative que les trois critères précédents. Sur les 706
          communautés sénégalaises où la population est connue :
        </p>
        <div className="method-table">
          <table>
            <thead><tr><th>Position dans le classement</th><th>Population correspondante</th><th>Exemple réel</th></tr></thead>
            <tbody>
              <tr><td>Les 10 % les plus peuplées</td><td>1 863 habitants ou plus</td><td><b>LOUBAL BALADJI</b> (Oréfondé) : 3 516 hab. <b>soit 95,6 pts</b></td></tr>
              <tr><td>La médiane (milieu du classement)</td><td>450 habitants</td><td>&nbsp;</td></tr>
              <tr><td>Les 10 % les moins peuplées</td><td>134 habitants ou moins</td><td>&nbsp;</td></tr>
              <tr><td>La moins peuplée connue</td><td>7 habitants</td><td>&nbsp;</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          À titre de comparaison, <b>saré Madiw</b> (l'exemple suivi dans les trois critères précédents) n'a pas de
          donnée de population : si ce critère était activé, il serait simplement retiré de sa moyenne, sans
          pénalité, conformément à la règle de couverture partielle expliquée en section 3.
        </p>
        <p>
          <b>D'où vient le chiffre brut (vérifié, avec plusieurs niveaux de confiance selon la source).</b>
        </p>
        <ul>
          <li>
            <b>Sénégal (706 communautés sur 1139, soit 62 %) :</b> recensement RGPH 2023 (ANSD), apparié au nom exact
            du village. Exemple : <i>LOUBAL BALADJI</i>, commune d'Oréfondé, 3 516 habitants, une valeur directement
            recensée, pas une estimation.
          </li>
          <li>
            <b>Gambie (146 communautés sur 233, soit 63 %) :</b> recensement GBoS 2013 (le dernier recensement
            disponible village par village), apparié au nom et à la région administrative, puis ajusté à la
            croissance démographique 2013-2024 de sa région. Exemple : <i>Baniko Ismaila</i>, Upper River Region,
            recensée à environ 295 habitants en 2013, ajustée à la croissance de sa région (facteur 1,103 sur la
            période), estimation 2024 : <b>325 habitants</b>, indiqué « est. 2024 » dans sa fiche.
          </li>
          <li>
            <b>Communautés restantes (433 au Sénégal, 87 en Gambie) :</b> aucune valeur fiable trouvée. Deux méthodes
            alternatives ont été testées pour combler ce manque, densité de population par satellite, puis moyenne
            des communes voisines, et toutes deux se sont révélées trop imprécises pour remplacer une vraie mesure
            (erreur médiane d'environ 70 % par rapport à des valeurs connues). Nous avons préféré laisser ces
            communautés sans donnée plutôt que d'afficher un chiffre trompeur.
          </li>
        </ul>

        <h2>3. De la valeur brute à la note</h2>
        <ol>
          <li>
            Pour chaque critère, on ne regarde pas la valeur brute mais la <b>position relative</b> de la communauté
            par rapport à toutes les autres de son pays, comme détaillé section par section ci-dessus. Cela donne un
            nombre de 0 à 100 par critère.
          </li>
          <li>La note finale est la <b>moyenne de ces positions, pondérée</b> par les poids ci-dessus (45 / 35 / 20 / 0).</li>
          <li>
            Si une donnée manque pour une communauté, le critère concerné est simplement <b>retiré de sa moyenne</b> :
            la communauté n'est pas pénalisée. La fiche de détail affiche « Couverture des critères : X % » pour
            indiquer quelle part du calcul a réellement pu être faite.
          </li>
        </ol>

        <h2>4. De la note à la sélection</h2>
        <ul>
          <li>On trie les communautés par note, <b>le Sénégal d'un côté, la Gambie de l'autre</b>, jamais mélangés, car les deux pays ont des données et des objectifs différents.</li>
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
        <h3>Accès route (note sur 100)</h3>
        <p>
          À partir d'OpenStreetMap, on mesure la <b>distance à vol d'oiseau jusqu'à la route la plus proche</b>,
          convertie en note sur 100 : 0 km = 100 (le village est sur la route), 5 km ou plus = 0.
        </p>
        <h3>Ville, marché et point d'eau les plus proches (distance en km)</h3>
        <p>
          À partir d'OpenStreetMap, on mesure pour chaque communauté la <b>distance à vol d'oiseau</b> jusqu'à
          la ville, au marché et au point d'eau (rivière, plan d'eau, puits, forage) les plus proches. Ces trois
          valeurs sont affichées <b>telles quelles, en kilomètres</b>, sans être transformées en note. Le lecteur
          juge lui-même : « 12 km » se lit directement.
        </p>
        <p>
          Limites à connaître : la couverture d'OpenStreetMap est bonne pour les villes et l'eau de surface, mais
          <b> partielle pour les marchés hebdomadaires ruraux et les puits</b>. Un marché ou un puits proche non
          cartographié peut faire apparaître une distance plus grande que la réalité. À terme, « accès marché »
          sera remplacé par la distance aux 7 centres de collecte HERS, une fois ceux-ci implantés.
        </p>

        <h2>6. Ce qu'il faut garder en tête</h2>
        <ul>
          <li>La population manque encore pour environ 38 % du Sénégal et 37 % de la Gambie, d'où son poids à 0 %. Pour la Gambie, les valeurs disponibles sont une estimation 2024, pas un comptage direct.</li>
          <li>15 communautés restent positionnées par estimation (moyenne de villages voisins vérifiés) ; pour celles-là, les indicateurs qui dépendent de la position sont approximatifs.</li>
          <li>« Accès route » est une distance à vol d'oiseau, pas un temps de trajet réel (état de la piste, saison des pluies, cours d'eau à franchir ne sont pas pris en compte).</li>
          <li>La note est un <b>outil de classement relatif</b>, pas une note de qualité absolue : deux communautés de pays différents avec la même note peuvent avoir un statut différent, puisque le classement est fait pays par pays.</li>
          <li>Le critère « Distance au bureau » pesant 45 %, il est normal qu'une zone proche d'un bureau ait un fort taux de sélection : ce n'est pas un déséquilibre, c'est le modèle qui fonctionne comme prévu.</li>
        </ul>

        <p className="method-foot">
          Cette page décrit la mécanique du choix. Les chiffres exacts (nombre de communautés, objectifs, poids)
          peuvent évoluer et se règlent dans l'onglet <button className="linkbtn" onClick={onGoDashboard}>Vue d'ensemble</button>.
        </p>
      </div>
    </section>
  );
}
