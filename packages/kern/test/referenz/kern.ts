/**
 * Einziger Bezug der Referenzprüfung auf den Rechenkern. Raster, Abbild und
 * Test greifen nur über diese Datei zu. So lässt sich dieselbe Prüfung gegen
 * einen anderen Stand des Rechenkerns richten, ohne sie zu verändern.
 */
export {
  calculateSchedule,
  defaultFristen,
  feiertage,
  RECHTSSTAND_DATUM,
  REGELVERSION,
} from '../../src/api.js';
export type {
  Bundesland,
  FristWerte,
  InterneFristen,
  Optionen,
  ScheduleInput,
  ScheduleResult,
  Verfahrensart,
  Vergabeordnung,
} from '../../src/api.js';
