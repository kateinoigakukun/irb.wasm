import * as Comlink from "comlink"
import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
import { StdinConsumer } from "./sync-stdin"

Comlink.expose({
    instance: null,
    async init(termWriter, requestStdinByte, stdinBuffer) {
        const response = await fetch("./irb.wasm");
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
            "irb.wasm", "-I/gems/lib", "/gems/libexec/irb", "--prompt", "default"
        ];

        termWriter("$ # Source code is available at https://github.com/kateinoigakukun/irb.wasm\r\n");
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
