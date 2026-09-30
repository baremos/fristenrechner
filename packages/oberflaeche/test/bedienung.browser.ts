/** Browser-Vertragstest ohne zusätzliche Testbibliothek. Auf einer frisch gerenderten
 * Komponentenseite ausführen; der Aufrufer stellt eine isolierte Seite bereit. */
import { initFristenrechner } from '../src/fristenrechner-ui';
import { erstelleProjektDatei } from '@baremos/fristenrechner-kern';
import { beispiel } from './beispiel';
import { webTexte, webExportInhalt } from '../src/web-vorgaben';
import { type Plattform, type AusgabeDatei, type Auswahl, MAX_PROJEKT_BYTES } from '../src/plattform';

const zeit = { zeitpunkt: '2026-09-30T10:00:00.000Z', kalendertag: '2026-09-30' };
const pause = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));
function pruefe(wert: unknown, text: string): void { if (!wert) throw new Error(text); }
async function bis(fn: () => boolean) {
  for (let i = 0; i < 300; i++) { if (fn()) return; await pause(20); }
  throw new Error('Zeitüberschreitung');
}
function offen<T>() { let resolve!: (wert: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
export async function pruefeBedienung(vorlage: HTMLElement): Promise<string[]> {
  const erfolge: string[] = [];
  const original = vorlage.cloneNode(true) as HTMLElement;
  let rechner: { dispose(): void } | undefined;
  let root = vorlage;
  let gespeichert: string | null = null;
  let auswahl: Auswahl<{ name: string; text: string }> = { status: 'abgebrochen' };
  let bestaetigt = true;
  let ausgabeStatus: 'ok' | 'abgebrochen' = 'ok';
  const writes: string[] = [], reihenfolge: string[] = [], dateien: AusgabeDatei[] = [];
  let plattform: Plattform;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const feld = (name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  const click = (id: string) => el(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  function start() { rechner = initFristenrechner(root, { plattform, texte: webTexte, exportInhalt: webExportInhalt }); }
  async function neu(saved: string | null = null, starten = true) {
    rechner?.dispose(); await pause();
    root.remove(); root = original.cloneNode(true) as HTMLElement; document.body.append(root);
    gespeichert = saved; writes.length = 0; reihenfolge.length = 0; dateien.length = 0;
    auswahl = { status: 'abgebrochen' }; bestaetigt = true; ausgabeStatus = 'ok';
    plattform = {
      zeit: () => zeit,
      speicher: {
        async lesen() { return gespeichert; },
        async schreiben(json) { writes.push(json); reihenfolge.push('schreiben'); gespeichert = json; },
        async entfernen() { reihenfolge.push('entfernen'); gespeichert = null; },
      },
      import: { async waehlen(vorgabe) { pruefe(vorgabe.maxBytes === MAX_PROJEKT_BYTES, 'Importgrenze'); return auswahl; } },
      ausgabe: { async exportieren(datei) { dateien.push(datei); return { status: ausgabeStatus }; } },
      async zuruecksetzenBestaetigen() { return bestaetigt; },
    };
    if (starten) { start(); await pause(); }
  }
  try {
    await neu();
    pruefe(writes.length === 1 && feld('bekanntmachung').value === zeit.kalendertag, 'Initialisieren und Speichern');
    const anzahl = writes.length;
    feld('projektname').value = 'Mein Projekt'; feld('projektname').dispatchEvent(new Event('input', { bubbles: true }));
    await pause(100); pruefe(writes.length === anzahl, '350-ms-Verzögerung');
    await pause(300); pruefe(JSON.parse(writes[writes.length - 1]).input.projekt.projektname === 'Mein Projekt', 'Letzte Eingabe gespeichert');
    erfolge.push('Initialisieren, Plattformzeit und verzögertes Speichern');

    const json = JSON.stringify(erstelleProjektDatei(beispiel({ projekt: { projektname: 'Geladen' } }), zeit.zeitpunkt));
    await neu(json);
    pruefe(feld('projektname').value === 'Geladen' && writes.length === 0, 'Gespeichertes Projekt laden ohne Umschreiben');
    pruefe(el('project-file-meta').textContent?.includes('Rechenkern'), 'Dateimetadaten');
    erfolge.push('Laden und Metadaten ohne automatisches Umschreiben');

    let doppelt = false; try { start(); } catch { doppelt = true; }
    pruefe(doppelt, 'Doppelte Initialisierung abweisen');
    rechner!.dispose(); await pause();
    const zweite = original.cloneNode(true) as HTMLElement; document.body.append(zweite);
    let mehrere = false; try { start(); } catch { mehrere = true; }
    pruefe(mehrere, 'Zweite Komponente abweisen'); zweite.remove();
    start(); await pause(); erfolge.push('Eine Instanz, doppelte Initialisierung und erneuter Start nach dispose');

    await neu('{kaputt');
    feld('projektname').value = 'Nicht überschreiben'; feld('projektname').dispatchEvent(new Event('input', { bubbles: true }));
    await pause(400);
    pruefe(writes.length === 0 && gespeichert === '{kaputt' && el('storage-status').textContent?.includes('bleibt erhalten'), 'Ungültigen Speicher erhalten');
    erfolge.push('Ungültiger Speicher bleibt mit sichtbarer Meldung erhalten');

    await neu(json);
    click('open-json'); await pause();
    pruefe(feld('projektname').value === 'Geladen' && el('import-message').textContent === '', 'Importabbruch');
    auswahl = { status: 'ok', wert: { name: 'zu-gross.json', text: 'x'.repeat(MAX_PROJEKT_BYTES + 1) } };
    click('open-json'); await pause();
    pruefe(el('import-message').textContent?.includes('1 MiB') && feld('projektname').value === 'Geladen', 'Importgröße vor Parser');
    auswahl = { status: 'ok', wert: { name: 'kaputt.json', text: '{kaputt' } };
    click('open-json'); await pause();
    pruefe(Boolean(el('import-message').textContent) && feld('projektname').value === 'Geladen', 'Ungültige Datei');
    const importiert = JSON.stringify(erstelleProjektDatei(beispiel({ projekt: { projektname: 'Importiert' } }), zeit.zeitpunkt));
    auswahl = { status: 'ok', wert: { name: 'import.json', text: importiert } };
    click('open-json'); await bis(() => Boolean(el('import-message').textContent?.includes('geöffnet')));
    pruefe(feld('projektname').value === 'Importiert' && JSON.parse(gespeichert!).input.projekt.projektname === 'Importiert', 'Import setzt Formular und Speicher');
    erfolge.push('Import erfolgreich, Abbruch, zu groß und ungültig');

    for (const [id, status, endung] of [['save-json', 'export-message', '.json'], ['export-excel', 'excel-message', '.xlsx'], ['export-pdf', 'pdf-message', '.pdf']]) {
      const vorher = dateien.length; click(id);
      await bis(() => dateien.length === vorher + 1 && !el<HTMLButtonElement>(id).disabled);
      const datei = dateien[dateien.length - 1];
      pruefe(datei.name.endsWith(endung) && datei.bytes.length > 100, 'Exportbytes ' + endung);
      pruefe(el(status).textContent === webTexte.exportErfolg, 'Eigener Exportstatus ' + endung);
    }
    ausgabeStatus = 'abgebrochen'; click('save-json'); await pause();
    pruefe(el('export-message').textContent === webTexte.exportErfolg, 'Exportabbruch erhält die vorherige Meldung');
    erfolge.push('Drei Byte-Exporte über Ausgabeadapter und eigener Status, Ausgabeabbruch');

    const ausgabe = offen<{ status: 'ok' }>();
    plattform!.ausgabe.exportieren = async datei => { dateien.push(datei); return ausgabe.promise; };
    const vorher = dateien.length; click('export-excel');
    await bis(() => dateien.length === vorher + 1);
    click('export-excel');
    feld('projektname').value = 'Während Export geändert'; feld('projektname').dispatchEvent(new Event('change', { bubbles: true }));
    pruefe(el<HTMLButtonElement>('export-excel').disabled, 'Laufender Export bleibt gesperrt');
    pruefe(dateien[dateien.length - 1].name.includes('importiert'), 'Export behält Eingabestand');
    ausgabe.resolve({ status: 'ok' }); await pause();
    pruefe(dateien.length === vorher + 1 && !el<HTMLButtonElement>('export-excel').disabled, 'Kein doppelter Export');
    erfolge.push('Festgehaltener Exportstand, wiederholter Klick und Freigabe');

    bestaetigt = false; const alterName = feld('projektname').value; click('reset-project'); await pause();
    pruefe(feld('projektname').value === alterName && !reihenfolge.includes('entfernen'), 'Reset abgelehnt');
    bestaetigt = true; click('reset-project'); await bis(() => el('reset-message').textContent === 'Neues Projekt angelegt.');
    pruefe(feld('projektname').value === '' && feld('vergabeordnung').value === 'vgv', 'Reset Ausgangswerte');
    pruefe(reihenfolge.slice(-2).join(',') === 'entfernen,schreiben', 'Reset löscht vor neuem Schreiben');
    erfolge.push('Resetbestätigung und Löschen vor Schreiben des neuen Projekts');

    await neu(null, false);
    const lesen = offen<string | null>(); plattform!.speicher.lesen = () => lesen.promise;
    start(); rechner!.dispose(); const vorherText = root.textContent;
    lesen.resolve(json); await pause();
    pruefe(root.textContent === vorherText && writes.length === 0, 'dispose stoppt verspätetes Laden');
    erfolge.push('dispose während Laden verhindert späte DOM- und Speicheränderungen');
    return erfolge;
  } finally { rechner?.dispose(); }
}
