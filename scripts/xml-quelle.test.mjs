// Echte XML-Quellprüfung mit dem JDK 21, ohne Android SDK oder Gradle.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findeJdk, windows } from './werkzeuge.mjs';

const quelle = fileURLToPath(new URL('XmlQuelle.java', import.meta.url));
const jdk = findeJdk();
assert.ok(jdk.pfad, 'Die XML-Quellprüfung braucht ein JDK 21 nach docs/toolchain.md.');
const java = join(jdk.pfad, 'bin', windows ? 'java.exe' : 'java');
const scratchpad = fileURLToPath(new URL('../scratchpad/test-xml-quelle', import.meta.url));
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'xml-quelle-'));
after(() => rmSync(arbeit, { recursive: true, force: true }));

function lese(xml, textwerte = false) {
  const ordner = join(arbeit, 'Quelle mit Leerzeichen und ü');
  mkdirSync(ordner, { recursive: true });
  const datei = join(ordner, 'quelle.xml');
  writeFileSync(datei, xml);
  // --source 17 prüft zugleich, dass keine neueren Sprachmittel nötig sind.
  const lauf = spawnSync(java, ['--source', '17', quelle, datei, ...(textwerte ? ['--textwerte'] : [])], { encoding: 'utf8', timeout: 30_000 });
  assert.ifError(lauf.error);
  return lauf;
}

test('XmlQuelle.java enthält nur ASCII', () => {
  assert.ok([...readFileSync(quelle)].every(byte => byte < 128));
});

test('XML-Quelle: Präfixe, Attribute, Reihenfolge und JSON-Maskierung bleiben erhalten', () => {
  const r = lese('<?xml version="1.0" encoding="UTF-8"?>\n<?vorher egal?>'
    + '<p:wurzel xmlns:p="urn:probe" p:wert="&quot;\\&#9;&#10;&#13;ä😀&amp;&lt;&gt;&apos;">'
    + '\n<!-- ignorieren --><p:z __proto__="wert"/><?probe egal?><a><![CDATA[ \t\n]]></a></p:wurzel>');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^[\x00-\x7f]+$/);
  assert.deepEqual(JSON.parse(r.stdout), {
    name: '#', attribute: {}, kinder: [{
      name: 'p:wurzel', attribute: { 'xmlns:p': 'urn:probe', 'p:wert': '"\\\t\n\rä😀&<>\'' },
      kinder: [
        { name: 'p:z', attribute: { ['__proto__']: 'wert' }, kinder: [] },
        { name: 'a', attribute: {}, kinder: [] },
      ],
    }],
  });
});

for (const [titel, xml] of [
  ['DOCTYPE mit interner Entität', '<!DOCTYPE r [<!ENTITY geheim "nicht ausgeben">]><r a="&geheim;"/>'],
  ['externe DTD', '<!DOCTYPE r SYSTEM "file:///nicht-lesen.dtd"><r/>'],
  ['externe Entität', '<!DOCTYPE r [<!ENTITY geheim SYSTEM "file:///nicht-lesen.txt">]><r>&geheim;</r>'],
  ['externe Parameterentität', '<!DOCTYPE r [<!ENTITY % geheim SYSTEM "file:///nicht-lesen.dtd">%geheim;]><r/>'],
  ['nicht gebundenes Präfix', '<p:r/>'],
  ['doppeltes Attribut mit anderem Präfix', '<r xmlns:a="urn:x" xmlns:b="urn:x" a:id="1" b:id="2"/>'],
  ['Text', '<r>nicht ausgeben</r>'],
  ['CDATA mit Text', '<r><![CDATA[nicht ausgeben]]></r>'],
  ['geschütztes Leerzeichen als Text', '<r>\u00a0</r>'],
  ['defekter Kommentar', '<r><!-- nicht -- erlaubt --></r>'],
  ['unvollständiges Dokument', '<r>'],
]) {
  test(`XML-Quelle verwirft ${titel} ohne Dateiinhalt in der Fehlermeldung`, () => {
    const r = lese(xml);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr.trim(), 'XML-Datei ist ungueltig oder nicht lesbar.');
  });
}

test('XML-Quelle löst XInclude nicht auf', () => {
  const r = lese('<r xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///nicht-lesen.xml"/></r>');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).kinder[0].kinder, [
    { name: 'xi:include', attribute: { href: 'file:///nicht-lesen.xml' }, kinder: [] },
  ]);
});

test('XML-Quelle: Textwerte nur im ausdrücklich gewählten Modus, auch CDATA', () => {
  const r = lese('<r>\n<v>true</v><v><![CDATA[false]]></v>ä&amp;</r>', true);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).kinder[0], {
    name: 'r', attribute: {}, text: '\nä&', kinder: [
      { name: 'v', attribute: {}, kinder: [], text: 'true' },
      { name: 'v', attribute: {}, kinder: [], text: 'false' },
    ],
  });
});
test('XML-Quelle: Textmodus öffnet keinen Weg für DTD oder Entitäten', () => {
  const r = lese('<!DOCTYPE r [<!ENTITY geheim SYSTEM "file:///nicht-lesen.txt">]><r>&geheim;</r>', true);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr.trim(), 'XML-Datei ist ungueltig oder nicht lesbar.');
});
