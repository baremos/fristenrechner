#!/bin/bash
# Richtet das Projekt-SDK für Android nach docs/toolchain.md ein (Linux).
#
# Das Skript legt ein eigenes Android SDK im Benutzerbereich an. Es lädt die
# Kommandozeilenwerkzeuge von Google, prüft die Prüfsumme und installiert mit
# sdkmanager die festgelegten Pakete. sdkmanager zeigt vorher die
# Lizenzbedingungen der Pakete. Die Bestätigung gibt ein, wer das Skript
# startet. Am Ende vergleicht das Skript die installierten Revisionen mit
# scripts/toolchain.json. Es entspricht scripts/android-sdk-einrichten.ps1.
#
# Aufruf:
#   scripts/android-sdk-einrichten.sh [--sdk-root <Ordner>] [--java-home <Ordner>]
#       [--ohne-testgruppe] [--nur-pruefen]
#
#   --ohne-testgruppe  ohne Emulator und Systemabbilder
#   --nur-pruefen      lädt und installiert nichts, vergleicht nur ein
#                      vorhandenes SDK mit der Festlegung
#
# Ort des SDK, in dieser Reihenfolge: --sdk-root, ANDROID_HOME, Standardordner
# des Projekt-SDK. Das Build-Skript verwendet dieselbe Reihenfolge.
#
# Rückgabewert: 0 ohne Abweichung, 2 bei fehlenden, abweichenden oder
# ungültigen Paketen, sonst ein Fehler.
#
# Voraussetzungen: bash, curl, unzip, sha1sum, sha256sum, python3, JDK 21.
set -eu

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C.UTF-8

hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sdk_root=""
java_home=""
ohne_test=0
nur_pruefen=0

while [ $# -gt 0 ]; do
  case "$1" in
    --sdk-root)
      [ $# -ge 2 ] || { echo "Zu --sdk-root fehlt der Ordner." >&2; exit 64; }
      sdk_root="$2"; shift 2 ;;
    --java-home)
      [ $# -ge 2 ] || { echo "Zu --java-home fehlt der Ordner." >&2; exit 64; }
      java_home="$2"; shift 2 ;;
    --ohne-testgruppe) ohne_test=1; shift ;;
    --nur-pruefen) nur_pruefen=1; shift ;;
    *) echo "Unbekannte Angabe: $1" >&2; exit 64 ;;
  esac
done

for werkzeug in curl unzip sha1sum sha256sum python3; do
  if ! command -v "$werkzeug" > /dev/null; then
    echo "Das Werkzeug fehlt: $werkzeug" >&2
    exit 69
  fi
done

# Festlegung lesen. Je Paket eine Zeile: Name, Ordner, Revision, Gruppe,
# Archiv für Linux, SHA-1. Felder sind durch Tabulatoren getrennt.
festlegung="$(python3 - "$hier/toolchain.json" <<'EOF'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as datei:
    vorgabe = json.load(datei)
print("jdk", vorgabe["jdk"]["hauptversion"], vorgabe["jdk"]["kennung"], sep="\t")
print("quelle", vorgabe["android"]["quelle"], sep="\t")
print("ordner", vorgabe["android"]["sdkOrdner"], sep="\t")
for paket in vorgabe["android"]["pakete"]:
    archiv = paket["archive"].get("linux") or paket["archive"].get("alle") or {}
    print("paket", paket["name"], paket["ordner"], paket["revision"], paket["gruppe"],
          archiv.get("datei", ""), archiv.get("sha1", ""), sep="\t")
EOF
)"
wert() { printf '%s\n' "$festlegung" | awk -F '\t' -v schluessel="$1" -v feld="$2" '$1 == schluessel { print $feld; exit }'; }
jdk_haupt="$(wert jdk 2)"
jdk_kennung="$(wert jdk 3)"
quelle="$(wert quelle 2)"
sdk_ordner="$(wert ordner 2)"

# Liefert nichts, wenn der Ordner ein vollständiges JDK der festgelegten
# Hauptversion und Kennung enthält. Sonst den Grund, warum er nicht passt.
pruefe_jdk() {
  local pfad="$1" ausgabe version haupt
  for programm in java javac; do
    [ -x "$pfad/bin/$programm" ] || { echo "$programm fehlt"; return; }
  done
  ausgabe="$("$pfad/bin/java" -version 2>&1)" || { echo "Versionsabfrage schlägt fehl"; return; }
  version="$(printf '%s\n' "$ausgabe" | sed -n 's/.*version "\([^"]*\)".*/\1/p' | head -1)"
  [ -n "$version" ] || { echo "Version nicht lesbar"; return; }
  haupt="${version%%.*}"
  [ "$haupt" = "1" ] && haupt="$(printf '%s' "$version" | cut -d . -f 2)"
  [ "$haupt" = "$jdk_haupt" ] || { echo "Hauptversion $haupt"; return; }
  printf '%s' "$ausgabe" | grep -q "$jdk_kennung" || { echo "keine $jdk_kennung-Distribution"; return; }
}

finde_jdk() {
  local kandidaten=() k grund
  [ -n "$java_home" ] && kandidaten+=("$java_home")
  [ -n "${JAVA_HOME:-}" ] && kandidaten+=("$JAVA_HOME")
  if [ -d /usr/lib/jvm ]; then
    while IFS= read -r k; do kandidaten+=("$k"); done < <(find /usr/lib/jvm -mindepth 1 -maxdepth 1 -type d | sort -r)
  fi
  for k in "${kandidaten[@]}"; do
    grund="$(pruefe_jdk "$k")"
    if [ -z "$grund" ]; then printf '%s' "$k"; return; fi
    if [ "$k" = "$java_home" ] || [ "$k" = "${JAVA_HOME:-}" ]; then echo "Übersprungen: $k ($grund)" >&2; fi
  done
  echo "Kein JDK $jdk_haupt gefunden. Zuerst ein JDK nach docs/toolchain.md installieren oder --java-home angeben." >&2
  exit 69
}

# Prüft Pakete mit scripts/SdkPruefung.java. Eingabe: Zeilen der Festlegung.
# Ausgabe je Paket: Status, Name, gefundene Revision, Meldung.
pruefe_pakete() {
  local angaben=() name ordner revision
  while IFS=$'\t' read -r _ name ordner revision _; do
    angaben+=("$name" "$ordner" "$revision")
  done
  "$jdk/bin/java" "$hier/SdkPruefung.java" "$sdk_root" "${angaben[@]}"
}

# 1. JDK
jdk="$(finde_jdk)"

# 2. Zielordner
herkunft="--sdk-root"
if [ -z "$sdk_root" ]; then
  if [ -n "${ANDROID_HOME:-}" ]; then
    sdk_root="$ANDROID_HOME"
    herkunft="ANDROID_HOME"
  else
    sdk_root="${XDG_DATA_HOME:-$HOME/.local/share}/$sdk_ordner"
    herkunft="Standardordner"
  fi
fi
sdk_root="$(realpath -m "$sdk_root")"
echo "JDK:  $jdk"
echo "SDK:  $sdk_root ($herkunft)"

pakete="$(printf '%s\n' "$festlegung" | awk -F '\t' -v ohne="$ohne_test" '$1 == "paket" && ($5 == "build" || ohne == 0)')"
werkzeuge="$(printf '%s\n' "$pakete" | awk -F '\t' '$2 ~ /^cmdline-tools;/ { print; exit }')"
werkzeuge_ordner="$(printf '%s' "$werkzeuge" | cut -f 3)"
werkzeuge_revision="$(printf '%s' "$werkzeuge" | cut -f 4)"
werkzeuge_archiv="$(printf '%s' "$werkzeuge" | cut -f 6)"
werkzeuge_sha1="$(printf '%s' "$werkzeuge" | cut -f 7)"
ziel="$sdk_root/$werkzeuge_ordner"
sdkmanager="$ziel/lib/sdkmanager-classpath.jar"

if [ "$nur_pruefen" -eq 0 ]; then
  if ! mkdir -p "$sdk_root" 2> /dev/null || ! probe="$(mktemp "$sdk_root/schreibprobe-XXXXXX" 2> /dev/null)"; then
    echo "Der Ordner $sdk_root ist nicht beschreibbar. Das Projekt-SDK braucht einen eigenen Ordner im Benutzerbereich. Mit --sdk-root einen anderen Ort angeben." >&2
    exit 73
  fi
  rm -f "$probe"

  # 3. Kommandozeilenwerkzeuge
  # sdkmanager läuft mit dem JDK aus Schritt 1 und wird ohne das Startskript
  # aufgerufen. Das Android-CLI aus demselben Archiv wird nicht verwendet.
  if [ -e "$ziel" ] && [ ! -f "$sdkmanager" ]; then
    echo "Der Ordner $ziel ist vorhanden, aber unvollständig. Bitte prüfen und löschen, dann das Skript erneut starten." >&2
    exit 65
  fi
  if [ ! -f "$sdkmanager" ]; then
    arbeit="$(mktemp -d "$sdk_root/einrichten-XXXXXX")"
    trap 'rm -rf "$arbeit"' EXIT
    echo "Lade $quelle$werkzeuge_archiv"
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --output "$arbeit/$werkzeuge_archiv" "$quelle$werkzeuge_archiv"
    sha1="$(sha1sum "$arbeit/$werkzeuge_archiv" | cut -d ' ' -f 1)"
    sha256="$(sha256sum "$arbeit/$werkzeuge_archiv" | cut -d ' ' -f 1)"
    echo "SHA-1:   $sha1"
    echo "SHA-256: $sha256"
    if [ "$sha1" != "$werkzeuge_sha1" ]; then
      echo "Die Prüfsumme weicht ab. Erwartet: $werkzeuge_sha1" >&2
      exit 65
    fi
    unzip -q "$arbeit/$werkzeuge_archiv" -d "$arbeit/entpackt"
    if [ ! -f "$arbeit/entpackt/cmdline-tools/lib/sdkmanager-classpath.jar" ]; then
      echo "Das Archiv hat nicht den erwarteten Aufbau: cmdline-tools/lib/sdkmanager-classpath.jar fehlt." >&2
      exit 65
    fi
    mkdir -p "$(dirname "$ziel")"
    mv "$arbeit/entpackt/cmdline-tools" "$ziel"
  fi

  ergebnis="$(printf '%s\n' "$werkzeuge" | pruefe_pakete)"
  if [ "$(printf '%s' "$ergebnis" | cut -f 1)" != "OK" ]; then
    echo "Kommandozeilenwerkzeuge unter $ziel: $(printf '%s' "$ergebnis" | cut -f 1,3,4 | tr -s '\t' ' ') Festgelegt ist $werkzeuge_revision." >&2
    exit 65
  fi
  echo "Kommandozeilenwerkzeuge $(printf '%s' "$ergebnis" | cut -f 3) sind vorhanden."
  while IFS= read -r ordner; do
    [ "$ordner" = "$ziel" ] || echo "Hinweis: $ordner gehört nicht zur Festlegung."
  done < <(find "$(dirname "$ziel")" -mindepth 1 -maxdepth 1 -type d | sort)

  # 4. Pakete. Die Kommandozeilenwerkzeuge sind schon vorhanden.
  # sdkmanager zeigt die Lizenzbedingungen der angeforderten Pakete, solange
  # sie in diesem SDK nicht bestätigt sind. "sdkmanager --licenses" entfällt:
  # Der Aufruf legt auch Bedingungen vor, die diese Pakete nicht brauchen.
  namen=()
  while IFS=$'\t' read -r _ name _; do
    [ "$name" = "$(printf '%s' "$werkzeuge" | cut -f 2)" ] || namen+=("$name")
  done <<< "$pakete"
  echo
  echo "Installiere: ${namen[*]}"
  echo "Zeigt sdkmanager Lizenzbedingungen an: bitte lesen und selbst bestätigen."
  code=0
  JAVA_HOME="$jdk" "$jdk/bin/java" "-Dcom.android.sdklib.toolsdir=$ziel" -classpath "$sdkmanager" \
    com.android.sdklib.tool.sdkmanager.SdkManagerCli "--sdk_root=$sdk_root" --install "${namen[@]}" || code=$?
  if [ "$code" -ne 0 ]; then
    echo "sdkmanager --install endete mit Code $code." >&2
    exit 70
  fi
fi

# 5. Installierte Revisionen gegen die Festlegung prüfen
# Die Ausgabe trennt Felder mit Tabulatoren, leere Felder kommen vor. bash
# fasst Tabulatoren beim Lesen zusammen, deshalb vorher ein anderes
# Trennzeichen einsetzen.
echo
abweichung=0
fehlt=0
trenner=$'\x1f'
while IFS="$trenner" read -r status name gefunden meldung; do
  [ -n "$status" ] || continue
  case "$status" in
    OK) echo "OK         $name  $gefunden" ;;
    FEHLT) echo "FEHLT      $name"; abweichung=1; fehlt=1 ;;
    ABWEICHUNG)
      soll="$(printf '%s\n' "$pakete" | awk -F '\t' -v name="$name" '$2 == name { print $4; exit }')"
      echo "ABWEICHUNG $name  gefunden $gefunden, festgelegt $soll"; abweichung=1 ;;
    UNGUELTIG) echo "UNGUELTIG  $name  $meldung"; abweichung=1 ;;
    *) echo "Die Prüfung der Pakete meldet den unbekannten Status $status." >&2; exit 70 ;;
  esac
done < <(printf '%s\n' "$pakete" | pruefe_pakete | tr '\t' "$trenner")

echo
if [ "$fehlt" -eq 1 ]; then
  echo "Mindestens ein Paket fehlt. sdkmanager installiert nur Pakete, deren Lizenzbedingungen bestätigt sind."
elif [ "$abweichung" -eq 1 ]; then
  echo "Mindestens ein Paket weicht von docs/toolchain.md ab. Die Festlegung prüfen und im Kreuz-Review aktualisieren."
elif [ "$herkunft" = "Standardordner" ]; then
  echo "Fertig. Das Build-Skript findet das SDK im Standardordner."
else
  echo "Fertig. Das Build-Skript findet dieses SDK über ANDROID_HOME, über sdk.dir in local.properties oder über --sdk:"
  echo "  node scripts/android-build.mjs --sdk \"$sdk_root\""
fi

[ "$abweichung" -eq 0 ] || exit 2
