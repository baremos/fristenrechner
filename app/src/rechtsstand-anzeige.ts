// Zeigt den Hinweis zum Rechtsstand, sobald die Regel aus rechtsstand-hinweis.ts
// greift. Geprüft wird beim Laden, bei der Rückkehr in den Vordergrund und beim
// Ereignis resume, damit der Hinweis ohne Neustart der App erscheint.
import { heuteLokal, rechtsstandHinweisNoetig } from './rechtsstand-hinweis';

function pruefen(): void {
  const hinweis = document.getElementById('app-rechtsstand-hinweis');
  const rechtsstand = hinweis?.dataset.rechtsstand;
  if (!hinweis || !rechtsstand) return;
  hinweis.hidden = !rechtsstandHinweisNoetig(heuteLokal(), rechtsstand);
}

pruefen();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pruefen();
});
document.addEventListener('resume', pruefen);
