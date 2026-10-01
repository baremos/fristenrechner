// SPDX-License-Identifier: Apache-2.0
// UID-Beobachtung über das ganze Dateifenster, einschließlich nativer Auswahlen.
import { befund, zusammenfassen, evaluiereProcNet, evaluiereNetstats } from '../emulator-auswertung.mjs';
import { netzGueltigkeit } from './pruefungen.mjs';

const protokolle = ['tcp', 'tcp6', 'udp', 'udp6'];
const zahl = n => Number.isSafeInteger(n) && n >= 0;
const paketMuster = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

async function paketUid(ctx, paket) {
  if (!paketMuster.test(paket)) throw new Error('Ungültige Paketkennung.');
  const text = await ctx.shell(`pm list packages -U ${paket}`);
  const zeile = text.split('\n').filter(z => z.startsWith(`package:${paket} `));
  const m = zeile.length === 1 && /\buid:(\d+)$/.exec(zeile[0]);
  if (!m || !zahl(Number(m[1])) || Number(m[1]) === 0) throw new Error('Paket-UID fehlt.');
  return Number(m[1]);
}

export function evalDateienNetz(m) {
  const ungueltig = grund => befund('ungültig', grund);
  if (!m || m.schema !== 1 || ![30, 36].includes(m.api) || !['debug', 'release'].includes(m.variante)
    || !paketMuster.test(m.paket ?? '') || !zahl(m.uid) || !m.uid || !zahl(m.gegenUid) || !m.gegenUid || m.uid === m.gegenUid
    || !zahl(m.annahmen) || !zahl(m.start) || !zahl(m.ende) || m.ende < m.start || m.abgeschlossen !== true
    || !Array.isArray(m.proben) || m.proben.length < 2 || m.proben.some(p => !p || typeof p !== 'object')
    || !Array.isArray(m.fehler) || m.fehler.length) return ungueltig('Datei-Netzfenster fehlt, wurde abgebrochen oder ist unvollständig.');
  if (![m.vorher, m.nachher].every(g => zahl(g?.annahmen) && g.annahmen > 0)) return ungueltig('Netzmelder vor und nach dem Dateifenster nicht durch die Gegenprobe bestätigt.');
  if (m.proben[0].zeit !== m.start || m.proben.at(-1).zeit !== m.ende) return ungueltig('Netzproben decken Anfang und Ende des Dateifensters nicht ab.');
  for (let i = 0; i < m.proben.length; i++) {
    const p = m.proben[i];
    if (!zahl(p.zeit) || p.zeit < m.start || p.zeit > m.ende || (i && (p.zeit < m.proben[i - 1].zeit || p.zeit - m.proben[i - 1].zeit > 15000))) return ungueltig('Ungültige Zeitfolge oder Beobachtungslücke über 15 Sekunden im Datei-Netzfenster.');
  }
  const einzel = m.proben.map(p => evaluiereProcNet({ uid: m.uid, tabellen: p.tabellen, gegenprobe: { uid: m.gegenUid, tabellen: m.vorher.tabellen } }));
  if (m.annahmen) einzel.push(befund('nicht bestanden', 'Der Netzmelder nahm während der Dateiwege eine Verbindung an.'));
  if (m.api === 36) einzel.push(evaluiereNetstats({ api: m.api, uid: m.uid, gegenUid: m.gegenUid, vorher: m.netstatsVorher, nachher: m.netstatsNachher }));
  const ergebnis = zusammenfassen(einzel);
  if (ergebnis.status !== 'bestanden') return befund(ergebnis.status, 'Datei-Netzbeobachtung enthält Fehler oder ungültige Messungen.', { einzel });
  if (m.api === 30) return befund('dokumentierte Grenze', 'API 30: Netzmelder und UID-Socketproben unauffällig; netstats liefert keine auswertbaren UID-Zähler. Kurze Verbindungen zwischen den Proben sind damit nicht ausgeschlossen.', { proben: m.proben.length });
  return befund('bestanden', 'Netzmelder unverändert, keine externen App-UID-Sockets in den Proben und keine Zählerzunahme während der Dateiwege.', { proben: m.proben.length, fremdeUids: 'Empfänger-, Provider-, WebView- und Systemverkehr nicht der App zugerechnet.' });
}

export async function mitDateienNetz(ctx, variante, arbeit) {
  if (!['debug', 'release'].includes(variante)) throw new Error('Unbekannte Datei-Netzvariante.');
  const name = `dateien-netz-${variante}`;
  const m = { schema: 1, api: ctx.api, variante, paket: ctx.app, proben: [], fehler: [], abgeschlossen: false };
  let ende = false, messung;
  const probe = async () => {
    const tabellen = {};
    for (const typ of protokolle) tabellen[typ] = await ctx.shell(`cat /proc/net/${typ}`);
    const p = { zeit: Date.now(), tabellen }; m.proben.push(p); return p.zeit;
  };
  try {
    m.uid = await paketUid(ctx, ctx.app); m.gegenUid = await paketUid(ctx, ctx.gegen);
    m.vorher = await netzGueltigkeit(ctx, name + '-vorher');
    if (!zahl(m.vorher?.annahmen) || m.vorher.annahmen < 1) throw new Error('Netzgegenprobe vor Dateiwegen fehlgeschlagen.');
    m.netstatsVorher = await ctx.shell('dumpsys netstats detail');
    const count = ctx.netz.count;
    m.start = await probe();
    messung = (async () => {
      while (!ende) {
        await ctx.sleep(2000);
        if (!ende) await probe();
      }
    })().catch(e => { m.fehler.push(e.message); });
    await ctx.start(ctx.app);
    const wert = await arbeit();
    ende = true; await messung;
    m.ende = await probe(); m.annahmen = ctx.netz.count - count;
    m.netstatsNachher = await ctx.shell('dumpsys netstats detail');
    m.nachher = await netzGueltigkeit(ctx, name + '-nachher');
    m.abgeschlossen = true;
    return wert;
  } catch (e) { m.fehler.push(e.message); throw e; }
  finally {
    ende = true; if (messung) await messung;
    ctx.save(`${name}.json`, m);
    ctx.befund(`D12-netz-${variante}`, evalDateienNetz(m));
  }
}
