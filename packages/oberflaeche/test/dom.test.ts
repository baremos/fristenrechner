import { expect, it } from 'vitest';
import { leerenUndAnhaengen } from '../src/dom';

function elementMit(...kinder: Node[]) {
  const entfernt: Node[] = [];
  const angehaengt: (Node | string)[] = [];
  return {
    kinder,
    entfernt,
    angehaengt,
    get firstChild(): ChildNode | null { return (kinder[0] as ChildNode | undefined) ?? null; },
    removeChild<T extends Node>(kind: T): T {
      const index = kinder.indexOf(kind);
      if (index < 0) throw new Error('Kind fehlt.');
      kinder.splice(index, 1);
      entfernt.push(kind);
      return kind;
    },
    append(...knoten: (Node | string)[]): void {
      expect(kinder).toEqual([]);
      angehaengt.push(...knoten);
      kinder.push(...knoten.map(knoten => typeof knoten === 'string' ? text(knoten) : knoten));
    },
  };
}

function text(textContent: string): Node {
  return { textContent } as Node;
}

it('entfernt sämtliche Kinder, auch Textknoten', () => {
  const vorher = [text('eins'), text('zwei'), text('drei')];
  const el = elementMit(...vorher);
  leerenUndAnhaengen(el);
  expect(el.kinder).toEqual([]);
  expect(el.entfernt).toEqual(vorher);
});

it('lässt ein leeres Element ohne neue Knoten leer', () => {
  const el = elementMit();
  leerenUndAnhaengen(el);
  expect(el.kinder).toEqual([]);
  expect(el.entfernt).toEqual([]);
});

it('hängt neue und erneut verwendete Knoten in der angegebenen Reihenfolge an', () => {
  const alt = text('alt');
  const neu = text('neu');
  const el = elementMit(alt, text('entfällt'));
  leerenUndAnhaengen(el, neu, alt);
  expect(el.kinder).toHaveLength(2);
  expect(el.kinder[0]).toBe(neu);
  expect(el.kinder[1]).toBe(alt);
});

it('übergibt Zeichenketten einschließlich leerem Text unverändert an append', () => {
  const knoten = text('Knoten');
  const el = elementMit(text('entfällt'));
  leerenUndAnhaengen(el, '<b>Text</b>', knoten, '', 'Ende');
  expect(el.angehaengt).toEqual(['<b>Text</b>', knoten, '', 'Ende']);
  expect(el.kinder.map(kind => kind.textContent)).toEqual(['<b>Text</b>', 'Knoten', '', 'Ende']);
  expect(el.kinder[1]).toBe(knoten);
});
