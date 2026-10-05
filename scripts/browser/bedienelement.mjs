// Gemeinsame Sperrprüfung für die im Browser ausgeführten Messausdrücke.
// :disabled erfasst auch native Sperren über ein übergeordnetes fieldset.
function gesperrt(element) {
  return element.disabled === true || element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
}

export const sperrpruefungQuelle = gesperrt.toString();
