#!/bin/bash
set -ex

REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"

cd "$REPO_ROOT"

curl -LO https://github.com/tmate-io/tmate/releases/download/2.2.1/tmate-2.2.1-static-linux-amd64.tar.gz
tar -xvzf tmate-2.2.1-static-linux-amd64.tar.gz
chmod +x ./tmate-2.2.1-static-linux-amd64/tmate

./tmate-2.2.1-static-linux-amd64/tmate -S /tmp/tmate.sock new-session -d
./tmate-2.2.1-static-linux-amd64/tmate -S /tmp/tmate.sock wait tmate-ready
./tmate-2.2.1-static-linux-amd64/tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}'

# amazon-linux-extras install rust1
# 
# ./tools/build-irb.sh
# 
# parcel build index.html
