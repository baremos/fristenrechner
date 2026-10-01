import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEHLERCODES, PlattformFehler, type AusgabeDatei, type DateiAusgabe, type Fehlercode } from '@baremos/fristenrechner-ui/ui';
import { erzeugeNativeDateiAusgabe, type DateiablaufPlugin } from '../src/adapters/dateiausgabe';

type Methode = keyof DateiablaufPlugin;
type Weg = 'exportieren' | 'teilen';
const wege: Weg[] = ['exportieren', 'teilen'];
const MIB = 1024 * 1024;
const formate = [
  { name: 'PDF-Datei', mime: 'application/pdf', endung: 'pdf', grenze: 2 * MIB },
  { name: 'Excel-Datei', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', endung: 'xlsx', grenze: MIB },
  { name: 'Projektdatei', mime: 'application/json;charset=utf-8', endung: 'json', grenze: MIB },
] as const;
const fehlermeldungen: Record<Fehlercode, string> = {
  'nicht-verfuegbar': 'Die Dateifunktion ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.',
  'kein-speicher': 'Der Zwischenspeicher für Dateien ist voll. Bitte versuchen Sie es später erneut.',
  'zu-gross': 'Die Datei ist zu groß. Erlaubt sind höchstens 2 MiB für PDF und 1 MiB für Excel- und Projektdateien.',
  lesen: 'Die Datei konnte nicht gelesen werden.',
  schreiben: 'Die Datei konnte nicht vollständig geschrieben werden. Bitte versuchen Sie es erneut.',
  'kein-ziel': 'Es ist keine passende App zum Speichern oder Teilen verfügbar.',
};

function pruefbytes(anzahl: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: anzahl }, (_, i) => (i * 73 + (i >>> 8) + 19) & 255);
}

function datei(anzahl = 7, format: typeof formate[number] = formate[0]): AusgabeDatei {
  return { name: `Fristenplan.${format.endung}`, mime: format.mime, bytes: pruefbytes(anzahl) };
}

function ausgeben(adapter: DateiAusgabe, weg: Weg, inhalt = datei()) {
  if (weg === 'teilen') return adapter.teilen!(inhalt);
  return adapter.exportieren(inhalt);
}

function rueckfall(format: typeof formate[number], weg: Weg): string {
  return `Die ${format.name} konnte nicht zum ${weg === 'teilen' ? 'Teilen' : 'Speichern'} bereitgestellt werden. Bitte versuchen Sie es erneut.`;
}

function aufschub<T>() {
  let erfuellen!: (wert: T | PromiseLike<T>) => void;
  let ablehnen!: (grund: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => { erfuellen = resolve; ablehnen = reject; });
  return { promise, erfuellen, ablehnen };
}

function genau(args: object, felder: string[]) {
  expect(Reflect.ownKeys(args).sort()).toEqual([...felder].sort());
}

/** Prüft den Transportvertrag bei jedem Aufruf, bevor ein Fehler simuliert wird. */
class PluginFake implements DateiablaufPlugin {
  readonly aufrufe: { methode: Methode; args: object }[] = [];
  readonly bloecke: Buffer[] = [];
  eingriff: (methode: Methode) => void | Promise<void> = () => {};
  speichernStatus: unknown = 'ok';
  teilenStatus: unknown = 'bereitgestellt';
  private aktiv = false;
  private abgeschlossen = false;
  private anzahlBytes = 0;
  private offset = 0;
  private nummer = 0;
  private kennung = '';

  private async aufruf(methode: Methode, args: object) {
    this.aufrufe.push({ methode, args: { ...args } });
    await this.eingriff(methode);
  }

  private nurKennung(args: { auftragId: string }) {
    genau(args, ['auftragId']);
    expect(this.aktiv).toBe(true);
    expect(args.auftragId).toBe(this.kennung);
  }

  async ausgabeBeginnen(args: { name: string; mime: string; anzahlBytes: number }) {
    genau(args, ['name', 'mime', 'anzahlBytes']);
    expect(this.aktiv).toBe(false);
    expect(typeof args.name).toBe('string');
    expect(formate.some(format => format.mime === args.mime)).toBe(true);
    expect(Number.isInteger(args.anzahlBytes)).toBe(true);
    expect(args.anzahlBytes).toBeGreaterThan(0);
    await this.aufruf('ausgabeBeginnen', args);
    this.aktiv = true;
    this.abgeschlossen = false;
    this.anzahlBytes = args.anzahlBytes;
    this.offset = 0;
    this.kennung = `auftrag-${++this.nummer}`;
    return { auftragId: this.kennung };
  }

  async ausgabeBlock(args: { auftragId: string; offset: number; base64: string }) {
    genau(args, ['auftragId', 'offset', 'base64']);
    expect(this.aktiv).toBe(true);
    expect(this.abgeschlossen).toBe(false);
    expect(args.auftragId).toBe(this.kennung);
    expect(args.offset).toBe(this.offset);
    expect(args.base64).toMatch(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
    const bytes = Buffer.from(args.base64, 'base64');
    expect(bytes.toString('base64')).toBe(args.base64);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThanOrEqual(65_536);
    expect(this.offset + bytes.length).toBeLessThanOrEqual(this.anzahlBytes);
    await this.aufruf('ausgabeBlock', args);
    this.bloecke.push(bytes);
    this.offset += bytes.length;
  }

  async ausgabeAbschliessen(args: { auftragId: string }) {
    this.nurKennung(args);
    expect(this.abgeschlossen).toBe(false);
    expect(this.offset).toBe(this.anzahlBytes);
    await this.aufruf('ausgabeAbschliessen', args);
    this.abgeschlossen = true;
  }

  async speichernUnter(args: { auftragId: string }): Promise<{ status: 'ok' | 'abgebrochen' }> {
    this.nurKennung(args);
    expect(this.abgeschlossen).toBe(true);
    await this.aufruf('speichernUnter', args);
    if (this.speichernStatus === 'ok' || this.speichernStatus === 'abgebrochen') this.aktiv = false;
    return { status: this.speichernStatus as 'ok' | 'abgebrochen' };
  }

  async teilen(args: { auftragId: string }): Promise<{ status: 'bereitgestellt' }> {
    this.nurKennung(args);
    expect(this.abgeschlossen).toBe(true);
    await this.aufruf('teilen', args);
    if (this.teilenStatus === 'bereitgestellt') this.aktiv = false;
    return { status: this.teilenStatus as 'bereitgestellt' };
  }

  async ausgabeVerwerfen(args: { auftragId: string }) {
    this.nurKennung(args);
    try { await this.aufruf('ausgabeVerwerfen', args); }
    finally { this.aktiv = false; }
  }

  async projektWaehlen(): ReturnType<DateiablaufPlugin['projektWaehlen']> {
    throw new Error('Der Ausgabetest darf keinen Import starten.');
  }

  async zuruecksetzenBestaetigen(): ReturnType<DateiablaufPlugin['zuruecksetzenBestaetigen']> {
    throw new Error('Der Ausgabetest darf keinen Dialog starten.');
  }
}

function methoden(plugin: PluginFake) {
  return plugin.aufrufe.map(aufruf => aufruf.methode);
}

function halteAn(plugin: PluginFake, methode: Methode) {
  const erreicht = aufschub<void>();
  const weiter = aufschub<void>();
  plugin.eingriff = async aktuell => {
    if (aktuell === methode) {
      erreicht.erfuellen();
      await weiter.promise;
    }
  };
  return { erreicht: erreicht.promise, weiter };
}

afterEach(() => vi.unstubAllGlobals());

describe.each(wege)('Native Dateiausgabe: %s', weg => {
  it.each([1, 2, 3, 65_535, 65_536, 65_537, 131_071, 131_072, 131_073])(
    'überträgt %i Bytes vollständig und mit gleicher SHA-256-Prüfsumme', async anzahl => {
      vi.stubGlobal('btoa', () => { throw new Error('Binärstrings sind nicht erforderlich.'); });
      const plugin = new PluginFake();
      const inhalt = datei(anzahl);
      expect(await ausgeben(erzeugeNativeDateiAusgabe(plugin), weg, inhalt)).toEqual({ status: 'ok' });
      const erhalten = Buffer.concat(plugin.bloecke);
      expect(erhalten).toEqual(Buffer.from(inhalt.bytes));
      expect(createHash('sha256').update(erhalten).digest('hex'))
        .toBe(createHash('sha256').update(inhalt.bytes).digest('hex'));
      expect(plugin.bloecke).toHaveLength(Math.ceil(anzahl / 65_536));
      expect(methoden(plugin)).toEqual([
        'ausgabeBeginnen', ...plugin.bloecke.map(() => 'ausgabeBlock'),
        'ausgabeAbschliessen', weg === 'exportieren' ? 'speichernUnter' : 'teilen',
      ]);
    },
  );

  it('überträgt nur die Bytes einer Ansicht und lässt den Dateinamen unverändert', async () => {
    const plugin = new PluginFake();
    const traeger = pruefbytes(150_000);
    const bytes = traeger.subarray(13, 131_086);
    const inhalt = { ...datei(), name: 'Prüfung für Köln 2026.pdf', bytes };
    await ausgeben(erzeugeNativeDateiAusgabe(plugin), weg, inhalt);
    expect(plugin.aufrufe[0].args).toEqual({ name: inhalt.name, mime: inhalt.mime, anzahlBytes: bytes.byteLength });
    expect(Buffer.concat(plugin.bloecke)).toEqual(Buffer.from(bytes));
  });

  it.each(formate)('akzeptiert $name genau an der Grenze', async format => {
    const plugin = new PluginFake();
    expect(await ausgeben(erzeugeNativeDateiAusgabe(plugin), weg, datei(format.grenze, format))).toEqual({ status: 'ok' });
    expect(Buffer.concat(plugin.bloecke).length).toBe(format.grenze);
  });

  it.each(formate)('lehnt $name ein Byte über der Grenze vor dem ersten Auftrag ab', async format => {
    const plugin = new PluginFake();
    await expect(ausgeben(erzeugeNativeDateiAusgabe(plugin), weg, datei(format.grenze + 1, format)))
      .rejects.toMatchObject({ name: 'PlattformFehler', code: 'zu-gross', message: fehlermeldungen['zu-gross'] });
    expect(plugin.aufrufe).toEqual([]);
  });

  it.each(formate)('lehnt eine leere $name ohne nativen Auftrag ab', async format => {
    const plugin = new PluginFake();
    await expect(ausgeben(erzeugeNativeDateiAusgabe(plugin), weg, datei(0, format)))
      .rejects.toMatchObject({ name: 'PlattformFehler', code: 'schreiben', message: rueckfall(format, weg) });
    expect(plugin.aufrufe).toEqual([]);
  });

  it.each(FEHLERCODES)('erhält Code %s und den deutschen Text einschließlich Restdateihinweis', async code => {
    const plugin = new PluginFake();
    const message = fehlermeldungen[code] + ' Am gewählten Speicherort kann eine unvollständige Datei liegen.';
    plugin.eingriff = methode => {
      if (methode === 'ausgabeBlock') throw { code, message, data: { zielrestMoeglich: true } };
    };
    const fehler = await ausgeben(erzeugeNativeDateiAusgabe(plugin), weg).catch(error => error);
    expect(fehler).toBeInstanceOf(PlattformFehler);
    expect(fehler).toMatchObject({ code, message });
    expect(methoden(plugin)).toEqual(['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeVerwerfen']);
  });

  describe.each(formate)('Rückfall für $name', format => {
    it.each([
      { name: 'unbekannten Code', fehler: { code: 'EACCES', message: '/private/datei: permission denied' } },
      { name: 'fehlenden Code', fehler: new Error('/private/datei: permission denied') },
      { name: 'fehlende Fehlerdaten', fehler: undefined },
      { name: 'einfachen Fehlertext', fehler: '/private/datei: permission denied' },
    ])('ersetzt $name durch den Fehlertext der Oberfläche', async ({ fehler }) => {
      const plugin = new PluginFake();
      plugin.eingriff = methode => { if (methode === 'ausgabeBlock') throw fehler; };
      await expect(ausgeben(erzeugeNativeDateiAusgabe(plugin), weg, datei(5, format)))
        .rejects.toMatchObject({ name: 'PlattformFehler', code: 'schreiben', message: rueckfall(format, weg) });
      expect(methoden(plugin).at(-1)).toBe('ausgabeVerwerfen');
    });
  });

  it.each(['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeAbschliessen', 'ziel'] as const)(
    'räumt einen Fehler bei %s auf und gibt die Sperre wieder frei', async schritt => {
      const plugin = new PluginFake();
      const adapter = erzeugeNativeDateiAusgabe(plugin);
      const methode = schritt === 'ziel' ? (weg === 'exportieren' ? 'speichernUnter' : 'teilen') : schritt;
      plugin.eingriff = aktuell => {
        if (aktuell === methode) throw { code: 'schreiben', message: fehlermeldungen.schreiben };
      };
      await expect(ausgeben(adapter, weg)).rejects.toMatchObject({ code: 'schreiben', message: fehlermeldungen.schreiben });
      expect(methoden(plugin).filter(aktuell => aktuell === 'ausgabeVerwerfen'))
        .toHaveLength(methode === 'ausgabeBeginnen' ? 0 : 1);
      plugin.eingriff = () => {};
      expect(await ausgeben(adapter, weg)).toEqual({ status: 'ok' });
    },
  );

  it('verschluckt den Fehler beim Verwerfen und bewahrt den ursprünglichen Fehler', async () => {
    const plugin = new PluginFake();
    const adapter = erzeugeNativeDateiAusgabe(plugin);
    plugin.eingriff = methode => {
      if (methode === 'ausgabeBlock') throw { code: 'kein-speicher', message: fehlermeldungen['kein-speicher'] };
      if (methode === 'ausgabeVerwerfen') throw new Error('Verwerfen fehlgeschlagen');
    };
    await expect(ausgeben(adapter, weg)).rejects.toMatchObject({ code: 'kein-speicher', message: fehlermeldungen['kein-speicher'] });
    expect(methoden(plugin)).toEqual(['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeVerwerfen']);
    plugin.eingriff = () => {};
    expect(await ausgeben(adapter, weg)).toEqual({ status: 'ok' });
  });

  it.each(['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeAbschliessen', 'ziel'] as const)(
    'meldet keinen Erfolg vor der Antwort von %s', async schritt => {
      const plugin = new PluginFake();
      const methode = schritt === 'ziel' ? (weg === 'exportieren' ? 'speichernUnter' : 'teilen') : schritt;
      const halt = halteAn(plugin, methode);
      let erledigt = false;
      const ausgabe = ausgeben(erzeugeNativeDateiAusgabe(plugin), weg).then(ergebnis => { erledigt = true; return ergebnis; });
      await halt.erreicht;
      expect(erledigt).toBe(false);
      expect(methoden(plugin).at(-1)).toBe(methode);
      halt.weiter.erfuellen();
      expect(await ausgabe).toEqual({ status: 'ok' });
      expect(erledigt).toBe(true);
    },
  );

  it('behandelt einen ungültigen abschließenden Status als Schreibfehler', async () => {
    const plugin = new PluginFake();
    plugin.speichernStatus = 'bereitgestellt';
    plugin.teilenStatus = 'ok';
    await expect(ausgeben(erzeugeNativeDateiAusgabe(plugin), weg))
      .rejects.toMatchObject({ code: 'schreiben', message: rueckfall(formate[0], weg) });
    expect(methoden(plugin).at(-1)).toBe('ausgabeVerwerfen');
  });
});

describe('Abbruch und gemeinsame Sperre', () => {
  it('gibt Abbruch zurück und erlaubt danach einen neuen Auftrag ohne Verwerfen', async () => {
    const plugin = new PluginFake();
    plugin.speichernStatus = 'abgebrochen';
    const adapter = erzeugeNativeDateiAusgabe(plugin);
    expect(await adapter.exportieren(datei())).toEqual({ status: 'abgebrochen' });
    expect(methoden(plugin)).toEqual(['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeAbschliessen', 'speichernUnter']);
    plugin.speichernStatus = 'ok';
    expect(await adapter.exportieren(datei())).toEqual({ status: 'ok' });
  });

  it.each(wege.flatMap(erster => wege.map(zweiter => ({ erster, zweiter }))))(
    'sperrt $zweiter während $erster schon beim Beginn wartet', async ({ erster, zweiter }) => {
      const plugin = new PluginFake();
      const halt = halteAn(plugin, 'ausgabeBeginnen');
      const adapter = erzeugeNativeDateiAusgabe(plugin);
      const ausgabe = ausgeben(adapter, erster);
      await halt.erreicht;
      await expect(ausgeben(adapter, zweiter))
        .rejects.toMatchObject({ code: 'nicht-verfuegbar', message: fehlermeldungen['nicht-verfuegbar'] });
      expect(methoden(plugin)).toEqual(['ausgabeBeginnen']);
      halt.weiter.erfuellen();
      expect(await ausgabe).toEqual({ status: 'ok' });
    },
  );

  it('hält die Sperre bis zum Ende des Verwerfens und verwirft keinen fremden Auftrag', async () => {
    const plugin = new PluginFake();
    const halt = halteAn(plugin, 'ausgabeVerwerfen');
    const warten = plugin.eingriff;
    plugin.eingriff = async methode => {
      if (methode === 'ausgabeBlock') throw { code: 'kein-speicher', message: fehlermeldungen['kein-speicher'] };
      await warten(methode);
    };
    const adapter = erzeugeNativeDateiAusgabe(plugin);
    let beendet = false;
    const ausgabe = adapter.exportieren(datei()).catch(fehler => { beendet = true; return fehler; });
    await halt.erreicht;
    expect(beendet).toBe(false);
    await expect(adapter.teilen!(datei())).rejects.toMatchObject({ code: 'nicht-verfuegbar' });
    expect(methoden(plugin)).toEqual(['ausgabeBeginnen', 'ausgabeBlock', 'ausgabeVerwerfen']);
    halt.weiter.ablehnen(new Error('Verwerfen fehlgeschlagen'));
    expect(await ausgabe).toMatchObject({ code: 'kein-speicher', message: fehlermeldungen['kein-speicher'] });
    plugin.eingriff = () => {};
    expect(await adapter.teilen!(datei())).toEqual({ status: 'ok' });
  });
});
