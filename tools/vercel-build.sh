#!/bin/bash
set -ex

REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"

cd "$REPO_ROOT"

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
source $HOME/.cargo/env
rustup target add wasm32-unknown-unknown

./tools/build-irb.sh

parcel build index.html
