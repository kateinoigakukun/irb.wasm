#!/bin/bash
set -ex

REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"

cd "$REPO_ROOT"

yum groupinstall "Development Tools" -y
yum install ruby bison make autoconf git curl libyaml-devel zlib-devel -y

rake static/irb.wasm
npx vite build
