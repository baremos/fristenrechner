#!/bin/bash
# Stellt die Referenzversion von Node.js unter Linux bereit.
#
# Das Skript lädt das Archiv von nodejs.org, prüft es gegen die Prüfsumme aus
# scripts/toolchain.json und entpackt es in den Benutzerbereich. Es installiert
# nichts im System und ändert keine Einstellungen. Wer Node.js danach nutzen
# will, stellt den Ordner bin für den Lauf vorn in PATH.
#
# Aufruf:
#   scripts/node-einrichten.sh [--ziel <Ordner>] [--probelauf]
#
#   --ziel       Ordner, unter dem das Archiv entpackt wird. Vorgabe:
#                $XDG_DATA_HOME/fristenrechner/node, ohne die Variable
#                ~/.local/share/fristenrechner/node
#   --probelauf  nennt Adresse, Prüfsumme und Ziel und lädt nichts
#
# Voraussetzungen: bash, curl, tar mit gzip, sha256sum, python3.
set -eu

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C.UTF-8

hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ziel="${XDG_DATA_HOME:-$HOME/.local/share}/fristenrechner/node"
probelauf=0

while [ $# -gt 0 ]; do
  case "$1" in
    --ziel)
      [ $# -ge 2 ] || { echo "Zu --ziel fehlt der Ordner." >&2; exit 64; }
      ziel="$2"; shift 2 ;;
    --probelauf) probelauf=1; shift ;;
    *) echo "Unbekannte Angabe: $1" >&2; exit 64 ;;
  esac
done

for werkzeug in curl tar gzip sha256sum python3; do
  if ! command -v "$werkzeug" > /dev/null; then
    echo "Das Werkzeug fehlt: $werkzeug" >&2
    exit 69
  fi
done

case "$(uname -m)" in
  x86_64) bauart="x64" ;;
  *) echo "Für die Bauart $(uname -m) ist kein Archiv festgelegt." >&2; exit 69 ;;
esac

# Version und Prüfsumme aus der Festlegung lesen
angaben="$(python3 - "$hier/toolchain.json" "$bauart" <<'EOF'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as datei:
    vorgabe = json.load(datei)
version = vorgabe["node"]["referenz"]
archiv = f"node-v{version}-linux-{sys.argv[2]}.tar.gz"
print(version)
print(archiv)
print(vorgabe["node"]["sha256"].get(archiv, ""))
print(vorgabe["npm"]["referenz"])
EOF
)"
version="$(printf '%s\n' "$angaben" | sed -n 1p)"
archiv="$(printf '%s\n' "$angaben" | sed -n 2p)"
summe="$(printf '%s\n' "$angaben" | sed -n 3p)"
npm_version="$(printf '%s\n' "$angaben" | sed -n 4p)"
if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || ! printf '%s' "$npm_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "scripts/toolchain.json nennt keine gültige Version von Node.js oder npm." >&2
  exit 65
fi
if ! printf '%s' "$summe" | grep -Eq '^[0-9a-f]{64}$'; then
  echo "Für $archiv nennt scripts/toolchain.json keine Prüfsumme." >&2
  exit 65
fi

ziel="$(realpath -m "$ziel")"
adresse="https://nodejs.org/dist/v$version/$archiv"
ordner="$ziel/${archiv%.tar.gz}"
echo "Node.js:    $version"
echo "npm:        $npm_version"
echo "Archiv:     $adresse"
echo "SHA-256:    $summe"
echo "Ziel:       $ordner"

# Prüft Node.js und npm in einem Ordner gegen die Festlegung. Liefert nichts,
# wenn beides stimmt, sonst den Grund.
pruefe_einrichtung() {
  local pfad="$1" gefunden code=0
  [ -x "$pfad/bin/node" ] || { echo "bin/node fehlt"; return; }
  gefunden="$("$pfad/bin/node" --version 2> /dev/null)" || code=$?
  [ "$code" -eq 0 ] || { echo "node --version endet mit Code $code"; return; }
  [ "$gefunden" = "v$version" ] || { echo "Node.js $gefunden statt v$version"; return; }
  [ -e "$pfad/bin/npm" ] || { echo "bin/npm fehlt"; return; }
  gefunden="$(PATH="$pfad/bin:$PATH" "$pfad/bin/npm" --version 2> /dev/null)" || code=$?
  [ "$code" -eq 0 ] || { echo "npm --version endet mit Code $code"; return; }
  [ "$gefunden" = "$npm_version" ] || { echo "npm $gefunden statt $npm_version"; return; }
}

if [ -e "$ordner" ]; then
  grund="$(pruefe_einrichtung "$ordner")"
  if [ -z "$grund" ]; then
    echo "Node.js v$version und npm $npm_version sind vorhanden."
    echo "Für einen Lauf: export PATH=\"$ordner/bin:\$PATH\""
    exit 0
  fi
  echo "Der Ordner $ordner ist vorhanden, passt aber nicht zur Festlegung: $grund. Bitte prüfen und löschen, dann das Skript erneut starten." >&2
  exit 65
fi

if [ "$probelauf" -eq 1 ]; then
  echo "Probelauf: nichts geladen, nichts geschrieben."
  exit 0
fi

mkdir -p "$ziel"
arbeit="$(mktemp -d "$ziel/einrichten-XXXXXX")"
trap 'rm -rf "$arbeit"' EXIT

echo "Lade $adresse"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --output "$arbeit/$archiv" "$adresse"
berechnet="$(sha256sum "$arbeit/$archiv" | cut -d ' ' -f 1)"
echo "Berechnet:  $berechnet"
if [ "$berechnet" != "$summe" ]; then
  echo "Die Prüfsumme weicht ab. Erwartet: $summe" >&2
  exit 65
fi

tar -xzf "$arbeit/$archiv" -C "$arbeit"
grund="$(pruefe_einrichtung "$arbeit/${archiv%.tar.gz}")"
if [ -n "$grund" ]; then
  echo "Der Inhalt des Archivs passt nicht zur Festlegung: $grund." >&2
  exit 65
fi
mv "$arbeit/${archiv%.tar.gz}" "$ordner"

echo "Node.js v$version und npm $npm_version sind eingerichtet."
echo "Für einen Lauf: export PATH=\"$ordner/bin:\$PATH\""
