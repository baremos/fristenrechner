import { expect } from 'vitest';
import type { DateiablaufPlugin } from '../src/adapters/dateiablauf-vertrag';

export type Methode = keyof DateiablaufPlugin;
export function aufschub<T>() {
  let erfuellen!: (wert: T | PromiseLike<T>) => void;
  let ablehnen!: (grund: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => { erfuellen = resolve; ablehnen = reject; });
  return { promise, erfuellen, ablehnen };
}

/** Jede Methode prüft Zahl und Felder ihrer Argumente vor der simulierten Antwort. */
export class PluginFake implements DateiablaufPlugin {
  readonly aufrufe: Methode[] = [];
  eingriff: (methode: Methode) => void | Promise<void> = () => {};
  projekt: unknown = { status: 'ok', name: 'projekt.json', text: '{}' };
  bestaetigung: unknown = { bestaetigt: true };

  private async aufrufen(methode: Methode, argumente: IArguments, felder?: string[]) {
    expect(argumente.length).toBe(felder ? 1 : 0);
    if (felder) expect(Reflect.ownKeys(argumente[0]).sort()).toEqual([...felder].sort());
    this.aufrufe.push(methode);
    await this.eingriff(methode);
  }

  async projektWaehlen(): ReturnType<DateiablaufPlugin['projektWaehlen']> {
    await this.aufrufen('projektWaehlen', arguments);
    return this.projekt as Awaited<ReturnType<DateiablaufPlugin['projektWaehlen']>>;
  }
  async zuruecksetzenBestaetigen(): ReturnType<DateiablaufPlugin['zuruecksetzenBestaetigen']> {
    await this.aufrufen('zuruecksetzenBestaetigen', arguments);
    return this.bestaetigung as Awaited<ReturnType<DateiablaufPlugin['zuruecksetzenBestaetigen']>>;
  }
  async ausgabeBeginnen(vorgabe: Parameters<DateiablaufPlugin['ausgabeBeginnen']>[0]) {
    await this.aufrufen('ausgabeBeginnen', arguments, ['name', 'mime', 'anzahlBytes']);
    expect(typeof vorgabe.name).toBe('string');
    expect(typeof vorgabe.mime).toBe('string');
    expect(Number.isInteger(vorgabe.anzahlBytes)).toBe(true);
    return { auftragId: 'auftrag-1' };
  }
  async ausgabeBlock(block: Parameters<DateiablaufPlugin['ausgabeBlock']>[0]) {
    await this.aufrufen('ausgabeBlock', arguments, ['auftragId', 'offset', 'base64']);
    expect(block.auftragId).toBe('auftrag-1');
    expect(Number.isInteger(block.offset)).toBe(true);
    expect(typeof block.base64).toBe('string');
  }
  async ausgabeAbschliessen(auftrag: { auftragId: string }) {
    await this.aufrufen('ausgabeAbschliessen', arguments, ['auftragId']);
    expect(auftrag.auftragId).toBe('auftrag-1');
  }
  async speichernUnter(auftrag: { auftragId: string }) {
    await this.aufrufen('speichernUnter', arguments, ['auftragId']);
    expect(auftrag.auftragId).toBe('auftrag-1');
    return { status: 'ok' as const };
  }
  async teilen(auftrag: { auftragId: string }) {
    await this.aufrufen('teilen', arguments, ['auftragId']);
    expect(auftrag.auftragId).toBe('auftrag-1');
    return { status: 'bereitgestellt' as const };
  }
  async ausgabeVerwerfen(auftrag: { auftragId: string }) {
    await this.aufrufen('ausgabeVerwerfen', arguments, ['auftragId']);
    expect(auftrag.auftragId).toBe('auftrag-1');
  }
}

export function halteAn(plugin: PluginFake, methode: Methode) {
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
