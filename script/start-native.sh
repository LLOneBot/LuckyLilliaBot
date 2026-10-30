#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT/bin/llbot"
chmod +x ./node
exec ./node --enable-source-maps ./llbot.js "$@"
