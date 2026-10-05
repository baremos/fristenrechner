// Geschlossene Entscheidungen der Maintainer vom 2026-10-04.
// Keine neue Lizenzkennung; das Inventar kann diese Liste nicht erweitern.
import { createHash } from 'node:crypto';
const fest = [
  {
    "gruppe": "eingebettet",
    "identitaet": {
      "paket": "jspdf",
      "version": "4.2.1",
      "ort": "node_modules/jspdf",
      "name": "src/libs/rgbcolor.js",
      "quelle": "src/libs/rgbcolor.js"
    },
    "angabe": "@license Use it if you like it",
    "beleg": {
      "datei": "node_modules/jspdf/dist/jspdf.es.min.js",
      "sha256": "761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83"
    },
    "datum": "2026-10-04",
    "entscheidung": "In jsPDF eingebettete Anteile ohne Lizenzangabe (md5 von Joseph Myers, BMPDecoder, ttffont) und mit Sonderwortlauten (RGBColor „Use it if you like it“, RC4 aus FPDF, Adobe-AFM-Bedingungen, WebM mit Patentzusage): Originalwortlaut wiedergeben und in docs/lizenzen.md als bekannte Einschränkung führen. Die Maintainer nehmen dazu keine eigene Einordnung vor. Keine Anfrage bei Dritten, kein Ersatz von jsPDF.",
    "wortlautSha256": "324183f1c9eb8c1f4fcf9e1c52ada76491c5e015b5457cfc09d314a04e103384"
  },
  {
    "gruppe": "eingebettet",
    "identitaet": {
      "paket": "jspdf",
      "version": "4.2.1",
      "ort": "node_modules/jspdf",
      "name": "src/libs/md5.js",
      "quelle": "src/libs/md5.js"
    },
    "angabe": "Joseph Myers does not specify a particular license for his work.",
    "beleg": {
      "datei": "node_modules/jspdf/dist/jspdf.es.min.js",
      "sha256": "761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83"
    },
    "datum": "2026-10-04",
    "entscheidung": "In jsPDF eingebettete Anteile ohne Lizenzangabe (md5 von Joseph Myers, BMPDecoder, ttffont) und mit Sonderwortlauten (RGBColor „Use it if you like it“, RC4 aus FPDF, Adobe-AFM-Bedingungen, WebM mit Patentzusage): Originalwortlaut wiedergeben und in docs/lizenzen.md als bekannte Einschränkung führen. Die Maintainer nehmen dazu keine eigene Einordnung vor. Keine Anfrage bei Dritten, kein Ersatz von jsPDF.",
    "wortlautSha256": "e2d41bceef00f4f9d91d4e8511ff763e58ce38cfe068a62b6997dd9712970395"
  },
  {
    "gruppe": "eingebettet",
    "identitaet": {
      "paket": "jspdf",
      "version": "4.2.1",
      "ort": "node_modules/jspdf",
      "name": "src/libs/rc4.js",
      "quelle": "src/libs/rc4.js"
    },
    "angabe": "FPDF is released under a permissive license: there is no usage restriction.",
    "beleg": {
      "datei": "node_modules/jspdf/dist/jspdf.es.min.js",
      "sha256": "761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83"
    },
    "datum": "2026-10-04",
    "entscheidung": "In jsPDF eingebettete Anteile ohne Lizenzangabe (md5 von Joseph Myers, BMPDecoder, ttffont) und mit Sonderwortlauten (RGBColor „Use it if you like it“, RC4 aus FPDF, Adobe-AFM-Bedingungen, WebM mit Patentzusage): Originalwortlaut wiedergeben und in docs/lizenzen.md als bekannte Einschränkung führen. Die Maintainer nehmen dazu keine eigene Einordnung vor. Keine Anfrage bei Dritten, kein Ersatz von jsPDF.",
    "wortlautSha256": "a68dc549f64522865402da3b7b004781d9dbf5f9c36d128354b0a41ac0d68856"
  },
  {
    "gruppe": "eingebettet",
    "identitaet": {
      "paket": "jspdf",
      "version": "4.2.1",
      "ort": "node_modules/jspdf",
      "name": "src/libs/WebPDecoder.js",
      "quelle": "src/libs/WebPDecoder.js"
    },
    "angabe": "WebM Software License Agreement + Additional IP Rights Grant; Port MIT",
    "beleg": {
      "datei": "node_modules/jspdf/dist/jspdf.es.min.js",
      "sha256": "761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83"
    },
    "datum": "2026-10-04",
    "entscheidung": "In jsPDF eingebettete Anteile ohne Lizenzangabe (md5 von Joseph Myers, BMPDecoder, ttffont) und mit Sonderwortlauten (RGBColor „Use it if you like it“, RC4 aus FPDF, Adobe-AFM-Bedingungen, WebM mit Patentzusage): Originalwortlaut wiedergeben und in docs/lizenzen.md als bekannte Einschränkung führen. Die Maintainer nehmen dazu keine eigene Einordnung vor. Keine Anfrage bei Dritten, kein Ersatz von jsPDF.",
    "wortlautSha256": "868763a6be5de5054c21c7fda1d5a3b4dd6b0a90a4a5035e2b816d271ddeda2e"
  },
  {
    "gruppe": "eingebettet",
    "identitaet": {
      "paket": "jspdf",
      "version": "4.2.1",
      "ort": "node_modules/jspdf",
      "name": "src/modules/standard_fonts_metrics.js",
      "quelle": "src/modules/standard_fonts_metrics.js"
    },
    "angabe": "MIT + Adobe-AFM-Bedingungen",
    "beleg": {
      "datei": "node_modules/jspdf/dist/jspdf.es.min.js",
      "sha256": "761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83"
    },
    "datum": "2026-10-04",
    "entscheidung": "In jsPDF eingebettete Anteile ohne Lizenzangabe (md5 von Joseph Myers, BMPDecoder, ttffont) und mit Sonderwortlauten (RGBColor „Use it if you like it“, RC4 aus FPDF, Adobe-AFM-Bedingungen, WebM mit Patentzusage): Originalwortlaut wiedergeben und in docs/lizenzen.md als bekannte Einschränkung führen. Die Maintainer nehmen dazu keine eigene Einordnung vor. Keine Anfrage bei Dritten, kein Ersatz von jsPDF.",
    "wortlautSha256": "332f0b76f302b1fa600d6233b8adbb00b035ab07a769645acc263b965b004c72"
  },
  {
    "gruppe": "eingebettet",
    "identitaet": {
      "paket": "jspdf",
      "version": "4.2.1",
      "ort": "node_modules/jspdf",
      "name": "src/libs/BMPDecoder.js",
      "quelle": "src/libs/BMPDecoder.js"
    },
    "angabe": "keine Lizenzangabe in der Quelle",
    "beleg": {
      "datei": "node_modules/jspdf/dist/jspdf.es.min.js",
      "sha256": "761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83"
    },
    "datum": "2026-10-04",
    "entscheidung": "In jsPDF eingebettete Anteile ohne Lizenzangabe (md5 von Joseph Myers, BMPDecoder, ttffont) und mit Sonderwortlauten (RGBColor „Use it if you like it“, RC4 aus FPDF, Adobe-AFM-Bedingungen, WebM mit Patentzusage): Originalwortlaut wiedergeben und in docs/lizenzen.md als bekannte Einschränkung führen. Die Maintainer nehmen dazu keine eigene Einordnung vor. Keine Anfrage bei Dritten, kein Ersatz von jsPDF.",
    "wortlautSha256": "67c7d1d9b19cbdcae751fe4d310febf3d57c10c0a40d151bfb8ebebe72f8f27c"
  },
  {
    "gruppe": "eingebettet",
    "identitaet": {
      "paket": "jspdf",
      "version": "4.2.1",
      "ort": "node_modules/jspdf",
      "name": "src/libs/ttffont.js",
      "quelle": "src/libs/ttffont.js"
    },
    "angabe": "keine Lizenzangabe in der Quelle",
    "beleg": {
      "datei": "node_modules/jspdf/dist/jspdf.es.min.js",
      "sha256": "761b3a84ae6acc087802bc60672a4092cd1d5b17c809621da37ea26c9224cb83"
    },
    "datum": "2026-10-04",
    "entscheidung": "In jsPDF eingebettete Anteile ohne Lizenzangabe (md5 von Joseph Myers, BMPDecoder, ttffont) und mit Sonderwortlauten (RGBColor „Use it if you like it“, RC4 aus FPDF, Adobe-AFM-Bedingungen, WebM mit Patentzusage): Originalwortlaut wiedergeben und in docs/lizenzen.md als bekannte Einschränkung führen. Die Maintainer nehmen dazu keine eigene Einordnung vor. Keine Anfrage bei Dritten, kein Ersatz von jsPDF.",
    "wortlautSha256": "badf35db5e9646a628e0c173323b590fb707bb8467a4f203dcb6c623116ce796"
  }
];
export const entschiedeneAusnahmen = Object.freeze(fest.map(e => Object.freeze({
  ...e, identitaet: Object.freeze(e.identitaet), beleg: Object.freeze(e.beleg),
})));
export function festeAusnahme(gruppe, e) {
  return entschiedeneAusnahmen.find(a => a.gruppe === gruppe
    && Object.entries(a.identitaet).every(([feld, wert]) => e[feld] === wert));
}
export function istEntschiedeneAusnahme(gruppe, e) {
  const a = festeAusnahme(gruppe, e), d = e.entschiedeneAusnahme;
  return !!a && e.status === 'vollstaendig' && !e.lizenzentscheidung
    && e.lizenz === a.angabe && d?.angabe === a.angabe
    && d?.beleg?.datei === a.beleg.datei && d?.beleg?.sha256 === a.beleg.sha256
    && d?.datum === a.datum && d?.entscheidung === a.entscheidung
    && typeof e.wortlaut === 'string'
    && createHash('sha256').update(e.wortlaut).digest('hex') === a.wortlautSha256;
}
