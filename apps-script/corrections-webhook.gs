// Code à coller dans l'éditeur Apps Script lié au Google Sheet qui reçoit les corrections de
// position (Spatial.tsx, mode correction). Remplace le doPost existant par celui-ci, puis :
//   1. Projet Apps Script -> Paramètres du projet -> Propriétés du script -> ajouter
//      CORRECTIONS_TOKEN = hers-corr-2026-k4m9 (même valeur que CORRECTIONS_TOKEN dans Spatial.tsx ;
//      si tu changes l'un, change l'autre).
//   2. Déployer -> Gérer les déploiements -> modifier le déploiement existant (même URL, pas besoin
//      de changer CORRECTIONS_WEBHOOK_URL côté site).
//
// Important à comprendre : ce jeton n'est PAS un secret vis-à-vis de quelqu'un qui lit le code source
// du site (public). Son seul rôle est de filtrer les requêtes automatisées/opportunistes qui tombent
// sur cette URL sans connaître la forme attendue de la requête. La vraie protection ci-dessous, c'est
// la vérification des coordonnées (boîte Sénégal/Gambie) : elle bloque les données absurdes même
// envoyées "à la main". Le risque réel reste faible de toute façon : ce Sheet est une file de
// relecture humaine avant toute correction appliquée aux vraies données, jamais un canal en direct.

const SHEET_NAME = "Corrections"; // adapter si l'onglet a un autre nom
const BBOX = { latMin: 11.5, latMax: 17, lonMin: -18, lonMax: -11 };
const EXPECTED_TOKEN = PropertiesService.getScriptProperties().getProperty("CORRECTIONS_TOKEN");

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (!EXPECTED_TOKEN || data.token !== EXPECTED_TOKEN) {
      return ContentService.createTextOutput("rejected: bad token");
    }
    const lat = Number(data.lat), lon = Number(data.lon);
    if (!isFinite(lat) || !isFinite(lon) || lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) {
      return ContentService.createTextOutput("rejected: coordinates out of range");
    }
    if (!data.code_communaute || !data.communaute) {
      return ContentService.createTextOutput("rejected: missing fields");
    }

    // Limite basique de débit : refuse si plus de 20 écritures dans la dernière minute (anti-spam).
    const cache = CacheService.getScriptCache();
    const count = Number(cache.get("write_count") || 0);
    if (count >= 20) return ContentService.createTextOutput("rejected: rate limit");
    cache.put("write_count", String(count + 1), 60);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([
      new Date(),
      data.code_communaute,
      data.communaute,
      lat,
      lon,
      data.oldLat,
      data.oldLon,
    ]);
    return ContentService.createTextOutput("ok");
  } catch (err) {
    return ContentService.createTextOutput("error: " + err.message);
  }
}
