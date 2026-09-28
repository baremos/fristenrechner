#!/bin/bash
# Prüft den Quelltext eines Android-Projekts mit dem Scanner von F-Droid.
#
# Das Skript legt den Quelltext in ein lokales Git-Repository, schreibt dazu
# Metadaten im Format von F-Droid und ruft "fdroid scanner" auf. Es braucht
# weder das Android SDK noch das Netz. Geprüft wird der Quelltext, wie er im
# Repository steht, also vor jedem Build-Schritt und ohne node_modules.
#
# Aufruf:
#   scripts/fdroid/quelltext-pruefen.sh --quelle <Ordner> --appid <App-ID> \
#       [--unterordner android/app] [--arbeitsordner <Ordner>]
#
# Voraussetzungen: Debian 13 mit fdroidserver, git, rsync. Siehe
# docs/fdroid-build.md.
set -eu

# Werkzeuge nur aus dem System. Unter WSL reicht sonst der Suchpfad von
# Windows in die Distribution hinein.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C.UTF-8

quelle=""
appid=""
unterordner="android/app"
arbeitsordner="${XDG_CACHE_HOME:-$HOME/.cache}/fristenrechner/fdroid-probe"

while [ $# -gt 0 ]; do
  case "$1" in
    --quelle) quelle="$2"; shift 2 ;;
    --appid) appid="$2"; shift 2 ;;
    --unterordner) unterordner="$2"; shift 2 ;;
    --arbeitsordner) arbeitsordner="$2"; shift 2 ;;
    *) echo "Unbekannte Angabe: $1" >&2; exit 64 ;;
  esac
done

if [ -z "$quelle" ] || [ -z "$appid" ]; then
  echo "Aufruf: $0 --quelle <Ordner> --appid <App-ID> [--unterordner android/app] [--arbeitsordner <Ordner>]" >&2
  exit 64
fi
if [ ! -d "$quelle" ]; then
  echo "Der Ordner mit dem Quelltext fehlt: $quelle" >&2
  exit 66
fi
if ! printf '%s' "$appid" | grep -Eq '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$'; then
  echo "Die App-ID hat nicht die Form eines Paketnamens: $appid" >&2
  exit 64
fi
for werkzeug in fdroid git rsync; do
  if ! command -v "$werkzeug" > /dev/null; then
    echo "Das Werkzeug fehlt: $werkzeug" >&2
    exit 69
  fi
done

repo="$arbeitsordner/quelle/$appid"
daten="$arbeitsordner/daten"
rm -rf "$repo" "$daten"
mkdir -p "$repo" "$daten/metadata"

# Quelltext ohne Build-Ergebnisse und ohne geladene Abhängigkeiten
rsync -a \
  --exclude .git --exclude node_modules --exclude dist --exclude .astro \
  --exclude '*.log' --exclude .gradle --exclude .kotlin --exclude build \
  --exclude local.properties \
  "$quelle/" "$repo/"

cd "$repo"
git init -q -b main
git config user.name "F-Droid-Probe"
git config user.email "probe@localhost"
git config core.autocrlf false
git add -A
git commit -q -m "Quelltext für die Prüfung mit dem Scanner von F-Droid"
commit=$(git rev-parse HEAD)
echo "Quelltext: $(git ls-files | wc -l) Dateien, Commit $commit"

gradle="$repo/$unterordner/build.gradle"
if [ ! -f "$gradle" ]; then
  echo "Die Datei fehlt: $unterordner/build.gradle" >&2
  exit 66
fi
version_code=$(sed -n 's/^[[:space:]]*versionCode[[:space:]]\+\([0-9]\+\).*/\1/p' "$gradle" | head -1)
version_name=$(sed -n 's/^[[:space:]]*versionName[[:space:]]\+"\([^"]*\)".*/\1/p' "$gradle" | head -1)
if [ -z "$version_code" ] || [ -z "$version_name" ]; then
  echo "versionCode oder versionName fehlt in $unterordner/build.gradle" >&2
  exit 65
fi

cat > "$daten/metadata/$appid.yml" <<EOF
License: Apache-2.0
RepoType: git
Repo: file://$repo

Builds:
  - versionName: '$version_name'
    versionCode: $version_code
    commit: $commit
    subdir: $unterordner
    gradle:
      - yes

AutoUpdateMode: None
UpdateCheckMode: None
CurrentVersion: '$version_name'
CurrentVersionCode: $version_code
EOF

cd "$daten"
echo "fdroidserver $(fdroid --version)"

# Der Rückgabewert des Scanners sagt bei der Prüfung von Quelltext nichts:
# fdroidserver 2.4.2 endet auch mit Beanstandungen und mit --exit-code mit 0.
# Ausgewertet wird deshalb die Ausgabe im Format JSON.
set +e
fdroid scanner --json --verbose "$appid" > "$arbeitsordner/scanner.json" 2> "$arbeitsordner/scanner.log"
rueckgabe=$?
set -e
echo "Protokoll: $arbeitsordner/scanner.log"
echo "Ergebnis des Scanners: $arbeitsordner/scanner.json"
if [ "$rueckgabe" -ne 0 ]; then
  grep -E ' (WARNING|ERROR|CRITICAL): ' "$arbeitsordner/scanner.log" || true
  echo "ERGEBNIS: Der Scanner ist mit Rückgabewert $rueckgabe abgebrochen"
  exit 70
fi

python3 - "$arbeitsordner/scanner.json" "$appid" <<'EOF'
import json
import sys

pfad, appid = sys.argv[1], sys.argv[2]
try:
    with open(pfad, encoding="utf-8") as datei:
        ergebnis = json.load(datei)
except (OSError, ValueError) as fehler:
    print(f"ERGEBNIS: Die Ausgabe des Scanners ist nicht lesbar: {fehler}")
    sys.exit(70)

versionen = ergebnis.get(appid)
if not isinstance(versionen, dict) or not versionen:
    print("ERGEBNIS: Der Scanner hat keine Version geprüft")
    sys.exit(70)

beanstandungen = 0
for version, befund in sorted(versionen.items()):
    for art, name in (("errors", "Fehler"), ("warnings", "Warnung")):
        for text, datei in befund.get(art, []):
            beanstandungen += 1
            print(f"{name}: {text} ({datei})")
    for text, datei in befund.get("infos", []):
        print(f"Hinweis: {text}")

if beanstandungen:
    print(f"ERGEBNIS: {beanstandungen} Beanstandungen")
    sys.exit(1)
print("ERGEBNIS: keine Beanstandung")
EOF
