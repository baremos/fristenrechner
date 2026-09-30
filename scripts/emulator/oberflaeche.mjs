import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hinweisGrenze } from '../../app/src/rechtsstand-hinweis.ts';
import { STATUS, befund, evaluiereBeobachtungen, evaluiereBarrierebaum, evaluiereUeberlauf, evaluiereFehlerseite, evaluiereBruecke, evaluiereFehlerfalleGegenprobe, evaluiereTastatur, evaluiereFehlerseiteGegenprobe, evaluiereZurueck } from '../emulator-auswertung.mjs';
import { navigation, netz } from './pruefungen.mjs';

// Selektoren belegt durch packages/oberflaeche/src/Fristenrechner.astro:
// #schedule-form, name=..., submit, #schedule-table-body, #result-regelstand.
// Speichern/Wiederherstellen: fristenrechner-ui.ts persist(), Startabschnitt.
// Hinweis/Fehlerfalle: app/src/pages/index.astro und rechtsstand-anzeige.ts.
export function quellvertrag(wurzel) {
  const markup = readFileSync(join(wurzel, 'packages/oberflaeche/src/Fristenrechner.astro'), 'utf8');
  const app = readFileSync(join(wurzel, 'app/src/pages/index.astro'), 'utf8');
  const ui = readFileSync(join(wurzel, 'packages/oberflaeche/src/fristenrechner-ui.ts'), 'utf8');
  for (const s of ['id="schedule-form"', 'id="result-regelstand"', 'id="schedule-table-body"', 'type="submit"', 'name="kunde"', 'name="projektname"', 'name="vergabenummer"', 'name="vergabeordnung"', 'name="verfahrensart"', 'name="bundesland"', 'name="bekanntmachung"']) {
    if (!markup.includes(s)) throw new Error(`Oberflächenvertrag geändert: ${s}`);
  }
  for (const s of ['id="app-startfehler"', 'id="app-rechtsstand-hinweis"']) if (!app.includes(s)) throw new Error(`App-Markup geändert: ${s}`);
  const storage = /const STORAGE_KEY = '([^']+)';/.exec(ui)?.[1];
  if (!storage) throw new Error('Schlüssel zum Speichern nicht im Quelltext gefunden.');
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
      ['schrift-1-3', 'settings put system font_scale 1.3'],
      ['schrift-2-0', 'settings put system font_scale 2.0'],
      ['nacht', 'settings put system font_scale 1.0; cmd uimode night yes'],
      ['gedreht', 'cmd uimode night no; settings put system accelerometer_rotation 0; settings put system user_rotation 1'],
      ['tastatur', 'settings put system user_rotation 0'],
    ];
    let fehler;
    try { for (const [name, befehl] of varianten) {
      await ctx.shell(befehl); await ctx.sleep(2500);
      // fontScale erzeugt in den aufgezeichneten Läufen eine neue Activity und
      // WebView. Die Prozesskennung allein erkennt den Wechsel der Seite nicht.
      const c = await ctx.cdp(ctx.app, { neu: true });
      const einstellungen = {
        schrift: await ctx.shell('settings get system font_scale'),
        nacht: await ctx.shell('cmd uimode night'),
        rotation: await ctx.shell('settings get system user_rotation'),
      };
      const checks = [];
      if (name.startsWith('schrift-')) checks.push({ name: 'Schriftgröße', ist: Number(einstellungen.schrift), soll: name === 'schrift-1-3' ? 1.3 : 2 });
      if (name === 'nacht') checks.push({ name: 'Nachtmodus', ist: /Night mode: yes\b/i.test(einstellungen.nacht), soll: true });
      if (name === 'gedreht' || name === 'tastatur') checks.push({ name: 'Rotation', ist: einstellungen.rotation, soll: name === 'gedreht' ? '1' : '0' });
      ctx.befund(`A8-${name}-Einstellungen`, evaluiereBeobachtungen(checks));
      ctx.save(`a8-${name}-einstellungen.json`, einstellungen);
      await c.evaluate('window.scrollTo(0,0)');
      if (name === 'tastatur') {
        const p = await c.evaluate(`(function(){var e=document.querySelector('[name="projektname"]');e.scrollIntoView();var b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
        await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
        await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await ctx.sleep(1500);
        const ime = await ctx.shell('dumpsys input_method'); ctx.save('a8-tastatur.txt', ime);
        ctx.befund('A8-Tastatur', evaluiereTastatur(ime));
      }
      const groesse = await c.evaluate('({scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),clientWidth:document.documentElement.clientWidth})');
      ctx.save(`a8-${name}.json`, groesse); await ctx.shot(`a8-${name}.png`);
      ctx.befund(`A8-${name}`, evaluiereUeberlauf(groesse));
    }
    await ctx.shell('input keyevent KEYCODE_BACK');
    } catch (e) { fehler = e; }
    finally {
      try { await ctx.restoreDisplay(); }
      catch (e) {
        ctx.befund('A8-Wiederherstellung', befund('ungültig', e.message));
        fehler = fehler ? new Error(`${fehler.message}; Wiederherstellung: ${e.message}`) : e;
      }
    }
    if (fehler) throw fehler;
    return befund('ungültig', 'Bilder für Systemleisten, Verdeckung und Lesbarkeit müssen noch gesichtet werden.');
  });
}

/** Namenquellen im DOM; kein Ersatz für den berechneten Barrierebaum. */
export function domAriaNamen() {
  var text = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  return Array.from(document.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="textbox"],[role="combobox"]'))
    .filter(function (e) { return e.type !== 'hidden' && e.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(e).visibility !== 'hidden'; })
    .map(function (e) {
      var refs = text(e.getAttribute('aria-labelledby')).split(' ').filter(Boolean).map(function (id) { return document.getElementById(id); }).filter(Boolean);
      var quellen = [
        ['aria-labelledby', refs.map(function (r) { return text(r.textContent); }).join(' ')],
        ['aria-label', e.getAttribute('aria-label')],
        ['label', Array.from(e.labels || []).map(function (r) { return text(r.textContent); }).join(' ')],
        ['alt', e.type === 'image' ? e.getAttribute('alt') : ''],
        ['text', e.tagName !== 'INPUT' && e.tagName !== 'SELECT' && e.tagName !== 'TEXTAREA' ? e.textContent : ''],
        ['value', e.tagName === 'INPUT' && /^(button|submit|reset)$/.test(e.type) ? e.value : ''],
        ['title', e.getAttribute('title')],
      ];
      var quelle = quellen.find(function (q) { return text(q[1]); });
      return { element: e.tagName.toLowerCase(), typ: e.type || e.getAttribute('role') || '', name: quelle ? text(quelle[1]) : '', quelle: quelle ? quelle[0] : '' };
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
      const baum = await c.send('Accessibility.getFullAXTree'); ctx.save('a10-barrierebaum.json', baum);
      return evaluiereBarrierebaum(baum);
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
      const logcat = (await ctx.adb(['logcat', '-d', '-v', 'time'])).out;
      let ort;
      try { ort = await c.evaluate('({pathname:location.pathname,text:document.body.innerText,capacitor:typeof Capacitor})'); }
      catch (e) { if (art === 'fehlerseite') throw e; ort = { fehler: e.message }; }
      ctx.save(`${art}.json`, { ort, events: c.events }); ctx.save(`${art}-logcat.txt`, logcat); await ctx.shot(`${art}.png`);
      if (art === 'fehlerseite') return evaluiereFehlerseite({ ort, ausnahmen: c.events.filter(e => e.method === 'Runtime.exceptionThrown'), logcat, erwarteterText: 'Der Fristenrechner kann nicht starten' });
      return evaluiereFehlerseiteGegenprobe({ logcat });
    });
  }
}
