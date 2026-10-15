#!/usr/bin/env bash
# extension/ 폴더를 사이트에서 받을 수 있는 zip 으로 묶는다: public/reference-box-extension.zip
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f public/reference-box-extension.zip
(cd extension && zip -qr -X ../public/reference-box-extension.zip . -x ".*" -x "__MACOSX/*")
ls -la public/reference-box-extension.zip
