import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const komponente = readFileSync(new URL('../src/Fristenrechner.astro', import.meta.url), 'utf8');
const bedienlogik = readFileSync(new URL('../src/fristenrechner-ui.ts', import.meta.url), 'utf8');
const menueStil = readFileSync(new URL('../src/fristenrechner-menue.css', import.meta.url), 'utf8');
type RGB = [number, number, number];
type Regel = { kontext: string; selektoren: string[]; deklarationen: [string, string][] };
type Palette = Record<string, string>;
type Farbpaar = { selector: string; vordergrund: RGB; hintergrund: RGB; schwelle: number };

const DUNKEL = 'screen and (prefers-color-scheme: dark)';
const SCHMAL = 'screen and (max-width: 48rem)';
const DUNKLER_SELEKTOR = '.fristenrechner[data-farbschema="system"]';
const KOMPAKTER_SELEKTOR = '.fristenrechner[data-ansicht="kompakt"]';
const phasen = ['einholung', 'teilnahmewettbewerb', 'verhandlung', 'bewertung', 'teststellung', 'zuschlag'];

// Flache Regeln mit ihrem Media-Kontext. CSS-Verschachtelung gibt es nicht (WebView 83).
function regeln(css: string): Regel[] {
  const liste: Regel[] = [];
  const lesen = (text: string, kontext: string): void => {
    let rest = text;
    for (;;) {
      const start = rest.indexOf('{');
      if (start < 0) break;
      const kopf = rest.slice(0, start).trim();
      if (kopf.startsWith('@media')) {
        let tiefe = 0;
        let ende = start;
        for (; ende < rest.length; ende += 1) {
          if (rest[ende] === '{') tiefe += 1;
          else if (rest[ende] === '}' && (tiefe -= 1) === 0) break;
        }
        lesen(rest.slice(start + 1, ende), kopf.replace(/^@media\s*/, ''));
        rest = rest.slice(ende + 1);
      } else {
        const ende = rest.indexOf('}', start);
        const inhalt = rest.slice(start + 1, ende);
        liste.push({
          kontext,
          selektoren: kopf.split(',').map(wert => wert.trim()),
          deklarationen: [...inhalt.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)].map(([, name, wert]) => [name, wert.trim()]),
        });
        rest = rest.slice(ende + 1);
      }
    }
  };
  lesen(css.replace(/\/\*[\s\S]*?\*\//g, ''), '');
  return liste;
}

function deklaration(css: string, selector: string, eigenschaft: string, kontext = ''): string {
  const werte = regeln(css)
    .filter(regel => regel.kontext === kontext && regel.selektoren.includes(selector))
    .flatMap(regel => regel.deklarationen.filter(([name]) => name === eigenschaft).map(([, wert]) => wert));
  if (werte.length !== 1) throw new Error(`Keine eindeutige CSS-Deklaration: ${selector} / ${eigenschaft} (${kontext || 'ohne Media'})`);
  return werte[0];
}

function palette(css: string, selector: string, kontext = ''): Palette {
  const regel = regeln(css).filter(wert => wert.kontext === kontext && wert.selektoren.length === 1 && wert.selektoren[0] === selector);
  if (regel.length !== 1) throw new Error(`Keine eindeutige Palette: ${selector}`);
  return Object.fromEntries(regel[0].deklarationen.filter(([name]) => name.startsWith('--')));
}

// Variablen aus der Palette auflösen; Gastgebervariablen ohne Palettenwert über ihren Fallback.
function aufloesen(wert: string, farben: Palette): string {
  const treffer = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(wert);
  if (!treffer) return wert;
  const eigen = farben[treffer[1]];
  if (eigen !== undefined) return aufloesen(eigen, farben);
  if (treffer[2] === undefined) throw new Error(`Variable ohne Wert und Fallback: ${treffer[1]}`);
  return aufloesen(treffer[2], farben);
}

function rgb(wert: string): RGB {
  if (!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(wert)) throw new Error(`Unbekannte Farbe: ${wert}`);
  const hex = wert.length === 4 ? [...wert.slice(1)].map(zeichen => zeichen + zeichen).join('') : wert.slice(1);
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16)) as RGB;
}

function rand(wert: string): string {
  const farbe = /^\d+px solid (.+)$/.exec(wert)?.[1];
  if (!farbe) throw new Error(`Unbekannter Rahmen: ${wert}`);
  return farbe;
}

function kontrast(a: RGB, b: RGB): number {
  const luminanz = (farbe: RGB) => farbe.map(kanal => {
    const srgb = kanal / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }).reduce((summe, kanal, index) => summe + kanal * [0.2126, 0.7152, 0.0722][index], 0);
  const helligkeitA = luminanz(a);
  const helligkeitB = luminanz(b);
  return (Math.max(helligkeitA, helligkeitB) + 0.05) / (Math.min(helligkeitA, helligkeitB) + 0.05);
}

// Geschlossenes Inventar der 40 Feldselektoren und ihrer äußeren Hintergründe.
const felder = [
  'kunde', 'projektname', 'vergabenummer', 'vergabeordnung', 'verfahrensart', 'bundesland',
  'bekanntmachung', 'angebotsaufforderungTermin', 'abgabeUhrzeit', 'versandBieterinformation',
  'teststellungDauerAT', 'teststellungStart', 'teststellungAuswertungAT',
  'praesentationDauerAT', 'praesentationStart',
  'verhandlungRunde1DauerAT', 'verhandlungRunde1Start', 'verhandlungRunde2DauerAT', 'verhandlungRunde2Start',
  'teilnahmeBewertungAT', 'aufforderungVersandAT', 'zwischenbewertungAT', 'einladungVersandAT',
  'vuAnpassungRunde1AT', 'vuAnpassungRunde2AT', 'bewertungAT', 'aufklaerungEntscheidungAT',
  'internerZuschlagAT', 'infoVersandAT', 'bindefristArt', 'bindefristTermin', 'bindefristTage',
  'teilnahmefristKT', 'bewerberfragenVorTeilnahmeKT', 'angebotsfristKT', 'bieterfragenVorAngebotKT',
  'klarstellungVorAngebotKT', 'optimiertesAngebotKT', 'finalesAngebotKT', 'wartefristKT',
];
const bedingteFelder = new Set([
  'teststellungDauerAT', 'teststellungStart', 'teststellungAuswertungAT',
  'praesentationDauerAT', 'praesentationStart',
  'verhandlungRunde1DauerAT', 'verhandlungRunde1Start', 'verhandlungRunde2DauerAT', 'verhandlungRunde2Start',
]);

function paletten(css: string): { name: string; farben: Palette }[] {
  const hell = palette(css, '.fristenrechner');
  return [
    { name: 'hell', farben: hell },
    { name: 'dunkel', farben: { ...hell, ...palette(css, DUNKLER_SELEKTOR, DUNKEL) } },
  ];
}

function farbpaare(css: string, menue: string): Farbpaar[] {
  const paare: Farbpaar[] = [];
  const paar = (selector: string, vordergrund: RGB, hintergrund: RGB, schwelle: number): void => {
    paare.push({ selector, vordergrund, hintergrund, schwelle });
  };
  for (const { name, farben } of paletten(css)) {
    const farbe = (wert: string): RGB => rgb(aufloesen(wert, farben));
    const wurzel = (kontext: string): string => kontext === SCHMAL ? KOMPAKTER_SELEKTOR : '.fristenrechner';
    const lesen = (selector: string, eigenschaft: string, kontext = ''): RGB => farbe(deklaration(css, `${wurzel(kontext)} ${selector}`, eigenschaft, kontext));
    const lesenRand = (selector: string, eigenschaft: string, kontext = ''): RGB => farbe(rand(deklaration(css, `${wurzel(kontext)} ${selector}`, eigenschaft, kontext)));
    const variable = (wert: string): RGB => farbe(`var(${wert})`);
    const text = (selector: string, hintergrund: RGB, kontext = ''): void => paar(`${name}: ${selector} (Text)`, lesen(selector, 'color', kontext), hintergrund, 4.7);
    const weiss = lesen('form', 'background');
    const panel = lesen('.conditional-panel', 'background');
    const hinweis = lesen('.privacy-note', 'background');
    const feldrahmen = lesenRand('input', 'border');
    const knopfrahmen = lesenRand('.button', 'border');
    const knopfhintergrund = lesen('.button', 'background');
    const hover = lesen('.button:hover', 'border-color');
    const fokus = lesenRand('input:focus-visible', 'outline');
    const primaer = lesen('.button-primary', 'background');
    const primaerHover = lesen('.button-primary:hover', 'background');
    const primaerText = lesen('.button-primary', 'color');

    felder.forEach(feld => paar(`${name}: [name="${feld}"]`, feldrahmen, bedingteFelder.has(feld) ? panel : weiss, 3.2));
    for (const selector of ['#save-json', '#open-json', '#export-excel', '#export-pdf']) {
      paar(`${name}: ${selector}`, knopfrahmen, weiss, 3.2);
      paar(`${name}: ${selector}:hover (Rahmen)`, hover, weiss, 3.2);
      paar(`${name}: ${selector}:hover (Text)`, lesen('.button:hover', 'color'), knopfhintergrund, 4.7);
    }
    paar(`${name}: .button-primary (Text)`, primaerText, primaer, 4.7);
    paar(`${name}: .button-primary:hover (Text)`, lesen('.button-primary:hover', 'color'), primaerHover, 4.7);
    paar(`${name}: .button-primary (Fläche)`, primaer, weiss, 3.2);
    for (const phase of phasen) {
      const kopf = variable(`--phase-${phase}-flaeche`);
      paar(`${name}: span.timeline-phase-order (${phase})`, farbe(`var(--phase-${phase}-text, var(--phase-${phase}))`), kopf, 4.7);
      paar(`${name}: .timeline-phase (${phase}, Kante und Punkt)`, variable(`--phase-${phase}`), weiss, 3.2);
      text('.timeline-phase > header span', kopf);
      text('.timeline-phase > header strong', kopf);
    }
    paar(`${name}: div.table-scroll (außen)`, lesenRand('.table-scroll', 'border'), lesen('.results', 'background'), 3.2);
    paar(`${name}: div.table-scroll (Kopfzellen)`, lesenRand('.table-scroll', 'border'), lesen('th', 'background'), 3.2);
    paar(`${name}: input:focus-visible (Fläche)`, fokus, weiss, 3.2);
    paar(`${name}: input:focus-visible (bedingte Karte)`, fokus, panel, 3.2);
    paar(`${name}: .file-button:focus-within`, lesenRand('.file-button:focus-within', 'outline'), weiss, 3.2);
    paar(`${name}: .privacy-note (Kante)`, lesenRand('.privacy-note', 'border-left'), hinweis, 3.2);
    paar(`${name}: .notice-warning (Kante)`, lesenRand('.notice-warning', 'border-left'), lesen('.notice-warning', 'background'), 3.2);
    paar(`${name}: .notice-error (Kante)`, lesenRand('.notice-error', 'border-left'), lesen('.notice-error', 'background'), 3.2);
    paar(`${name}: .check-card:has(input:checked) (Rahmen)`, lesen('.check-card:has(input:checked)', 'border-color'), lesen('.check-card:has(input:checked)', 'background'), 3.2);
    text('.milestone-warning', weiss);
    text('.project-file-meta--migration', lesen('.project-file-meta--migration', 'background'));
    text('input', weiss);
    text('label:not(.check-card):not(.file-button)', weiss);
    text('legend span', weiss);
    text('.zeit-beschreibung small', weiss);
    text('.check-card small', weiss);
    text('.check-card small', lesen('.check-card:has(input:checked)', 'background'));
    text('.field-help', weiss);
    text('.project-file-meta', weiss);
    text('#storage-status', hinweis);
    text('#result-summary', weiss);
    text('.result-bindefrist', weiss);
    text('.export-message', weiss);
    text('.section-heading-row p', weiss);
    text('.timeline-milestones time', weiss);
    text('.eyebrow', weiss);
    text('.button-quiet', weiss);
    text('.print-footer p', weiss);
    text('.button', weiss);
    text('td:first-child', lesen('tr', 'background', SCHMAL), SCHMAL);
    text('td:nth-child(3)', lesen('tr', 'background', SCHMAL), SCHMAL);
    paar(`${name}: .button-quiet (Rahmen, schmal)`, lesen('.button-quiet', 'border-color', SCHMAL), weiss, 3.2);
  }
  // Menüleiste und Sheet liegen außerhalb der Komponente und haben eigene Werte.
  const menueLesen = (selector: string, eigenschaft: string, kontext = ''): RGB => rgb(aufloesen(deklaration(menue, selector, eigenschaft, kontext), {}));
  const leisteHell = menueLesen('.fr-menue-leiste', 'background');
  paar('hell: .fr-menue-leiste (Text)', menueLesen('.fr-menue-leiste', 'color'), leisteHell, 4.7);
  paar('hell: .fr-menue-liste button:disabled (Text)', menueLesen('.fr-menue-liste button:disabled', 'color'), menueLesen('.fr-menue-liste button:disabled', 'background'), 4.7);
  paar('hell: .fr-menue-tastatur :focus', rgb(aufloesen(/^2px solid (.+)$/.exec(deklaration(menue, '.fr-menue-leiste.fr-menue-tastatur :focus', 'outline'))![1], {})), leisteHell, 3.2);
  paar('hell: .fr-menue-sperre (Rahmen)', rgb(rand(deklaration(menue, '.fr-menue-sperre', 'border'))), menueLesen('.fr-menue-sperre', 'background'), 3.2);
  const leisteDunkel = menueLesen('.fr-menue-leiste.fr-menue-system', 'background', DUNKEL);
  paar('dunkel: .fr-menue-leiste (Text)', menueLesen('.fr-menue-leiste.fr-menue-system', 'color', DUNKEL), leisteDunkel, 4.7);
  paar('dunkel: .fr-menue-liste button:disabled (Text)', menueLesen('.fr-menue-system .fr-menue-liste button:disabled', 'color', DUNKEL), menueLesen('.fr-menue-system .fr-menue-liste button:disabled', 'background', DUNKEL), 4.7);
  paar('dunkel: .fr-menue-tastatur :focus', menueLesen('.fr-menue-leiste.fr-menue-system.fr-menue-tastatur :focus', 'outline-color', DUNKEL), leisteDunkel, 3.2);
  paar('dunkel: .fr-menue-sperre (Rahmen)', menueLesen('.fr-menue-system .fr-menue-sperre', 'border-color', DUNKEL), menueLesen('.fr-menue-system .fr-menue-sperre', 'background', DUNKEL), 3.2);
  return paare;
}

function pruefen(paar: Farbpaar): void {
  const verhaeltnis = kontrast(paar.vordergrund, paar.hintergrund);
  if (verhaeltnis < paar.schwelle) throw new Error(`${paar.selector}: ${verhaeltnis.toFixed(5)}:1 < ${paar.schwelle}:1`);
}

it.each(farbpaare(komponente, menueStil))('$selector erreicht mindestens $schwelle:1', pruefen);

it('begrenzt sämtliche neuen Handyregeln auf die ausdrücklich gewählte kompakte Ansicht', () => {
  const handyregeln = regeln(komponente).filter(regel => regel.kontext === SCHMAL);
  expect(handyregeln.length).toBeGreaterThan(0);
  for (const regel of handyregeln) {
    expect(regel.selektoren.length).toBeGreaterThan(0);
    for (const selector of regel.selektoren) expect(selector.startsWith(`${KOMPAKTER_SELEKTOR} `)).toBe(true);
  }
});

it('bindet die Phasenfarben über data-phase an die Paletten statt an Inline-Stile', () => {
  expect(bedienlogik).toContain("item.className = 'timeline-phase';");
  expect(bedienlogik).toContain('item.dataset.phase = phase.id;');
  expect(bedienlogik).toContain("const order = makeTextElement('span', `Phase ${index + 1}`, 'timeline-phase-order');");
  expect(bedienlogik).not.toMatch(/style\.(?:color|setProperty)/);
  expect(bedienlogik).not.toMatch(/#[\da-f]{6}\b/i);
  for (const phase of phasen) {
    expect(komponente).toContain(`.fristenrechner .timeline-phase[data-phase="${phase}"]`);
    expect(deklaration(komponente, `.fristenrechner .timeline-phase[data-phase="${phase}"]`, '--phase-color')).toBe(`var(--phase-${phase})`);
  }
  for (const { farben } of paletten(komponente)) {
    const namen = Object.keys(farben).filter(name => name.startsWith('--phase-'));
    expect(namen.filter(name => !/-(?:flaeche|text)$/.test(name)).sort()).toEqual(phasen.map(phase => `--phase-${phase}`).sort());
    expect(namen.filter(name => name.endsWith('-flaeche')).sort()).toEqual(phasen.map(phase => `--phase-${phase}-flaeche`).sort());
  }
  expect(deklaration(komponente, '.fristenrechner .timeline-phase > header .timeline-phase-order', 'color')).toBe('var(--phase-text-color, var(--phase-color, #a7303c))');
  expect(felder).toHaveLength(40);
  for (const name of felder) expect(komponente).toContain(`name="${name}"`);
  expect(deklaration(komponente, '.fristenrechner input', 'border')).toBe(deklaration(komponente, '.fristenrechner select', 'border'));
  expect(deklaration(komponente, '.fristenrechner input:focus-visible', 'outline')).toBe('3px solid var(--fr-akzent)');
});

it('hält die helle Palette auf den bisherigen Werten und leitet die Phasenköpfe aus den Phasenfarben ab', () => {
  const [hell, dunkel] = paletten(komponente);
  expect(aufloesen('var(--fr-text)', hell.farben)).toBe('#343438');
  expect(aufloesen('var(--fr-rahmen-karte)', hell.farben)).toBe('#d7d7d3');
  expect(aufloesen('var(--fr-akzent)', hell.farben)).toBe('#a7303c');
  expect(aufloesen('var(--fr-primaer-hover)', hell.farben)).toBe('#862630');
  expect(hell.farben['--fr-rahmen-feld']).toBe('#8a8a8e');
  expect(hell.farben['--fr-rahmen-knopf']).toBe('#8f8f93');
  expect(hell.farben['--fr-rahmen-tabelle']).toBe('#878783');
  expect(hell.farben['--phase-teststellung-text']).toBe('#9a5f1f');
  expect(deklaration(komponente, DUNKLER_SELEKTOR, 'color-scheme', DUNKEL)).toBe('dark');
  // Keine Kontext-Verwechslung: Die dunkle Palette ist nur im dunklen Media-Block definiert.
  expect(() => palette(komponente, DUNKLER_SELEKTOR)).toThrow('Keine eindeutige Palette');
  const mischung = (phase: RGB, grund: RGB, anteil: number): RGB => phase.map((kanal, index) => kanal * anteil + grund[index] * (1 - anteil)) as RGB;
  for (const phase of phasen) {
    const hellKopf = rgb(hell.farben[`--phase-${phase}-flaeche`]);
    const hellSoll = mischung(rgb(hell.farben[`--phase-${phase}`]), [255, 255, 255], 0.08);
    hellKopf.forEach((kanal, index) => expect(Math.abs(kanal - hellSoll[index])).toBeLessThanOrEqual(1));
    const dunkelKopf = rgb(dunkel.farben[`--phase-${phase}-flaeche`]);
    const dunkelSoll = mischung(rgb(dunkel.farben[`--phase-${phase}`]), rgb(dunkel.farben['--fr-flaeche']), 0.15);
    dunkelKopf.forEach((kanal, index) => expect(Math.abs(kanal - dunkelSoll[index])).toBeLessThanOrEqual(1));
  }
});

it('gibt der dunklen Komponente auf einer hellen Gastseite eine eigene kontrastreiche Text- und Grundfarbe', () => {
  const farben = { '--color-text': '#222222', '--color-background': '#ffffff', ...paletten(komponente)[1].farben };
  const text = deklaration(komponente, DUNKLER_SELEKTOR, 'color', DUNKEL);
  const grund = deklaration(komponente, DUNKLER_SELEKTOR, 'background', DUNKEL);
  expect(text).toBe('var(--fr-text)');
  expect(grund).toBe('var(--fr-flaeche)');
  expect(aufloesen(text, farben)).toBe('#e8e8e5');
  expect(aufloesen(grund, farben)).toBe('#1c1c1f');
  expect(kontrast(rgb(aufloesen(text, farben)), rgb(aufloesen(grund, farben)))).toBeGreaterThanOrEqual(4.5);
  // Transparente Bereiche der kompakten Ansicht liegen auf der Komponentenfläche.
  for (const selector of ['form', '.results']) {
    expect(deklaration(komponente, `${KOMPAKTER_SELEKTOR} ${selector}`, 'background', SCHMAL)).toBe('transparent');
  }
  // Ohne Farbschema-Opt-in werden weiterhin die Farben der Gastseite geerbt.
  expect(() => deklaration(komponente, '.fristenrechner', 'color')).toThrow('Keine eindeutige CSS-Deklaration');
  expect(() => deklaration(komponente, '.fristenrechner', 'background')).toThrow('Keine eindeutige CSS-Deklaration');
});

it('behält den festen Hellwert betonter Texte auch bei abweichender Gastfarbe bei', () => {
  const [hell, dunkel] = paletten(komponente);
  const gastfarbe = { '--color-text': '#006699' };
  expect(aufloesen('var(--fr-text)', { ...hell.farben, ...gastfarbe })).toBe(gastfarbe['--color-text']);
  for (const selector of ['.result-bindefrist', '.timeline-phase > header strong']) {
    const text = deklaration(komponente, `.fristenrechner ${selector}`, 'color');
    expect(text).toBe('var(--fr-text-betont)');
    expect(aufloesen(text, { ...hell.farben, ...gastfarbe })).toBe('#343438');
    expect(aufloesen(text, { ...dunkel.farben, ...gastfarbe })).toBe('#e8e8e5');
  }
});

it.each([
  { name: 'Feldrahmen', von: '--fr-rahmen-feld: #8a8a8e', alt: '--fr-rahmen-feld: #99999d', anzahl: 40, selector: 'hell: [name="kunde"]' },
  { name: 'Dateiknöpfe', von: '--fr-rahmen-knopf: #8f8f93', alt: '--fr-rahmen-knopf: #96969a', anzahl: 5, selector: 'hell: #save-json' },
  { name: 'Phasenbeschriftung', von: '--phase-teststellung-text: #9a5f1f', alt: '--phase-teststellung-text: #a56721', anzahl: 1, selector: 'hell: span.timeline-phase-order (teststellung)' },
  { name: 'Tabellenrahmen', von: '--fr-rahmen-tabelle: #878783', alt: '--fr-rahmen-tabelle: #d7d7d3', anzahl: 2, selector: 'hell: div.table-scroll (außen)' },
  { name: 'dunkler Akzent', von: '--fr-akzent: #e8858e', alt: '--fr-akzent: #a7303c', anzahl: 12, selector: 'dunkel: #save-json:hover (Rahmen)' },
  { name: 'dunkle Phasenfarbe', von: '--phase-bewertung: #7cc5ca', alt: '--phase-bewertung: #2f6f73', anzahl: 2, selector: 'dunkel: span.timeline-phase-order (bewertung)' },
])('Gegenprobe: abweichende Farbe für $name scheitert', ({ von, alt, anzahl, selector }) => {
  expect(komponente).toContain(von);
  const paare = farbpaare(komponente.replace(von, alt), menueStil);
  expect(paare.filter(paar => kontrast(paar.vordergrund, paar.hintergrund) < paar.schwelle)).toHaveLength(anzahl);
  expect(() => paare.forEach(pruefen)).toThrow(selector);
});

it('weist eine dunkle Menüleiste mit zu schwachem Text zurück', () => {
  const paare = farbpaare(komponente, menueStil.replace('.fr-menue-overlay.fr-menue-system { color: #e8e8e5;', '.fr-menue-overlay.fr-menue-system { color: #5a5a60;'));
  expect(() => paare.forEach(pruefen)).toThrow('dunkel: .fr-menue-leiste (Text)');
});

it.each([
  { a: '#000000', b: '#ffffff', wert: 21 },
  { a: '#ffffff', b: '#ffffff', wert: 1 },
  { a: '#99999d', b: '#f7f7f6', wert: 2.64806469 },
])('berechnet WCAG-Kontrast für $a auf $b', ({ a, b, wert }) => {
  expect(kontrast(rgb(a), rgb(b))).toBeCloseTo(wert, 6);
});
