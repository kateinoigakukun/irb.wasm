#!/bin/bash
set -ex

REPO_ROOT="$(cd "$(dirname $0)"/.. && pwd)"

RUBY_REPO=https://github.com/kateinoigakukun/ruby.git
RUBY_BRANCH=katei/poc-wasm-unknown-wasi-with-rb-wasm-support

WASI_VFS_REPO=git@github.com:kateinoigakukun/wasi-vfs.git

BUILD_SDK="$PWD/build-sdk"
BUILD_DIR="$PWD/build"
RUBY_SRC_DIR="$BUILD_DIR/ruby"
WASI_VFS_SRC_DIR="$BUILD_DIR/wasi-vfs-src"
RUBY_INSTALL_PREFIX="$BUILD_DIR/usr"
WASI_VFS_INSTALL_PREFIX="$BUILD_DIR/was-vfs"

OUTPUT_RUBY_WASM_PATH="$REPO_ROOT/static/ruby.wasm"

function install_wasi_vfs() {
    mkdir -p "$WASI_VFS_INSTALL_PREFIX/lib/wasm32-unknown-unknown"

    pushd "$WASI_VFS_SRC_DIR"
    cargo build --target wasm32-unknown-unknown --features trace-syscall --release
    cp ./target/wasm32-unknown-unknown/release/libwasi_vfs.a "$WASI_VFS_INSTALL_PREFIX/lib/wasm32-unknown-unknown/"
    cargo install --path crates/wasi-vfs-mkfs --root "$WASI_VFS_INSTALL_PREFIX"
    popd
}

function setup_build_sdk() {
    mkdir "$BUILD_SDK"
    pushd "$BUILD_SDK"
    curl -LO https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-14/wasi-sdk-14.0-macos.tar.gz
    tar xfz wasi-sdk-14.0-macos.tar.gz
    mv wasi-sdk-14.0 wasi-sdk
    curl -LO https://github.com/kateinoigakukun/rb-wasm-support/releases/download/0.4.0/rb-wasm-support-wasm32-unknown-wasi.tar.gz
    tar xfz rb-wasm-support-wasm32-unknown-wasi.tar.gz

    mkdir -p dmybin
    ln -fs /usr/bin/true ./dmybin/wasm-opt
    popd
}

function build_ruby() {
    pushd "$RUBY_SRC_DIR"

    ./autogen.sh

    ./configure \
        --host wasm32-unknown-wasi \
        --prefix=$RUBY_INSTALL_PREFIX \
        --with-static-linked-ext \
        --with-coroutine=asyncify \
        --disable-jit-support \
        --with-ext=ripper,monitor \
        CC=$BUILD_SDK/wasi-sdk/bin/clang \
        LD=$BUILD_SDK/wasi-sdk/bin/clang \
        AR=$BUILD_SDK/wasi-sdk/bin/llvm-ar \
        RANLIB=$BUILD_SDK/wasi-sdk/bin/llvm-ranlib \
        LDFLAGS=" \
          --sysroot=$BUILD_SDK/wasi-sdk/share/wasi-sysroot \
          -L$BUILD_SDK/wasi-sdk/share/wasi-sysroot/lib/wasm32-wasi \
          -L$BUILD_SDK/rb-wasm-support-wasm32-unknown-wasi/lib \
          -lwasi-emulated-mman \
          -lwasi-emulated-signal \
          -lwasi-emulated-getpid \
          -lwasi-emulated-process-clocks \
          -lrb_wasm_support \
        " \
        XLDFLAGS="-Xlinker --relocatable" \
        CFLAGS=" \
          --sysroot=$BUILD_SDK/wasi-sdk/share/wasi-sysroot \
          -I$BUILD_SDK/rb-wasm-support-wasm32-unknown-wasi/include \
          -D_WASI_EMULATED_SIGNAL \
          -D_WASI_EMULATED_MMAN \
          -D_WASI_EMULATED_GETPID \
          -D_WASI_EMULATED_PROCESS_CLOCKS \
          -DRB_WASM_SUPPORT_EMULATE_SETJMP \
        "

    # prefer dummy wasm-opt to avoid mis-optimization by wasm-opt -O3
    (PATH="$BUILD_SDK/dmybin:$PATH"; make install -j8)
    popd
}

if [ ! -d "$BUILD_SDK" ]; then
    setup_build_sdk
fi

if [ ! -d "$WASI_VFS_SRC_DIR" ]; then
    git clone --recursive "$WASI_VFS_REPO" "$WASI_VFS_SRC_DIR"
fi
install_wasi_vfs

if [ ! -d "$RUBY_SRC_DIR" ]; then
    git clone --branch "$RUBY_BRANCH" --depth 1 "$RUBY_REPO" "$RUBY_SRC_DIR"
else
    pushd "$RUBY_SRC_DIR"
    git fetch origin "$RUBY_BRANCH"
    popd
fi

build_ruby

CLANG="$BUILD_SDK/wasi-sdk/bin/clang" \
    "$WASI_VFS_INSTALL_PREFIX/bin/wasi-vfs-mkfs" --emit obj \
        --mapdir /gems::$REPO_ROOT/fake-gems \
        --mapdir /lib::$RUBY_INSTALL_PREFIX/lib/ruby/3.1.0 \
        -o "$BUILD_DIR/fs.o"

"$BUILD_SDK/wasi-sdk/bin/wasm-ld" \
    "$RUBY_INSTALL_PREFIX/bin/ruby" \
    "$WASI_VFS_INSTALL_PREFIX/lib/wasm32-unknown-unknown/libwasi_vfs.a" \
    "$BUILD_DIR/fs.o" \
    --stack-first -z stack-size=16777216 \
    -o "$OUTPUT_RUBY_WASM_PATH"

wasm-opt "$OUTPUT_RUBY_WASM_PATH" --asyncify -g -O --pass-arg=asyncify-ignore-imports -o "$OUTPUT_RUBY_WASM_PATH"
