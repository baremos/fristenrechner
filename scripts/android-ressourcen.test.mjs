// XML-Grundregeln der eingecheckten Android-Ressourcen und des Manifests, ohne Gradle.
// Der Ressourcen-Build bricht an Fehlern ab, die npm test sonst nicht sieht.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const haupt = join(wurzel, 'app/android/app/src/main');

function xmlDateien(ordner) {
  const dateien = [];
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) dateien.push(...xmlDateien(pfad));
    else if (name.endsWith('.xml')) dateien.push(pfad);
  }
  return dateien;
}

export function xmlBefunde(text) {
  const befunde = [];
  if (!/^<\?xml version="1\.0" encoding="utf-8"\?>/i.test(text.replace(/^﻿/, '')) && !text.trimStart().startsWith('<')) {
    befunde.push('beginnt nicht mit XML');
  }
  for (const kommentar of text.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (kommentar[1].includes('--')) befunde.push('Kommentar enthält "--"');
    if (kommentar[1].endsWith('-')) befunde.push('Kommentar endet mit "-"');
  }
  const ohneKommentare = text.replace(/<!--[\s\S]*?-->/g, '');
  if (ohneKommentare.includes('<!--')) befunde.push('nicht geschlossener Kommentar');
  return befunde;
}

test('Android-Ressourcen und Manifest halten die XML-Kommentarregeln ein', () => {
  const dateien = [join(haupt, 'AndroidManifest.xml'), ...xmlDateien(join(haupt, 'res'))];
  assert.ok(dateien.length >= 5, 'XML-Dateien gefunden: ' + dateien.length);
  const fehler = dateien.flatMap((datei) => xmlBefunde(readFileSync(datei, 'utf8')).map((b) => relative(wurzel, datei) + ': ' + b));
  assert.deepEqual(fehler, []);
});

test('Gegenproben: verbotene Kommentarformen werden erkannt', () => {
  assert.deepEqual(xmlBefunde('<?xml version="1.0" encoding="utf-8"?>\n<a><!-- gut --></a>'), []);
  assert.deepEqual(xmlBefunde('<a><!-- entspricht --app-flaeche --></a>'), ['Kommentar enthält "--"']);
  assert.deepEqual(xmlBefunde('<a><!-- Ende ---></a>'), ['Kommentar endet mit "-"']);
  assert.deepEqual(xmlBefunde('<a><!-- offen </a>'), ['nicht geschlossener Kommentar']);
});
