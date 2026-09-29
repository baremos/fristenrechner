/** Entfernt alle Kinder und hängt Knoten oder Text in der angegebenen Reihenfolge an. */
export function leerenUndAnhaengen(
  el: Pick<Element, 'firstChild' | 'removeChild' | 'append'>,
  ...knoten: (Node | string)[]
): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.append(...knoten);
}
