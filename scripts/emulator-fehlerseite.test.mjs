import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fehlerseite } from './emulator/oberflaeche.mjs';
import { evaluiereFehlerseiteGegenprobe } from './emulator-auswertung.mjs';

const vorlage = JSON.parse(readFileSync(new URL('./emulator/fixtures/ohne-fehlerseite-api30-r4.json', import.meta.url), 'utf8'));

test('API 30: fehlender Ruhezustand verhindert den Baum, die Fehlerschleife ist unabhängig belegt', () => {
  assert.equal(vorlage.dump.code, 0);
  assert.match(vorlage.dump.err, /could not get idle state/);
  assert.equal(vorlage.lesen.code, 1);
  assert.match(vorlage.lesen.err, /No such file or directory/);
  assert.equal(evaluiereFehlerseiteGegenprobe(vorlage).status, 'bestanden');
  assert.equal(evaluiereFehlerseiteGegenprobe({ logcat: vorlage.dump.err }).status, 'ungültig');
  assert.equal(evaluiereFehlerseiteGegenprobe({ logcat: vorlage.logcat.split('\n')[0] }).status, 'ungültig');
});

async function gegenprobe({ logcatCode = 0, logcat = vorlage.logcat, ortFehler = false } = {}) {
  const schritte = new Map(), bilder = [], dateien = new Map();
  const ctx = {
    app: 'de.baremos.fristenrechner', varianten: { fehlerseite: 'fehlerseite.apk', 'ohne-fehlerseite': 'ohne-fehlerseite.apk' },
    uninstall: async () => {}, install: async () => {}, start: async () => {}, shell: async () => {}, sleep: async () => {},
    pruefung: async (name, fn) => schritte.set(name, fn),
    adb: async () => ({ code: logcatCode, out: logcat }),
    cdp: async () => ({ events: [], send: async () => {}, evaluate: async () => { if (ortFehler) throw new Error('Kontext beim Neuladen verloren'); return vorlage.ort; } }),
    save: (name, wert) => dateien.set(name, wert),
    shot: async (name, optionen) => {
      bilder.push({ name, optionen });
      if (name === 'ohne-fehlerseite.png' && optionen.ui !== false) throw new Error('Kein Ruhezustand für Ansichtsbaum');
    },
  };
  await fehlerseite(ctx);
  return { schritte, bilder, dateien };
}

test('Gegenprobe ohne Fehlerseite braucht keinen Baum und bewahrt Logcat und CDP', async () => {
  const u = await gegenprobe();
  assert.equal((await u.schritte.get('ohne-fehlerseite')()).status, 'bestanden');
  assert.deepEqual(u.bilder, [{ name: 'ohne-fehlerseite.png', optionen: { ui: false } }]);
  assert.equal(u.dateien.get('ohne-fehlerseite-logcat.txt'), vorlage.logcat);
  assert.deepEqual(u.dateien.get('ohne-fehlerseite.json').ort, vorlage.ort);
});

test('Gegenprobe behält den Nachweis auch bei durch Neuladen verlorenem CDP-Kontext', async () => {
  const u = await gegenprobe({ ortFehler: true });
  assert.equal((await u.schritte.get('ohne-fehlerseite')()).status, 'bestanden');
  assert.match(u.dateien.get('ohne-fehlerseite.json').ort.fehler, /Kontext/);
});

test('Fehler beim Lesen von Logcat wird nicht als erfolgreiche Gegenprobe gewertet', async () => {
  const u = await gegenprobe({ logcatCode: 1 });
  await assert.rejects(u.schritte.get('ohne-fehlerseite')(), /Logcat.*nicht lesbar/);
  assert.deepEqual(u.bilder, []);
});

test('Fehlender Baum allein begründet keine erfolgreiche Gegenprobe', async () => {
  const u = await gegenprobe({ logcat: vorlage.dump.err });
  assert.equal((await u.schritte.get('ohne-fehlerseite')()).status, 'ungültig');
});

test('Reguläre Fehlerseite prüft weiterhin den Ansichtsbaum im Screenshot', async () => {
  const u = await gegenprobe();
  await u.schritte.get('fehlerseite')();
  assert.deepEqual(u.bilder, [{ name: 'fehlerseite.png', optionen: { ui: true } }]);
});
