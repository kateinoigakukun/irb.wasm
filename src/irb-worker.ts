import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
import * as path from "path-browserify";
import { RubyVM } from "ruby-head-wasm-wasi"
import stdlib_compat from "url:./ruby/stdlib_compat.rb";
import rubygems_compat from "url:./ruby/rubygems_compat.rb";
import bundler_compat from "url:./ruby/bundler_compat.rb";

class LineBuffer {
    private resolve: ((value: string) => void) | null = null;
    private buffer: string[] = [];

    writeLine(line: string) {
        if (this.resolve) {
            const rslv = this.resolve;
            this.resolve = null;
            rslv(line);
        } else {
            this.buffer.push(line);
        }
    }

    async readLine(): Promise<string> {
        if (this.buffer.length > 0) {
            return this.buffer.shift()!;
        }
        return new Promise((resolve) => {
            this.resolve = resolve;
        });
    }
}

type Term = { echo: (line: string) => void, set_prompt: (prompt: string) => void };

export class IRB {
    private instance: WebAssembly.Instance | null;
    private wasi: any;
    private wasmFs: WasmFs;
    private vm: RubyVM;
    private isTracingSyscall = false;
    private lineBuffer = new LineBuffer();

    async fetchWithProgress(url: string, title: string, termWriter: Term): Promise<Uint8Array> {
        const response = await fetch(url);
        if (!response.ok || response.body === null) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        const reader = response.body.getReader();
        const contentLengthField = response.headers.get("Content-Length");
        if (contentLengthField !== null) {
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
                termWriter.set_prompt(`${title} ${Math.floor(progress * 100)}%`);
                offset += value.length;
            }
            termWriter.set_prompt("");
            return buffer;
        } else {
            const buffer = await response.arrayBuffer();
            return new Uint8Array(buffer);
        }
    }

    async init(termWriter: Term) {
        const buffer = await this.fetchWithProgress("./irb.wasm", "Downloading irb.wasm ", termWriter);

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
                    termWriter.echo(text)
                    break;
                }
            }
            return originalWriteSync(fd, buffer, offset, length, position);
        };

        const args = [
            "irb.wasm", "-e_=0", "-I/gems/lib"
        ];

        termWriter.echo("$ #\r\n");
        termWriter.echo("$ # [[b;teal;black] irb.wasm - IRB on CRuby on WebAssembly ]\r\n");
        termWriter.echo("$ #\r\n");
        termWriter.echo("$ # Source code is available at https://github.com/kateinoigakukun/irb.wasm\r\n");
        termWriter.echo("$ #\r\n");
        termWriter.echo("$ # QUICK START \r\n");
        termWriter.echo("$ #   1. Install gem by `gem \"haml\" \r\n");
        termWriter.echo("$ #   2. `require \"haml\"` \r\n");
        termWriter.echo("$ #   3. `Term.echo Haml::Template.new { \"%h1 Haml code!\" }.render` \r\n");
        termWriter.echo("$ #\r\n");
        termWriter.echo("$ " + args.join(" ") + "\r\n");
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
        this.vm.evalAsync(`
            require "irb"
            require "stringio"
            require "js"

            ap_path = __FILE__
            STDOUT.sync = true
            $0 = File::basename(ap_path, ".rb") if ap_path

            def require_remote(path)
                response = JS.global.fetch(path).await
                text = response.text.await
                Kernel.eval(text.to_s, TOPLEVEL_BINDING, path)
            end

            require_remote "${stdlib_compat}"
            require_remote "${rubygems_compat}"
            require_remote "${bundler_compat}"

            class Term
                def self.echo(text)
                    JS.global.call("termEchoRaw", text)
                end
            end

            def self.gem(name, version = nil)
                install = Gem::Commands::InstallCommand.new
                # To avoid writing to read-only VFS
                install.options[:install_dir] = Gem.user_dir
                install.install_gem(name, version)
            end

            IRB.setup(ap_path)

            irb = IRB::Irb.new(nil, IRB::StdioInputMethod.new)
            irb.run(IRB.conf)
        `)
    }

    writeLine(line: string) {
        this.lineBuffer.writeLine(line);
    }
}
