import css from './fristenrechner-menue.css?inline';
import type { DateiAktion, MenueOption, MenueZurueck, RechnerAktionen } from './plattform';

const fokusSelektor = 'a[href],area[href],button,input,select,textarea,summary,iframe,object,embed,audio[controls],video[controls],[tabindex],[contenteditable]';

/** Nur Ansicht und Modalität. Alle Dateiwege bleiben bei RechnerAktionen. */
export function erzeugeMenue(root: HTMLElement, option: Exclude<MenueOption, 'aus'>, aktionen: RechnerAktionen, zurueck?: MenueZurueck): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const abmelden: (() => void)[] = [];
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, klasse: string, text?: string): HTMLElementTagNameMap[K] => {
    const el = doc.createElement(tag); el.className = klasse;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const hoeren = (ziel: EventTarget, typ: string, fn: (e: Event) => void, capture = false): void => {
    const optionen = { capture };
    ziel.addEventListener(typ, fn, optionen);
    abmelden.push(() => ziel.removeEventListener(typ, fn, optionen));
  };
  // Eine Rechnerinstanz je Dokument; IDs trotzdem gegen Gastgeber-IDs absichern.
  let nummer = 1;
  while (doc.querySelector(`[id="fr-menue-${nummer}"]`) || doc.querySelector(`[id="fr-menue-${nummer}-titel"]`) || doc.querySelector(`[id="fr-menue-${nummer}-sperre"]`)) nummer++;
  const id = `fr-menue-${nummer}`;
  const stil = element('style', 'fr-menue-stil'); stil.textContent = css;
  const reserve = element('div', 'fr-menue-reserve'); reserve.setAttribute('aria-hidden', 'true');
  const leiste = element('div', 'fr-menue-leiste');
  leiste.append(element('span', 'fr-menue-kurztitel', option.titel ?? 'Fristenrechner'));
  const symbol = (name: string, kreuze: boolean): HTMLButtonElement => {
    const button = element('button', 'fr-menue-symbol'); button.type = 'button'; button.setAttribute('aria-label', name);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    if (kreuze) {
      const pfad = doc.createElementNS(ns, 'path');
      pfad.setAttribute('d', 'M6 6L18 18M18 6L6 18'); pfad.setAttribute('fill', 'none');
      pfad.setAttribute('stroke', 'currentColor'); pfad.setAttribute('stroke-width', '2'); svg.append(pfad);
    } else for (const y of [5, 12, 19]) {
      const kreis = doc.createElementNS(ns, 'circle');
      kreis.setAttribute('cx', '12'); kreis.setAttribute('cy', String(y)); kreis.setAttribute('r', '2'); kreis.setAttribute('fill', 'currentColor'); svg.append(kreis);
    }
    button.append(svg); return button;
  };
  const knopf = symbol('Dateiaktionen', false);
  knopf.setAttribute('aria-haspopup', 'dialog'); knopf.setAttribute('aria-controls', id); knopf.setAttribute('aria-expanded', 'false');
  leiste.append(knopf);
  const overlay = element('div', 'fr-menue-overlay'); overlay.hidden = true;
  const sheet = element('div', 'fr-menue-sheet'); sheet.id = id;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', `${id}-titel`);
  const kopf = element('div', 'fr-menue-kopf');
  const griff = element('div', 'fr-menue-griff'); griff.setAttribute('aria-hidden', 'true'); kopf.append(griff);
  const kopfzeile = element('div', 'fr-menue-kopfzeile');
  const titel = element('h2', '', 'Dateiaktionen'); titel.id = `${id}-titel`; titel.tabIndex = -1;
  const x = symbol('Schließen', true); kopfzeile.append(titel, x); kopf.append(kopfzeile);
  const liste = element('div', 'fr-menue-liste'); liste.tabIndex = 0;
  liste.setAttribute('role', 'region'); liste.setAttribute('aria-labelledby', titel.id);
  const hinweis = element('p', 'fr-menue-sperre', 'Ein Dateiauftrag läuft'); hinweis.id = `${id}-sperre`; hinweis.hidden = true;
  liste.append(hinweis);
  const eintraege: { button: HTMLButtonElement; aktion: DateiAktion }[] = [];
  const gruppe = (name: string): HTMLUListElement => {
    liste.append(element('h3', '', name)); const ul = element('ul', ''); liste.append(ul); return ul;
  };
  const eintrag = (ziel: HTMLElement, text: string, aktion: DateiAktion): void => {
    const li = element('li', ''); const button = element('button', '', text); button.type = 'button';
    li.append(button); ziel.append(li); eintraege.push({ button, aktion });
    hoeren(button, 'click', () => {
      if (!offen || !aktionen.istErlaubt(aktion)) return;
      schliessen();
      if (aktion.art === 'ausgabe') void aktionen.ausgeben(aktion.format, aktion.weg);
      else if (aktion.art === 'import') void aktionen.projektImportieren();
      else void aktionen.neuesProjekt();
    });
  };
  const speichern = gruppe('Speichern');
  eintrag(speichern, 'Projekt speichern unter', { art: 'ausgabe', format: 'projekt', weg: 'exportieren' });
  eintrag(speichern, 'Excel speichern', { art: 'ausgabe', format: 'excel', weg: 'exportieren' });
  eintrag(speichern, 'PDF speichern', { art: 'ausgabe', format: 'pdf', weg: 'exportieren' });
  if (aktionen.zustand().kannTeilen) {
    const teilen = gruppe('Teilen');
    eintrag(teilen, 'Projekt teilen', { art: 'ausgabe', format: 'projekt', weg: 'teilen' });
    eintrag(teilen, 'Excel teilen', { art: 'ausgabe', format: 'excel', weg: 'teilen' });
    eintrag(teilen, 'PDF teilen', { art: 'ausgabe', format: 'pdf', weg: 'teilen' });
  }
  eintrag(gruppe('Import'), 'Projekt importieren', { art: 'import' });
  const neu = element('ul', 'fr-menue-neu'); liste.append(neu); eintrag(neu, 'Neues Projekt', { art: 'neues-projekt' });
  sheet.append(kopf, liste); overlay.append(sheet);
  root.append(stil, leiste, overlay);
  doc.body.insertBefore(reserve, doc.body.firstChild);

  let offen = false;
  let beendet = false;
  let scrollX = 0; let scrollY = 0;
  const attribute = new Map<Element, Map<string, string | null>>();
  const sichern = (el: Element, name: string, wert: string): void => {
    let vorher = attribute.get(el);
    if (!vorher) { vorher = new Map(); attribute.set(el, vorher); }
    if (!vorher.has(name)) vorher.set(name, el.getAttribute(name));
    el.setAttribute(name, wert);
  };
  const wiederherstellen = (el: Element, name: string, wert: string | null): void => {
    if (wert === null) el.removeAttribute(name); else el.setAttribute(name, wert);
  };
  const bodyStil = (): string | null => doc.body.getAttribute('style');
  let alterBodyStil: string | null = null;
  let alterHtmlStil: string | null = null;
  const padding = doc.documentElement.style.getPropertyValue('scroll-padding-top');
  const paddingPrioritaet = doc.documentElement.style.getPropertyPriority('scroll-padding-top');
  const htmlHatteStil = doc.documentElement.hasAttribute('style');
  const fokus = (el: HTMLElement): void => { el.focus({ preventScroll: true }); };
  const zurueckSetzen = (aktiv: boolean): void => {
    // Auch ein fehlerhafter Gastgeberadapter darf den lokalen Abschluss nicht aufhalten.
    try { void zurueck?.setzen(aktiv).catch(() => {}); } catch { /* Kein Projektfehler. */ }
  };
  const messen = (): void => {
    if (beendet) return;
    const viewport = win.visualViewport;
    const oben = viewport?.offsetTop ?? 0;
    const hoehe = viewport?.height ?? win.innerHeight;
    leiste.style.top = `${oben}px`;
    const leistenHoehe = leiste.getBoundingClientRect().height;
    reserve.style.height = `${leistenHoehe}px`;
    doc.documentElement.style.setProperty('scroll-padding-top', `${leistenHoehe + 8}px`);
    overlay.style.top = `${oben}px`; overlay.style.height = `${hoehe}px`;
    const platz = Math.max(0, hoehe - leistenHoehe - 8);
    sheet.style.setProperty('--fr-menue-max', `${platz}px`);
    const rem = parseFloat(win.getComputedStyle(leiste).fontSize) || 16;
    sheet.classList.toggle('fr-menue-kompakt', platz < kopf.getBoundingClientRect().height + 3 * rem);
    if (!offen) {
      const aktiv = doc.activeElement as HTMLElement | null;
      if (aktiv && root.contains(aktiv) && /^(INPUT|SELECT|TEXTAREA)$/.test(aktiv.tagName)) {
        const r = aktiv.getBoundingClientRect();
        const unterkante = oben + hoehe;
        if (r.top < oben + leistenHoehe + 8 || r.bottom > unterkante) aktiv.scrollIntoView({ block: 'center' });
      }
    }
  };
  const beobachten = (): void => {
    mutation?.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex', 'href', 'contenteditable', 'aria-hidden'] });
  };
  const hintergrundSperren = (): void => {
    if (!offen) return;
    mutation?.disconnect();
    // Nur Geschwister entlang des Pfads verbergen, niemals einen Dialogvorfahren.
    let kind: Element = overlay;
    while (kind.parentElement) {
      const parent = kind.parentElement;
      for (const nachbar of Array.from(parent.children)) if (nachbar !== kind) sichern(nachbar, 'aria-hidden', 'true');
      if (parent === doc.body) break;
      kind = parent;
    }
    for (const el of Array.from(doc.body.querySelectorAll(fokusSelektor))) if (!overlay.contains(el)) sichern(el, 'tabindex', '-1');
    beobachten();
  };
  const mutation = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(hintergrundSperren);
  const schliessen = (): void => {
    if (!offen) return;
    offen = false; mutation?.disconnect(); overlay.hidden = true; knopf.setAttribute('aria-expanded', 'false');
    for (const [el, werte] of attribute) for (const [name, wert] of werte) wiederherstellen(el, name, wert);
    attribute.clear();
    wiederherstellen(doc.body, 'style', alterBodyStil);
    wiederherstellen(doc.documentElement, 'style', alterHtmlStil);
    win.scrollTo(scrollX, scrollY);
    if (knopf.isConnected) fokus(knopf);
    zurueckSetzen(false);
  };
  hoeren(knopf, 'click', () => {
    if (offen || beendet) return;
    offen = true; overlay.hidden = false; knopf.setAttribute('aria-expanded', 'true');
    scrollX = win.scrollX; scrollY = win.scrollY;
    alterBodyStil = bodyStil(); alterHtmlStil = doc.documentElement.getAttribute('style');
    doc.documentElement.style.setProperty('overflow', 'hidden');
    doc.body.style.setProperty('position', 'fixed'); doc.body.style.setProperty('top', `${-scrollY}px`);
    doc.body.style.setProperty('left', `${-scrollX}px`); doc.body.style.setProperty('width', '100%'); doc.body.style.setProperty('overflow', 'hidden');
    sheet.scrollTop = 0; liste.scrollTop = 0;
    messen(); fokus(titel); hintergrundSperren(); zurueckSetzen(true);
  });
  hoeren(x, 'click', schliessen);
  hoeren(overlay, 'click', e => { if (e.target === overlay) { e.preventDefault(); e.stopPropagation(); schliessen(); } });
  // WebView 83 kennt :focus-visible noch nicht. Die Eingabeart gilt auch bei
  // geschlossenem Sheet, damit bereits der erste Tab zur Leiste sichtbar ist.
  const tastaturFokus = (aktiv: boolean): void => {
    leiste.classList.toggle('fr-menue-tastatur', aktiv);
    overlay.classList.toggle('fr-menue-tastatur', aktiv);
  };
  hoeren(doc, 'pointerdown', () => tastaturFokus(false), true);
  hoeren(doc, 'touchstart', () => tastaturFokus(false), true);
  hoeren(doc, 'keydown', e => {
    tastaturFokus(true);
    if (!offen) return;
    const event = e as KeyboardEvent;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); schliessen(); }
    if (event.key === 'Tab') {
      const ziele: HTMLElement[] = [x, liste, ...eintraege.filter(eintrag => !eintrag.button.disabled).map(eintrag => eintrag.button)];
      const index = ziele.indexOf(doc.activeElement as HTMLElement);
      const naechster = event.shiftKey ? (index <= 0 ? ziele.length - 1 : index - 1) : (index + 1) % ziele.length;
      event.preventDefault(); fokus(ziele[naechster]!);
      ziele[naechster]!.scrollIntoView({ block: 'nearest' });
    }
  }, true);
  hoeren(doc, 'focusin', () => { if (offen && !overlay.contains(doc.activeElement)) fokus(titel); }, true);
  hoeren(doc, 'click', e => { if (offen && !overlay.contains(e.target as Node)) { e.preventDefault(); e.stopPropagation(); } }, true);
  if (zurueck) abmelden.push(zurueck.beobachten(schliessen));
  abmelden.push(aktionen.beobachten(stand => {
    for (const { button, aktion } of eintraege) button.disabled = !aktionen.istErlaubt(aktion);
    hinweis.hidden = !stand.beschaeftigt;
    if (stand.beschaeftigt) sheet.setAttribute('aria-describedby', hinweis.id); else sheet.removeAttribute('aria-describedby');
    if (offen) messen();
  }));
  hoeren(win, 'resize', messen);
  if (win.visualViewport) { hoeren(win.visualViewport, 'resize', messen); hoeren(win.visualViewport, 'scroll', messen); }
  const groesse = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(messen);
  groesse?.observe(leiste); groesse?.observe(kopf);
  messen();
  return () => {
    if (beendet) return;
    const warOffen = offen;
    schliessen(); beendet = true;
    if (!warOffen) zurueckSetzen(false);
    mutation?.disconnect(); groesse?.disconnect(); abmelden.forEach(fn => fn());
    stil.remove(); overlay.remove(); leiste.remove(); reserve.remove();
    if (padding) doc.documentElement.style.setProperty('scroll-padding-top', padding, paddingPrioritaet);
    else doc.documentElement.style.removeProperty('scroll-padding-top');
    if (!htmlHatteStil && !doc.documentElement.style.length) doc.documentElement.removeAttribute('style');
  };
}
