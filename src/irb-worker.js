import * as Comlink from "comlink"
import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
import { STDIN_INDEX_INPUT, STDIN_INDEX_STATE, STDIN_STATE_WAITING } from "./sync-stdin"

class Stdin {
    constructor(stdinBuffer) {
        this.stdinBuffer = stdinBuffer;
    }

    readSync() {
        Atomics.store(this.stdinBuffer, STDIN_INDEX_STATE, STDIN_STATE_WAITING);
        Atomics.wait(this.stdinBuffer, STDIN_INDEX_STATE, STDIN_STATE_WAITING);
        const byte = Atomics.load(this.stdinBuffer, STDIN_INDEX_INPUT);
        if (byte == 13) {
            return 10;
        }
        return byte
    }
}

Comlink.expose({
    instance: null,
    async init(termWriter, stdinBuffer) {
        const response = await fetch("./ruby.wasm");
        const buffer = await response.arrayBuffer();

        const stdin = new Stdin(new Int32Array(stdinBuffer));
        const wasmFs = new WasmFs();

        const textDecoder = new TextDecoder("utf-8");
        const originalWriteSync = wasmFs.fs.writeSync;
        wasmFs.fs.writeSync = (fd, buffer, offset, length, position) => {
            switch (fd) {
                case 1:
                case 2: {
                    const text = textDecoder.decode(buffer);
                    termWriter(text)
                    break;
                }
            }
            return originalWriteSync(fd, buffer, offset, length, position);
        };

        const originalReadSync = wasmFs.fs.readSync;
        wasmFs.fs.readSync = (fd, buffer, offset, length, position) => {
            if (fd === 0) {
                buffer[offset] = stdin.readSync();
                buffer[offset + 1] = 0;
                return 1;
            }
            return originalReadSync(fd, buffer, offset, length, position);
        };

        const args = [
            "ruby.wasm",
            "-I/embd-root/gems/lib", "-I/embd-root/lib", "-I/embd-root/lib/wasm32-wasi",
            "/embd-root/gems/libexec/irb", "--prompt", "default"
        ];

        termWriter("$ " + args.join(" ") + "\r\n");
        const wasi = new WASI({
            args,
            env: {},
            bindings: {
                ...WASI.defaultBindings,
                fs: wasmFs.fs,
            }
        });

        const { instance } = await WebAssembly.instantiate(buffer, {
            wasi_snapshot_preview1: wasi.wasiImport,
        });
        this.instance = instance;
        wasi.start(instance);
    },
})
