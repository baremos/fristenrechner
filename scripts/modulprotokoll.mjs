// Nur Herkunftsmetadaten; die Build-Ausgaben werden nicht verändert.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import { relativerPfad } from './hinweise-dritter.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sortiert = liste => [...liste].sort();

export function zerlegeKennung(id) {
  if (typeof id !== 'string') throw new Error('Modulprotokoll: ungültige Kennung.');
  const virtuell = id.startsWith('virtuell:');
  const wert = virtuell ? id.slice(9) : id;
  const [pfad, ...anhaenge] = wert.split('?');
  if (virtuell && /(?:^|[:/])[A-Za-z]:/.test(pfad)) throw new Error('Modulprotokoll: absolute virtuelle Kennung.');
  relativerPfad(virtuell ? pfad.replaceAll(':', '/') : pfad);
  const anhang = anhaenge.join('?');
  let dekodiert;
  try { dekodiert = decodeURIComponent(anhang); }
  catch { throw new Error('Modulprotokoll: ungültiger Abfrageanhang.'); }
  if (/[\\\x00-\x1f]/.test(dekodiert) || /(?:^|[\s:=?&#(])(?:\/|[A-Za-z]:)/.test(dekodiert)) {
    throw new Error('Modulprotokoll: absoluter Pfad im Abfrageanhang.');
  }
  return { pfad, anhang, virtuell };
}

export function paketort(id) {
  const { pfad, virtuell } = zerlegeKennung(id);
  if (virtuell) return null;
  const fund = [...pfad.matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)].at(-1);
  return fund ? pfad.slice(0, fund.index + fund[0].length) : null;
}

export function pruefeStilOderAsset(id) {
  const { pfad, anhang } = zerlegeKennung(id);
  if (paketort(id) && (!/\.(?:[cm]?[jt]sx?|json)$/.test(pfad)
      || /(?:^|&)(?:raw|url|inline|type=style)(?:[=&]|$)/.test(anhang))) {
    throw new Error('Modulprotokoll: Stil- oder Asset-Modul aus node_modules; Herkunftsabdeckung fehlt.');
  }
}

export function modulprotokoll(wurzel, { astro = false } = {}) {
  const basis = resolve(wurzel).replaceAll('\\', '/');
  const ordner = join(wurzel, 'app/.astro');
  const datei = join(ordner, 'module-client.json');
  const zwischen = datei + '.tmp';
  const chunks = new Map(), css = new Map(), graph = new Set();
  let begonnen = false, gescheitert = false;
  function entwerte() {
    mkdirSync(ordner, { recursive: true });
    rmSync(datei, { force: true }); rmSync(zwischen, { force: true });
    chunks.clear(); css.clear(); graph.clear();
    begonnen = true; gescheitert = false;
  }
  function kennung(id) {
    let wert = id.startsWith('\0') ? 'virtuell:' + id.slice(1) : id;
    const trennung = wert.indexOf('?');
    const pfad = (trennung < 0 ? wert : wert.slice(0, trennung)).replaceAll('\\', '/');
    wert = (pfad.startsWith(basis + '/') ? pfad.slice(basis.length + 1) : pfad)
      + (trennung < 0 ? '' : wert.slice(trennung));
    try { zerlegeKennung(wert); }
    catch { throw new Error('Modulprotokoll: Kennung außerhalb der Repositorywurzel.'); }
    return wert;
  }
  function daten(abgeschlossen) {
    return { formatVersion: 2, umgebung: 'client', abgeschlossen,
      chunks: [...chunks.values()].sort((a, b) => a.datei.localeCompare(b.datei, 'en')),
      cssAssets: [...css.values()].sort((a, b) => a.datei.localeCompare(b.datei, 'en')),
      modulgraph: sortiert(graph) };
  }
  function abschliessen(dist = join(wurzel, 'app/dist')) {
    if (!begonnen || gescheitert || !chunks.size) throw new Error('Modulprotokoll: kein vollständiger Client-Build.');
    for (const c of [...chunks.values(), ...css.values()]) {
      let bytes;
      try { bytes = readFileSync(join(dist, c.datei)); }
      catch { throw new Error('Modulprotokoll: protokollierte Ausgabedatei fehlt.'); }
      if (bytes.length !== c.groesse || sha(bytes) !== c.sha256) throw new Error('Modulprotokoll: Ausgabedatei weicht vom Build ab.');
    }
    writeFileSync(zwischen, JSON.stringify(daten(true), null, 2) + '\n', 'utf8');
    renameSync(zwischen, datei);
    begonnen = false;
  }
  return {
    name: 'hinweise-dritter:modulprotokoll', enforce: 'post',
    entwerte, abschliessen,
    buildStart() { if (!begonnen) entwerte(); },
    buildEnd(fehler) { if (fehler) { gescheitert = true; rmSync(datei, { force: true }); rmSync(zwischen, { force: true }); } },
    generateBundle(_optionen, bundle) {
      if (!begonnen) entwerte();
      try {
        // Auch nicht gerenderte Module und der Servergraph werden geprüft.
        for (const id of this.getModuleIds?.() ?? []) {
          if (isBuiltin(id)) continue;
          const wert = kennung(id); pruefeStilOderAsset(wert); graph.add(wert);
        }
        for (const c of Object.values(bundle)) {
          relativerPfad(c.fileName);
          if (c.type === 'asset' && c.fileName.endsWith('.css')) {
            const bytes = Buffer.from(c.source);
            const eintrag = { datei: c.fileName, groesse: bytes.length, sha256: sha(bytes) };
            if (css.has(c.fileName) && JSON.stringify(css.get(c.fileName)) !== JSON.stringify(eintrag)) throw new Error('Modulprotokoll: doppelte CSS-Ausgabe.');
            css.set(c.fileName, eintrag);
          }
          if (this.environment?.name !== 'client' || c.type !== 'chunk') continue;
          if (chunks.has(c.fileName)) throw new Error('Modulprotokoll: doppelte Client-Ausgabedatei.');
          const bytes = Buffer.from(c.code, 'utf8');
          const module = Object.entries(c.modules).map(([id, d]) => {
            const wert = kennung(id); pruefeStilOderAsset(wert); graph.add(wert);
            return { id: wert, renderedLength: d.renderedLength, ...(d.originalLength === undefined ? {} : { originalLength: d.originalLength }) };
          }).sort((a, b) => a.id.localeCompare(b.id, 'en'));
          for (const id of [...c.imports, ...c.dynamicImports]) relativerPfad(id);
          chunks.set(c.fileName, { datei: c.fileName, groesse: bytes.length, sha256: sha(bytes),
            einstieg: c.isEntry, dynamischerEinstieg: c.isDynamicEntry,
            imports: sortiert(c.imports), dynamischeImports: sortiert(c.dynamicImports), module });
        }
        writeFileSync(zwischen, JSON.stringify(daten(false), null, 2) + '\n', 'utf8');
      } catch (e) { gescheitert = true; rmSync(datei, { force: true }); rmSync(zwischen, { force: true }); throw e; }
    },
    writeBundle(optionen, bundle) {
      // Vite bearbeitet dynamische Importe noch nach generateBundle. Erst die
      // geschriebenen Bytes belegen die Ausgabe dieses Client-Schritts.
      for (const c of Object.values(bundle)) {
        const eintrag = this.environment?.name === 'client' && c.type === 'chunk' ? chunks.get(c.fileName)
          : c.type === 'asset' && c.fileName.endsWith('.css') ? css.get(c.fileName) : null;
        if (!eintrag) continue;
        const bytes = readFileSync(join(optionen.dir, c.fileName));
        eintrag.groesse = bytes.length; eintrag.sha256 = sha(bytes);
      }
      writeFileSync(zwischen, JSON.stringify(daten(false), null, 2) + '\n', 'utf8');
    },
    closeBundle() { if (!astro && !gescheitert && chunks.size) abschliessen(); },
  };
}

export function modulprotokollIntegration(plugin) {
  return { name: 'hinweise-dritter:abschluss', hooks: {
    'astro:build:start': () => plugin.entwerte(),
    'astro:build:done': ({ dir }) => plugin.abschliessen(fileURLToPath(dir)),
  } };
}
