// Prüft den Python-Kern der Bash-Hülle ohne Netz und ohne gradlew.py auszuführen.
// Jede Prüfung enthält eine Gegenprobe mit einem erwarteten Fehler.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hier = dirname(fileURLToPath(import.meta.url));
const kern = join(hier, 'fdroid', 'gradlew-einrichten.py');
const python = ['python3', 'python'].find((name) => spawnSync(name, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)']).status === 0);
const vorlage = JSON.parse(readFileSync(join(hier, 'toolchain.json'), 'utf8'));
const probe = Buffer.from('raise RuntimeError("Diese Datei darf kein Test ausführen")\n');
const scratchpad = resolve(hier, '../scratchpad');
mkdirSync(scratchpad, { recursive: true });
const arbeit = mkdtempSync(join(scratchpad, 'gradlew-einrichten-test-'));
test.after(() => rmSync(arbeit, { recursive: true, force: true }));

// Nur der Benutzerordner und der HTTPS-Transport sind nachgestellt. Die Prüfung,
// das Schreiben, die Rechte und der Schutz vor Überschreiben sind der echte Kern.
const aufruf = String.raw`
import base64, io, json, os, runpy, sys, urllib.error
from pathlib import Path
from unittest.mock import patch
d = json.load(sys.stdin)
m = runpy.run_path(sys.argv[1], run_name="einrichtung_test")
aufrufe = []
class Transport:
    def open(self, url, timeout):
        aufrufe.append(url)
        if d.get("netzfehler"):
            raise urllib.error.URLError("nachgestellter Abbruch")
        if d.get("kollision"):
            ziel = Path(d["kollision"])
            ziel.mkdir()
            (ziel / "behalten.txt").write_text("nicht ersetzen")
        return io.BytesIO(base64.b64decode(d["inhalt"]))
with patch("pathlib.Path.home", return_value=Path(d["home"])), patch.dict(os.environ, {"XDG_DATA_HOME": d.get("xdg", "")}), patch("urllib.request.build_opener", return_value=Transport()):
    code = m["main"](d["args"])
print("TEST_BEOBACHTUNG=" + json.dumps(aufrufe), file=sys.stderr)
sys.exit(code)
`;

function fall({ aenderung = {}, bestehend, leer = false } = {}) {
  const ordner = mkdtempSync(join(arbeit, 'fall-'));
  const home = join(ordner, 'benutzer');
  const basis = join(home, 'Werkzeuge ü');
  mkdirSync(home);
  const daten = structuredClone(vorlage);
  daten.gradlewFdroid.sha256 = createHash('sha256').update(probe).digest('hex');
  Object.assign(daten.gradlewFdroid, aenderung);
  const vorgabe = join(ordner, 'toolchain.json');
  writeFileSync(vorgabe, JSON.stringify(daten));
  const ziel = join(basis, vorlage.gradlewFdroid.commit);
  if (bestehend !== undefined || leer) {
    mkdirSync(ziel, { recursive: true });
    if (bestehend !== undefined) {
      writeFileSync(join(ziel, 'gradlew.py'), bestehend);
      chmodSync(join(ziel, 'gradlew.py'), 0o755);
    }
  }
  return { ordner, home, basis, daten, vorgabe, ziel };
}

function laufe(f, optionen = {}) {
  const args = [f.vorgabe];
  if (!optionen.standard) args.push('--ziel', optionen.ziel ?? f.basis);
  args.push(...(optionen.args ?? ['--probelauf']));
  const ergebnis = spawnSync(python, ['-B', '-c', aufruf, kern], {
    input: JSON.stringify({ ...optionen, home: f.home, args, inhalt: (optionen.inhalt ?? probe).toString('base64') }),
    encoding: 'utf8',
    env: { ...process.env, TEMP: arbeit, TMP: arbeit, PYTHONIOENCODING: 'utf-8' },
  });
  const gefunden = /TEST_BEOBACHTUNG=(.*)/.exec(ergebnis.stderr);
  assert.ok(gefunden, ergebnis.stdout + ergebnis.stderr);
  return { code: ergebnis.status, text: ergebnis.stdout + ergebnis.stderr, netz: JSON.parse(gefunden[1]) };
}

function paar(name, pruefung) {
  test(name, { skip: !python && 'Python ab 3.9 fehlt' }, pruefung);
}

paar('Probelauf schreibt und lädt nichts; Gegenprobe mit fehlender Prüfsumme', () => {
  const f = fall();
  const ok = laufe(f);
  assert.equal(ok.code, 0, ok.text);
  assert.deepEqual(ok.netz, []);
  assert.equal(existsSync(f.basis), false);
  const falsch = laufe(fall({ aenderung: { sha256: '' } }));
  assert.equal(falsch.code, 65);
  assert.deepEqual(falsch.netz, []);
});

paar('Vorhandener Stand wird geprüft; Gegenprobe verändert ein Byte', () => {
  const ok = laufe(fall({ bestehend: probe }), { args: ['--nur-pruefen'] });
  assert.equal(ok.code, 0, ok.text);
  assert.deepEqual(ok.netz, []);
  const f = fall({ bestehend: Buffer.from('abweichend') });
  const falsch = laufe(f, { args: ['--nur-pruefen'] });
  assert.equal(falsch.code, 65);
  assert.match(falsch.text, /Prüfsumme weicht ab/);
  assert.equal(readFileSync(join(f.ziel, 'gradlew.py'), 'utf8'), 'abweichend');
});

paar('Bestehende Einrichtung lädt nicht; Gegenprobe leerer vorhandener Ordner', () => {
  const ok = laufe(fall({ bestehend: probe }), { args: [] });
  assert.equal(ok.code, 0, ok.text);
  assert.deepEqual(ok.netz, []);
  const f = fall({ leer: true });
  const falsch = laufe(f, { args: [] });
  assert.equal(falsch.code, 65);
  assert.deepEqual(falsch.netz, []);
  assert.deepEqual(readdirSync(f.ziel), []);
});

paar('Nur-Prüfen akzeptiert vorhandene Datei; Gegenprobe fehlender Stand', () => {
  assert.equal(laufe(fall({ bestehend: probe }), { args: ['--nur-pruefen'] }).code, 0);
  const f = fall();
  const falsch = laufe(f, { args: ['--nur-pruefen'] });
  assert.equal(falsch.code, 66);
  assert.deepEqual(falsch.netz, []);
  assert.equal(existsSync(f.basis), false);
});

paar('Nachgestellter HTTPS-Download wird geprüft; Gegenprobe falscher Inhalt', () => {
  const f = fall();
  const ok = laufe(f, { args: [] });
  assert.equal(ok.code, 0, ok.text);
  assert.deepEqual(ok.netz, [`${f.daten.gradlewFdroid.quelle}/-/raw/${f.daten.gradlewFdroid.commit}/gradlew.py`]);
  assert.deepEqual(readFileSync(join(f.ziel, 'gradlew.py')), probe);
  const g = fall();
  const falsch = laufe(g, { args: [], inhalt: Buffer.from('falsch') });
  assert.equal(falsch.code, 65);
  assert.equal(existsSync(g.ziel), false);
});

paar('Download kann eingerichtet werden; Gegenprobe Transportabbruch', () => {
  assert.equal(laufe(fall(), { args: [] }).code, 0);
  const f = fall();
  const falsch = laufe(f, { args: [], netzfehler: true });
  assert.equal(falsch.code, 74);
  assert.equal(existsSync(f.ziel), false);
});

paar('Neues Ziel ist exklusiv; Gegenprobe konkurrierend angelegter Ordner', () => {
  assert.equal(laufe(fall(), { args: [] }).code, 0);
  const f = fall();
  const falsch = laufe(f, { args: [], kollision: f.ziel });
  assert.equal(falsch.code, 74);
  assert.equal(readFileSync(join(f.ziel, 'behalten.txt'), 'utf8'), 'nicht ersetzen');
  assert.equal(existsSync(join(f.ziel, 'gradlew.py')), false);
});

paar('Ziel im Benutzerordner mit Leerzeichen und Umlaut; Gegenprobe außerhalb', () => {
  const f = fall();
  assert.equal(laufe(f).code, 0);
  const falsch = laufe(f, { ziel: join(f.ordner, 'system') });
  assert.equal(falsch.code, 64);
  assert.deepEqual(falsch.netz, []);
  assert.equal(existsSync(join(f.ordner, 'system')), false);
});

paar('XDG_DATA_HOME im Benutzerbereich; Gegenprobe relativer XDG-Pfad', () => {
  const f = fall();
  const ok = laufe(f, { standard: true, xdg: join(f.home, 'daten') });
  assert.equal(ok.code, 0, ok.text);
  assert.ok(ok.text.includes(join(f.home, 'daten', 'fristenrechner', 'gradlew-fdroid')));
  const falsch = laufe(f, { standard: true, xdg: 'relativer-pfad' });
  assert.equal(falsch.code, 64);
});

for (const [name, aenderung] of [
  ['HTTPS-Quelle', { quelle: 'http://gitlab.com/fdroid/gradlew-fdroid' }],
  ['Commit', { commit: '../anderer-stand' }],
  ['Programmdatei', { datei: '../fremd.py' }],
  ['Benutzerpfad', { benutzerOrdner: '../system' }],
  ['Lizenzangabe', { lizenz: 'unbekannt' }],
]) {
  paar(`Gültige ${name}; Gegenprobe ungültige Festlegung`, () => {
    assert.equal(laufe(fall()).code, 0);
    const falsch = laufe(fall({ aenderung }));
    assert.equal(falsch.code, 65);
    assert.deepEqual(falsch.netz, []);
  });
}

paar('Python-Version reicht; Gegenprobe unerfüllbare Mindestversion', () => {
  assert.equal(laufe(fall()).code, 0);
  const falsch = laufe(fall({ aenderung: { pythonMindestens: '999.0' } }));
  assert.equal(falsch.code, 69);
  assert.deepEqual(falsch.netz, []);
});

paar('Ein Lesemodus; Gegenprobe widersprüchliche Modi', () => {
  assert.equal(laufe(fall()).code, 0);
  assert.equal(laufe(fall(), { args: ['--probelauf', '--nur-pruefen'] }).code, 64);
});

paar('Vollständiger Aufruf; Gegenprobe unbekannter Schalter und fehlendes Ziel', () => {
  assert.equal(laufe(fall()).code, 0);
  assert.equal(laufe(fall(), { args: ['--fremd'] }).code, 64);
  assert.equal(laufe(fall(), { args: ['--ziel'] }).code, 64);
});

paar('HTTPS-Umleitung bleibt erlaubt; Gegenprobe unverschlüsselte Umleitung', () => {
  const code = String.raw`
import runpy, sys, urllib.request
m = runpy.run_path(sys.argv[1], run_name="einrichtung_test")
h = m["NurHTTPS"]()
r = urllib.request.Request("https://gitlab.com/quelle")
try:
    ziel = h.redirect_request(r, None, 302, "Found", {}, sys.argv[2])
    assert ziel.full_url == sys.argv[2]
except m["Fehler"]:
    sys.exit(65)
`;
  const ok = spawnSync(python, ['-B', '-c', code, kern, 'https://gitlab.com/datei']);
  assert.equal(ok.status, 0, ok.stderr.toString());
  const falsch = spawnSync(python, ['-B', '-c', code, kern, 'http://gitlab.com/datei']);
  assert.equal(falsch.status, 65);
});
