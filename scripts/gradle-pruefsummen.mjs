// Formprüfung der Gradle-Verifikation; optionaler Abgleich mit lokalen Belegen.
// Ohne --cache/--liste: nur öffentliche Projektdateien, kein Netz und kein Gradle.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseQuellXml } from './xml-quelle.mjs';

export const DATEI = fileURLToPath(new URL('../app/android/gradle/verification-metadata.xml', import.meta.url));
export const TRUST_MUSTER = Object.freeze(['.*-javadoc[.]jar', '.*-sources[.]jar']);

// Exakte Gruppen, keine Präfixfreigabe. Grundlage: docs/lizenzen.md (Laufzeit),
// AGP 8.13.0 samt POM-/Modulbaum im Cache, dessen UtpDependency-Registry und
// die Testkonfigurationen von @capacitor/android 8.5.2. Das ist keine
// Lizenzfreigabe oder Herkunftsgarantie.
// Neue Gruppen verlangen einen Abgleich des Abhängigkeitswegs und ein Review.
export const ERWARTETE_GRUPPEN = Object.freeze(Object.fromEntries([
  ['AndroidX aus App-, Capacitor- und transitiven Testkonfigurationen', `
    androidx.activity androidx.annotation androidx.appcompat androidx.arch.core
    androidx.collection androidx.concurrent androidx.coordinatorlayout androidx.core
    androidx.cursoradapter androidx.customview androidx.drawerlayout androidx.emoji2
    androidx.fragment androidx.interpolator androidx.lifecycle androidx.loader
    androidx.profileinstaller androidx.resourceinspection androidx.savedstate
    androidx.startup androidx.tracing androidx.vectordrawable androidx.versionedparcelable
    androidx.viewpager androidx.webkit`],
  ['AndroidX-Instrumentierungstests von Capacitor (JUnit und Espresso)', `
    androidx.test androidx.test.espresso androidx.test.ext androidx.test.services`],
  ['Android-Gradle-Plugin, Lint, Databinding und deren Android-Werkzeuge', `
    androidx.databinding com.android com.android.databinding com.android.tools
    com.android.tools.analytics-library com.android.tools.build com.android.tools.build.jetifier
    com.android.tools.ddms com.android.tools.emulator com.android.tools.external.com-intellij
    com.android.tools.external.org-jetbrains com.android.tools.layoutlib com.android.tools.lint
    com.android.tools.utp com.google.testing.platform`],
  ['Kotlin, Coroutines und Nullbarkeitsannotationen in Laufzeit und Werkzeugbaum', `
    org.jetbrains org.jetbrains.kotlin org.jetbrains.kotlinx org.jspecify
    org.checkerframework com.google.code.findbugs com.google.j2objc`],
  ['Cordova-Laufzeit aus Capacitor', 'org.apache.cordova'],
  ['Guava mit Transitiven, Laufzeit und Android-Werkzeuge', 'com.google.guava'],
  ['JUnit-/Mockito-Testkonfigurationen einschließlich BOM und Transitiven', `
    junit org.junit org.hamcrest org.mockito org.objenesis net.bytebuddy org.json`],
  ['AGP-Transport, RPC, Protobuf und deren Transitiven', `
    com.google.api.grpc com.google.protobuf io.grpc io.netty io.opencensus io.perfmark
    org.apache.httpcomponents commons-codec commons-logging`],
  ['AGP-/Lint-Datenformate, XML, Archive und native Schnittstellen', `
    com.google.code.gson com.google.flatbuffers com.google.jimfs com.googlecode.juniversalchardet
    com.sun.activation com.sun.istack com.sun.xml.bind com.sun.xml.bind.mvn com.sun.xml.fastinfoset
    commons-io jakarta.activation jakarta.xml.bind net.java.dev.jna net.sf.kxml
    org.apache.commons org.glassfish.jaxb org.jdom org.jvnet.staxex`],
  ['AGP-/Lint-Codeerzeugung, Annotationen und Analysewerkzeuge', `
    com.google.android com.google.auto com.google.auto.service com.google.auto.value
    com.google.dagger com.google.errorprone com.squareup javax.annotation javax.inject
    net.sf.jopt-simple org.codehaus.groovy org.codehaus.mojo org.ow2.asm org.slf4j
    org.tensorflow`],
  ['Signier-/Kryptografiewerkzeuge im AGP-Baum', `
    com.google.crypto.tink org.bitbucket.b_c org.bouncycastle`],
  ['Übergeordnete POM-Metadaten der genannten Werkzeuge und Tests', `
    net.java org.apache org.eclipse.ee4j org.ow2 org.sonatype.oss`],
].flatMap(([grund, gruppen]) => gruppen.trim().split(/\s+/).map(gruppe => [gruppe, grund]))));

const WURZEL_ATTRIBUTE = {
  xmlns: 'https://schema.gradle.org/dependency-verification',
  'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  'xsi:schemaLocation': 'https://schema.gradle.org/dependency-verification https://schema.gradle.org/dependency-verification/dependency-verification-1.3.xsd',
};
const SHA256 = /^[0-9a-f]{64}$/i;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/;
const leer = text => /^[ \t\r\n]*$/.test(text ?? '');
const trimXml = text => (text ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
const kennung = a => `${a.gruppe}:${a.name}:${a.version}/${a.datei}`;

/** Prüft den einmal gelesenen JDK-Baum geschlossen, ohne Dateien nachzuladen. */
export function pruefeGradleBaum(baum) {
  const fehler = [], artefakte = [], gruppen = new Set(), komponenten = new Set();
  const form = (k, name, erlaubt = [], pflicht = erlaubt, textwert = false) => {
    if (k.name !== name) fehler.push(`${name}: unerwartetes Element ${k.name}.`);
    if (!textwert && !leer(k.text)) fehler.push(`${name}: kein Textwert erlaubt.`);
    for (const a of Object.keys(k.attribute)) {
      if (!erlaubt.includes(a)) fehler.push(`${name}: Attribut ${a} ist nicht erlaubt.`);
    }
    for (const a of pflicht) {
      if (typeof k.attribute[a] !== 'string' || !k.attribute[a].trim()) fehler.push(`${name}: Attribut ${a} fehlt oder ist leer.`);
    }
  };
  const genau = (k, namen) => {
    for (const name of namen) {
      if (k.kinder.filter(c => c.name === name).length !== 1) fehler.push(`${k.name}: genau ein ${name} erwartet.`);
    }
    for (const c of k.kinder) {
      if (!namen.includes(c.name)) fehler.push(`${k.name}: ${c.name} ist nicht erlaubt.`);
    }
  };
  form(baum, '#');
  genau(baum, ['verification-metadata']);
  const wurzel = baum.kinder.find(k => k.name === 'verification-metadata');
  if (!wurzel) return { fehler, artefakte, komponenten: 0, gruppen: [] };
  form(wurzel, 'verification-metadata', Object.keys(WURZEL_ATTRIBUTE));
  for (const [name, soll] of Object.entries(WURZEL_ATTRIBUTE)) {
    if (wurzel.attribute[name] !== soll) fehler.push(`verification-metadata: ${name} weicht von der Vorgabe ab.`);
  }
  genau(wurzel, ['configuration', 'components']);
  for (const config of wurzel.kinder.filter(k => k.name === 'configuration')) {
    form(config, 'configuration');
    genau(config, ['verify-metadata', 'verify-signatures', 'trusted-artifacts']);
    for (const [name, soll] of [['verify-metadata', 'true'], ['verify-signatures', 'false']]) {
      for (const k of config.kinder.filter(c => c.name === name)) {
        form(k, name, [], [], true);
        if (k.kinder.length || trimXml(k.text) !== soll) fehler.push(`${name} muss ${soll} sein und darf keine Elemente enthalten.`);
      }
    }
    for (const trusted of config.kinder.filter(k => k.name === 'trusted-artifacts')) {
      form(trusted, 'trusted-artifacts');
      const muster = [];
      for (const trust of trusted.kinder) {
        form(trust, 'trust', ['file', 'regex']);
        if (trust.kinder.length || trust.attribute.regex !== 'true') fehler.push('trust: regex muss true sein; keine Kindelemente erlaubt.');
        muster.push(trust.attribute.file);
      }
      if (muster.length !== 2 || TRUST_MUSTER.some(m => muster.filter(w => w === m).length !== 1)) {
        fehler.push('trusted-artifacts: genau die zwei Muster für -sources.jar und -javadoc.jar erwartet.');
      }
    }
  }
  for (const liste of wurzel.kinder.filter(k => k.name === 'components')) {
    form(liste, 'components');
    if (!liste.kinder.length) fehler.push('components: mindestens eine Komponente erwartet.');
    for (const c of liste.kinder) {
      form(c, 'component', ['group', 'name', 'version']);
      const { group: gruppe, name, version } = c.attribute;
      for (const [feld, wert] of Object.entries(c.attribute)) {
        if (!SEGMENT.test(wert)) fehler.push(`component: ungültiger Wert für ${feld}.`);
      }
      if (!Object.hasOwn(ERWARTETE_GRUPPEN, gruppe)) fehler.push(`Unbekannte Gruppe: ${gruppe}.`);
      gruppen.add(gruppe);
      const gav = JSON.stringify([gruppe, name, version]);
      if (komponenten.has(gav)) fehler.push(`Doppelte Komponente: ${gruppe}:${name}:${version}.`);
      komponenten.add(gav);
      if (!c.kinder.length) fehler.push(`component ${gruppe}:${name}:${version}: mindestens ein Artefakt erwartet.`);
      const dateien = new Set();
      for (const a of c.kinder) {
        form(a, 'artifact', ['name']);
        const datei = a.attribute.name;
        if (!SEGMENT.test(datei)) fehler.push('artifact: ungültiger Dateiname.');
        if (dateien.has(datei)) fehler.push(`Doppeltes Artefakt: ${gruppe}:${name}:${version}/${datei}.`);
        dateien.add(datei);
        genau(a, ['sha256']);
        for (const sha of a.kinder.filter(k => k.name === 'sha256')) {
          form(sha, 'sha256', ['value', 'origin', 'reason'], ['value']);
          if (sha.kinder.length) fehler.push('sha256: keine Kindelemente erlaubt (auch kein also-trust).');
          if (!SHA256.test(sha.attribute.value)) fehler.push('sha256: genau 64 Hex-Zeichen erwartet.');
          artefakte.push({ gruppe, name, version, datei, sha256: sha.attribute.value?.toLowerCase() });
        }
      }
    }
  }
  return { fehler, artefakte, komponenten: komponenten.size, gruppen: [...gruppen].sort() };
}

function statistik() { return { artefakte: 0, dateien: 0, gleich: 0, abweichend: 0, fehlend: 0, fehler: [] }; }

/** Alle gefundenen Kopien prüfen; eine passende Kopie verdeckt keine abweichende. */
export function vergleicheCache(artefakte, cache) {
  const aus = statistik();
  if (!statSync(cache).isDirectory()) throw new Error('Gradle-Cache: ein Ordner files-2.1 erwartet.');
  for (const a of artefakte) {
    const ordner = join(cache, a.gruppe, a.name, a.version);
    const dateien = existsSync(ordner) ? readdirSync(ordner, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => join(ordner, e.name, a.datei)).filter(p => existsSync(p)) : [];
    aus.artefakte++;
    if (!dateien.length) aus.fehlend++;
    for (const datei of dateien) {
      aus.dateien++;
      const hash = createHash('sha256').update(readFileSync(datei)).digest('hex');
      if (hash === a.sha256) aus.gleich++;
      else {
        aus.abweichend++;
        aus.fehler.push(`Cache: abweichende SHA-256 für ${kennung(a)}.`);
      }
    }
  }
  return aus;
}

// Pfade der Liste müssen auf group/name/version/hash/datei enden; ein gleicher
// Dateiname aus anderen Koordinaten ist kein Beleg. Absolute Präfixe bleiben privat.
function listenKennung(pfad) {
  const teile = pfad.replaceAll('\\', '/').split('/');
  if (teile.length < 5 || teile.slice(-5).some(t => !SEGMENT.test(t))) return null;
  const [gruppe, name, version, , datei] = teile.slice(-5);
  return kennung({ gruppe, name, version, datei });
}

/** sha256  pfad; zusätzlich die Erhebung: pfad<TAB>bytes<TAB>sha256. */
export function vergleicheListe(artefakte, text) {
  const aus = statistik(), eintraege = new Map();
  for (const [i, zeile] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!zeile.trim()) continue;
    const standard = /^([0-9a-f]{64})[ \t]+(.+)$/i.exec(zeile);
    const erhebung = /^(.*?)\t[0-9]+\t([0-9a-f]{64})$/i.exec(zeile);
    const hash = standard?.[1] ?? erhebung?.[2], pfad = standard?.[2] ?? erhebung?.[1];
    const id = pfad && listenKennung(pfad);
    if (!id || !hash) { aus.fehler.push(`Liste: ungültige Zeile ${i + 1}.`); continue; }
    const werte = eintraege.get(id) ?? [];
    werte.push(hash.toLowerCase());
    eintraege.set(id, werte);
  }
  for (const a of artefakte) {
    aus.artefakte++;
    const werte = eintraege.get(kennung(a)) ?? [];
    if (!werte.length) aus.fehlend++;
    for (const hash of werte) {
      aus.dateien++;
      if (hash === a.sha256) aus.gleich++;
      else { aus.abweichend++; aus.fehler.push(`Liste: abweichende SHA-256 für ${kennung(a)}.`); }
    }
  }
  return aus;
}

export function pruefeGradlePruefsummen({ datei = DATEI, umgebung = process.env } = {}) {
  if (!existsSync(datei)) return { fehler: ['verification-metadata.xml fehlt.'], artefakte: [], komponenten: 0, gruppen: [] };
  return pruefeGradleBaum(leseQuellXml(datei, undefined, umgebung, { textwerte: true }));
}

export function aufruf(argumente) {
  const optionen = {};
  for (let i = 0; i < argumente.length; i++) {
    const name = argumente[i];
    if (!['--cache', '--liste'].includes(name) || optionen[name] || !argumente[i + 1] || argumente[i + 1].startsWith('--')) {
      throw new Error('Aufruf: node scripts/gradle-pruefsummen.mjs [--cache <files-2.1>] [--liste <Datei>]');
    }
    optionen[name] = resolve(argumente[++i]);
  }
  return optionen;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let optionen;
  try { optionen = aufruf(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 64; }
  if (optionen) {
    try {
      const form = pruefeGradlePruefsummen();
      const fehler = [...form.fehler];
      console.log(`Form: ${form.komponenten} Komponenten, ${form.artefakte.length} Artefakte, ${form.gruppen.length} Gruppen, ${fehler.length} Fehler.`);
      if (!fehler.length) {
        for (const [schalter, titel, pruefen] of [
          ['--cache', 'Cache', pfad => vergleicheCache(form.artefakte, pfad)],
          ['--liste', 'Liste', pfad => vergleicheListe(form.artefakte, readFileSync(pfad, 'utf8'))],
        ]) {
          if (!optionen[schalter]) continue;
          const aus = pruefen(optionen[schalter]);
          console.log(`${titel}: ${aus.artefakte} Artefakte, ${aus.dateien} Belegdateien, ${aus.gleich} gleich, ${aus.abweichend} abweichend; Hinweis: ${aus.fehlend} Artefakte ohne Belegdatei.`);
          fehler.push(...aus.fehler);
        }
      }
      for (const f of fehler) console.error(f);
      if (fehler.length) process.exitCode = 1;
    } catch (e) {
      // Dateisystemfehler enthalten private Pfade; nur den Fehlercode ausgeben.
      console.error(e.code ? `Prüfsummenprüfung: Datei nicht lesbar (${e.code}).` : e.message);
      process.exitCode = 1;
    }
  }
}
