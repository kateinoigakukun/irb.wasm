import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
import * as path from "path-browserify";
import { RubyVM } from "ruby-head-wasm-wasi"
import irb_wasm from "url:../static/irb.wasm";
import { Term } from "./terminals/terminal";


export class IRB {
    private instance: WebAssembly.Instance | null;
    private wasi: any;
    private wasmFs: WasmFs;
    private vm: RubyVM;
    private isTracingSyscall = false;
    private term: Term;

    async fetchWithProgress(url: string, title: string, termWriter: Term): Promise<Uint8Array> {
        const response = await fetch(url);
        if (!response.ok || response.body === null) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        const contentLengthField = response.headers.get("Content-Length");
        if (contentLengthField !== null) {
            const reader = response.body.getReader();
            const contentLength = parseInt(contentLengthField, 10);
            const buffer = new Uint8Array(contentLength);
            let offset = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                buffer.set(value, offset);
                const progress = offset / contentLength;
                offset += value.length;
            }
            return buffer;
        } else {
            let dots = 0;
            const indicator = setInterval(() => {
                dots = (dots + 1) % 4;
            }, 200);
            const buffer = await response.arrayBuffer();
            clearInterval(indicator);
            return new Uint8Array(buffer);
        }
    }

    async init(termWriter: Term) {
        this.term = termWriter;
        const buffer = await this.fetchWithProgress(irb_wasm, "Downloading irb.wasm", termWriter);

        const wasmFs = new WasmFs();
        this.wasmFs = wasmFs;

        const textDecoder = new TextDecoder("utf-8");
        const originalWriteSync = wasmFs.fs.writeSync;
        // @ts-ignore
        wasmFs.fs.writeSync = (fd, buffer, offset, length, position) => {
            switch (fd) {
                case 1:
                case 2: {
                    const text = textDecoder.decode(buffer);
                    termWriter.write(text)
                    break;
                }
            }
            return originalWriteSync(fd, buffer, offset, length, position);
        };

        const args = [
            "irb.wasm", "-e_=0", "-I/gems/lib"
        ];
        termWriter.write("$ #\r\n");
        termWriter.write("$ # \x1B[32;1m irb.wasm - IRB on CRuby on WebAssembly\x1B[m\r\n");
        termWriter.write("$ #\r\n");
        termWriter.write("$ # Source code is available at https://github.com/kateinoigakukun/irb.wasm\r\n");
        termWriter.write("$ #\r\n");
        termWriter.write("$ # QUICK START \r\n");
        termWriter.write("$ #   1. `require \"bundler/inline\"` \r\n");
        termWriter.write("$ #   2. Install parser gem by \r\n");
        termWriter.write("$ #      `gemfile do \r\n");
        termWriter.write("$ #         source \"https://rubygems.org\" \r\n");
        termWriter.write("$ #         gem \"parser\" \r\n");
        termWriter.write("$ #       end` \r\n");
        termWriter.write("$ #   3. `require \"parser/current\"` \r\n");
        termWriter.write("$ #   4. `Parser::CurrentRuby.parse \"puts 'hello world'\"` \r\n");
        termWriter.write("$ #\r\n");
        termWriter.write("$ " + args.join(" ") + "\r\n");
        const vm = new RubyVM();
        wasmFs.fs.mkdirSync("/home/me", { mode: 0o777, recursive: true });
        wasmFs.fs.mkdirSync("/home/me/.gem/specs", { mode: 0o777, recursive: true });
        wasmFs.fs.writeFileSync("/dev/null", new Uint8Array(0));
        const wasi = new WASI({
            args,
            env: {
                "GEM_PATH": "/gems:/home/me/.gem/ruby/3.2.0+2",
                "GEM_SPEC_CACHE": "/home/me/.gem/specs",
                "RUBY_FIBER_MACHINE_STACK_SIZE": String(1024 * 1024 * 20),
            },
            preopens: {
                "/home": "/home",
                "/dev": "/dev",
            },
            bindings: {
                ...WASI.defaultBindings,
                fs: wasmFs.fs,
                path: path,
            }
        });

        const wrapWASI = (wasiObject) => {
            if (this.isTracingSyscall) {
                for (const key in wasiObject.wasiImport) {
                    const func = wasiObject.wasiImport[key]
                    wasiObject.wasiImport[key] = function () {
                        // console.log(`[tracing] WASI.${key}`);
                        const ret = Reflect.apply(func, undefined, arguments);
                        if (ret !== 0) {
                            console.warn(`[tracing] WASI.${key} returned ${ret}`);
                        }
                        return ret
                    }
                }
            }
            // PATCH: @wasmer-js/wasi@0.x forgets to call `refreshMemory` in `clock_res_get`,
            // which writes its result to memory view. Without the refresh the memory view,
            // it accesses a detached array buffer if the memory is grown by malloc.
            // But they wasmer team discarded the 0.x codebase at all and replaced it with
            // a new implementation written in Rust. The new version 1.x is really unstable
            // and not production-ready as far as katei investigated in Apr 2022.
            // So override the broken implementation of `clock_res_get` here instead of
            // fixing the wasi polyfill.
            // Reference: https://github.com/wasmerio/wasmer-js/blob/55fa8c17c56348c312a8bd23c69054b1aa633891/packages/wasi/src/index.ts#L557
            const original_clock_res_get = wasiObject.wasiImport["clock_res_get"];
            wasiObject.wasiImport["clock_res_get"] = (clockId, resolution) => {
                wasiObject.refreshMemory();
                return original_clock_res_get(clockId, resolution)
            };
            wasiObject.wasiImport["fd_fdstat_set_flags"] = (fd, flags) => {
                return 0;
            };
            return wasiObject.wasiImport;
        }

        const imports = {
            wasi_snapshot_preview1: wrapWASI(wasi),
        }
        vm.addToImports(imports)
        const { instance } = await WebAssembly.instantiate(buffer, imports);
        await vm.setInstance(instance);

        wasi.setMemory(instance.exports.memory as WebAssembly.Memory);
        (instance.exports._initialize as Function)();
        vm.initialize(args);

        this.instance = instance;
        this.wasi = wasi
        this.vm = vm;
    }

    start() {
        this.term.startIRB(this.vm);
    }

    async sleep_ms(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

}
