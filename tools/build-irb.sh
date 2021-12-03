#!/bin/bash
set -ex
REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"
OUTPUT_RUBY_WASM_PATH="$REPO_ROOT/static/ruby.wasm"

rbwasm --mapdir /gems::$REPO_ROOT/fake-gems --cruby-src github:kateinoigakukun/ruby@35a2ce1d50189f866eb03341e67a64d448bb9c5c -o $OUTPUT_RUBY_WASM_PATH
