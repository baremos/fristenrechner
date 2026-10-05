// Feste Grenze für die offenen Angaben des vorbereiteten Hinweisbestands.
// Das Inventar kann diese Liste weder ergänzen noch ihre Belege ersetzen.
const jspdfBeleg = {
  datei: 'node_modules/jspdf/dist/jspdf.es.min.js',
  sha256: '761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83',
};

export const uebergangsangaben = Object.freeze([
  ...[
    ['src/libs/FileSaver.js', 'MIT (nur Verweis auf github.com/eligrey/FileSaver.js/blob/master/LICENSE.md)'],
    ['src/libs/rgbcolor.js', '@license Use it if you like it'],
    ['src/libs/md5.js', 'Joseph Myers does not specify a particular license for his work.'],
    ['src/libs/rc4.js', 'FPDF is released under a permissive license: there is no usage restriction.'],
    ['src/libs/omggif.js', 'MIT-Text im Kommentar'],
    ['src/libs/JPEGEncoder.js', 'BSD-3-Clause-Text im Kommentar'],
    ['src/libs/WebPDecoder.js', 'WebM Software License Agreement + Additional IP Rights Grant (nur Haftungsausschluss und URLs im Kommentar); Port MIT'],
    ['src/modules/standard_fonts_metrics.js', 'MIT + Adobe-AFM-Bedingungen (Wortlaut wie SPDX APAFML, Abgleich offen)'],
    ['src/libs/BMPDecoder.js', 'keine Lizenzangabe in der Quelle'],
    ['src/libs/ttffont.js', 'keine Lizenzangabe in der Quelle'],
  ].map(([name, angabe]) => ({ gruppe: 'eingebettet',
    identitaet: { paket: 'jspdf', ort: 'node_modules/jspdf', name, quelle: name },
    angabe, beleg: jspdfBeleg })),
  { gruppe: 'buildHilfscode', identitaet: { paket: '@oxc-project/runtime', version: '0.150.0', ort: null },
    angabe: 'noch zu belegen', beleg: {
      datei: 'node_modules/rolldown/dist/shared/bindingify-input-options-D4l624og.mjs',
      sha256: 'c37e1b58aa8b7d0528d9a83de39b8109f0281756d88ca84efa160af248ab8d66',
    } },
  { gruppe: 'android.projektmodule', identitaet: { name: 'capacitor-cordova-android-plugins', version: '1.0', ort: null },
    angabe: 'noch zu belegen', beleg: {
      datei: 'app/android/capacitor-cordova-android-plugins/build.gradle',
      sha256: '28e3fa281f4d1e388bf98abc7f5bb31e672516e385c165c719d201ed54b8236e',
    } },
].map(e => Object.freeze({ ...e, identitaet: Object.freeze(e.identitaet), beleg: Object.freeze(e.beleg) })));

export function istUebergangsangabe(gruppe, e) {
  const b = e.lizenzentscheidung?.beleg;
  return e.status === 'platzhalter' && e.lizenzentscheidung?.angabe === e.lizenz
    && uebergangsangaben.some(a => a.gruppe === gruppe && a.angabe === e.lizenz
      && Object.entries(a.identitaet).every(([feld, wert]) => e[feld] === wert)
      && b?.datei === a.beleg.datei && b?.sha256 === a.beleg.sha256);
}
