#!/bin/bash
set -ex

REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"

cd "$REPO_ROOT"

apt-get update
apt-get install ruby bison make autoconf git curl build-essential libyaml-dev zlib1g-dev -y

rake static/irb.wasm
npx parcel build ./src/index.html
