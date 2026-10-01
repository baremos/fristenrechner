import { describe, expect, it } from 'vitest';
import { erstelleProjektDatei } from '@baremos/fristenrechner-kern';
import { projektAlsDatei, safeFilename } from '../src/projekt-datei';
import { beispiel, eingabe, KALENDERTAG, ZEITPUNKT } from './beispiel';

const zeit = { zeitpunkt: ZEITPUNKT, kalendertag: KALENDERTAG };

describe('Projektdatei als Bytes', () => {
  it('entspricht bei festem Zeitpunkt bytegenau dem bisherigen JSON-Export', () => {
    const vorher = new TextEncoder().encode(JSON.stringify(erstelleProjektDatei(eingabe, ZEITPUNKT), null, 2));
    const datei = projektAlsDatei(eingabe, zeit);
    expect(datei.bytes).toEqual(vorher);
    expect(datei.mime).toBe('application/json;charset=utf-8');
    expect(datei.name).toBe('gerate-und-zubehor.json');
    expect(JSON.parse(new TextDecoder().decode(datei.bytes))).toEqual(erstelleProjektDatei(eingabe, ZEITPUNKT));
  });

  it('verwendet den übergebenen Zeitpunkt und verändert weder Eingabe noch Zeit', () => {
    const input = beispiel();
    const vorher = JSON.stringify(input);
    const festeZeit = Object.freeze({ zeitpunkt: '2001-02-03T04:05:06.000Z', kalendertag: '2001-02-04' });
    const json = new TextDecoder().decode(projektAlsDatei(input, festeZeit).bytes);
    expect(json).toBe(JSON.stringify(erstelleProjektDatei(input, festeZeit.zeitpunkt), null, 2));
    expect(JSON.stringify(input)).toBe(vorher);
    expect(projektAlsDatei(input, festeZeit).bytes).toEqual(projektAlsDatei(input, festeZeit).bytes);
  });

  it('nimmt ohne Projektnamen die Vergabenummer, danach den bisherigen Standardnamen', () => {
    expect(projektAlsDatei(beispiel({ projekt: { vergabenummer: 'TEST-2026/01' } }), zeit).name).toBe('test-2026-01.json');
    expect(projektAlsDatei(beispiel({ projekt: {} }), zeit).name).toBe('vergabe-terminplan.json');
    expect(projektAlsDatei(beispiel({ projekt: undefined }), zeit).name).toBe('vergabe-terminplan.json');
  });
});

describe('Dateinamen', () => {
  it.each([
    ['  Geräte\nund Zubehör  ', 'gerate-und-zubehor'],
    ['../A/B\\C: D?*', 'a-b-c-d'],
    ['  ', 'vergabe-terminplan'],
    ['A_1-B', 'a_1-b'],
  ])('bereinigt %j wie bisher', (eingang, erwartet) => {
    expect(safeFilename(eingang)).toBe(erwartet);
  });
});

it('begrenzt den formatierten Projektexport auf genau 1 MiB einschließlich UTF-8', () => {
  const max = 1024 * 1024;
  const input = beispiel({ projekt: { projektname: 'Grenze', kunde: '' } });
  const grundBytes = projektAlsDatei(input, zeit).bytes.length;
  input.projekt!.kunde = 'ä'.repeat(Math.floor((max - grundBytes) / 2)) + 'a'.repeat((max - grundBytes) % 2);
  expect(projektAlsDatei(input, zeit).bytes.length).toBe(max);
  input.projekt!.kunde += 'a';
  expect(() => projektAlsDatei(input, zeit)).toThrow('Die Projektdatei ist größer als 1 MiB.');
});
