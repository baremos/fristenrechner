#!/bin/bash
# Lokaler Build mit fdroidserver 2.4.2. Jeder Lauf bleibt als Nachweis liegen.
# --probelauf lädt nichts und legt keinen Lauf an. Siehe docs/fdroid-build.md.
set -eu
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C.UTF-8
export PYTHONDONTWRITEBYTECODE=1
hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$hier/build-lokal.py" "$@"
