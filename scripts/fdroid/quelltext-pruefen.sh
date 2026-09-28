#!/bin/bash
# Prüft einen festgelegten Stand eines Git-Repositorys mit dem Scanner von
# F-Droid.
#
# Das Skript schreibt Metadaten im Format von F-Droid und ruft "fdroid scanner"
# auf. Der Scanner holt sich den genannten Stand selbst aus dem Repository.
# Geprüft wird damit genau das, was eingecheckt ist: vor jedem Build-Schritt
# und ohne node_modules. Das Skript kopiert und löscht keine Quelldateien.
#
# Aufruf:
#   scripts/fdroid/quelltext-pruefen.sh --repo <Ordner> --appid <App-ID>
#       [--stand <Commit>] [--unterordner android/app]
#       [--arbeitsordner <Ordner>] [--mit-netz]
#
#   --repo           Git-Repository mit dem Quelltext
#   --stand          Commit, Branch oder Tag. Vorgabe: HEAD
#   --unterordner    Ordner des App-Moduls mit build.gradle
#   --arbeitsordner  Ordner für die Läufe. Je Lauf entsteht darin ein neuer
#                    Ordner. Vorgabe: $XDG_CACHE_HOME/fristenrechner/fdroid-probe,
#                    ohne die Variable ~/.cache/fristenrechner/fdroid-probe.
#                    Die Ordner der Läufe bleiben liegen, auch nach einem
#                    gescheiterten Lauf. Das Skript räumt nicht auf.
#   --mit-netz       lässt dem Scanner das Netzwerk. Ohne die Angabe läuft er
#                    in einem eigenen Namensraum ohne Netzwerk.
#
# Rückgabewert: 0 ohne Beanstandung, 1 mit Beanstandungen, sonst ein Fehler.
#
# Voraussetzungen: Debian 13 mit fdroidserver, git, python3 mit yaml, unshare.
# Siehe docs/fdroid-build.md.
set -eu

# Werkzeuge nur aus dem System. Unter WSL reicht sonst der Suchpfad von
# Windows in die Distribution hinein.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C.UTF-8

hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

aufruf() {
  echo "Aufruf: $0 --repo <Ordner> --appid <App-ID> [--stand <Commit>] [--unterordner android/app] [--arbeitsordner <Ordner>] [--mit-netz]" >&2
  exit 64
}

repo=""
appid=""
stand="HEAD"
unterordner="android/app"
arbeitsordner="${XDG_CACHE_HOME:-$HOME/.cache}/fristenrechner/fdroid-probe"
mit_netz=0

while [ $# -gt 0 ]; do
  case "$1" in
    --repo | --appid | --stand | --unterordner | --arbeitsordner)
      if [ $# -lt 2 ] || [ -z "$2" ]; then
        echo "Zu $1 fehlt der Wert." >&2
        exit 64
      fi
      case "$1" in
        --repo) repo="$2" ;;
        --appid) appid="$2" ;;
        --stand) stand="$2" ;;
        --unterordner) unterordner="$2" ;;
        --arbeitsordner) arbeitsordner="$2" ;;
      esac
      shift 2 ;;
    --mit-netz) mit_netz=1; shift ;;
    *) echo "Unbekannte Angabe: $1" >&2; aufruf ;;
  esac
done

[ -n "$repo" ] && [ -n "$appid" ] || aufruf

for werkzeug in fdroid git python3 realpath; do
  if ! command -v "$werkzeug" > /dev/null; then
    echo "Das Werkzeug fehlt: $werkzeug" >&2
    exit 69
  fi
done
if ! python3 -c 'import yaml' 2> /dev/null; then
  echo "Das Python-Modul yaml fehlt." >&2
  exit 69
fi

if ! printf '%s' "$appid" | grep -Eq '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$'; then
  echo "Die App-ID hat nicht die Form eines Paketnamens: $appid" >&2
  exit 64
fi
case "/$unterordner/" in
  *//* | */./* | */../*)
    echo "Der Unterordner muss ein Pfad innerhalb des Repositorys sein: $unterordner" >&2
    exit 64 ;;
esac
if ! printf '%s' "$unterordner" | grep -Eq '^[A-Za-z0-9._/-]+$'; then
  echo "Der Unterordner enthält Zeichen, die das Skript nicht zulässt: $unterordner" >&2
  exit 64
fi

if [ ! -d "$repo" ]; then
  echo "Der Ordner des Repositorys fehlt: $repo" >&2
  exit 66
fi
repo="$(realpath "$repo")"
if [ "$(git -C "$repo" rev-parse --show-toplevel 2> /dev/null)" != "$repo" ]; then
  echo "Der Ordner ist nicht die Wurzel eines Git-Repositorys: $repo" >&2
  exit 66
fi
# --end-of-options: Auch ein Name wie "--help" gilt als Stand, nicht als Option.
if ! commit="$(git -C "$repo" rev-parse --verify --quiet --end-of-options "$stand^{commit}")"; then
  echo "Den Stand gibt es im Repository nicht: $stand" >&2
  exit 66
fi

# Der Arbeitsordner liegt weder im Repository noch umschließt er es.
arbeitsordner="$(realpath -m "$arbeitsordner")"
case "$arbeitsordner/" in
  "$repo"/*) echo "Der Arbeitsordner liegt im Repository: $arbeitsordner" >&2; exit 64 ;;
esac
case "$repo/" in
  "$arbeitsordner"/*) echo "Das Repository liegt im Arbeitsordner: $arbeitsordner" >&2; exit 64 ;;
esac

if ! gradle="$(git -C "$repo" show "$commit:$unterordner/build.gradle" 2> /dev/null)"; then
  echo "Im Stand $commit fehlt die Datei $unterordner/build.gradle" >&2
  exit 66
fi
version_code="$(printf '%s\n' "$gradle" | sed -n 's/^[[:space:]]*versionCode[[:space:]]\+\([0-9]\+\)[[:space:]]*$/\1/p' | head -1)"
version_name="$(printf '%s\n' "$gradle" | sed -n 's/^[[:space:]]*versionName[[:space:]]\+"\([^"]*\)"[[:space:]]*$/\1/p' | head -1)"
if [ -z "$version_code" ] || [ -z "$version_name" ]; then
  echo "versionCode oder versionName fehlt in $unterordner/build.gradle" >&2
  exit 65
fi

if [ "$mit_netz" -eq 0 ] && ! unshare -r -n true 2> /dev/null; then
  echo "Ein Lauf ohne Netzwerk ist hier nicht möglich: unshare -r -n scheitert. Mit --mit-netz läuft der Scanner mit Netzwerk." >&2
  exit 69
fi

# Jeder Lauf bekommt einen neuen Ordner. Vorhandenes bleibt unberührt.
mkdir -p "$arbeitsordner"
lauf="$(mktemp -d "$arbeitsordner/lauf-XXXXXX")"
mkdir "$lauf/metadata"

python3 - "$lauf/metadata/$appid.yml" "$repo" "$commit" "$unterordner" "$version_name" "$version_code" << 'EOF'
import sys

import yaml

ziel, repo, commit, unterordner, version_name, version_code = sys.argv[1:7]
metadaten = {
    "License": "Apache-2.0",
    "RepoType": "git",
    "Repo": "file://" + repo,
    "Builds": [
        {
            "versionName": version_name,
            "versionCode": int(version_code),
            "commit": commit,
            "subdir": unterordner,
            "gradle": ["yes"],
        }
    ],
    "AutoUpdateMode": "None",
    "UpdateCheckMode": "None",
    "CurrentVersion": version_name,
    "CurrentVersionCode": int(version_code),
}
with open(ziel, "w", encoding="utf-8") as datei:
    yaml.safe_dump(metadaten, datei, allow_unicode=True, sort_keys=False, default_style=None)
EOF

echo "Repository:  $repo"
echo "Stand:       $commit, $(git -C "$repo" ls-tree -r --name-only "$commit" | wc -l) Dateien"
echo "Version:     $version_name ($version_code)"
echo "fdroidserver $(fdroid --version)"
echo "Netzwerk:    $([ "$mit_netz" -eq 1 ] && echo 'zugelassen' || echo 'abgeschaltet')"
echo "Lauf:        $lauf"

cd "$lauf"
rueckgabe=0
if [ "$mit_netz" -eq 1 ]; then
  fdroid scanner --json --verbose "$appid" > scanner.json 2> scanner.log || rueckgabe=$?
else
  unshare -r -n fdroid scanner --json --verbose "$appid" > scanner.json 2> scanner.log || rueckgabe=$?
fi

# Auswertung in einer eigenen Datei, damit sie sich mit nachgestellten
# Protokollen prüfen lässt.
python3 "$hier/scanner-auswerten.py" "$lauf" "$appid" "$version_name" "$version_code" "$rueckgabe"
