import { PlattformFehler, pruefeProjektGroesse, MAX_PROJEKT_BYTES, type Auswahl, type ExportZeit, type Plattform, type ProjektSpeicher } from './plattform';

export const WEB_SPEICHERSCHLUESSEL = 'baremos-fristenrechner-projekt-v1';

/** Website und WebView verwenden denselben Schlüssel, dieselben Prüfungen und Texte. */
export function erzeugeWebSpeicher(fenster: Pick<Window, 'localStorage'>): ProjektSpeicher {
  return {
    async lesen() {
      try {
        const text = fenster.localStorage.getItem(WEB_SPEICHERSCHLUESSEL);
        if (text !== null) pruefeProjektGroesse(text);
        return text;
      } catch (error) {
        if (error instanceof PlattformFehler) throw error;
        throw new PlattformFehler('nicht-verfuegbar', 'Der lokale Speicher konnte nicht gelesen werden.');
      }
    },
    async schreiben(json) {
      try { fenster.localStorage.setItem(WEB_SPEICHERSCHLUESSEL, json); }
      catch { throw new PlattformFehler('kein-speicher', 'Das Projekt konnte nicht gespeichert werden.'); }
    },
    async entfernen() {
      try { fenster.localStorage.removeItem(WEB_SPEICHERSCHLUESSEL); }
      catch { throw new PlattformFehler('schreiben', 'Das gespeicherte Projekt konnte nicht entfernt werden.'); }
    },
  };
}

export function webZeit(): ExportZeit {
  const jetzt = new Date();
  return {
    zeitpunkt: jetzt.toISOString(),
    kalendertag: `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`,
  };
}

/** Der Gastgeber besitzt den Adapter und räumt ihn nach dem Rechner mit dispose auf. */
export function erzeugeWebPlattform(root: HTMLElement): Plattform & { dispose(): void } {
  const feld = root.querySelector<HTMLInputElement>('#open-json');
  if (!feld) throw new Error('Das Dateifeld für den Projektimport fehlt.');
  const fenster = root.ownerDocument.defaultView!;
  let feldKlick: Event | undefined;
  const nutzerEreignisse = new Map<string, Event>();
  const aktivierungsEreignisse = ['click', 'keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend'];
  const nutztAktivierungsRueckfall = fenster.navigator?.userActivation === undefined;
  let geschlossen = false;
  let abbrechen: (() => void) | undefined;
  // eventPhase bleibt auch bei Mikrotasks zwischen Listenern gesetzt und
  // endet mit dem Ereignis. Pro Typ bleibt höchstens ein Ereignis gespeichert.
  const laeuft = (event: Event | undefined): boolean => !!event && event.eventPhase !== 0;
  const nutzerAktiviert = (event: Event): void => {
    if (!event.isTrusted) return;
    if (event.type === 'keydown') {
      if ((event as KeyboardEvent).key === 'Escape') return;
    }
    if (event.type === 'pointerdown' && (event as PointerEvent).pointerType !== 'mouse') return;
    if (event.type === 'pointerup' && (event as PointerEvent).pointerType === 'mouse') return;
    nutzerEreignisse.set(event.type, event);
  };
  const aktiviertDurchKlick = (event: Event): void => { feldKlick = event; };
  if (nutztAktivierungsRueckfall) {
    for (const typ of aktivierungsEreignisse) fenster.addEventListener(typ, nutzerAktiviert, true);
  }
  feld.addEventListener('click', aktiviertDurchKlick, true);
  return {
    speicher: erzeugeWebSpeicher(fenster),
    import: {
      waehlen(vorgabe) {
        if (geschlossen) return Promise.resolve({ status: 'abgebrochen' });
        if (abbrechen) return Promise.reject(new PlattformFehler('lesen', 'Eine Dateiauswahl ist bereits geöffnet.'));
        // Nur während einer Nutzergeste beginnen. Ein synthetischer Feldklick
        // allein ist keine Aktivierung; Gastgeber können synchron ihre API nutzen.
        const aktivierung = fenster.navigator?.userActivation;
        const hatNutzeraktivierung = aktivierung !== undefined ? aktivierung.isActive
          : Array.from(nutzerEreignisse.values()).some(event => event.isTrusted && laeuft(event));
        if (!(laeuft(feldKlick) && feldKlick!.isTrusted)
          && !hatNutzeraktivierung) return Promise.resolve({ status: 'abgebrochen' });
        return new Promise<Auswahl<{ name: string; text: string }>>((resolve, reject) => {
          let fertig = false;
          let liest = false;
          let timer: number | undefined;
          const aufraeumen = () => {
            fertig = true;
            feld.removeEventListener('change', ausgewaehlt);
            feld.removeEventListener('cancel', abbruch);
            fenster.removeEventListener('focus', fokus);
            fenster.clearTimeout(timer);
            feld.value = '';
            abbrechen = undefined;
          };
          const abbruch = () => {
            if (fertig) return;
            aufraeumen(); resolve({ status: 'abgebrochen' });
          };
          const ausgewaehlt = async () => {
            if (fertig || liest) return;
            const datei = feld.files?.[0];
            if (!datei) { abbruch(); return; }
            liest = true;
            try {
              const grenze = Math.min(MAX_PROJEKT_BYTES, vorgabe.maxBytes);
              if (datei.size > grenze) throw new PlattformFehler('zu-gross', 'Die Projektdatei ist größer als 1 MiB.');
              const text = await datei.text();
              if (fertig) return;
              pruefeProjektGroesse(text, grenze);
              aufraeumen(); resolve({ status: 'ok', wert: { name: datei.name, text } });
            } catch (error) {
              if (fertig) return;
              aufraeumen();
              reject(error instanceof PlattformFehler ? error : new PlattformFehler('lesen', 'Die Projektdatei konnte nicht gelesen werden.'));
            }
          };
          // Chromium 83 hat kein cancel-Ereignis am Dateifeld. Nach Rückkehr zum
          // Fenster prüfen wir die Auswahl; change kann dabei bereits gelesen haben.
          const fokus = () => {
            fenster.clearTimeout(timer);
            timer = fenster.setTimeout(() => {
              if (!liest && !fertig) { if (feld.files?.length) void ausgewaehlt(); else abbruch(); }
            }, 300);
          };
          abbrechen = abbruch;
          feld.value = '';
          feld.accept = `${vorgabe.mime},${vorgabe.endungen.join(',')}`;
          feld.addEventListener('change', ausgewaehlt);
          feld.addEventListener('cancel', abbruch);
          fenster.addEventListener('focus', fokus);
          if (!laeuft(feldKlick)) feld.click();
        });
      },
    },
    ausgabe: {
      async exportieren(datei) {
        let url: string | undefined;
        const link = root.ownerDocument.createElement('a');
        try {
          url = URL.createObjectURL(new Blob([datei.bytes], { type: datei.mime }));
          link.href = url; link.download = datei.name; link.hidden = true;
          root.append(link); link.click();
          return { status: 'ok' };
        } catch { throw new PlattformFehler('kein-ziel', 'Die Datei konnte nicht zum Speichern bereitgestellt werden.'); }
        finally {
          link.remove();
          // Dem Browser Zeit geben, den Download anzunehmen.
          if (url) { const adresse = url; fenster.setTimeout(() => URL.revokeObjectURL(adresse), 1000); }
        }
      },
    },
    zeit: webZeit,
    async zuruecksetzenBestaetigen() { return fenster.confirm('Alle Eingaben dieses lokal gespeicherten Projekts zurücksetzen?'); },
    dispose() {
      geschlossen = true;
      if (nutztAktivierungsRueckfall) {
        for (const typ of aktivierungsEreignisse) fenster.removeEventListener(typ, nutzerAktiviert, true);
      }
      nutzerEreignisse.clear();
      feldKlick = undefined;
      feld.removeEventListener('click', aktiviertDurchKlick, true);
      abbrechen?.();
    },
  };
}
