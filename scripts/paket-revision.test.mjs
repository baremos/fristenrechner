// Prüft die Revisionsprüfung beider Skripte gegen dieselben Fälle:
// scripts/paket-revision.mjs und die Funktion Get-Revision des Einrichtungsskripts.
//
// Aufruf: node --test "scripts/*.test.mjs"
//
// Der Vergleich mit PowerShell läuft, wenn pwsh oder powershell vorhanden ist.
// Das Einrichtungsskript selbst wird dabei nicht ausgeführt.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { revision } from './paket-revision.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const name = 'build-tools;35.0.0';
const FEHLER = 'FEHLER';

const kopf = '<?xml version="1.0" encoding="UTF-8"?>\n';
const auf = '<ns2:repository xmlns:ns2="http://schemas.android.com/repository/android/common/02">\n';
const lizenz = '  <license id="android-sdk-license" type="text">Bedingungen &amp; Hinweise, 1 &lt; 2</license>\n';
const zu = '</ns2:repository>\n';
const paket = (inhalt, pfad = `path="${name}"`) =>
  `${kopf}${auf}${lizenz}  <localPackage ${pfad} obsolete="false">\n    <type-details xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:genericDetailsType" />\n    ${inhalt}\n    <display-name>Probe</display-name>\n  </localPackage>\n${zu}`;
const voll = '<revision><major>35</major><minor>0</minor><micro>0</micro></revision>';

// erwartet: Revision als Text, null für "fehlt" oder FEHLER.
// nurNode: Der Leser in Node ist hier strenger als der von .NET.
const faelle = [
  { fall: 'vollstaendig', xml: paket(voll), erwartet: '35.0.0' },
  { fall: 'nur-major', xml: paket('<revision>\n<major>11</major>\n</revision>'), erwartet: '11.0.0' },
  { fall: 'major-und-micro', xml: paket('<revision><major>35</major><micro>4</micro></revision>'), erwartet: '35.0.4' },
  { fall: 'major-und-minor', xml: paket('<revision><major>35</major><minor>2</minor></revision>'), erwartet: '35.2.0' },
  { fall: 'vorschau', xml: paket('<revision><major>36</major><minor>0</minor><micro>0</micro><preview>5</preview></revision>'), erwartet: '36.0.0 rc5' },
  { fall: 'abhaengigkeit', xml: paket('<revision><major>11</major></revision>\n    <dependencies><dependency path="emulator"><min-revision><major>29</major><minor>1</minor><micro>11</micro></min-revision></dependency></dependencies>'), erwartet: '11.0.0' },
  { fall: 'kommentar-daneben', xml: paket(`<!-- <revision><major>1</major></revision> -->${voll}`), erwartet: '35.0.0' },
  { fall: 'leerraum-im-feld', xml: paket('<revision><major> 35 </major></revision>'), erwartet: '35.0.0' },
  { fall: 'einfache-anfuehrung', xml: paket(voll, `path='${name}'`), erwartet: '35.0.0' },
  { fall: 'mit-bom', xml: `﻿${paket(voll)}`, erwartet: '35.0.0' },
  { fall: 'ohne-kopf', xml: paket(voll).slice(kopf.length), erwartet: '35.0.0' },

  { fall: 'anderes-paket', xml: paket(voll, 'path="build-tools;34.0.0"'), erwartet: FEHLER },
  { fall: 'ohne-kennung', xml: paket(voll, 'obsolet="nein"'), erwartet: FEHLER },
  { fall: 'doppeltes-attribut', xml: paket(voll, `path="build-tools;34.0.0" path="${name}"`), erwartet: FEHLER },
  { fall: 'abgeschnitten', xml: paket(voll).slice(0, -40), erwartet: FEHLER },
  { fall: 'auskommentiert', xml: paket(`<!-- ${voll} -->`), erwartet: FEHLER },
  { fall: 'kommentar-im-namen', xml: paket('<revision><ma<!--x-->jor>35</major></revision>'), erwartet: FEHLER },
  { fall: 'kommentar-im-feld', xml: paket('<revision><major>3<!--x-->5</major></revision>'), erwartet: FEHLER },
  { fall: 'kommentar-mit-strichen', xml: paket(`<!-- a -- b -->${voll}`), erwartet: FEHLER },
  { fall: 'zwei-revisionen', xml: paket('<revision><major>35</major></revision><revision><major>36</major></revision>'), erwartet: FEHLER },
  { fall: 'zwei-pakete', xml: paket(voll).replace(zu, `  <localPackage path="${name}"><revision><major>35</major></revision></localPackage>\n${zu}`), erwartet: FEHLER },
  { fall: 'kein-paket', xml: `${kopf}${auf}${lizenz}${zu}`, erwartet: FEHLER },
  { fall: 'major-fehlt', xml: paket('<revision><minor>1</minor></revision>'), erwartet: FEHLER },
  { fall: 'major-doppelt', xml: paket('<revision><major>35</major><major>36</major></revision>'), erwartet: FEHLER },
  { fall: 'keine-zahl', xml: paket('<revision><major>35a</major></revision>'), erwartet: FEHLER },
  { fall: 'negative-zahl', xml: paket('<revision><major>-1</major></revision>'), erwartet: FEHLER },
  { fall: 'fremde-ziffern', xml: paket('<revision><major>٣٥</major></revision>'), erwartet: FEHLER },
  { fall: 'feld-mit-element', xml: paket('<revision><major><wert>35</wert></major></revision>'), erwartet: FEHLER },
  { fall: 'falsches-ende', xml: paket('<revision><major>35</minor></revision>'), erwartet: FEHLER },
  { fall: 'zwei-wurzeln', xml: `${paket(voll)}<zweite />\n`, erwartet: FEHLER },
  { fall: 'text-nach-wurzel', xml: `${paket(voll)}Rest\n`, erwartet: FEHLER },
  { fall: 'vorsilbe-unbekannt', xml: paket(`<x:zusatz />${voll}`), erwartet: FEHLER },
  { fall: 'paket-mit-vorsilbe', xml: paket(voll).replaceAll('localPackage', 'ns2:localPackage'), erwartet: FEHLER },
  { fall: 'standard-namensraum', xml: paket(voll).replace('<ns2:repository ', '<ns2:repository xmlns="urn:beispiel" '), erwartet: FEHLER },
  { fall: 'und-zeichen', xml: paket(voll).replace('&amp;', '&'), erwartet: FEHLER },
  { fall: 'zeichenangabe-unbekannt', xml: paket(voll).replace('&amp;', '&nbsp;'), erwartet: FEHLER },
  { fall: 'kleiner-im-attribut', xml: paket(voll, 'path="build-tools;<35.0.0"'), erwartet: FEHLER },
  { fall: 'kein-xml', xml: 'Pkg.Revision=35.0.0\n', eigenschaften: 'Pkg.Revision=35.0.0\n', erwartet: FEHLER },
  { fall: 'leer', xml: '', eigenschaften: 'Pkg.Revision=35.0.0\n', erwartet: FEHLER },

  { fall: 'abschnitt-cdata', xml: paket(voll).replace('Bedingungen', '<![CDATA[Bedingungen]]>'), erwartet: FEHLER, nurNode: true },
  { fall: 'dokumenttyp', xml: paket(voll).replace(auf, `<!DOCTYPE repository>\n${auf}`), erwartet: FEHLER, nurNode: true },
  { fall: 'anweisung', xml: paket(voll).replace(auf, `<?probe wert?>\n${auf}`), erwartet: FEHLER, nurNode: true },

  { fall: 'nur-eigenschaften', eigenschaften: 'Pkg.Desc=Probe\nPkg.Revision=35.0.0\n', erwartet: '35.0.0' },
  { fall: 'eigenschaften-mit-pfad', eigenschaften: `Pkg.Revision=35.0.0\nPkg.Path=${name}\n`, erwartet: '35.0.0' },
  { fall: 'eigenschaften-anderer-pfad', eigenschaften: 'Pkg.Revision=35.0.0\nPkg.Path=build-tools;34.0.0\n', erwartet: FEHLER },
  { fall: 'eigenschaften-ohne-revision', eigenschaften: 'Pkg.Desc=Probe\n', erwartet: null },
  { fall: 'xml-hat-vorrang', xml: paket('<revision><major>11</major></revision>'), eigenschaften: 'Pkg.Revision=10\n', erwartet: '11.0.0' },
  { fall: 'ordner-leer', erwartet: null },
];

const arbeit = mkdtempSync(join(tmpdir(), 'paket-revision-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));

for (const f of faelle) {
  const ordner = join(arbeit, 'faelle', f.fall);
  mkdirSync(ordner, { recursive: true });
  if (f.xml !== undefined) writeFileSync(join(ordner, 'package.xml'), f.xml);
  if (f.eigenschaften !== undefined) writeFileSync(join(ordner, 'source.properties'), f.eigenschaften);
}

function ausNode(fall) {
  try {
    return revision(join(arbeit, 'faelle', fall), name);
  } catch {
    return FEHLER;
  }
}

test('Fallnamen sind eindeutig', () => {
  assert.equal(new Set(faelle.map((f) => f.fall)).size, faelle.length);
});

for (const f of faelle) {
  test(`Node: ${f.fall}`, () => {
    assert.equal(ausNode(f.fall), f.erwartet);
  });
}

// Löst Get-Revision über den Syntaxbaum aus dem Einrichtungsskript und wendet
// die Funktion auf jeden Ordner an.
const skript = join(arbeit, 'get-revision.ps1');
writeFileSync(
  skript,
  [
    "$ErrorActionPreference = 'Stop'",
    'Set-StrictMode -Version Latest',
    `$baum = [System.Management.Automation.Language.Parser]::ParseFile('${join(hier, 'android-sdk-einrichten.ps1').replaceAll("'", "''")}', [ref]$null, [ref]$null)`,
    '$baum.FindAll({ param($k) $k -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false) |',
    "    Where-Object { $_.Name -in @('Get-Revision', 'Get-RevisionsFeld') } |",
    '    ForEach-Object { . ([scriptblock]::Create($_.Extent.Text)) }',
    `Get-ChildItem -LiteralPath '${join(arbeit, 'faelle').replaceAll("'", "''")}' -Directory | ForEach-Object {`,
    `    try { $r = Get-Revision $_.FullName '${name}'; if ($null -eq $r) { $r = 'null' } } catch { $r = '${FEHLER}' }`,
    '    "$($_.Name)=$r"',
    '}',
  ].join('\r\n'),
);

for (const programm of ['pwsh', 'powershell']) {
  const lauf = spawnSync(programm, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', skript], { encoding: 'utf8' });
  const fehlt = lauf.error?.code === 'ENOENT';
  test(`${programm}: gleiche Ergebnisse wie erwartet`, { skip: fehlt ? `${programm} ist nicht vorhanden` : false }, () => {
    assert.equal(lauf.status, 0, lauf.stderr || lauf.stdout);
    const ergebnis = Object.fromEntries(
      lauf.stdout
        .trim()
        .split(/\r?\n/)
        .map((zeile) => [zeile.slice(0, zeile.indexOf('=')), zeile.slice(zeile.indexOf('=') + 1)]),
    );
    const erwartet = Object.fromEntries(faelle.filter((f) => !f.nurNode).map((f) => [f.fall, String(f.erwartet)]));
    const gefunden = Object.fromEntries(Object.keys(erwartet).map((fall) => [fall, ergebnis[fall]]));
    assert.deepEqual(gefunden, erwartet);
  });
}
