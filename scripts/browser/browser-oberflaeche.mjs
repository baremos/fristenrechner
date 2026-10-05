// Nur das Schema belegt Browser-Oberfläche, keine Domain-/Feature-Whitelist.
// Parameter und Fragmente gehören nicht in den Oberflächenbeleg.
export function browserOberflaecheBeleg(adresse) {
  try {
    const url = new URL(adresse);
    if (!['edge:', 'chrome:', 'devtools:', 'chrome-untrusted:'].includes(url.protocol)) return null;
    url.search = ''; url.hash = ''; url.username = ''; url.password = '';
    return { einordnung: 'Browser-Oberfläche', schema: url.protocol, url: url.href };
  } catch { return null; }
}
