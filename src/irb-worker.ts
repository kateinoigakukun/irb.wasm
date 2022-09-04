import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
import { RbValue, RubyVM } from "ruby-head-wasm-wasi"

export class IRB {
    private instance: WebAssembly.Instance | null;
    private wasi: any;
    private vm: RubyVM;
    irbFiber: RbValue | null;

    async init(termWriter) {
        const response = await fetch("./irb.wasm");
        const buffer = await response.arrayBuffer();

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

        const args = [
            "irb.wasm", "-e_=0", "-I/gems/lib", "-I/gems/io-console-1.0.0/lib"
        ];

        termWriter("$ # Source code is available at https://github.com/kateinoigakukun/irb.wasm\r\n");
        termWriter("$ " + args.join(" ") + "\r\n");
        const vm = new RubyVM();
        const wasi = new WASI({
            args,
            env: {
                "GEM_PATH": "/gems"
            },
            bindings: {
                ...WASI.defaultBindings,
                fs: wasmFs.fs,
            }
        });
        const imports = {
            wasi_snapshot_preview1: wasi.wasiImport,
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
        this.irbFiber = this.vm.eval(`
            require "irb"
            require "stringio"

            ap_path = __FILE__
            STDOUT.sync = true
            $0 = File::basename(ap_path, ".rb") if ap_path

            class JsNonBlockingIO
                def gets
                    Fiber.yield.inspect
                end

                def external_encoding
                    "US-ASCII"
                end

                def wait_readable(timeout = nil)
                    true
                end

                def getc = "x"
                def ungetc(c) = nil
            end

            class IO
                class << self
                    alias_method :original_open, :open
                    def fake_open(fd, ...)
                        if fd == 0
                            return JsNonBlockingIO.new
                        end
                        original_open(fd, ...)
                    end
                    alias_method :open, :fake_open
                end
            end

            Fiber.new {
                IRB.setup(ap_path)

                irb = IRB::Irb.new(nil, IRB::StdioInputMethod.new)
                irb.run(IRB.conf)
            }
        `)
        this.irbFiber.call("resume")
    }

    writeLine(line: string) {
        try {
            this.irbFiber?.call("resume", this.vm.wrap(line))
        } catch (e) {
            console.log(e)
        }
    }
}
