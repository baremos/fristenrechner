// Prüft scripts/SdkPruefung.java gegen Paketbeschreibungen aller Art.
//
// Aufruf: node --test "scripts/*.test.mjs"
//
// Der Test braucht ein JDK der festgelegten Hauptversion. Er sucht es wie das
// Build-Skript: JAVA_HOME, dann die üblichen Installationsordner. Ohne JDK wird
// er übersprungen.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const vorgabe = JSON.parse(readFileSync(join(hier, 'toolchain.json'), 'utf8'));
const windows = process.platform === 'win32';
const name = 'build-tools;35.0.0';
const soll = '35.0.0';

function findeJava() {
  const programm = windows ? 'java.exe' : 'java';
  const kandidaten = [];
  if (process.env.JAVA_HOME) kandidaten.push(process.env.JAVA_HOME);
  const programme = process.env.ProgramFiles ?? 'C:\\Program Files';
  const ordner = windows
    ? [join(programme, 'Eclipse Adoptium'), join(programme, 'Microsoft'), join(programme, 'Android', 'openjdk')]
    : ['/usr/lib/jvm'];
  for (const o of ordner) {
    if (!existsSync(o)) continue;
    for (const eintrag of readdirSync(o).sort().reverse()) kandidaten.push(join(o, eintrag));
  }
  for (const k of kandidaten) {
    const java = join(k, 'bin', programm);
    if (!existsSync(java)) continue;
    const lauf = spawnSync(java, ['-version'], { encoding: 'utf8' });
    if (lauf.status === 0 && new RegExp(`version "${vorgabe.jdk.hauptversion}[."]`).test(`${lauf.stderr}${lauf.stdout}`)) return java;
  }
  return null;
}

const kopf = '<?xml version="1.0" encoding="UTF-8"?>\n';
const auf = '<ns2:repository xmlns:ns2="http://schemas.android.com/repository/android/common/02">\n';
const lizenz = '  <license id="android-sdk-license" type="text">Bedingungen &amp; Hinweise, 1 &lt; 2</license>\n';
const zu = '</ns2:repository>\n';
const paket = (inhalt, pfad = `path="${name}"`) =>
  `${kopf}${auf}${lizenz}  <localPackage ${pfad} obsolete="false">\n    <type-details xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:genericDetailsType" />\n    ${inhalt}\n    <display-name>Probe</display-name>\n  </localPackage>\n${zu}`;
const voll = '<revision><major>35</major><minor>0</minor><micro>0</micro></revision>';
// Kurzform für Gegenproben: Wurzel r, ein Paket, nur major
const kurz = (attribute = '', major = '35', davor = '') =>
  `<r${attribute}>${davor}<localPackage path="${name}"><revision><major>${major}</major></revision></localPackage></r>`;

const OK = ['OK', soll];
const ABWEICHUNG = (gefunden) => ['ABWEICHUNG', gefunden];
const FEHLT = ['FEHLT', ''];
const UNGUELTIG = ['UNGUELTIG', ''];

// xml und eigenschaften: Text (als UTF-8 geschrieben) oder Buffer
const faelle = [
  { fall: 'vollstaendig', xml: paket(voll), erwartet: OK },
  { fall: 'nur-major', xml: paket('<revision>\n<major>35</major>\n</revision>'), erwartet: OK },
  { fall: 'fuehrende-nullen', xml: paket('<revision><major>035</major><minor>00</minor></revision>'), erwartet: OK },
  { fall: 'leerraum-im-feld', xml: paket('<revision><major> 35\n</major></revision>'), erwartet: OK },
  { fall: 'einfache-anfuehrung', xml: paket(voll, `path='${name}'`), erwartet: OK },
  { fall: 'mit-bom', xml: `\uFEFF${paket(voll)}`, erwartet: OK },
  { fall: 'ohne-kopf', xml: paket(voll).slice(kopf.length), erwartet: OK },
  { fall: 'kommentar-daneben', xml: paket(`<!-- <revision><major>1</major></revision> -->${voll}`), erwartet: OK },
  { fall: 'abhaengigkeit', xml: paket(`${voll}\n    <dependencies><dependency path="emulator"><min-revision><major>29</major><minor>1</minor><micro>11</micro></min-revision></dependency></dependencies>`), erwartet: OK },
  { fall: 'abschnitt-cdata-im-text', xml: paket(voll).replace('Bedingungen', '<![CDATA[Bedingungen]]>'), erwartet: OK },
  { fall: 'anweisung', xml: paket(voll).replace(auf, `<?probe wert?>\n${auf}`), erwartet: OK },
  { fall: 'elementname-mit-umlaut', xml: kurz('', '35', '<\u00e4/>'), erwartet: OK },
  { fall: 'utf-16', xml: Buffer.from(`\uFEFF<?xml version="1.0" encoding="UTF-16"?>${kurz()}`, 'utf16le'), erwartet: OK },
  { fall: 'abschnittsende-im-attribut', xml: kurz(' a="]]>"'), erwartet: OK },

  { fall: 'major-und-micro', xml: paket('<revision><major>35</major><micro>4</micro></revision>'), erwartet: ABWEICHUNG('35.0.4') },
  { fall: 'major-und-minor', xml: paket('<revision><major>35</major><minor>2</minor></revision>'), erwartet: ABWEICHUNG('35.2.0') },
  { fall: 'vorschau', xml: paket('<revision><major>35</major><minor>0</minor><micro>0</micro><preview>5</preview></revision>'), erwartet: ABWEICHUNG('35.0.0 rc5') },
  { fall: 'andere-revision', xml: paket('<revision><major>34</major></revision>'), erwartet: ABWEICHUNG('34.0.0') },

  { fall: 'anderes-paket', xml: paket(voll, 'path="build-tools;34.0.0"'), erwartet: UNGUELTIG },
  { fall: 'ohne-kennung', xml: paket(voll, 'obsolet="nein"'), erwartet: UNGUELTIG },
  { fall: 'kennung-mit-namensraum', xml: paket(voll, `ns2:path="${name}"`), erwartet: UNGUELTIG },
  { fall: 'doppeltes-attribut', xml: paket(voll, `path="build-tools;34.0.0" path="${name}"`), erwartet: UNGUELTIG },
  { fall: 'abgeschnitten', xml: paket(voll).slice(0, -40), erwartet: UNGUELTIG },
  { fall: 'auskommentiert', xml: paket(`<!-- ${voll} -->`), erwartet: UNGUELTIG },
  { fall: 'kommentar-im-namen', xml: paket('<revision><ma<!--x-->jor>35</major></revision>'), erwartet: UNGUELTIG },
  { fall: 'kommentar-im-feld', xml: paket('<revision><major>3<!--x-->5</major></revision>'), erwartet: UNGUELTIG },
  { fall: 'abschnitt-cdata-im-feld', xml: paket('<revision><major><![CDATA[35]]></major></revision>'), erwartet: UNGUELTIG },
  { fall: 'kommentar-mit-strichen', xml: paket(`<!-- a -- b -->${voll}`), erwartet: UNGUELTIG },
  { fall: 'zwei-revisionen', xml: paket('<revision><major>35</major></revision><revision><major>36</major></revision>'), erwartet: UNGUELTIG },
  { fall: 'zwei-pakete', xml: paket(voll).replace(zu, `  <localPackage path="${name}"><revision><major>35</major></revision></localPackage>\n${zu}`), erwartet: UNGUELTIG },
  { fall: 'kein-paket', xml: `${kopf}${auf}${lizenz}${zu}`, erwartet: UNGUELTIG },
  { fall: 'major-fehlt', xml: paket('<revision><minor>1</minor></revision>'), erwartet: UNGUELTIG },
  { fall: 'major-doppelt', xml: paket('<revision><major>35</major><major>36</major></revision>'), erwartet: UNGUELTIG },
  { fall: 'keine-zahl', xml: paket('<revision><major>35a</major></revision>'), erwartet: UNGUELTIG },
  { fall: 'negative-zahl', xml: paket('<revision><major>-1</major></revision>'), erwartet: UNGUELTIG },
  { fall: 'leeres-feld', xml: paket('<revision><major></major></revision>'), erwartet: UNGUELTIG },
  { fall: 'fremde-ziffern', xml: paket('<revision><major>\u0663\u0665</major></revision>'), erwartet: UNGUELTIG },
  { fall: 'feld-mit-element', xml: paket('<revision><major><wert>35</wert></major></revision>'), erwartet: UNGUELTIG },
  { fall: 'falsches-ende', xml: paket('<revision><major>35</minor></revision>'), erwartet: UNGUELTIG },
  { fall: 'zwei-wurzeln', xml: `${paket(voll)}<zweite />\n`, erwartet: UNGUELTIG },
  { fall: 'text-nach-wurzel', xml: `${paket(voll)}Rest\n`, erwartet: UNGUELTIG },
  { fall: 'vorsilbe-unbekannt', xml: paket(`<x:zusatz />${voll}`), erwartet: UNGUELTIG },
  { fall: 'paket-mit-vorsilbe', xml: paket(voll).replaceAll('localPackage', 'ns2:localPackage'), erwartet: UNGUELTIG },
  { fall: 'standard-namensraum', xml: paket(voll).replace('<ns2:repository ', '<ns2:repository xmlns="urn:beispiel" '), erwartet: UNGUELTIG },
  { fall: 'und-zeichen', xml: paket(voll).replace('&amp;', '&'), erwartet: UNGUELTIG },
  { fall: 'zeichenangabe-unbekannt', xml: paket(voll).replace('&amp;', '&nbsp;'), erwartet: UNGUELTIG },
  { fall: 'kleiner-im-attribut', xml: paket(voll, 'path="build-tools;<35.0.0"'), erwartet: UNGUELTIG },
  { fall: 'dokumenttyp', xml: paket(voll).replace(auf, `<!DOCTYPE repository>\n${auf}`), erwartet: UNGUELTIG },
  { fall: 'kein-xml', xml: 'Pkg.Revision=35.0.0\n', eigenschaften: 'Pkg.Revision=35.0.0\n', erwartet: UNGUELTIG },
  { fall: 'leer', xml: '', eigenschaften: 'Pkg.Revision=35.0.0\n', erwartet: UNGUELTIG },

  { fall: 'attribute-im-selben-namensraum', xml: kurz(' xmlns:a="urn:x" xmlns:b="urn:x" a:x="1" b:x="2"'), erwartet: UNGUELTIG },
  { fall: 'vorsilbe-xml-umgebunden', xml: kurz(' xmlns:xml="urn:falsch"'), erwartet: UNGUELTIG },
  { fall: 'vorsilbe-constructor', xml: kurz().replace('<r>', '<constructor:r>').replace('</r>', '</constructor:r>'), erwartet: UNGUELTIG },
  { fall: 'version-ungueltig', xml: `<?xml version="banana"?>${kurz()}`, erwartet: UNGUELTIG },
  { fall: 'kodierung-unbekannt', xml: `<?xml version="1.0" encoding="no-such-encoding"?>${kurz()}`, erwartet: UNGUELTIG },
  { fall: 'standalone-ungueltig', xml: `<?xml version="1.0" standalone="maybe"?>${kurz()}`, erwartet: UNGUELTIG },
  { fall: 'nullzeichen-im-kommentar', xml: kurz('', '35', '<!--\u0000-->'), erwartet: UNGUELTIG },
  { fall: 'geschuetztes-leerzeichen', xml: kurz('\u00a0a="b"'), erwartet: UNGUELTIG },
  { fall: 'zeichenangabe-vor-wurzel', xml: `&#32;${kurz()}`, erwartet: UNGUELTIG },
  { fall: 'bom-im-feld', xml: kurz('', '\uFEFF35'), erwartet: UNGUELTIG },
  { fall: 'zeilenende-0085-im-feld', xml: kurz('', '\u008535'), erwartet: UNGUELTIG },
  { fall: 'utf-8-ungueltig', xml: Buffer.concat([Buffer.from('<r><unused>'), Buffer.from([0xff]), Buffer.from(`</unused>${kurz().slice(3)}`)]), erwartet: UNGUELTIG },

  { fall: 'nur-eigenschaften', eigenschaften: 'Pkg.Desc=Probe\nPkg.Revision=35.0.0\n', erwartet: OK },
  { fall: 'eigenschaften-mit-pfad', eigenschaften: `Pkg.Revision=35.0.0\nPkg.Path=${name}\n`, erwartet: OK },
  { fall: 'eigenschaften-kurze-revision', eigenschaften: 'Pkg.Revision=35\n', erwartet: ['OK', '35'] },
  { fall: 'eigenschaften-kleinschreibung', eigenschaften: 'Pkg.Revision=35.0.0\npkg.path=fremd\n', erwartet: OK },
  { fall: 'eigenschaften-abweichung', eigenschaften: 'Pkg.Revision=36.0.0 rc5\n', erwartet: ABWEICHUNG('36.0.0 rc5') },
  { fall: 'eigenschaften-anderer-pfad', eigenschaften: 'Pkg.Revision=35.0.0\nPkg.Path=build-tools;34.0.0\n', erwartet: UNGUELTIG },
  { fall: 'eigenschaften-zwei-pfade', eigenschaften: `Pkg.Revision=35.0.0\nPkg.Path=${name}\nPkg.Path=fremd\n`, erwartet: UNGUELTIG },
  { fall: 'eigenschaften-leerer-pfad', eigenschaften: 'Pkg.Revision=35.0.0\nPkg.Path=\nPkg.Desc=x\n', erwartet: UNGUELTIG },
  { fall: 'eigenschaften-ohne-revision', eigenschaften: 'Pkg.Desc=Probe\n', erwartet: FEHLT },
  { fall: 'xml-hat-vorrang', xml: paket(voll), eigenschaften: 'Pkg.Revision=10\n', erwartet: OK },
  { fall: 'ordner-leer', erwartet: FEHLT },
  { fall: 'ordner-fehlt', ohneOrdner: true, erwartet: FEHLT },
];

const java = findeJava();
const ohneJdk = java ? false : `kein JDK ${vorgabe.jdk.hauptversion} gefunden`;

test('Fallnamen sind eindeutig', () => {
  assert.equal(new Set(faelle.map((f) => f.fall)).size, faelle.length);
});

test('SdkPruefung.java enthält nur ASCII', () => {
  assert.equal(/[^\x00-\x7f]/.test(readFileSync(join(hier, 'SdkPruefung.java'), 'utf8')), false);
});

let ergebnis = new Map();
let lauf = null;
if (java) {
  const arbeit = mkdtempSync(join(tmpdir(), 'sdk-pruefung-'));
  test.after(() => rmSync(arbeit, { recursive: true, force: true }));
  for (const f of faelle) {
    if (f.ohneOrdner) continue;
    const ordner = join(arbeit, f.fall);
    mkdirSync(ordner, { recursive: true });
    if (f.xml !== undefined) writeFileSync(join(ordner, 'package.xml'), f.xml);
    if (f.eigenschaften !== undefined) writeFileSync(join(ordner, 'source.properties'), f.eigenschaften);
  }
  // Jeder Fall ist ein eigener Ordner im nachgestellten SDK. Geprüft wird stets dasselbe Paket.
  const angaben = faelle.flatMap((f) => [name, f.fall, soll]);
  lauf = spawnSync(java, [join(hier, 'SdkPruefung.java'), arbeit, ...angaben], { encoding: 'utf8' });
  const zeilen = lauf.stdout.split(/\r?\n/).filter((zeile) => zeile !== '').map((zeile) => zeile.split('\t'));
  ergebnis = new Map(zeilen.map((zeile, i) => [faelle[i]?.fall, zeile]));
}

test('Programm läuft und liefert je Fall eine Zeile mit vier Feldern', { skip: ohneJdk }, () => {
  assert.equal(lauf.status, 0, lauf.stderr);
  assert.equal(ergebnis.size, faelle.length);
  for (const zeile of ergebnis.values()) {
    assert.equal(zeile.length, 4);
    assert.equal(zeile[1], name);
    assert.equal(/^[\x20-\x7e]*$/.test(zeile.join('')), true);
  }
});

for (const f of faelle) {
  test(`Fall ${f.fall}`, { skip: ohneJdk }, () => {
    const [status, , gefunden, meldung] = ergebnis.get(f.fall);
    assert.deepEqual([status, gefunden], f.erwartet);
    assert.equal(meldung !== '', status === 'UNGUELTIG');
  });
}

test('falscher Aufruf endet mit Code 2', { skip: ohneJdk }, () => {
  assert.equal(spawnSync(java, [join(hier, 'SdkPruefung.java'), 'sdk', name], { encoding: 'utf8' }).status, 2);
});

test('Kennung mit fremden Zeichen erscheint in der Meldung als ASCII', { skip: ohneJdk }, () => {
  const arbeit = mkdtempSync(join(tmpdir(), 'sdk-pruefung-'));
  try {
    writeFileSync(join(arbeit, 'package.xml'), paket(voll, 'path="pr\u00fcf\tung"'));
    const probe = spawnSync(java, [join(hier, 'SdkPruefung.java'), arbeit, name, '.', soll], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.stderr);
    assert.equal(probe.stdout, `UNGUELTIG\t${name}\t\tpackage.xml beschreibt 'pr\\u00FCf ung'.\n`);
  } finally {
    rmSync(arbeit, { recursive: true, force: true });
  }
});
