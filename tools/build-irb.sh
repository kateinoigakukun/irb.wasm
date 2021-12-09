#!/bin/bash
set -ex
REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"
OUTPUT_RUBY_WASM_PATH="$REPO_ROOT/static/ruby.wasm"

rbwasm --mapdir /gems::$REPO_ROOT/fake-gems --cruby-src github:kateinoigakukun/ruby@9bcc194dc3c12f017a41b6287f85b58f2c487bf8 -o $OUTPUT_RUBY_WASM_PATH
