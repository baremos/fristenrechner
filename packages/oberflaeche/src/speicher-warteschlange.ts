import type { ProjektSpeicher } from './plattform';

/** Auch nach Fehlern bleibt die Reihenfolge erhalten. Barrieren verwerfen wartende alte Schreibaufträge. */
export function speicherWarteschlange(speicher: ProjektSpeicher) {
  let ende: Promise<void> = Promise.resolve();
  let generation = 0;
  let geschlossen = false;
  function anstellen(aktion: () => Promise<void>): Promise<void> {
    const lauf = ende.then(aktion);
    ende = lauf.catch(() => {});
    return lauf;
  }
  return {
    schreiben(json: string): Promise<void> {
      const stand = generation;
      return anstellen(async () => {
        if (!geschlossen && stand === generation) await speicher.schreiben(json);
      });
    },
    async beruhigen(): Promise<void> { generation += 1; await ende; },
    entfernen(): Promise<void> { return anstellen(() => speicher.entfernen()); },
    dispose(): Promise<void> { geschlossen = true; generation += 1; return ende; },
  };
}
