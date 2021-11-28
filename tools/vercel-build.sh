#!/bin/bash
set -ex

REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"

cd "$REPO_ROOT"

amazon-linux-extras install rust1

./tools/build-irb.sh

parcel build index.html
