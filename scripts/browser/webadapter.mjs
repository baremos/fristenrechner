// Browserprüfungen des Web-Adapters. Eingaben laufen über CDP, nicht über DOM-Ereignisse.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { browserDownload, echterMausklick, exportInstrumentationQuelle } from './download.mjs';
import { browserErgebnis, Messfehler, messbefehl, Produktabweichung } from './fehler.mjs';

const SCHLUESSEL = 'baremos-fristenrechner-projekt-v1';
const IMPORT_PROJEKT = {
  kunde: 'Müller & Söhne „Test“ <GmbH>',
  projektname: 'Straßenbeleuchtung – Los 2 (§ 3)',
  vergabenummer: 'VG-2026/ÄÖÜ-01',
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const methode = ereignis => ereignis.method ?? ereignis.methode;

// Eine leere Dateiliste an DOM.setFileInputFiles ist kein Dialogabbruch: Bei
// bereits leerem Feld entsteht weder change noch cancel, und durch das Abfangen
// des Dialogs kehrt auch kein Fensterfokus zurück. Der CDP-Abbruch muss deshalb
// vor der Nutzeraktivierung eingeschaltet und durch ein echtes cancel belegt sein.
export async function dateiauswahlAbbrechen({ send, aktivieren, wert, bis }) {
  const anfang = await messbefehl(() => wert('globalThis.__browserLaufDateifeldEreignisse.length'));
  await messbefehl(() => send('Page.setInterceptFileChooserDialog', { enabled: true, cancel: true }));
  try {
    await aktivieren();
    return await messbefehl(() => bis(async () => {
      const ereignisse = await wert(`globalThis.__browserLaufDateifeldEreignisse.slice(${anfang})`);
      return ereignisse.some(e => e.typ === 'cancel' && e.isTrusted === true) ? ereignisse : false;
    }, 'CDP-Steuerung: echtes cancel-Ereignis nach Dateiauswahlabbruch'));
  } finally {
    await messbefehl(() => send('Page.setInterceptFileChooserDialog', { enabled: true, cancel: false }));
  }
}

export async function pruefeBox320({ send, wert, frisch, berechnen, ausgabe, protokoll }) {
  const originalSend = send;
  send = (name, parameter) => messbefehl(() => originalSend(name, parameter));
  // CDP Emulation.setScrollbarsHidden blendet nur die Browser-Bildlaufleisten
  // aus. Kein CSS der Probeseite wird verändert; 320 bedeutet hier 320 Pixel
  // nutzbare Layoutbreite, nicht 320 minus eine Windows-Bildlaufleiste.
  await send('Emulation.setScrollbarsHidden', { hidden: true });
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
    await frisch();
    await berechnen();
    await wert('scrollTo(0,0)');
    const messen = () => wert(`(() => {
      const element=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();const c=getComputedStyle(e);return {links:r.left,rechts:r.right,breite:r.width,boxSizing:c.boxSizing};};
      return {innerWidth:window.innerWidth,visualViewportWidth:window.visualViewport?.width ?? null,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,scrollX:window.scrollX,wurzel:element('.fristenrechner'),stack:element('.timeline-stack'),timeline:element('#timeline')};
    })()`);
    const ohne = await messen();
    const messung = { id: 'BOX-320', ohneGlobaleRegel: ohne, mitGlobalerRegel: null, bilder: [] };
    (protokoll.messungen ??= []).push(messung);
    await messbefehl(() => {
      assert.equal(ohne.innerWidth, 320, '320 CSS-Pixel Browser-Viewport tatsächlich eingestellt');
      assert.equal(ohne.clientWidth, 320, '320 CSS-Pixel nutzbare Layoutbreite ohne Bildlaufleisten');
      assert.equal(ohne.visualViewportWidth, 320, '320 CSS-Pixel sichtbarer Viewport ohne Zoom');
      assert.equal(ohne.scrollX, 0, 'Überlaufmessung beginnt am linken Viewportrand');
    });
    assert.ok(ohne.timeline, 'Zeitschiene gerendert');
    const bildOhne = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await messbefehl(() => writeFileSync(join(ausgabe, 'box-320-ohne.png'), Buffer.from(bildOhne.data, 'base64')));
    messung.bilder.push('box-320-ohne.png');
    // Eine ausschließlich im Prüfdokument gesetzte Gegenprobe grenzt die Ursache ein.
    await wert(`(() => {const s=document.createElement('style');s.id='browser-lauf-box-sizing';s.textContent='*,*::before,*::after{box-sizing:border-box}';document.head.append(s);})()`);
    await wert('scrollTo(0,0)');
    const mit = await messen();
    messung.mitGlobalerRegel = mit;
    await messbefehl(() => {
      assert.equal(mit.clientWidth, 320, 'Layoutbreite der Gegenprobe bleibt 320 CSS-Pixel');
      assert.equal(mit.scrollX, 0, 'Gegenprobe beginnt am linken Viewportrand');
    });
    assert.ok(mit.timeline, 'Zeitschiene der Gegenprobe gerendert');
    const bildMit = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await messbefehl(() => writeFileSync(join(ausgabe, 'box-320-mit.png'), Buffer.from(bildMit.data, 'base64')));
    messung.bilder.push('box-320-mit.png');
    const ueberlauf = Math.max(0, ohne.timeline.rechts - ohne.clientWidth);
    if (ueberlauf > 0.5) (protokoll.befunde ??= []).push({
      ...messung,
      id: 'WEB-BOX-SIZING',
      beschreibung: `Die Zeitschiene der gebauten README-Probeseite ragt bei 320 CSS-Pixeln ${Math.round(ueberlauf * 100) / 100} Pixel über den rechten Viewportrand.`,
      gegenprobe: mit.timeline.rechts <= mit.clientWidth + 0.5 ? 'Mit globalem box-sizing:border-box liegt die Zeitschiene innerhalb des Viewports.' : 'Auch die globale Gegenprobe beseitigt den Überlauf nicht vollständig.',
    });
    assert.ok(ueberlauf <= 0.5, `Zeitschiene ragt ohne globale box-sizing-Regel ${Math.round(ueberlauf * 100) / 100} Pixel über den Viewport; Messungen und Bilder sind im Protokoll gesichert.`);
    return messung;
  } finally {
    try { await send('Emulation.clearDeviceMetricsOverride'); }
    finally { await send('Emulation.setScrollbarsHidden', { hidden: false }); }
  }
}

export async function pruefeWebadapter(kontext) {
  const { cdp, browserCdp, basisUrl, ausgabe, protokoll, pruefung, navigieren } = kontext;
  const send = (name, parameter) => messbefehl(() => cdp.send(name, parameter));
  const befunde = protokoll.befunde ??= [];
  const dateien = protokoll.dateien ??= [];
  const auswahlBeobachtungen = [];
  const vorabSkripte = [];

  // Cdp.evaluate setzt userGesture:true. Für Messungen darf keine künstliche
  // Nutzeraktivierung entstehen; allein Input.dispatch* löst die Bedienung aus.
  async function wert(expression) {
    const antwort = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: false });
    return browserErgebnis(antwort);
  }

  async function bis(fn, beschreibung, timeout = 8000, produkt = false) {
    const ende = Date.now() + timeout;
    while (Date.now() < ende) {
      const ergebnis = await fn();
      if (ergebnis) return ergebnis;
      await pause(50);
    }
    // Nach bestätigter Steuerung kann eine ausgebliebene Produktreaktion ein
    // Produktbefund sein. Fehlende Mess-/Dialogereignisse bleiben ungültig.
    throw new (produkt ? Error : Messfehler)(`Zeitüberschreitung: ${beschreibung}`);
  }

  const inhalt = selector => wert(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const feldwert = name => wert(`document.querySelector(${JSON.stringify(`[name="${name}"]`)})?.value ?? null`);
  const speicher = () => wert(`localStorage.getItem(${JSON.stringify(SCHLUESSEL)})`);
  const dateiaktionenFrei = () => wert(`['save-json','export-excel','export-pdf','open-json','reset-project'].every(id => {const e=document.getElementById(id);return e && !e.disabled;})`);

  async function bereit() {
    await bis(() => wert(`(() => {for(const selector of ['[data-fristenrechner]','#save-json','#storage-status']){if(!document.querySelector(selector))return {produktabweichung:{art:'element-fehlt',selector}};}if(document.querySelector('#storage-status').textContent.includes('wird geladen'))return false;if(document.querySelector('#save-json').disabled)return {produktabweichung:{art:'element-gesperrt',selector:'#save-json'}};return true;})()`), 'Initialisierung der Probeseite', 8000, true);
  }

  async function frisch(vorab) {
    // Erst die alte Instanz beenden, damit kein alter Speichertimer die Isolation aufhebt.
    await send('Page.navigate', { url: 'about:blank' });
    await bis(async () => (await wert('location.href')) === 'about:blank', 'Leerseite vor dem Einzelfall');
    await send('Storage.clearDataForOrigin', { origin: new URL(basisUrl).origin, storageTypes: 'local_storage' });
    let kennung;
    if (vorab) {
      kennung = (await send('Page.addScriptToEvaluateOnNewDocument', { source: vorab })).identifier;
      vorabSkripte.push(kennung);
    }
    try {
      await navigieren('/');
      await bereit();
    } finally {
      // Das Vorabskript bleibt in diesem Dokument wirksam, nie im nächsten Fall.
      if (kennung) {
        await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: kennung });
        vorabSkripte.splice(vorabSkripte.indexOf(kennung), 1);
      }
    }
  }

  async function klick(selector) {
    return echterMausklick({ send, wert, selector });
  }

  async function taste(key, code, windowsVirtualKeyCode, extra = {}) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...extra });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers: extra.modifiers ?? 0 });
  }

  async function eingabe(name, text) {
    await klick(`[name="${name}"]`);
    await taste('a', 'KeyA', 65, { modifiers: 2 });
    await send('Input.insertText', { text });
    assert.equal(await feldwert(name), text, `Eingabe in ${name}`);
  }

  async function gespeichert(projektname) {
    return bis(async () => {
      const json = await speicher();
      if (!json) return false;
      const projekt = JSON.parse(json);
      return projektname === undefined || projekt.input.projekt.projektname === projektname ? projekt : false;
    }, 'Speichern der Eingaben nach 350 ms', 8000, true);
  }

  async function berechnen() {
    await klick('#schedule-form button[type="submit"]');
    await bis(async () => (await inhalt('#form-message')) === 'Terminplan aktualisiert.', 'Terminplan nach Berechnen', 8000, true);
  }

  async function importDatei() {
    const projekt = await gespeichert();
    projekt.input.projekt = { ...IMPORT_PROJEKT };
    const pfad = join(ausgabe, 'import-sonderzeichen.json');
    await messbefehl(() => writeFileSync(pfad, `${JSON.stringify(projekt, null, 2)}\n`));
    return pfad;
  }

  async function auswaehlen(datei, aktivierung = 'Maus') {
    const anfang = cdp.events.length;
    const klicksVorher = await wert('globalThis.__browserLaufDateifeldKlicks ?? 0');
    const aktivieren = async () => {
      if (aktivierung === 'Maus') await klick('#open-json');
      else {
        // Fokus über CDP; der Tastaturrundgang selbst gehört zur späteren Phase tastatur.
        await wert(`(() => {const selector='#open-json';const e=document.querySelector(selector);if(!e)return {produktabweichung:{art:'element-fehlt',selector}};if(e.disabled)return {produktabweichung:{art:'element-gesperrt',selector}};return true;})()`);
        const dokument = await send('DOM.getDocument');
        if (!dokument?.root?.nodeId) throw new Messfehler('CDP-Dokument für den Tastaturfokus nicht bestätigt.');
        const auswahl = await send('DOM.querySelector', { nodeId: dokument.root.nodeId, selector: '#open-json' });
        if (!Number.isInteger(auswahl?.nodeId) || auswahl.nodeId < 0) throw new Messfehler('CDP-Auswahl des Dateifelds nicht bestätigt.');
        const { nodeId } = auswahl;
        if (nodeId === 0) throw new Produktabweichung({ art: 'element-fehlt', selector: '#open-json' });
        await send('Page.bringToFront');
        await send('DOM.focus', { nodeId });
        if (!await wert(`document.hasFocus() && document.activeElement === document.querySelector('#open-json')`)) throw new Messfehler('Fokus am Dateifeld nicht bestätigt.');
        if (aktivierung === 'Enter') await taste('Enter', 'Enter', 13, { text: '\r' });
        else await taste(' ', 'Space', 32, { text: ' ' });
      }
    };
    let abbruchereignisse;
    if (datei === null) abbruchereignisse = await dateiauswahlAbbrechen({ send, aktivieren, wert, bis });
    else {
      await aktivieren();
      const auswahl = await bis(() => cdp.events.slice(anfang).find(e => methode(e) === 'Page.fileChooserOpened'), `Dateiauswahl nach ${aktivierung}`);
      if (!auswahl.params.backendNodeId) throw new Messfehler('Dateiauswahl ohne belegtes Dateifeld.');
      await send('DOM.setFileInputFiles', { backendNodeId: auswahl.params.backendNodeId, files: [datei] });
    }
    await pause(100);
    const ereignisse = cdp.events.slice(anfang);
    const beobachtung = {
      aktivierung,
      auswahlereignisse: ereignisse.filter(e => methode(e) === 'Page.fileChooserOpened').length,
      zusaetzlicheClickAufrufe: (await wert('globalThis.__browserLaufDateifeldKlicks ?? 0')) - klicksVorher,
      warnungen: ereignisse.filter(e => methode(e) === 'Log.entryAdded' && /user activation/i.test(e.params.entry.text)).map(e => e.params.entry.text),
      ...(abbruchereignisse ? { abbruchereignisse } : {}),
    };
    auswahlBeobachtungen.push(beobachtung);
    if (datei !== null) assert.equal(beobachtung.auswahlereignisse, 1, 'Genau eine Dateiauswahl je Aktivierung');
    return beobachtung;
  }

  async function download(selector, endung, meldung) {
    const nachweis = { id: `W5-${endung}`, format: endung, selector };
    protokoll.messungen.push(nachweis);
    const seitenzustand = () => wert(`({status:document.querySelector(${JSON.stringify(meldung)})?.textContent,disabled:document.querySelector(${JSON.stringify(selector)})?.disabled,fokus:document.hasFocus(),klicks:globalThis.__browserLaufExportKlicks,anker:globalThis.__browserLaufDownloadAnker,blobs:globalThis.__browserLaufBlobURLs})`);
    let start;
    try {
      nachweis.vorher = await seitenzustand();
      const { frameTree } = await send('Page.getFrameTree');
      if (!frameTree?.frame?.id) throw new Messfehler('Frame der Prüfseite nicht bestätigt.');
      start = await browserDownload({ browserCdp, ausgabe, browserContextId: protokoll.pruefTarget.browserContextId,
        frameId: frameTree.frame.id, endung, nachweis, aktivieren: async () => {
          const punkt = await klick(selector), danach = await seitenzustand();
          const neu = danach.klicks.slice(nachweis.vorher.klicks.length);
          nachweis.aktivierung = { punkt, klicks: neu };
          if (neu.length !== 1 || !neu[0].isTrusted || neu[0].id !== selector.slice(1)) throw new Messfehler('Kein eindeutiger vertrauenswürdiger Exportklick am richtigen Bedienelement.');
          return punkt;
        } });
    } finally {
      // Auch ohne downloadWillBegin erhalten: echter Klick, Exportmeldung,
      // Freigabe und vom Adapter ausgelöster Downloadanker. Kein Erfolg daraus.
      try { nachweis.nachher = await seitenzustand(); }
      catch (e) { nachweis.seitenzustandFehler = e.message; }
    }
    // allowAndName benennt die Datei mit der CDP-Kennung. Keine vom Browser
    // vorgeschlagenen Namen als Schreibpfad übernehmen.
    const pfad = join(ausgabe, start.guid);
    await bis(() => existsSync(pfad), 'Heruntergeladene Datei');
    const bytes = await messbefehl(() => readFileSync(pfad));
    assert.ok(bytes.length > 0, 'Download enthält Bytes');
    const eintrag = { format: endung, datei: basename(pfad), vorgeschlagenerName: start.suggestedFilename, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    dateien.push(eintrag);
    return { bytes, eintrag };
  }

  async function bestaetigen(accept) {
    const anfang = cdp.events.length;
    // Ein synchroner confirm-Dialog kann die Eingabeantwort bis zur Antwort aufhalten.
    let aktivierungsfehler;
    const eingabeVersprechen = klick('#reset-project').catch(e => { aktivierungsfehler = e; });
    try {
      const dialog = await bis(() => {
        if (aktivierungsfehler) throw aktivierungsfehler;
        return cdp.events.slice(anfang).find(e => methode(e) === 'Page.javascriptDialogOpening');
      }, 'Bestätigungsdialog');
      await send('Page.handleJavaScriptDialog', { accept });
      await eingabeVersprechen;
      if (aktivierungsfehler) throw aktivierungsfehler;
      assert.equal(dialog.params.type, 'confirm', 'Nativer Bestätigungsdialog');
      assert.equal(dialog.params.message, 'Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?', 'Wortlaut des Bestätigungsdialogs');
      return { text: dialog.params.message, antwort: accept };
    } catch (error) {
      await send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
      await eingabeVersprechen.catch(() => {});
      throw error;
    }
  }

  for (const name of ['Page.enable', 'Runtime.enable', 'DOM.enable', 'Log.enable']) await send(name);
  await send('Page.setInterceptFileChooserDialog', { enabled: true, cancel: false });
  const instrumentation = (await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `globalThis.__browserLaufDateifeldKlicks=0;globalThis.__browserLaufDateifeldEreignisse=[];for(const typ of ['input','change','cancel'])document.addEventListener(typ,e=>{if(e.target.id==='open-json')globalThis.__browserLaufDateifeldEreignisse.push({typ:e.type,isTrusted:e.isTrusted,dateien:e.target.files?.length ?? null});},true);const original=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.id==='open-json')globalThis.__browserLaufDateifeldKlicks++;return original.call(this);};`,
  })).identifier;
  const exportInstrumentation = (await send('Page.addScriptToEvaluateOnNewDocument', {
    source: exportInstrumentationQuelle,
  })).identifier;

  try {
    await pruefung('W1', 'Erstes Projekt im lokalen Speicher', async () => {
      await frisch();
      const projekt = await gespeichert();
      assert.ok(projekt.input && projekt.input.projekt, 'Gültige gespeicherte Projektstruktur');
      return { status: await inhalt('#storage-status') };
    });
    await pruefung('W2', 'Echte Texteingabe wird nach 350 ms gespeichert', async () => {
      await frisch();
      await gespeichert();
      const beginn = Date.now();
      await eingabe('projektname', 'Web-Probe Ä');
      await gespeichert('Web-Probe Ä');
      return { projektname: 'Web-Probe Ä', beobachtetNachMs: Date.now() - beginn, status: await inhalt('#storage-status') };
    });
    await pruefung('W3', 'Gespeicherte Eingabe wird nach Neuladen wiederhergestellt', async () => {
      await frisch();
      await eingabe('projektname', 'Wiederherstellung Ä');
      await gespeichert('Wiederherstellung Ä');
      await navigieren('/');
      await bereit();
      assert.equal(await feldwert('projektname'), 'Wiederherstellung Ä');
      assert.match(await inhalt('#storage-status'), /Lokales Projekt geladen/);
      return { status: await inhalt('#storage-status') };
    });
    await pruefung('W4', 'Berechnen durch einen echten Mausklick', async () => {
      await frisch();
      await berechnen();
      return { status: await inhalt('#form-message') };
    });
    for (const [endung, selector, meldung] of [['json', '#save-json', '#export-message'], ['xlsx', '#export-excel', '#excel-message'], ['pdf', '#export-pdf', '#pdf-message']]) {
      await pruefung(`W5-${endung}`, `Download und Inhalt der ${endung.toUpperCase()}-Datei`, async () => {
        await frisch();
        await eingabe('projektname', 'Browser-Export V6a');
        await berechnen();
        const { bytes, eintrag } = await download(selector, endung, meldung);
        if (endung === 'json') assert.equal(JSON.parse(bytes.toString('utf8')).input.projekt.projektname, 'Browser-Export V6a');
        if (endung === 'xlsx') {
          const teile = unzipSync(bytes);
          assert.ok(teile['xl/worksheets/sheet1.xml'], 'Arbeitsblatt in XLSX vorhanden');
          assert.match(strFromU8(teile['xl/worksheets/sheet1.xml']), /Browser-Export V6a/);
        }
        if (endung === 'pdf') {
          const text = bytes.toString('latin1');
          assert.match(text, /^%PDF-1\./);
          assert.match(text, /%%EOF\s*$/);
          assert.match(text, /Browser-Export V6a/);
          assert.match(text, /Terminplan/);
        }
        assert.ok((await inhalt(meldung))?.trim(), 'Sichtbare Exportmeldung');
        assert.ok(await dateiaktionenFrei(), 'Dateiaktionen nach Export freigegeben');
        return { ...eintrag, status: await inhalt(meldung) };
      });
    }
    await pruefung('W6', 'Projektdatei über echtes Dateifeld importieren', async () => {
      await frisch();
      const beobachtung = await auswaehlen(await importDatei());
      await bis(async () => (await inhalt('#import-message'))?.includes('geöffnet'), 'Importmeldung', 8000, true);
      for (const [name, erwartet] of Object.entries(IMPORT_PROJEKT)) assert.equal(await feldwert(name), erwartet, `Importiertes Feld ${name}`);
      assert.ok(await dateiaktionenFrei(), 'Dateiaktionen nach Import freigegeben');
      return { ...beobachtung, status: await inhalt('#import-message'), projekt: IMPORT_PROJEKT };
    });
    await pruefung('W7', 'Projektdatei mit 1 MiB plus 1 Byte wird abgelehnt', async () => {
      await frisch();
      await eingabe('projektname', 'Vor Übergröße');
      const pfad = join(ausgabe, 'import-zu-gross.json');
      await messbefehl(() => writeFileSync(pfad, Buffer.alloc(1024 * 1024 + 1, 0x20)));
      await auswaehlen(pfad);
      await bis(async () => (await inhalt('#import-message'))?.includes('1 MiB'), 'Meldung zur Größengrenze', 8000, true);
      assert.equal(await feldwert('projektname'), 'Vor Übergröße', 'Projekt bleibt erhalten');
      assert.ok(await dateiaktionenFrei(), 'Dateiaktionen nach Ablehnung freigegeben');
      return { bytes: 1024 * 1024 + 1, status: await inhalt('#import-message') };
    });
    await pruefung('W8', 'Dateiauswahlabbruch erhält Projekt und Aktionsmeldung', async () => {
      await frisch();
      await auswaehlen(await importDatei());
      await bis(async () => (await inhalt('#import-message'))?.includes('geöffnet'), 'Importmeldung vor dem Abbruch', 8000, true);
      await eingabe('projektname', 'Vor Abbruch');
      const vorher = await inhalt('#import-message');
      assert.ok(vorher?.trim(), 'Vorherige Aktionsmeldung ist nicht leer');
      const beobachtung = await auswaehlen(null);
      (protokoll.messungen ??= []).push({ id: 'W8', ...beobachtung });
      try { await bis(dateiaktionenFrei, 'Freigabe nach browserseitigem Dateiauswahlabbruch', 8000, true); }
      catch (error) {
        if (error instanceof Messfehler) throw error;
        befunde.push({ id: 'WEB-ABBRUCH', beschreibung: 'Der Browser hat ein echtes cancel-Ereignis geliefert; die Oberfläche gibt die Dateiaktionen danach nicht frei.', ...beobachtung });
        throw error;
      }
      assert.equal(await feldwert('projektname'), 'Vor Abbruch');
      assert.equal(await inhalt('#import-message'), vorher);
      const folgeimport = await auswaehlen(await importDatei());
      await bis(async () => (await feldwert('projektname')) === IMPORT_PROJEKT.projektname, 'Erneuter Import nach dem Abbruch', 8000, true);
      assert.ok(await dateiaktionenFrei(), 'Dateiaktionen nach erneutem Import freigegeben');
      return { ...beobachtung, status: vorher, folgeimport, weg: 'CDP Page.setInterceptFileChooserDialog mit cancel:true vor echter Input-Aktivierung; browserseitiges cancel mit isTrusted:true beobachtet. Projekt und vorherige Meldung erhalten; anschließender Import erfolgreich. Esc im sichtbaren Systemdialog bleibt eine Handprüfung.' };
    });
    await pruefung('W9', 'Bestätigungsdialog: Abbrechen erhält, Bestätigen setzt zurück', async () => {
      await frisch();
      await eingabe('projektname', 'Vor Zurücksetzen');
      const nein = await bestaetigen(false);
      assert.equal(await feldwert('projektname'), 'Vor Zurücksetzen');
      assert.ok(await dateiaktionenFrei(), 'Dateiaktionen nach Abbruch freigegeben');
      const ja = await bestaetigen(true);
      await bis(async () => (await inhalt('#reset-message')) === 'Neues Projekt angelegt.', 'Zurücksetzen bestätigt', 8000, true);
      assert.equal(await feldwert('projektname'), '');
      assert.ok(await dateiaktionenFrei(), 'Dateiaktionen nach Zurücksetzen freigegeben');
      return { dialoge: [nein, ja], status: await inhalt('#reset-message') };
    });
    await pruefung('W10', 'Gesperrter lokaler Speicher meldet den Fehler; Berechnen bleibt möglich', async () => {
      await frisch(`Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('gesperrt','SecurityError');}});`);
      await bis(async () => (await inhalt('#storage-status'))?.includes('nicht verfügbar'), 'Meldung bei gesperrtem Speicher', 8000, true);
      await berechnen();
      return { status: await inhalt('#storage-status'), berechnung: await inhalt('#form-message') };
    });
    await pruefung('W11', 'Voller lokaler Speicher meldet fehlgeschlagenes Schreiben', async () => {
      await frisch(`globalThis.__browserLaufSchreibversuche=0;Storage.prototype.setItem=function(){globalThis.__browserLaufSchreibversuche++;throw new DOMException('voll','QuotaExceededError');};`);
      const vorher = await wert('globalThis.__browserLaufSchreibversuche');
      await eingabe('projektname', 'Speicher voll');
      await bis(async () => (await wert('globalThis.__browserLaufSchreibversuche')) > vorher && (await inhalt('#storage-status'))?.includes('nicht verfügbar'), 'Meldung bei vollem Speicher nach neuer Eingabe', 8000, true);
      assert.equal(await speicher(), null, 'Fehlgeschlagener Schreibversuch hinterlässt keine Datei');
      await berechnen();
      return { schreibversuche: await wert('globalThis.__browserLaufSchreibversuche'), status: await inhalt('#storage-status'), berechnung: await inhalt('#form-message') };
    });
    for (const aktivierung of ['Enter', 'Leertaste']) {
      await pruefung(`W12-${aktivierung}`, `Dateifeld durch ${aktivierung} auslösen`, async () => {
        await frisch();
        const beobachtung = await auswaehlen(await importDatei(), aktivierung);
        await bis(async () => (await inhalt('#import-message'))?.includes('geöffnet'), `Import nach ${aktivierung}`, 8000, true);
        assert.equal(await feldwert('projektname'), IMPORT_PROJEKT.projektname);
        assert.ok(await dateiaktionenFrei(), 'Dateiaktionen nach Tastaturimport freigegeben');
        return { ...beobachtung, fokus: await wert('document.activeElement?.id'), status: await inhalt('#import-message') };
      });
    }

    const zusaetzlicheKlicks = auswahlBeobachtungen.filter(e => e.zusaetzlicheClickAufrufe > 0);
    if (zusaetzlicheKlicks.length) befunde.push({
      id: 'WEB-AKTIVIERUNG',
      beschreibung: 'Der Web-Adapter ruft bei echter Aktivierung zusätzlich HTMLInputElement.click() auf. Der Aktivierungsschutz verhindert diesen Aufruf nicht.',
      beobachtungen: zusaetzlicheKlicks,
    });

    await pruefung('BOX-320', 'Zeitschiene der gebauten README-Probeseite bei 320 CSS-Pixeln', () =>
      pruefeBox320({ send, wert, frisch, berechnen, ausgabe, protokoll }));
  } finally {
    const fehler = [];
    for (const identifier of [instrumentation, exportInstrumentation, ...vorabSkripte]) {
      try { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier }); } catch (e) { fehler.push(e.message); }
    }
    try { await send('Page.setInterceptFileChooserDialog', { enabled: false }); } catch (e) { fehler.push(e.message); }
    if (fehler.length) throw new Messfehler(`Webadapter-Aufräumen unvollständig: ${fehler.join('; ')}`);
  }
}
