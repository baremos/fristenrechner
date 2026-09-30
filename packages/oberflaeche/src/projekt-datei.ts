import { erstelleProjektDatei, type ScheduleInput } from '@baremos/fristenrechner-kern';
import { pruefeProjektGroesse, type AusgabeDatei, type ExportZeit } from './plattform';

export function safeFilename(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'vergabe-terminplan';
}

export function projektAlsDatei(input: ScheduleInput, zeit: ExportZeit): AusgabeDatei {
  const name = safeFilename(input.projekt?.projektname || input.projekt?.vergabenummer || 'vergabe-terminplan');
  const json = JSON.stringify(erstelleProjektDatei(input, zeit.zeitpunkt), null, 2);
  pruefeProjektGroesse(json);
  return {
    name: `${name}.json`, mime: 'application/json;charset=utf-8',
    bytes: new TextEncoder().encode(json),
  };
}
