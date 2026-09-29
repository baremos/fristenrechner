#!/bin/bash
# Stellt den festgehaltenen Stand von gradlew-fdroid im Benutzerbereich bereit.
# Aufruf: bash scripts/gradlew-fdroid-einrichten.sh [--ziel <Basisordner>]
#         [--probelauf | --nur-pruefen]
# --probelauf nennt Quelle, Prüfsumme und Ziel, ohne Netz oder Schreibzugriff.
# --nur-pruefen prüft einen vorhandenen Stand, ohne ihn auszuführen.
# Voraussetzung: Python ab 3.9. Das Skript installiert nichts im System.
set -eu
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C.UTF-8
hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 > /dev/null; then
  echo "Das Werkzeug fehlt: python3" >&2
  exit 69
fi
exec python3 "$hier/fdroid/gradlew-einrichten.py" "$hier/toolchain.json" "$@"
