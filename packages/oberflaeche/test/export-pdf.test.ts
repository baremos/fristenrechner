import { expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { pdfAlsDatei } from '../src/fristenrechner-export-pdf';
import { exportHaftungshinweis, exportHinweis } from '../src/fristenrechner-export-data';
import { webExportInhalt } from '../src/web-vorgaben';
import { beispiel, eingabe, ergebnis, ZEITPUNKT, KALENDERTAG } from './beispiel';
import { calculateSchedule, REGELVERSION, RECHTSSTAND_DATUM } from '@baremos/fristenrechner-kern';

const zeit = { zeitpunkt: ZEITPUNKT, kalendertag: KALENDERTAG };
const pdfText = (bytes: Uint8Array) => Array.from(bytes, byte => String.fromCharCode(byte)).join('');

// Die Exporte schreiben unkomprimierte Seitenströme mit Helvetica/WinAnsi.
// Hier werden nur deren Text-, Linien- und Rechteckbefehle gelesen.
function pdfSeiten(bytes: Uint8Array) {
  const inhalt = pdfText(bytes);
  const punkteProMm = 72 / 25.4;
  const seitenhoehe = Number(inhalt.match(/\/MediaBox \[0 0 [\d.]+ ([\d.]+)\]/)![1]);
  const dekodiere = (text: string) => new TextDecoder('windows-1252').decode(Uint8Array.from(
    text.replace(/\\([\\()])/g, '$1'), zeichen => zeichen.charCodeAt(0),
  ));
  const seiten = [...inhalt.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((seite) => {
    const stream = seite[1];
    const texte: { text: string; x: number; y: number; zeilenabstand: number; schriftgroesse: number; schrift: string; farbe: number[] }[] = [];
    for (const block of stream.matchAll(/BT\n([\s\S]*?)\nET/g)) {
      let x = 0; let y = 0;
      const zeilenabstand = Number(block[1].match(/([\d.]+) TL/)![1]);
      const schrift = block[1].match(/\/(\w+) ([\d.]+) Tf/)!;
      const farbe = block[1].match(/([\d.]+) ([\d.]+) ([\d.]+) rg/);
      for (const befehl of block[1].matchAll(/(-?[\d.]+) (-?[\d.]+) Td|\(((?:\\.|[^\\)])*)\) Tj|(T\*)/g)) {
        if (befehl[1] !== undefined) { x += Number(befehl[1]); y += Number(befehl[2]); }
        else if (befehl[3] !== undefined) texte.push({ text: dekodiere(befehl[3]), x: x / punkteProMm,
          y: (seitenhoehe - y) / punkteProMm, zeilenabstand: zeilenabstand / punkteProMm,
          schriftgroesse: Number(schrift[2]), schrift: schrift[1], farbe: farbe ? farbe.slice(1).map(Number) : [] });
        else y -= zeilenabstand;
      }
    }
    const trennlinien = [...stream.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l\nS/g)]
      .filter(linie => linie[2] === linie[4]).map(linie => (seitenhoehe - Number(linie[2])) / punkteProMm);
    const rechtecke = [...stream.matchAll(/-?[\d.]+ (-?[\d.]+) -?[\d.]+ (-?[\d.]+) re/g)];
    const rechteckAnfaenge = rechtecke.map(rechteck => (seitenhoehe - Number(rechteck[1])) / punkteProMm);
    const rechteckEnden = rechtecke.map(rechteck => (seitenhoehe - Number(rechteck[1]) - Number(rechteck[2])) / punkteProMm);
    return { texte, trennlinie: Math.min(...trennlinien), fussTrennlinie: Math.max(...trennlinien),
      rechteckAnfang: Math.min(...rechteckAnfaenge), rechteckEnde: Math.max(...rechteckEnden), seitenhoehe: seitenhoehe / punkteProMm };
  });
  expect(seiten).toHaveLength(inhalt.match(/\/Type \/Page\b/g)!.length);
  return seiten;
}

it.each([true, false])('PDF-Fußzeile richtet den Block und die seitlichen Texte in Helvetica 8 pt aus (Adresse: %s)', async (mitAdresse) => {
  const inhalt = { ...webExportInhalt, adresse: mitAdresse ? webExportInhalt.adresse : undefined };
  const seiten = pdfSeiten((await pdfAlsDatei(eingabe, ergebnis, zeit, inhalt)).bytes);
  const mass = new jsPDF({ unit: 'mm', format: 'a4' });
  mass.setFont('helvetica', 'normal'); mass.setFontSize(8);
  const breite = mass.internal.pageSize.getWidth();
  for (const [index, seite] of seiten.entries()) {
    const fuss = seite.texte.filter(text => text.y > seite.fussTrennlinie);
    expect(fuss).toHaveLength(mitAdresse ? 4 : 3);
    const haftung = fuss.find(text => text.text === exportHaftungshinweis)!;
    const herausgeber = fuss.find(text => text.text === inhalt.herausgeber)!;
    const seitenzahl = fuss.find(text => text.text === `Seite ${index + 1} von ${seiten.length}`)!;
    const adresse = fuss.find(text => text.text === webExportInhalt.adresse!.text);
    expect(adresse !== undefined).toBe(mitAdresse);
    const ersteZeile = mitAdresse ? adresse! : haftung;
    expect(haftung.y - ersteZeile.y).toBeCloseTo(mitAdresse ? haftung.zeilenabstand : 0, 8);
    expect(ersteZeile.y - seite.fussTrennlinie).toBeCloseTo(4.5, 8);
    expect(herausgeber.y).toBeCloseTo((ersteZeile.y + haftung.y) / 2, 8);
    expect(seitenzahl.y).toBeCloseTo(herausgeber.y, 8);
    expect(herausgeber.x).toBeCloseTo(12, 8);
    expect(seitenzahl.x + mass.getTextWidth(seitenzahl.text)).toBeCloseTo(breite - 12, 8);
    for (const text of mitAdresse ? [adresse!, haftung] : [haftung])
      expect(text.x + mass.getTextWidth(text.text) / 2).toBeCloseTo(breite / 2, 8);
    for (const text of fuss) {
      expect(text.schriftgroesse).toBe(8);
      expect(text.schrift).toBe('F1'); // Helvetica normal in jsPDFs Standardschriften.
      expect(text.farbe).toHaveLength(3);
      for (const [i, kanal] of [93, 93, 98].entries()) expect(text.farbe[i]).toBeCloseTo(kanal / 255, 3);
    }
    expect(seite.texte.map(text => text.text).join('\n')).not.toContain(exportHinweis(inhalt));
  }
});

it.each([true, false])('PDF-Inhalt endet auch auf den letzten Tabellen- und Zeitschienenseiten oberhalb der Fußtrennlinie (Adresse: %s)', async (mitAdresse) => {
  const result = calculateSchedule(eingabe);
  result.warnungen = Array.from({ length: 65 }, (_, i) => `Zusätzlicher Warnhinweis ${i + 1}`);
  result.phasen = [...result.phasen, ...result.phasen, ...result.phasen];
  const inhalt = { ...webExportInhalt, adresse: mitAdresse ? webExportInhalt.adresse : undefined };
  const seiten = pdfSeiten((await pdfAlsDatei(eingabe, result, zeit, inhalt)).bytes);
  const tabellenseiten = seiten.filter(seite => seite.texte.some(text => ['Datum / Zeitraum', 'Warnungen'].includes(text.text)));
  const zeitschienenseiten = seiten.filter(seite => seite.texte.some(text => text.text.startsWith('Phase ')));
  expect(tabellenseiten.length).toBeGreaterThan(1);
  expect(zeitschienenseiten.length).toBeGreaterThan(1);
  for (const seite of seiten) {
    expect(seite.rechteckEnde).toBeLessThanOrEqual(seite.fussTrennlinie - 5 + 0.000001);
    const inhalt = seite.texte.filter(text => text.y > seite.trennlinie && text.y < seite.fussTrennlinie);
    for (const text of inhalt) expect(text.y + text.schriftgroesse / (72 / 25.4)).toBeLessThan(seite.fussTrennlinie);
  }
  for (const gruppe of [tabellenseiten, zeitschienenseiten]) {
    const letzte = gruppe[gruppe.length - 1];
    expect(letzte.rechteckEnde).toBeLessThan(letzte.fussTrennlinie);
  }
});

it.each([true, false])('PDF bricht einen langen Herausgeber im vorhandenen Fußbereich in zwei Zeilen um (Adresse: %s)', async (mitAdresse) => {
  const kurz = { ...webExportInhalt, adresse: mitAdresse ? webExportInhalt.adresse : undefined };
  const inhalt = { ...kurz, herausgeber: 'Vergabestelle des Landkreises Musterkreis' };
  const referenz = pdfSeiten((await pdfAlsDatei(eingabe, ergebnis, zeit, kurz)).bytes);
  const seiten = pdfSeiten((await pdfAlsDatei(eingabe, ergebnis, zeit, inhalt)).bytes);
  expect(seiten).toHaveLength(referenz.length);
  for (const [index, seite] of seiten.entries()) {
    const fuss = seite.texte.filter(text => text.y > seite.fussTrennlinie);
    const herausgeber = fuss.filter(text => Math.abs(text.x - 12) < 0.000001);
    expect(herausgeber).toHaveLength(2);
    expect(herausgeber.map(text => text.text).join(' ')).toBe(inhalt.herausgeber);
    const mitte = fuss.filter(text => [webExportInhalt.adresse!.text, exportHaftungshinweis].includes(text.text));
    expect((herausgeber[0].y + herausgeber[1].y) / 2).toBeCloseTo((mitte[0].y + mitte[mitte.length - 1].y) / 2, 8);
    expect(herausgeber[0].y - 8 / (72 / 25.4)).toBeGreaterThan(seite.fussTrennlinie);
    expect(herausgeber[1].y + 8 / (72 / 25.4)).toBeLessThan(seite.seitenhoehe);
    expect(seite.fussTrennlinie).toBe(referenz[index].fussTrennlinie);
    expect(seite.rechteckEnde).toBe(referenz[index].rechteckEnde);
  }
});

it.each([
  { ...webExportInhalt, herausgeber: 'Ein zu langer Herausgeber '.repeat(10) },
  { ...webExportInhalt, herausgeber: 'Herausgeber\nZusatz' },
  { ...webExportInhalt, adresse: { text: 'Eine zu lange Adresse '.repeat(20), href: 'https://example.org' } },
  { ...webExportInhalt, adresse: { text: 'Adresse\nZusatz', href: 'https://example.org' } },
])('PDF scheitert bei einer Fußzeile ohne Platz geschlossen (%j)', async (inhalt) => {
  await expect(pdfAlsDatei(eingabe, ergebnis, zeit, inhalt)).rejects.toThrow(/Fußzeilenblock/);
});

it('PDF zeigt Kopffelder mit 200/200/100 Zeichen auf jeder Seite vollständig untereinander', async () => {
  const bis = (text: string, laenge: number) => text.repeat(Math.ceil(laenge / text.length)).slice(0, laenge).replace(/\s$/, 'X');
  const projekt = { kunde: bis('Kunde ÄÖÜ & Beschaffungsstelle Berlin / ', 200),
    projektname: bis('Projekt Geräte und Zubehör – Abschnitt § 3 / ', 200),
    vergabenummer: bis('VG-2026-ÄÖÜ-Los-1234567890-', 100) };
  expect(Object.values(projekt).map(wert => wert.length)).toEqual([200, 200, 100]);
  const input = beispiel({ projekt });
  const result = calculateSchedule(input);
  // Auch die Folgeblätter der Warnungstabelle müssen den höheren Kopf beachten.
  result.warnungen = Array.from({ length: 40 }, (_, i) => `Zusätzlicher Warnhinweis ${i + 1}`);
  // Wiederholte Phasen erzwingen zusätzlich einen manuellen Zeitschienenumbruch.
  result.phasen = [...result.phasen, ...result.phasen];
  const seiten = pdfSeiten((await pdfAlsDatei(input, result, zeit, webExportInhalt)).bytes);
  expect(seiten.length).toBeGreaterThan(3);
  let kopfzeilen = 0;
  for (const seite of seiten) {
    const kopf = seite.texte.filter(text => text.y < seite.trennlinie);
    const ohneLeerraum = (text: string) => text.replace(/\s/g, '');
    const text = ohneLeerraum(kopf.map(zeile => zeile.text).join(''));
    for (const wert of Object.values(projekt)) expect(text).toContain(ohneLeerraum(wert));
    expect(kopf.length).toBeGreaterThan(2);
    if (kopfzeilen) expect(kopf).toHaveLength(kopfzeilen);
    kopfzeilen = kopf.length;
    const versatz = (kopf.length - 2) * kopf[0].zeilenabstand;
    expect(seite.trennlinie).toBeCloseTo(17 + versatz, 8);
    expect(seite.trennlinie).toBeGreaterThan(kopf[kopf.length - 1].y);
    expect(seite.rechteckAnfang).toBeGreaterThan(seite.trennlinie);
    const tabellenkopf = seite.texte.find(text => ['Datum / Zeitraum', 'Warnungen'].includes(text.text));
    if (tabellenkopf && !seite.texte.some(text => text.text.startsWith('Erstellungsdatum:')))
      expect(seite.rechteckAnfang).toBeCloseTo(21 + versatz, 8);
    const zeitschiene = seite.texte.find(text => text.text === 'Zeitschiene');
    if (zeitschiene) expect(zeitschiene.y).toBeCloseTo(25 + versatz, 8);
    else if (seite.texte.some(text => text.text.startsWith('Phase ')))
      expect(seite.rechteckAnfang).toBeCloseTo(25 + versatz, 8);
  }
});

it.each(['Kunde', 'Kunde\nZusatz'])('PDF behält bei kurzem Kopf (%s) ohne Blockumbrüche alle bisherigen Anfangspositionen', async (kunde) => {
  const input = beispiel({ verfahrensart: 'offen', projekt: { kunde, projektname: 'Projekt', vergabenummer: '123' } });
  const seiten = pdfSeiten((await pdfAlsDatei(input, calculateSchedule(input), zeit, webExportInhalt)).bytes);
  for (const seite of seiten) expect(seite.trennlinie).toBeCloseTo(17, 8);
  const position = (anfang: string) => seiten[0].texte.find(text => text.text.startsWith(anfang))!.y;
  for (const [text, y] of [[webExportInhalt.titel, 25], ['Verfahrensart:', 32], ['Bundesland:', 32],
    ['Erstellungsdatum:', 39], ['Rechtsstand:', 39], ['Regelversion:', 46], ['Bindefrist:', 53]] as const)
    expect(position(text)).toBeCloseTo(y, 8);
  expect(seiten[0].rechteckAnfang).toBeCloseTo(62, 8);
  expect(seiten.find(seite => seite.texte.some(text => text.text === 'Zeitschiene'))!.texte
    .find(text => text.text === 'Zeitschiene')!.y).toBeCloseTo(25, 8);
  const ohneBindefrist = calculateSchedule(beispiel({ ...input, fristen: {} }));
  expect(pdfSeiten((await pdfAlsDatei(input, ohneBindefrist, zeit, webExportInhalt)).bytes)[0].rechteckAnfang).toBeCloseTo(55, 8);
});

it('PDF rückt nach umbrechender Verfahrensart beide Spalten um einen vollen Zeilenabstand nach', async () => {
  const seite = pdfSeiten((await pdfAlsDatei(eingabe, ergebnis, zeit, webExportInhalt)).bytes)[0];
  const verfahren = seite.texte.filter(text => text.x < 13 && text.y >= 31.999 && text.y < 38.999);
  expect(verfahren.map(text => text.text).join(' ')).toContain('Verhandlungsverfahren mit Teilnahmewettbewerb');
  expect(verfahren).toHaveLength(2);
  const datum = seite.texte.find(text => text.text.startsWith('Erstellungsdatum:'))!;
  const rechtsstand = seite.texte.find(text => text.text.startsWith('Rechtsstand:'))!;
  expect(datum.y - verfahren[verfahren.length - 1].y).toBeGreaterThanOrEqual(verfahren[0].zeilenabstand);
  expect(datum.y).toBeCloseTo(39 + verfahren[0].zeilenabstand, 8);
  expect(rechtsstand.y).toBeCloseTo(datum.y, 8);
});

it('PDF berücksichtigt auch Titelumbruch und Umbrüche in der rechten Kopfspalte und im Regelstand', async () => {
  const input = beispiel({ verfahrensart: 'offen', projekt: {} });
  const result = calculateSchedule(input);
  result.rechtsstand = 'Ein ausführlicher Rechtsstand mit zusätzlichen Angaben '.repeat(5).trim();
  const inhalt = { ...webExportInhalt, titel: 'Ein ausführlicher Titel für den Fristenplan '.repeat(3).trim() };
  const seite = pdfSeiten((await pdfAlsDatei(input, result, zeit, inhalt)).bytes)[0];
  const verfahren = seite.texte.find(text => text.text.startsWith('Verfahrensart:'))!;
  const titel = seite.texte.filter(text => text.y < verfahren.y && text.y > seite.trennlinie);
  expect(titel.length).toBeGreaterThan(1);
  expect(verfahren.y - titel[titel.length - 1].y).toBeCloseTo(7, 8);
  const datum = seite.texte.find(text => text.text.startsWith('Erstellungsdatum:'))!;
  const regel = seite.texte.find(text => text.text.startsWith('Regelversion:'))!;
  const rechtsstand = seite.texte.filter(text => text.x > 100 && text.y >= datum.y - 0.001 && text.y < regel.y);
  expect(rechtsstand.length).toBeGreaterThan(1);
  expect(rechtsstand[0].y).toBeCloseTo(datum.y, 8);
  expect(regel.y - rechtsstand[rechtsstand.length - 1].y).toBeCloseTo(7, 8);
  const bindefrist = seite.texte.find(text => text.text.startsWith('Bindefrist:'))!;
  const regelzeilen = seite.texte.filter(text => text.y >= regel.y - 0.001 && text.y < bindefrist.y);
  expect(regelzeilen.length).toBeGreaterThan(1);
  expect(bindefrist.y - regelzeilen[regelzeilen.length - 1].y).toBeCloseTo(7, 8);
});

it('PDF scheitert bei einem Kopf oder Zeitschienenblock ohne Platz auf der Seite geschlossen', async () => {
  const input = beispiel({ projekt: { kunde: 'K\n'.repeat(99) + 'KK' } });
  await expect(pdfAlsDatei(input, calculateSchedule(input), zeit, webExportInhalt)).rejects.toThrow(/Kopfblock/);
  const result = calculateSchedule(eingabe);
  result.phasen[0].meilensteine = Array(100).fill(result.phasen[0].meilensteine[0]);
  await expect(pdfAlsDatei(eingabe, result, zeit, webExportInhalt)).rejects.toThrow(/Zeitschienenblock/);
});

it('PDF-Datei entsteht ohne Browser und zeigt Metadaten und Seitenzahlen', async () => {
  const datei = await pdfAlsDatei(eingabe, ergebnis, zeit, webExportInhalt);
  const inhalt = pdfText(datei.bytes);
  expect(datei.name).toBe('BAREMOS-IT_fristenplan-test-2026-01.pdf');
  expect(datei.mime).toBe('application/pdf');
  expect(inhalt).toMatch(/^%PDF-/);
  expect(inhalt).toContain(`Regelversion: ${REGELVERSION}`);
  expect(inhalt).toContain(RECHTSSTAND_DATUM);
  expect(inhalt).toContain('29.09.2026');
  expect(inhalt).toContain('BAREMOS IT GmbH');
  expect(inhalt).not.toContain('©');
  const seiten = inhalt.match(/\/Type \/Page\b/g)!.length;
  expect(seiten).toBeGreaterThan(1);
  expect(inhalt.split(exportHaftungshinweis)).toHaveLength(seiten + 1);
  expect(inhalt.split(webExportInhalt.adresse!.text)).toHaveLength(seiten + 1);
  expect(inhalt.split(webExportInhalt.herausgeber)).toHaveLength(seiten + 1);
  expect(inhalt).not.toContain(exportHinweis(webExportInhalt));
  expect(inhalt).toContain(`Seite ${seiten} von ${seiten}`);
  expect(inhalt).toContain('Zeitschiene');
});
it('PDF ohne Bindefrist und ohne Phasen bleibt erzeugbar', async () => {
  const input = beispiel({ fristen: {}, projekt: {} });
  const result = calculateSchedule(input);
  result.phasen = []; result.warnungen = [];
  const inhalt = pdfText((await pdfAlsDatei(input, result, zeit, webExportInhalt)).bytes);
  expect(inhalt).toContain(`Regelversion: ${REGELVERSION}`);
  expect(inhalt).not.toContain('(Zeitschiene)');
  expect(inhalt).toContain(exportHaftungshinweis);
});
it('PDF bleibt bei gleichen Zeit- und Zufallswerten bytegleich zur Referenz mit festem Hinweis', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ZEITPUNKT));
  // Verschiedene Werte erhalten jsPDFs interne Ereigniskennungen eindeutig.
  let zufall = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => 0.25 + (++zufall) / 1000000);
  try {
    const datei = await pdfAlsDatei(eingabe, ergebnis, zeit, webExportInhalt);
    // Nur die Darstellung derselben Erstellungszeit in der Zeitzone des Rechners
    // wird für den plattformübergreifenden Referenzvergleich vereinheitlicht.
    const text = pdfText(datei.bytes).replace(/\/CreationDate \([^)]*\)/, "/CreationDate (D:20260929003000+02'00')");
    const bytes = Uint8Array.from(text, zeichen => zeichen.charCodeAt(0));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    expect(Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join(''))
      .toBe('529015e5d2c367acc3dc269c530c27f02a3be3e201f03a3f331d6a1a21a98f18');
  } finally { vi.restoreAllMocks(); vi.useRealTimers(); }
});
it('PDF verwendet den übergebenen Kalendertag und die Inhalte des Gastgebers', async () => {
  const inhalt = { herausgeber: 'Beispielverlag', titel: 'Terminplan', dateiPraefix: 'BEISPIEL_' };
  const datei = await pdfAlsDatei(beispiel({ projekt: {} }), ergebnis, { zeitpunkt: ZEITPUNKT, kalendertag: '2026-09-30' }, inhalt);
  const text = pdfText(datei.bytes);
  expect(datei.name).toBe('BEISPIEL_fristenplan-2026-09-30.pdf');
  expect(text).toContain('Beispielverlag');
  expect(text).toContain('(Terminplan)');
  expect(text).toContain('30.09.2026');
  expect(text).toContain(exportHaftungshinweis);
  const seiten = pdfSeiten(datei.bytes);
  for (const seite of seiten) expect(seite.texte.map(zeile => zeile.text)).toContain(inhalt.herausgeber);
  expect(text).not.toContain(exportHinweis(inhalt));
  expect(text).not.toContain('BAREMOS');
  expect(text).not.toContain('baremos.de');
});
it('PDF weist eine Exportadresse ohne HTTPS zurück', async () => {
  await expect(pdfAlsDatei(eingabe, ergebnis, zeit, { ...webExportInhalt, adresse: { text: 'Beispiel', href: 'http://example.org' } })).rejects.toThrow(/HTTPS/);
});
