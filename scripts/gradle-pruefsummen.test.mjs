// Gegenproben der Verifikation, ohne Gradle, Netz oder private Cache-Dateien.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { aufruf, DATEI, ERWARTETE_GRUPPEN, pruefeGradleBaum, pruefeGradlePruefsummen, vergleicheCache, vergleicheListe } from './gradle-pruefsummen.mjs';
import { leseQuellXml } from './xml-quelle.mjs';

const scratchpad = fileURLToPath(new URL('../scratchpad/test-gradle-pruefsummen', import.meta.url));
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'gradle-pruefsummen-'));
after(() => rmSync(arbeit, { recursive: true, force: true }));
// Die echte Datei einmal mit dem JDK lesen. Gegenproben verändern nur den Baum.
const original = leseQuellXml(DATEI, undefined, process.env, { textwerte: true });
const wurzel = b => b.kinder[0];
const config = b => wurzel(b).kinder.find(k => k.name === 'configuration');
const liste = b => wurzel(b).kinder.find(k => k.name === 'components');
const artefakt = b => liste(b).kinder[0].kinder[0];
const checksum = b => artefakt(b).kinder[0];
const element = (name, attribute = {}, kinder = [], text = '') => ({ name, attribute, kinder, text });

test('Gradle-Prüfsummen: eingecheckte Datei besteht mit begründeten, exakt benannten Gruppen', () => {
  const aus = pruefeGradleBaum(original);
  assert.deepEqual(aus.fehler, []);
  assert.ok(aus.komponenten > 0);
  assert.ok(aus.artefakte.length >= aus.komponenten);
  assert.ok(aus.gruppen.every(g => Object.hasOwn(ERWARTETE_GRUPPEN, g) && ERWARTETE_GRUPPEN[g].length > 20));
});

for (const [titel, aendern, muster] of [
  ['also-trust', b => checksum(b).kinder.push(element('also-trust', { value: 'a'.repeat(64) })), /also-trust/],
  ['fehlende sha256', b => artefakt(b).kinder = [], /genau ein sha256/],
  ['doppelte sha256', b => artefakt(b).kinder.push(structuredClone(checksum(b))), /genau ein sha256/],
  ['kurze sha256', b => checksum(b).attribute.value = 'a'.repeat(63), /64 Hex/],
  ['ungültige sha256', b => checksum(b).attribute.value = 'g'.repeat(64), /64 Hex/],
  ['sha512 statt sha256', b => checksum(b).name = 'sha512', /sha512 ist nicht erlaubt/],
  ['zusätzliches sha256-Attribut', b => checksum(b).attribute.auchVertrauen = 'true', /Attribut auchVertrauen/],
  ['doppelte Komponente', b => liste(b).kinder.push(structuredClone(liste(b).kinder[0])), /Doppelte Komponente/],
  ['doppeltes Artefakt', b => liste(b).kinder[0].kinder.push(structuredClone(artefakt(b))), /Doppeltes Artefakt/],
  ['unbekannte Gruppe', b => liste(b).kinder[0].attribute.group = 'com.unbekannt', /Unbekannte Gruppe: com.unbekannt/],
  ['bekanntes Präfix reicht nicht', b => liste(b).kinder[0].attribute.group = 'androidx.unbekannt', /Unbekannte Gruppe/],
  ['verify-metadata false', b => config(b).kinder[0].text = 'false', /verify-metadata muss true/],
  ['verify-signatures true', b => config(b).kinder[1].text = 'true', /verify-signatures muss false/],
  ['verify-metadata fehlt', b => config(b).kinder.shift(), /genau ein verify-metadata/],
  ['verify-signatures doppelt', b => config(b).kinder.push(structuredClone(config(b).kinder[1])), /genau ein verify-signatures/],
  ['Boolescher Schalter mit Kind', b => config(b).kinder[0].kinder.push(element('x')), /darf keine Elemente/],
  ['ignored-keys', b => config(b).kinder.push(element('ignored-keys')), /ignored-keys ist nicht erlaubt/],
  ['trusted-keys', b => config(b).kinder.push(element('trusted-keys')), /trusted-keys ist nicht erlaubt/],
  ['zusätzliches trust-Muster', b => config(b).kinder[2].kinder.push(element('trust', { file: '.*', regex: 'true' })), /genau die zwei Muster/],
  ['fehlendes trust-Muster', b => config(b).kinder[2].kinder.pop(), /genau die zwei Muster/],
  ['doppeltes trust-Muster', b => config(b).kinder[2].kinder[1] = structuredClone(config(b).kinder[2].kinder[0]), /genau die zwei Muster/],
  ['trust auf Gruppe erweitert', b => config(b).kinder[2].kinder[0].attribute.group = '.*', /Attribut group/],
  ['trust ohne regex', b => config(b).kinder[2].kinder[0].attribute.regex = 'false', /regex muss true/],
  ['unbekanntes trust-Element', b => config(b).kinder[2].kinder[0].name = 'freigabe', /unerwartetes Element freigabe/],
  ['abweichender Namensraum', b => wurzel(b).attribute.xmlns = 'urn:unbekannt', /xmlns weicht/],
  ['unbekanntes Wurzelelement', b => wurzel(b).kinder.push(element('weitere')), /weitere ist nicht erlaubt/],
  ['zusätzlicher Text', b => artefakt(b).text = 'nicht erlaubt', /kein Textwert/],
  ['leere Komponentenliste', b => liste(b).kinder = [], /mindestens eine Komponente/],
  ['leere Artefaktliste', b => liste(b).kinder[0].kinder = [], /mindestens ein Artefakt/],
  ...['group', 'name', 'version'].map(f => [`fehlendes ${f}`, b => delete liste(b).kinder[0].attribute[f], new RegExp(`Attribut ${f} fehlt`)]),
  ['Cache-Pfadmanipulation', b => liste(b).kinder[0].attribute.version = '../anderes', /ungültiger Wert/],
  ['Artefakt-Pfadmanipulation', b => artefakt(b).attribute.name = '../anderes.jar', /ungültiger Dateiname/],
]) {
  test(`Gradle-Prüfsummen Gegenprobe: ${titel}`, () => {
    const baum = structuredClone(original); aendern(baum);
    assert.match(pruefeGradleBaum(baum).fehler.join('\n'), muster);
  });
}

test('Gradle-Prüfsummen: XML-Textwerte, Kommentare und Zeichenreferenzen über den JDK-Parser', () => {
  const datei = join(arbeit, 'textwerte.xml');
  writeFileSync(datei, readFileSync(DATEI, 'utf8').replace('<verify-metadata>true', '<verify-metadata><!-- Kommentar -->tr&#117;e'));
  assert.deepEqual(pruefeGradlePruefsummen({ datei }).fehler, []);
});
test('Gradle-Prüfsummen: fehlende und ungültige XML-Dateien scheitern', () => {
  assert.match(pruefeGradlePruefsummen({ datei: join(arbeit, 'fehlt.xml') }).fehler.join('\n'), /fehlt/);
  const datei = join(arbeit, 'ungueltig.xml');
  writeFileSync(datei, '<verification-metadata>');
  assert.throws(() => pruefeGradlePruefsummen({ datei }), /XML-Quellprüfung fehlgeschlagen/);
});

const inhalt = 'belegter Inhalt\n';
const a = { gruppe: 'org.slf4j', name: 'slf4j-api', version: '2.0.17', datei: 'slf4j-api-2.0.17.jar',
  sha256: createHash('sha256').update(inhalt).digest('hex') };
const relativ = `${a.gruppe}/${a.name}/${a.version}/cache-hash/${a.datei}`;
function cacheDatei(cache, pfad, text) {
  const datei = join(cache, pfad); mkdirSync(dirname(datei), { recursive: true }); writeFileSync(datei, text);
}
test('Gradle-Prüfsummen Cache: passende Datei und fehlender Beleg werden getrennt gezählt', () => {
  const cache = join(arbeit, 'cache-gleich'); mkdirSync(cache);
  cacheDatei(cache, relativ, inhalt);
  const aus = vergleicheCache([a, { ...a, datei: 'fehlt.jar' }], cache);
  assert.deepEqual(aus, { artefakte: 2, dateien: 1, gleich: 1, abweichend: 0, fehlend: 1, fehler: [] });
});
test('Gradle-Prüfsummen Gegenprobe: abweichende Cache-Datei scheitert', () => {
  const cache = join(arbeit, 'cache-falsch'); mkdirSync(cache);
  cacheDatei(cache, relativ, 'verändert');
  const aus = vergleicheCache([a], cache);
  assert.equal(aus.abweichend, 1);
  assert.match(aus.fehler.join('\n'), /abweichende SHA-256/);
  assert.ok(!aus.fehler.join('\n').includes(cache));
});
test('Gradle-Prüfsummen Cache: passende Kopie verdeckt keine manipulierte zweite Kopie', () => {
  const cache = join(arbeit, 'cache-zwei'); mkdirSync(cache);
  cacheDatei(cache, relativ, inhalt);
  cacheDatei(cache, relativ.replace('/cache-hash/', '/zweiter-hash/'), 'verändert');
  const aus = vergleicheCache([a], cache);
  assert.equal(aus.dateien, 2); assert.equal(aus.gleich, 1); assert.equal(aus.abweichend, 1);
  assert.equal(aus.fehler.length, 1);
});
for (const [titel, text] of [
  ['sha256 und relativer Pfad', `${a.sha256}  ${relativ}\n`],
  ['sha256 und absoluter Windows-Pfad mit Leerzeichen', `${a.sha256.toUpperCase()}  C:\\Cache mit Leerzeichen\\${relativ.replaceAll('/', '\\')}\r\n`],
  ['ursprüngliche Cache-Erhebung', `${relativ}\t${Buffer.byteLength(inhalt)}\t${a.sha256}\n`],
]) {
  test(`Gradle-Prüfsummen Liste: ${titel}`, () => {
    assert.deepEqual(vergleicheListe([a, { ...a, datei: 'fehlt.jar' }], text), {
      artefakte: 2, dateien: 1, gleich: 1, abweichend: 0, fehlend: 1, fehler: [],
    });
  });
}
test('Gradle-Prüfsummen Liste: gleicher Dateiname aus anderer Komponente zählt nicht', () => {
  const aus = vergleicheListe([a], `${a.sha256}  ${relativ.replace('org.slf4j/', 'unbekannt/')}\n`);
  assert.equal(aus.dateien, 0); assert.equal(aus.fehlend, 1);
});
test('Gradle-Prüfsummen Gegenprobe: abweichende Liste und zweite Kopie scheitern', () => {
  const aus = vergleicheListe([a], `${a.sha256}  ${relativ}\n${'0'.repeat(64)}  ${relativ}\n`);
  assert.equal(aus.gleich, 1); assert.equal(aus.abweichend, 1); assert.equal(aus.fehler.length, 1);
});
test('Gradle-Prüfsummen Gegenprobe: fehlerhafte Listenzeilen scheitern ohne private Pfade auszugeben', () => {
  const aus = vergleicheListe([a], 'geheimer Pfad\n' + `${a.sha256}  ../kein-cache-pfad\n`);
  assert.equal(aus.fehler.length, 2);
  assert.match(aus.fehler[0], /ungültige Zeile 1/);
  assert.ok(!aus.fehler.join('\n').includes('geheimer'));
});
test('Gradle-Prüfsummen Aufruf: Schalter nur einmal und mit Wert', () => {
  assert.deepEqual(aufruf([]), {});
  assert.equal(Object.keys(aufruf(['--cache', arbeit, '--liste', join(arbeit, 'liste.txt')])).length, 2);
  for (const args of [['--cache'], ['--liste', '--cache'], ['--unbekannt'], ['--cache', arbeit, '--cache', arbeit]]) {
    assert.throws(() => aufruf(args), /Aufruf:/);
  }
});
