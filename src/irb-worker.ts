import * as Comlink from "comlink"
import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
import { StdinConsumer } from "./sync-stdin"

Comlink.expose({
    instance: null,
    async init(termWriter, requestStdinByte, stdinBuffer) {
        const response = await fetch("./ruby.wasm");
        const buffer = await response.arrayBuffer();

        console.log(requestStdinByte)
        const stdin = new StdinConsumer(new Int32Array(stdinBuffer), requestStdinByte)
        const wasmFs = new WasmFs();

        const textDecoder = new TextDecoder("utf-8");
        const originalWriteSync = wasmFs.fs.writeSync;
        // @ts-ignore
        wasmFs.fs.writeSync = (fd, buffer, offset, length, position) => {
            switch (fd) {
                case 1:
                case 2: {
                    const text = textDecoder.decode(buffer);
                    console.log("irb -> term: ", text)
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
