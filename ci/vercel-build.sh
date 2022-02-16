#!/bin/bash
set -ex

REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"

cd "$REPO_ROOT"

export WASI_VFS_VERSION=0.1.0
curl -LO "https://github.com/kateinoigakukun/wasi-vfs/releases/download/v${WASI_VFS_VERSION}/wasi-vfs-cli-x86_64-unknown-linux-gnu.zip"
unzip wasi-vfs-cli-x86_64-unknown-linux-gnu.zip
mv wasi-vfs /usr/local/bin/wasi-vfs

make static/irb.wasm
npx parcel build ./src/index.html
