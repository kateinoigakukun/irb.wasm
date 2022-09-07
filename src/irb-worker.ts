import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
import * as path from "path-browserify";
import { RbValue, RubyVM } from "ruby-head-wasm-wasi"

type IOTask = {
    kind: string;
    state: "running" | "done";
    value1: any | null;
    value2: RbValue | null;
}

class ResumptionQueue {
    private tasks: IOTask[] = [];

    constructor(readonly fiber: RbValue, readonly vm: RubyVM) { }

    schedule(kind: string) {
        this.tasks.push({ kind, state: "running", value1: null, value2: null });
    }

    finish(kind: string, value1: any, value2: RbValue | null = null) {
        let oldestTask: IOTask | null = null;
        for (let i = 0; i < this.tasks.length; i++) {
            const task = this.tasks[i];
            if (task.state === "running" && task.kind === kind) {
                oldestTask = task;
                break;
            }
        }
        if (!oldestTask) {
            console.warn(`No running task of kind ${kind} found`);
            return;
        }
        oldestTask.state = "done";
        oldestTask.value1 = value1;
        oldestTask.value2 = value2;
        return this.resumeIfPossible(this.fiber, this.vm);
    }

    private resumeIfPossible(fiber: RbValue, vm: RubyVM): RbValue | null {
        let oldestTask = this.tasks.shift();
        if (oldestTask && oldestTask.state === "done") {
            if (oldestTask.value2) {
                return fiber.call("resume", vm.wrap(oldestTask.value1), oldestTask.value2);
            } else {
                return fiber.call("resume", vm.wrap(oldestTask.value1));
            }
        }
        return null;
    }
}

export class IRB {
    private instance: WebAssembly.Instance | null;
    private wasi: any;
    private vm: RubyVM;
    private irbFiber: RbValue | null;
    private queue: ResumptionQueue | null;

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
                    termWriter(text)
                    break;
                }
            }
            return originalWriteSync(fd, buffer, offset, length, position);
        };

        const args = [
            "irb.wasm", "-e_=0", "-I/gems/lib"
        ];

        termWriter("$ #\r\n");
        termWriter("$ # [[b;teal;black] irb.wasm - IRB on CRuby on WebAssembly ]\r\n");
        termWriter("$ #\r\n");
        termWriter("$ # Source code is available at https://github.com/kateinoigakukun/irb.wasm\r\n");
        termWriter("$ #\r\n");
        termWriter("$ # QUICK START \r\n");
        termWriter("$ #   1. Install gem by `gem \"haml\"` \r\n");
        termWriter("$ #   2. `require \"haml\"` \r\n");
        termWriter("$ #   3. `Term.echo Haml::Engine.new(\"%h1 Haml code!\").render` \r\n");
        termWriter("$ #\r\n");
        termWriter("$ " + args.join(" ") + "\r\n");
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
        this.irbFiber = this.vm.eval(`
            require "irb"
            require "stringio"
            require "js"

            ap_path = __FILE__
            STDOUT.sync = true
            $0 = File::basename(ap_path, ".rb") if ap_path

            def Dir.home = "/home/me"
            def Gem.user_home = Dir.home

            class Socket
                class << self
                    def method_missing(sym, *) = nil
                end
            end
            class SocketError; end

            require "rubygems/commands/install_command"
            class Gem::Request
                def perform_request(request)
                    response, body_bytes = Fiber.yield(["Gem::Request#perform_request", [request, @uri]])
                    if body_bytes.is_a?(Array)
                        body_str = body_bytes.pack("C*")
                    else
                        body_str = body_bytes.inspect
                    end
                    body_str = Net::BufferedIO.new(StringIO.new(body_str))

                    status = response["status"].inspect
                    response_class = Net::HTTPResponse::CODE_TO_OBJ[status]
                    response = response_class.new("2.0", status.to_i, nil)

                    response.reading_body(body_str, true) {}

                    response
                end
            end

            class NonBlockingIO
                def gets
                    Fiber.yield(["NonBlockingIO#gets"]).inspect
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
                            return NonBlockingIO.new
                        end
                        original_open(fd, ...)
                    end
                    alias_method :open, :fake_open
                end
            end

            class Thread
                def self.new(&block)
                    f = Fiber.new(&block)
                    def f.value = resume
                    f
                end
            end

            def File.chmod(mode, *paths) = nil
            class File
                def chmod(mode) = nil
            end

            Gem.configuration.concurrent_downloads = 1

            class Term
                def self.echo(text)
                    JS.global.call("termEchoRaw", text)
                end
            end

            Fiber.new {
                def self.gem(name, version = nil)
                    install = Gem::Commands::InstallCommand.new
                    # To avoid writing to read-only VFS
                    install.options[:install_dir] = Gem.user_dir
                    install.install_gem(name, version)
                end

                IRB.setup(ap_path)

                irb = IRB::Irb.new(nil, IRB::StdioInputMethod.new)
                irb.run(IRB.conf)
            }
        `)
        this.queue = new ResumptionQueue(this.irbFiber, this.vm);
        const reply = this.irbFiber.call("resume")
        this.handleIOTask(reply)
    }

    handleIOTask(task: RbValue) {
        const kind = task.call("at", this.vm.eval("0")).toJS();
        this.queue?.schedule(kind);
        if (kind === "Gem::Request#perform_request") {
            const args = task.call("at", this.vm.eval("1"));
            const request = args.call("at", this.vm.eval("0"));
            const uri = new URL(args.call("at", this.vm.eval("1")).toString());
            const handle = async () => {
                console.log(uri.hostname)
                if (uri.hostname === "index.rubygems.org") {
                    uri.hostname = "irb-wasm-proxy.edgecompute.app"
                }
                const response = await fetch(uri, {
                    method: request.call("method").toString(),
                    headers: RbToJs.Hash(this.vm, request.call("each").call("to_h")),
                })
                let body: RbValue;
                // FIXME: handle encoding things on Ruby side
                if (uri.toString().endsWith(".rz") || uri.toString().endsWith(".gem")) {
                    const bodyBuffer = await response.arrayBuffer();
                    body = JsToRb.Array(this.vm, new Uint8Array(bodyBuffer));
                } else {
                    body = this.vm.wrap(await response.text());
                }
                const newTask = this.queue?.finish("Gem::Request#perform_request", response, body);
                if (newTask) {
                    this.handleIOTask(newTask);
                }
            }
            handle();
        } else if (kind === "NonBlockingIO#gets") {
        } else {
            throw new Error("unknown IO task: " + kind);
        }
    }

    writeLine(line: string) {
        const newTask = this.queue?.finish("NonBlockingIO#gets", line);
        if (newTask) {
            this.handleIOTask(newTask);
        }
    }
}

const RbToJs = {
    Array: (vm: RubyVM, value: RbValue) => {
        const length = value.call("length").toJS();
        const items: RbValue[] = [];
        for (let i = 0; i < length; i++) {
            const element = value.call("at", vm.eval(String(i)));
            items.push(element);
        }
        return items;
    },
    Hash: (vm: RubyVM, value: RbValue) => {
        const keys = RbToJs.Array(vm, value.call("keys"));
        const dict = {};
        for (const key of keys) {
            const keyString = key.toString();
            dict[keyString] = value.call("[]", key);
        }
        return dict;
    }
}

const JsToRb = {
    Array: (vm: RubyVM, value: Uint8Array): RbValue => {
        const array = vm.eval("Array.new");
        for (const item of value) {
            array.call("push", vm.eval(String(item)));
        }
        return array;
    },
}
