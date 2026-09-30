import { readFileSync } from 'node:fs';

/** Kleines Testdoppel für den UI-/Plattformvertrag. Kein HTML-Parser und kein
 * Browser: Layout, Constraint Validation, Fokus und native Dialoge fehlen.
 * Die statischen Elemente und Feldvorgaben stammen aus der Astro-Komponente. */
export class TestElement extends EventTarget {
  readonly kinder: TestElement[] = [];
  readonly attribute = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style = { setProperty: (_name: string, _wert: string): void => {} };
  parent: TestElement | undefined;
  hidden = false;
  disabled = false;
  name = '';
  value = '';
  checked = false;
  defaultValue = '';
  defaultChecked = false;
  dateTime = '';
  min = '';
  validity = true;
  scrolls: unknown[] = [];
  private text = '';
  private readonly handlers = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(readonly tagName: string, readonly ownerDocument: TestDocument) { super(); }
  get id(): string { return this.attribute.get('id') ?? ''; }
  get className(): string { return this.attribute.get('class') ?? ''; }
  set className(wert: string) { this.attribute.set('class', wert); }
  get firstChild(): TestElement | null { return this.kinder[0] ?? null; }
  get textContent(): string { return this.text + this.kinder.map(kind => kind.textContent).join(''); }
  set textContent(wert: string) {
    this.text = wert;
    this.kinder.forEach(kind => { kind.parent = undefined; });
    this.kinder.length = 0;
  }
  readonly classList = {
    toggle: (name: string, kraft?: boolean): boolean => {
      const klassen = new Set(this.className.split(/\s+/).filter(Boolean));
      const vorhanden = kraft ?? !klassen.has(name);
      if (vorhanden) klassen.add(name); else klassen.delete(name);
      this.className = [...klassen].join(' ');
      return vorhanden;
    },
    remove: (name: string): void => { this.classList.toggle(name, false); },
    contains: (name: string): boolean => this.className.split(/\s+/).includes(name),
  };
  setAttribute(name: string, wert: string): void {
    this.attribute.set(name, wert);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_all, buchstabe: string) => buchstabe.toUpperCase())] = wert;
    if (name === 'name') this.name = wert;
    if (name === 'value') this.value = this.defaultValue = wert;
    if (name === 'checked') this.checked = this.defaultChecked = true;
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
  }
  removeAttribute(name: string): void {
    this.attribute.delete(name);
    if (name === 'min') this.min = '';
  }
  append(...knoten: (TestElement | string)[]): void {
    for (const knotenWert of knoten) {
      const kind = typeof knotenWert === 'string' ? this.ownerDocument.createTextNode(knotenWert) : knotenWert;
      kind.remove(); kind.parent = this; this.kinder.push(kind);
    }
  }
  removeChild(kind: TestElement): TestElement {
    const index = this.kinder.indexOf(kind);
    if (index < 0) throw new Error('Der Testknoten ist kein Kind.');
    this.kinder.splice(index, 1); kind.parent = undefined; return kind;
  }
  remove(): void { this.parent?.removeChild(this); }
  contains(element: TestElement): boolean { return element === this || this.kinder.some(kind => kind.contains(element)); }
  private passt(selector: string): boolean {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const attribut = /^(\w+)?\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attribut) return (!attribut[1] || this.tagName === attribut[1])
      && this.attribute.has(attribut[2]!) && (attribut[3] === undefined || this.attribute.get(attribut[2]!) === attribut[3]);
    return this.tagName === selector;
  }
  querySelectorAll(selector: string): TestElement[] {
    const ergebnis: TestElement[] = [];
    for (const kind of this.kinder) {
      if (selector.split(',').some(teil => kind.passt(teil.trim()))) ergebnis.push(kind);
      ergebnis.push(...kind.querySelectorAll(selector));
    }
    return ergebnis;
  }
  querySelector(selector: string): TestElement | null { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector: string): TestElement | null { return this.passt(selector) ? this : this.parent?.closest(selector) ?? null; }
  reportValidity(): boolean { return this.validity; }
  scrollIntoView(optionen: unknown): void { this.scrolls.push(optionen); }
  override addEventListener(typ: string, handler: EventListenerOrEventListenerObject | null, optionen?: AddEventListenerOptions | boolean): void {
    if (handler) {
      const gruppe = this.handlers.get(typ) ?? new Set<EventListenerOrEventListenerObject>();
      gruppe.add(handler); this.handlers.set(typ, gruppe);
    }
    super.addEventListener(typ, handler, optionen);
  }
  override removeEventListener(typ: string, handler: EventListenerOrEventListenerObject | null, optionen?: EventListenerOptions | boolean): void {
    if (handler) this.handlers.get(typ)?.delete(handler);
    super.removeEventListener(typ, handler, optionen);
  }
  override dispatchEvent(event: Event): boolean {
    // Node-EventTarget kennt keine DOM-Eltern; der Ursprung bleibt beim Bubbling erhalten.
    if (!event.target) Object.defineProperty(event, 'target', { value: this, configurable: true });
    const ergebnis = super.dispatchEvent(event);
    if (event.bubbles && !Reflect.get(event, 'cancelBubble')) this.parent?.dispatchEvent(event);
    return ergebnis;
  }
  listenerAnzahl(): number { return [...this.handlers.values()].reduce((summe, gruppe) => summe + gruppe.size, 0); }
}

export class TestInput extends TestElement {}
export class TestSelect extends TestElement {}
class TestForm extends TestElement {
  readonly elements = { namedItem: (name: string) => this.querySelector(`[name="${name}"]`) };
  reset(): void {
    this.querySelectorAll('input,select').forEach(feld => { feld.value = feld.defaultValue; feld.checked = feld.defaultChecked; });
  }
}
export class TestDocument {
  readonly body = new TestElement('body', this);
  createElement(tag: string): TestElement {
    return tag === 'input' ? new TestInput(tag, this) : tag === 'select' ? new TestSelect(tag, this)
      : tag === 'form' ? new TestForm(tag, this) : new TestElement(tag, this);
  }
  createTextNode(text: string): TestElement { const knoten = this.createElement('#text'); knoten.textContent = text; return knoten; }
  createDocumentFragment(): TestElement { return this.createElement('#fragment'); }
  querySelectorAll(selector: string): TestElement[] { return this.body.querySelectorAll(selector); }
}

function dekodiere(text: string): string {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

export function erstelleTestDom(dokument = new TestDocument()) {
  const quelle = readFileSync(new URL('../src/Fristenrechner.astro', import.meta.url), 'utf8');
  const start = quelle.indexOf('<div class="fristenrechner"');
  if (start < 0) throw new Error('Komponentenwurzel fehlt.');
  let vorlage = quelle.slice(start).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<!--[\s\S]*?-->/g, '');
  // Die optionale Importbedienung ist im Testdoppel zunächst das Dateifeld.
  // Beide echten Astro-Zweige werden zusätzlich durch Render-Tests geprüft.
  vorlage = vorlage.replace(/\{importBedienung === 'schaltflaeche' \? <button[\s\S]*?<\/button> : (<label[\s\S]*?<\/label>)\}/, '$1');
  // Diese eine dynamische Feldliste wird aus ihrer statischen Astro-Vorgabe aufgebaut.
  const liste = quelle.match(/const bundeslaender = \[([\s\S]*?)\] as const;/)?.[1];
  if (!liste) throw new Error('Bundeslandvorgaben fehlen.');
  const laender = [...liste.matchAll(/\['([^']+)', '([^']+)'\]/g)]
    .map(([, wert, label]) => `<option value="${wert}"${wert === 'BE' ? ' selected' : ''}>${label}</option>`).join('');
  vorlage = vorlage.replace(/\{bundeslaender\.map\([\s\S]*?<\/option>\)\}/, laender);
  const stack = [dokument.body];
  const ohneEndtag = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
  for (const treffer of vorlage.matchAll(/<\/?([a-z][\w-]*)\b([^<>]*?)>/g)) {
    const token = treffer[0];
    const tag = treffer[1]!;
    if (token.startsWith('</')) {
      const index = stack.map(knoten => knoten.tagName).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const element = dokument.createElement(tag);
    for (const attr of treffer[2]!.matchAll(/(?:^|\s)([\w:-]+)(?:="([^"]*)"|'([^']*)'|=\{[^}]*\})?/g)) {
      element.setAttribute(attr[1]!, dekodiere(attr[2] ?? attr[3] ?? ''));
    }
    stack[stack.length - 1]!.append(element);
    if (!ohneEndtag.has(tag) && !token.endsWith('/>')) stack.push(element);
  }
  const root = dokument.body.kinder[dokument.body.kinder.length - 1]!;
  for (const select of root.querySelectorAll('select')) {
    const optionen = select.querySelectorAll('option');
    select.value = select.defaultValue = (optionen.find(option => option.attribute.has('selected')) ?? optionen[0])?.value ?? '';
  }
  const feld = (name: string): TestElement => {
    const element = root.querySelector(`[name="${name}"]`);
    if (!element) throw new Error(`Testfeld ${name} fehlt.`);
    return element;
  };
  const el = (id: string): TestElement => {
    const element = root.querySelector('#' + id);
    if (!element) throw new Error(`Testelement ${id} fehlt.`);
    return element;
  };
  const senden = (element: TestElement, typ: string) => element.dispatchEvent(new Event(typ, { bubbles: true, cancelable: true }));
  return { root, dokument, feld, el, senden, click: (id: string) => senden(el(id), 'click') };
}
