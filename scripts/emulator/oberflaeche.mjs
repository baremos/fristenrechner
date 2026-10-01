import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hinweisGrenze } from '../../app/src/rechtsstand-hinweis.ts';
import { STATUS, SICHTPRUEFUNGEN, sichtpruefungAusstehend, befund, evaluiereBeobachtungen, evaluiereBarrierebaum, evaluiereUeberlauf, evaluiereFehlerseite, evaluiereBruecke, evaluiereFehlerfalleGegenprobe, evaluiereTastatur, evaluiereFehlerseiteGegenprobe, evaluiereZurueck } from '../emulator-auswertung.mjs';
import { navigation, netz } from './pruefungen.mjs';
import { ohneGradleKommentare } from '../app-pruefungen.mjs';

export function dateiMethodenVertrag(java) {
  const quelltext = ohneGradleKommentare(java);
  const erwartet = ['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeAbschliessen', 'ausgabeVerwerfen', 'speichernUnter', 'teilen', 'projektWaehlen', 'zuruecksetzenBestaetigen'].sort();
  const methoden = [...quelltext.matchAll(/@PluginMethod\s+public\s+void\s+(\w+)\s*\(PluginCall\s+call\)/g)].map(m => m[1]).sort();
  if ((quelltext.match(/@PluginMethod\b/g) ?? []).length !== erwartet.length || JSON.stringify(methoden) !== JSON.stringify(erwartet)) throw new Error('Dateiablauf enthält unbekannte Brücken- oder Testmethoden.');
  return methoden;
}

// Selektoren belegt durch packages/oberflaeche/src/Fristenrechner.astro:
// #schedule-form, name=..., submit, #schedule-table-body, #result-regelstand.
// Speichern/Wiederherstellen: fristenrechner-ui.ts und erzeugeWebSpeicher.
// Hinweis/Fehlerfalle: app/src/pages/index.astro und rechtsstand-anzeige.ts.
// App-Plattform: Ausgabe, Import und Rücksetzen über Dateiablauf; Speicher und
// Uhr der WebView verwenden die gemeinsamen Funktionen aus web-plattform.ts.
// Ein bestandener Quellvertrag ist kein Nachweis eines erneuten Emulatorlaufs.
export function quellvertrag(wurzel) {
  dateiMethodenVertrag(readFileSync(join(wurzel, 'app/android/app/src/main/java/de/baremos/fristenrechner/io/DateiablaufPlugin.java'), 'utf8'));
  const markup = readFileSync(join(wurzel, 'packages/oberflaeche/src/Fristenrechner.astro'), 'utf8');
  const app = readFileSync(join(wurzel, 'app/src/pages/index.astro'), 'utf8');
  const ui = readFileSync(join(wurzel, 'packages/oberflaeche/src/fristenrechner-ui.ts'), 'utf8');
  const web = readFileSync(join(wurzel, 'packages/oberflaeche/src/web-plattform.ts'), 'utf8');
  const ausgabe = readFileSync(join(wurzel, 'app/src/adapters/dateiausgabe.ts'), 'utf8');
  const eingabe = readFileSync(join(wurzel, 'app/src/adapters/dateiimport.ts'), 'utf8');
  const vertrag = readFileSync(join(wurzel, 'app/src/adapters/dateiablauf-vertrag.ts'), 'utf8');
  const plattform = readFileSync(join(wurzel, 'app/src/adapters/app-plattform.ts'), 'utf8');
  for (const s of ['id="schedule-form"', 'id="result-regelstand"', 'id="schedule-table-body"', 'type="submit"', 'name="kunde"', 'name="projektname"', 'name="vergabenummer"', 'name="vergabeordnung"', 'name="verfahrensart"', 'name="bundesland"', 'name="bekanntmachung"']) {
    if (!markup.includes(s)) throw new Error(`Oberflächenvertrag geändert: ${s}`);
  }
  for (const s of ['id="app-startfehler"', 'id="app-rechtsstand-hinweis"']) if (!app.includes(s)) throw new Error(`App-Markup geändert: ${s}`);
  if (!/import\s*\{\s*Content as Datenschutz\s*\}\s*from\s*'\.\.\/\.\.\/\.\.\/docs\/datenschutz\.md';/.test(app)
    || !/<details class="app-abschnitt" id="app-datenschutz">\s*<summary>Datenschutz<\/summary>\s*<Datenschutz\s*\/>\s*<\/details>/.test(app)) {
    throw new Error('Offline-Datenschutz aus gemeinsamer Markdown-Quelle geändert.');
  }
  if (!/^# Datenschutz\r?\n/.test(readFileSync(join(wurzel, 'docs/datenschutz.md'), 'utf8'))) {
    throw new Error('Datenschutzdokument geändert oder nicht gefunden.');
  }
  for (const id of ['import-message', 'reset-message']) {
    if (!new RegExp(`<p\\s[^>]*id="${id}"[^>]*role="status"[^>]*aria-live="polite"`).test(markup)
      || !ui.includes(`('#${id}')`)) throw new Error(`Statuszeile geändert: ${id}`);
  }
  if (!app.includes("'[data-fristenrechner]'")
    || !/import\s*\{\s*erzeugeAppPlattform\s*\}\s*from\s*'\.\.\/adapters\/app-plattform';/.test(app)
    || !/const plattform\s*=\s*erzeugeAppPlattform\(root\);/.test(app)
    || !app.includes('importBedienung="schaltflaeche"')
    || /erzeugeWebPlattform\s*\(/.test(app + plattform)
    || !/initFristenrechner\(root,\s*\{\s*plattform,\s*texte,\s*exportInhalt\s*\}\)/.test(app)) {
    throw new Error('Ausdrückliche Initialisierung der App geändert.');
  }
  for (const s of ['const fenster = root.ownerDocument.defaultView!', 'const sperre = erzeugeNativeAuftragsSperre()',
    'speicher: erzeugeWebSpeicher(fenster)', 'zeit: webZeit', 'ausgabe: erzeugeNativeDateiAusgabe(plugin, sperre)',
    '...erzeugeNativeProjektEingabe(plugin, sperre)', 'dispose() { sperre.dispose(); }']) {
    if (!plattform.includes(s)) throw new Error(`App-Plattform geändert: ${s}.`);
  }
  if (!/import\s*\{\s*registerPlugin\s*\}\s*from\s*'@capacitor\/core';/.test(vertrag)
    || !vertrag.includes("registerPlugin<DateiablaufPlugin>('Dateiablauf')")) throw new Error('Nativer Dateiablauf geändert: Registrierung.');
  for (const name of ['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeAbschliessen', 'speichernUnter', 'teilen', 'ausgabeVerwerfen']) {
    if (!ausgabe.includes(`await plugin.${name}({`)) throw new Error(`Native Dateiausgabe geändert: ${name}.`);
  }
  for (const name of ['projektWaehlen', 'zuruecksetzenBestaetigen']) {
    if (!eingabe.includes(`await plugin.${name}()`)) throw new Error(`Native Projekteingabe geändert: ${name}.`);
  }
  for (const [weg, endung] of [['exportieren', 'gespeichert.'], ['teilen', 'zum Teilen bereitgestellt.']]) {
    const texte = `    ${weg}: { projekt: 'Projektdatei ${endung}', excel: 'Excel-Datei ${endung}', pdf: 'PDF ${endung}' }`;
    if (!app.includes(texte)) throw new Error(`Ausgabe-Erfolgstexte geändert: ${weg}.`);
  }
  const storage = /export const WEB_SPEICHERSCHLUESSEL = '([^']+)';/.exec(web)?.[1];
  if (!storage) throw new Error('Schlüssel zum Speichern nicht im Quelltext gefunden.');
  if (!web.includes('export function erzeugeWebSpeicher(') || !web.includes('speicher: erzeugeWebSpeicher(fenster)')
    || !web.includes('export function webZeit(') || !web.includes('zeit: webZeit')) throw new Error('Gemeinsamer Web-Speicher oder Uhr geändert.');
  for (const aktion of ['getItem', 'setItem', 'removeItem']) if (!web.includes(`localStorage.${aktion}(WEB_SPEICHERSCHLUESSEL`)) throw new Error(`Web-Speichervertrag geändert: ${aktion}`);
  const kern = readFileSync(join(wurzel, 'packages/kern/src/fristen.ts'), 'utf8');
  const konstante = name => {
    const m = new RegExp(`export const ${name}(?:: [A-Za-z]+)? = '([^']+)';`).exec(kern);
    if (!m) throw new Error(`Regelkonstante nicht gefunden: ${name}`);
    return m[1];
  };
  return { storage, datum: konstante('RECHTSSTAND_DATUM'), text: `Regelversion: ${konstante('REGELVERSION')} · Rechtsstand: ${konstante('RECHTSSTAND')} (${konstante('RECHTSSTAND_DATUM')})` };
}

export const formularWerte = { kunde: 'Emulatorprüfung', projektname: 'Gespeichertes Testprojekt', vergabenummer: 'EMU-42', vergabeordnung: 'vob_a_eu', verfahrensart: 'offen', bundesland: 'BY', bekanntmachung: '2026-10-01' };
const valuesJS = `Object.fromEntries(${JSON.stringify(Object.keys(formularWerte))}.map(function(n){var e=document.querySelector('#schedule-form [name="'+n+'"]'); if(!e)throw Error('Formularfeld fehlt: '+n);return [n,e.value]}))`;

/** Die Tabelle darf innen rollen, ihr eigener Rahmen muss in die Seite passen. */
export function ueberlaufMessung() {
  var breite = document.documentElement.clientWidth;
  var gesamt = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  var elemente = gesamt > breite ? Array.from(document.querySelectorAll('body *')).filter(function (e) {
    var rolle = e.closest('.table-scroll');
    return (!rolle || rolle === e) && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  }).map(function (e) {
    var r = e.getBoundingClientRect();
    // Ein langes Wort kann aus einer passend breiten Blockbox hinausragen.
    // Nur direkte Textknoten messen; Tabelleninhalt zählt nicht bei Vorfahren mit.
    var textRechts = Array.from(e.childNodes || []).filter(function (n) { return n.nodeType === 3 && String(n.textContent || '').trim(); }).reduce(function (rechts, n) {
      var range = document.createRange(); range.selectNodeContents(n);
      return Math.max(rechts, range.getBoundingClientRect().right);
    }, r.right);
    return { tag: e.tagName.toLowerCase(), id: e.id || '', klassen: e.getAttribute('class') || '', text: String(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160), links: r.left, rechts: r.right, textRechts: textRechts, oben: r.top, unten: r.bottom, breite: r.width, hoehe: r.height };
  }).filter(function (e) { return e.rechts > breite || e.textRechts > breite; }) : [];
  return { scrollWidth: gesamt, clientWidth: breite, ueberlaufElemente: elemente };
}

/** Native Koordinaten stammen aus demselben Ansichtsbaum wie das Eingabefeld. */
export function tastaturTippPunkt(xml, paket) {
  const treffer = [...String(xml).matchAll(/<node\b[^>]*>/g)].map(([node]) => Object.fromEntries([...node.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])))
    .filter(a => a.package === paket && a.class === 'android.widget.EditText' && a.text === formularWerte.projektname && a.enabled === 'true')
    .map(a => /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(a.bounds || ''))
    .filter(m => m && Number(m[3]) > Number(m[1]) && Number(m[4]) > Number(m[2]));
  if (treffer.length !== 1) throw new Error('Projektname ist in der nativen Ansicht nicht eindeutig sichtbar.');
  const [, l, o, r, u] = treffer[0].map(Number);
  return { x: Math.floor((l + r) / 2), y: Math.floor((o + u) / 2), bounds: [l, o, r, u] };
}

export function tastaturViewport() {
  var e = document.activeElement;
  return { innerHeight: innerHeight, clientHeight: document.documentElement.clientHeight, visualViewportHeight: window.visualViewport ? window.visualViewport.height : null, aktivesElement: e ? { tag: e.tagName.toLowerCase(), id: e.id || '', name: e.getAttribute('name') || '' } : null };
}

async function ausfuellen(c) {
  return c.evaluate(`(function(){var f=document.querySelector('#schedule-form');if(!f)throw Error('Formular fehlt');var w=${JSON.stringify(formularWerte)};Object.keys(w).forEach(function(n){var e=f.elements.namedItem(n);if(!e)throw Error(n);e.value=w[n];e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});if(!f.checkValidity())throw Error('Formular ungültig');f.querySelector('button[type="submit"]').click();return ${valuesJS};})()`);
}

export function datumBefehl(epochSekunden) {
  if (!Number.isSafeInteger(epochSekunden)) throw new Error('Ungültige Gerätezeit.');
  const d = new Date(epochSekunden * 1000);
  if (!Number.isFinite(d.getTime())) throw new Error('Gerätezeit außerhalb des Datumsbereichs.');
  const p = x => String(x).padStart(2, '0');
  return `date -u ${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${d.getUTCFullYear()}.${p(d.getUTCSeconds())}`;
}

export async function ablaufA(ctx) {
  const quelle = quellvertrag(ctx.wurzel);
  await ctx.install(ctx.debug, ctx.app);
  await ctx.start(ctx.app);
  await ctx.pruefung('A1', async () => {
    const c = await ctx.cdp(ctx.app);
    await c.send('Page.reload', { ignoreCache: true }); await ctx.sleep(3500);
    const zustand = await c.evaluate(`({origin:location.origin,fehlerVersteckt:document.querySelector('#app-startfehler')?.hidden,formular:!!document.querySelector('#schedule-form')})`);
    ctx.save('a1-start.json', { zustand, events: c.events });
    const r = evaluiereBeobachtungen([
      { name: 'Lokale Herkunft', ist: zustand.origin, soll: 'https://localhost' },
      { name: 'Fehlerfalle versteckt', ist: zustand.fehlerVersteckt, soll: true },
      { name: 'Formular geladen', ist: zustand.formular, soll: true },
      { name: 'Runtime.exceptionThrown', ist: c.events.filter(e => e.method === 'Runtime.exceptionThrown').length, soll: 0 },
    ]);
    // Gegenprobe der Fehlerfalle mit einer ausdrücklich gleichnamigen Herkunft.
    const gp = await c.evaluate(`(function(){window.dispatchEvent(new ErrorEvent('error',{filename:location.origin+'/emulator-gegenprobe.js'}));return document.querySelector('#app-startfehler').hidden===false;})()`);
    ctx.befund('A1-Gegenprobe', evaluiereFehlerfalleGegenprobe(gp));
    await c.send('Page.reload'); await ctx.sleep(2000);
    return r;
  });
  await ctx.pruefung('A2', async () => {
    const c = await ctx.cdp(ctx.app);
    const werte = await ausfuellen(c); await ctx.sleep(700);
    const daten = await c.evaluate(`({regel:document.querySelector('#result-regelstand').textContent,zeilen:document.querySelector('#schedule-table-body').children.length,speicher:JSON.parse(localStorage.getItem(${JSON.stringify(quelle.storage)}))})`);
    ctx.save('a2-berechnung.json', { quelle, werte, daten });
    if (!Number.isSafeInteger(daten?.zeilen) || daten.zeilen < 0) return befund('ungültig', 'Anzahl der berechneten Termine ist nicht lesbar.');
    return evaluiereBeobachtungen([
      ...Object.entries(formularWerte).map(([name, soll]) => ({ name, ist: werte[name], soll })),
      { name: 'Regelstand', ist: daten.regel, soll: quelle.text },
      { name: 'Berechnete Termine vorhanden', ist: daten.zeilen > 0, soll: true },
      { name: 'Projekt gespeichert', ist: daten.speicher?.input?.projekt?.projektname, soll: formularWerte.projektname },
    ]);
  });
  await ctx.pruefung('A3', async () => {
    const c = await ctx.cdp(ctx.app);
    const wert = await c.evaluate('Capacitor.Plugins.WebView.getServerBasePath()');
    ctx.save('a3-bruecke.json', wert);
    return evaluiereBruecke(wert);
  });
  await ctx.pruefung('A4', async () => {
    // Bekannte Testwerte erneut über die Oberfläche setzen; keine Speicher-Manipulation.
    await ausfuellen(await ctx.cdp(ctx.app));
    await ctx.stop(ctx.app); await ctx.start(ctx.app);
    let c = await ctx.cdp(ctx.app);
    const nachStart = await c.evaluate(valuesJS);
    await ctx.stop(ctx.app);
    const clear = await ctx.shell(`pm clear ${ctx.app}`);
    if (clear.trim() !== 'Success') throw new Error('pm clear nicht bestätigt.');
    await ctx.start(ctx.app); c = await ctx.cdp(ctx.app);
    const nachClear = await c.evaluate(valuesJS);
    const heute = await c.evaluate(`(function(){var d=new Date();return String(d.getFullYear()).padStart(4,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})()`);
    if (typeof heute !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(heute)) throw new Error('Gerätedatum nach pm clear nicht lesbar.');
    // Fristenrechner.astro: erste Optionen vgv/offen, selected={value === 'BE'},
    // leere Kopffelder. fristenrechner-ui.ts initialisiert bekanntmachung mit todayISO().
    const standard = { kunde: '', projektname: '', vergabenummer: '', vergabeordnung: 'vgv', verfahrensart: 'offen', bundesland: 'BE', bekanntmachung: heute };
    ctx.save('a4-persistenz.json', { nachStart, clear, nachClear, standard });
    const checks = Object.entries(formularWerte).map(([name, soll]) => ({ name: `Nach Neustart: ${name}`, ist: nachStart[name], soll }));
    for (const [name, soll] of Object.entries(standard)) checks.push({ name: `Nach pm clear: ${name}`, ist: nachClear[name], soll });
    // Die Oberfläche erzeugt beim Start bereits ein neues Standardprojekt im Speicher.
    return evaluiereBeobachtungen(checks);
  });
  await ctx.pruefung('A5', async () => {
    const c = await ctx.cdp(ctx.app), grenze = hinweisGrenze(quelle.datum);
    const folge = new Date(`${grenze}T12:00:00Z`); folge.setUTCDate(folge.getUTCDate() + 1);
    const tage = [grenze, folge.toISOString().slice(0, 10)], daten = [];
    const pidVor = (await ctx.shell(`pidof ${ctx.app}`)).trim();
    if (!/^\d+$/.test(pidVor)) throw new Error('Prozesskennung vor dem Datumswechsel nicht lesbar.');
    try {
      await ctx.shell('settings put global auto_time 0');
      for (const tag of tage) {
        const epoch = await c.evaluate(`Math.floor(new Date(${Number(tag.slice(0, 4))},${Number(tag.slice(5, 7)) - 1},${Number(tag.slice(8, 10))},12).getTime()/1000)`);
        await ctx.shell('input keyevent KEYCODE_HOME');
        await ctx.shell(datumBefehl(epoch)); await ctx.start(ctx.app);
        daten.push(await c.evaluate(`({tag:new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0'),hidden:document.querySelector('#app-rechtsstand-hinweis').hidden})`));
      }
      const pidNach = (await ctx.shell(`pidof ${ctx.app}`)).trim();
      if (!/^\d+$/.test(pidNach)) throw new Error('Prozesskennung nach dem Datumswechsel nicht lesbar.');
      ctx.save('a5-rechtsstand.json', { tage, daten, pidVor, pidNach });
      return evaluiereBeobachtungen([
        { name: 'Datum an Grenze', ist: daten[0].tag, soll: tage[0] }, { name: 'Grenze ohne Hinweis', ist: daten[0].hidden, soll: true },
        { name: 'Datum nach Grenze', ist: daten[1].tag, soll: tage[1] }, { name: 'Folgetag mit Hinweis', ist: daten[1].hidden, soll: false },
        { name: 'Kein Prozessneustart', ist: pidNach, soll: pidVor },
      ]);
    } finally { await ctx.restoreClock(); }
  });
  await ctx.pruefung('A6', async () => { await navigation(ctx); return befund('bestanden', 'Einzelbefunde unter navigation/* aufgezeichnet; deren Grenzen gelten weiterhin.'); });
  await ctx.pruefung('A7', async () => { await netz(ctx); return befund('bestanden', 'Einzelbefunde unter netz/* aufgezeichnet.'); });
  await ablaufA8(ctx);
  // Barrierebaum vor der Zurück-Taste erfassen, damit Zurück wirklich die App verlassen kann.
  await ablaufA10(ctx);
  await ctx.pruefung('A9', async () => {
    await ctx.start(ctx.app); await ctx.shell('input keyevent KEYCODE_BACK'); await ctx.sleep(2000);
    const text = await ctx.shell('dumpsys activity activities'); ctx.save('a9-zurueck.txt', text);
    return evaluiereZurueck(text, ctx.app);
  });
}

/** Auch einzeln ausführbar; die Debug-App muss zuvor installiert sein. */
export async function ablaufA8(ctx) {
  await ctx.pruefung('A8', async () => {
    await ctx.start(ctx.app); await ausfuellen(await ctx.cdp(ctx.app));
    const varianten = [
      ['schrift-1-3', ['settings put system font_scale 1.3']],
      ['schrift-2-0', ['settings put system font_scale 2.0']],
      ['nacht', ['settings put system font_scale 1.0', 'cmd uimode night yes']],
      ['gedreht', ['cmd uimode night no', 'settings put system accelerometer_rotation 0', 'settings put system user_rotation 1']],
      ['tastatur', ['settings put system user_rotation 0']],
    ];
    let fehler, hardwareTastatur;
    try { for (const [name, befehle] of varianten) {
      for (const befehl of befehle) { await ctx.shell(befehl); await ctx.sleep(500); }
      await ctx.sleep(2500);
      const versuche = [];
      if (name === 'gedreht' || name === 'tastatur') {
        const soll = name === 'gedreht' ? '1' : '0';
        for (let versuch = 0; versuch < 3; versuch++) {
          const rotation = (await ctx.shell('settings get system user_rotation')).trim();
          versuche.push({ versuch: versuch + 1, rotation });
          if (rotation === soll || versuch === 2) break;
          await ctx.shell('settings put system accelerometer_rotation 0');
          await ctx.shell(`settings put system user_rotation ${soll}`); await ctx.sleep(2500);
        }
      }
      // fontScale erzeugt in den aufgezeichneten Läufen eine neue Activity und
      // WebView. Die Prozesskennung allein erkennt den Wechsel der Seite nicht.
      const c = await ctx.cdp(ctx.app, { neu: true });
      const einstellungen = {
        schrift: await ctx.shell('settings get system font_scale'),
        nacht: await ctx.shell('cmd uimode night'),
        rotation: await ctx.shell('settings get system user_rotation'),
        versuche,
        viewport: await c.evaluate('({breite:innerWidth,hoehe:innerHeight,ausrichtung:screen.orientation?screen.orientation.type:null})'),
      };
      const checks = [];
      if (name.startsWith('schrift-')) checks.push({ name: 'Schriftgröße', ist: Number(einstellungen.schrift), soll: name === 'schrift-1-3' ? 1.3 : 2 });
      if (name === 'nacht') checks.push({ name: 'Nachtmodus', ist: /Night mode: yes\b/i.test(einstellungen.nacht), soll: true });
      if (name === 'gedreht' || name === 'tastatur') {
        checks.push({ name: 'Rotation', ist: einstellungen.rotation.trim(), soll: name === 'gedreht' ? '1' : '0' });
        checks.push({ name: 'Ausrichtung der Ansicht', ist: einstellungen.viewport?.ausrichtung?.split('-')[0], soll: name === 'gedreht' ? 'landscape' : 'portrait' });
      }
      ctx.befund(`A8-${name}-Einstellungen`, evaluiereBeobachtungen(checks));
      ctx.save(`a8-${name}-einstellungen.json`, einstellungen);
      await c.evaluate('window.scrollTo(0,0)');
      if (name === 'tastatur') {
        const hardwareVorher = (await ctx.shell('settings get secure show_ime_with_hard_keyboard')).trim();
        if (!['0', '1', 'null'].includes(hardwareVorher)) throw new Error('Einstellung der Bildschirmtastatur nicht lesbar.');
        hardwareTastatur = hardwareVorher;
        await ctx.shell('settings put secure show_ime_with_hard_keyboard 1');
        if ((await ctx.shell('settings get secure show_ime_with_hard_keyboard')).trim() !== '1') throw new Error('Bildschirmtastatur trotz Hardwaretastatur nicht eingeschaltet.');
        await c.evaluate(`document.querySelector('[name="projektname"]').scrollIntoView({block:'center'})`);
        const vorher = await c.evaluate(`(${tastaturViewport.toString()})()`);
        const p = tastaturTippPunkt(await ctx.uiBaum('a8-tastatur-ziel'), ctx.app);
        ctx.save('a8-tastatur-tipp.json', p);
        await ctx.shell(`input tap ${p.x} ${p.y}`);
        let nachweis;
        const messungen = [];
        for (let versuch = 0; versuch < 5; versuch++) {
          await ctx.sleep(1000);
          nachweis = { inputMethod: await ctx.shell('dumpsys input_method'), fenster: await ctx.shell('dumpsys window windows'), vorher, nachher: await c.evaluate(`(${tastaturViewport.toString()})()`) };
          messungen.push(nachweis);
          if (evaluiereTastatur(nachweis).status === 'bestanden') break;
        }
        ctx.save('a8-tastatur-messungen.json', messungen);
        ctx.save('a8-tastatur.txt', nachweis.inputMethod); ctx.save('a8-tastatur-fenster.txt', nachweis.fenster);
        ctx.save('a8-tastatur-nachweis.json', nachweis);
        ctx.befund('A8-Tastatur', evaluiereTastatur(nachweis));
      }
      const groesse = await c.evaluate(`(${ueberlaufMessung.toString()})()`);
      ctx.save(`a8-${name}.json`, groesse); await ctx.shot(`a8-${name}.png`);
      ctx.befund(`A8-${name}`, evaluiereUeberlauf(groesse));
    }
    await ctx.shell('input keyevent KEYCODE_BACK');
    } catch (e) { fehler = e; }
    finally {
      if (hardwareTastatur !== undefined) {
        try {
          await ctx.shell(hardwareTastatur === 'null' ? 'settings delete secure show_ime_with_hard_keyboard' : `settings put secure show_ime_with_hard_keyboard ${hardwareTastatur}`);
          const nachher = (await ctx.shell('settings get secure show_ime_with_hard_keyboard')).trim();
          ctx.save('a8-tastatur-wiederherstellung.json', { vorher: hardwareTastatur, nachher });
          if (nachher !== hardwareTastatur) throw new Error('Einstellung der Bildschirmtastatur wurde nicht wiederhergestellt.');
        } catch (e) { ctx.befund('A8-Tastatur-Wiederherstellung', befund('ungültig', e.message)); fehler = fehler ? new Error(`${fehler.message}; Wiederherstellung: ${e.message}`) : e; }
      }
      try { await ctx.restoreDisplay(); }
      catch (e) {
        ctx.befund('A8-Wiederherstellung', befund('ungültig', e.message));
        fehler = fehler ? new Error(`${fehler.message}; Wiederherstellung: ${e.message}`) : e;
      }
    }
    if (fehler) throw fehler;
    return sichtpruefungAusstehend(SICHTPRUEFUNGEN.A8);
  });
}

/** Namenquellen im DOM; kein Ersatz für den berechneten Barrierebaum. */
export function domAriaNamen() {
  var text = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  return Array.from(document.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="textbox"],[role="combobox"],[tabindex]'))
    .filter(function (e) { return e.type !== 'hidden' && e.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(e).visibility !== 'hidden'; })
    .map(function (e) {
      var refs = text(e.getAttribute('aria-labelledby')).split(' ').filter(Boolean).map(function (id) { return document.getElementById(id); }).filter(Boolean);
      var quellen = [
        ['aria-labelledby', refs.map(function (r) { return text(r.textContent); }).join(' ')],
        ['aria-label', e.getAttribute('aria-label')],
        ['label', Array.from(e.labels || []).map(function (r) { return text(r.textContent); }).join(' ')],
        ['alt', e.type === 'image' ? e.getAttribute('alt') : ''],
        ['text', /^(BUTTON|A|SUMMARY)$/.test(e.tagName) || /^(button|link|checkbox|radio)$/.test(e.getAttribute('role') || '') ? e.textContent : ''],
        ['value', e.tagName === 'INPUT' && /^(button|submit|reset)$/.test(e.type) ? e.value : ''],
        ['title', e.getAttribute('title')],
      ];
      var quelle = quellen.find(function (q) { return text(q[1]); });
      return { element: e.tagName.toLowerCase(), id: e.id || '', klassen: e.getAttribute('class') || '', typ: e.type || e.getAttribute('role') || '', name: quelle ? text(quelle[1]) : '', quelle: quelle ? quelle[0] : '' };
    });
}

export function evaluiereDomAria(namen) {
  if (!Array.isArray(namen) || !namen.length || namen.some(n => !n || typeof n.element !== 'string' || typeof n.name !== 'string' || typeof n.quelle !== 'string')) {
    return befund('ungültig', 'DOM/ARIA liefert keine auswertbaren Bedienelemente.');
  }
  if (namen.some(n => !n.name.trim())) return befund('nicht bestanden', 'Mindestens ein sichtbares Bedienelement hat keine ermittelte Namenquelle in DOM/ARIA.', namen);
  return befund('bestanden', 'Sichtbare Bedienelemente haben Namenquellen in DOM/ARIA; der berechnete Barrierebaum und TalkBack sind damit nicht belegt.', namen);
}

/** Auch einzeln ausführbar; die Debug-App muss zuvor installiert sein. */
export async function ablaufA10(ctx) {
  await ctx.pruefung('A10', async () => {
    // A8 kann die Activity erneut erzeugt haben. Die neue Seite zuerst mit einer
    // unabhängigen DOM-Abfrage belegen, erst danach AX als verfügbar bewerten.
    await ctx.start(ctx.app); const c = await ctx.cdp(ctx.app, { neu: true });
    const namen = await c.evaluate(`(${domAriaNamen.toString()})()`);
    ctx.save('a10-dom-aria.json', namen);
    ctx.befund('A10-DOM-ARIA', evaluiereDomAria(namen));
    try {
      await c.send('Accessibility.enable');
      const baum = await c.send('Accessibility.getFullAXTree');
      const webview = await ctx.shell('dumpsys webviewupdate'); ctx.save('a10-webview.txt', webview);
      baum.webviewVersion = /Current WebView package \(name, version\): \([^,]+, (\d+(?:\.\d+)*)\)/.exec(webview)?.[1];
      baum.domKnoten = [];
      const diagnose = evaluiereBarrierebaum(baum, { webviewVersion: baum.webviewVersion });
      for (const node of Array.isArray(diagnose.details) ? diagnose.details : []) {
        if (!node.backendDOMNodeId) continue;
        try {
          const dom = await c.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId, depth: 0 });
          baum.domKnoten.push({ backendDOMNodeId: node.backendDOMNodeId, nodeName: dom.node?.nodeName, attributes: dom.node?.attributes });
        } catch (e) {
          baum.domKnoten.push({ backendDOMNodeId: node.backendDOMNodeId, fehler: e.message });
          // Der berechnete Baum bleibt bei fehlender DOM-Diagnose auswertbar.
        }
      }
      ctx.save('a10-barrierebaum.json', baum);
      return evaluiereBarrierebaum(baum, { webviewVersion: baum.webviewVersion });
    } catch (e) {
      ctx.save('a10-barrierebaum-fehler.json', { fehler: e.message, domErreichbar: true });
      if (/^CDP-Zeitüberschreitung: Accessibility\.(?:enable|getFullAXTree)$|^CDP -32601:/.test(e.message)) {
        return befund(STATUS.grenze, `Barrierebaum nicht verfügbar: ${e.message}. DOM/ARIA ist nur ein Nebenbeleg; Barrierebaum und TalkBack bleiben nachzuprüfen.`);
      }
      throw e;
    }
  });
}

export async function fehlerseite(ctx) {
  for (const art of ['fehlerseite', 'ohne-fehlerseite']) {
    await ctx.uninstall(ctx.app); await ctx.shell('logcat -c'); await ctx.install(ctx.varianten[art], ctx.app); await ctx.start(ctx.app);
    await ctx.pruefung(art, async () => {
      const c = await ctx.cdp(ctx.app); await c.send('Page.enable'); await c.send('Page.reload'); await ctx.sleep(10000);
      const protokoll = await ctx.adb(['logcat', '-d', '-v', 'time']);
      if (protokoll.code !== 0) throw new Error(`Logcat der Variante ${art} nicht lesbar (${protokoll.code}).`);
      const logcat = protokoll.out;
      let ort;
      try { ort = await c.evaluate('({pathname:location.pathname,text:document.body.innerText,capacitor:typeof Capacitor})'); }
      catch (e) { if (art === 'fehlerseite') throw e; ort = { fehler: e.message }; }
      ctx.save(`${art}.json`, { ort, events: c.events }); ctx.save(`${art}-logcat.txt`, logcat);
      // Die Gegenprobe lädt bei fehlender Fehlerseite fortlaufend neu. Uiautomator
      // findet dann nicht zuverlässig einen Ruhezustand; maßgeblich ist Logcat.
      // Die Prüfung auf einen Systemdialog bleibt im Screenshot-Aufruf aktiv.
      await ctx.shot(`${art}.png`, { ui: art !== 'ohne-fehlerseite' });
      if (art === 'fehlerseite') return evaluiereFehlerseite({ ort, ausnahmen: c.events.filter(e => e.method === 'Runtime.exceptionThrown'), logcat, erwarteterText: 'Der Fristenrechner kann nicht starten' });
      return evaluiereFehlerseiteGegenprobe({ logcat });
    });
  }
}
