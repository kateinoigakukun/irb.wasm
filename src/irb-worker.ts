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
            throw new Error(`No running task of kind ${kind} found`);
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
        wasmFs.fs.mkdirSync("/home/me", { mode: 0o777, recursive: true });
        const wasi = new WASI({
            args,
            env: {
                "GEM_PATH": "/gems",
                "RUBY_FIBER_MACHINE_STACK_SIZE": String(1024 * 1024 * 20),
            },
            preopens: {
                "/home/me": "/home/me",
            },
            bindings: {
                ...WASI.defaultBindings,
                fs: wasmFs.fs,
                path: path,
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
                    puts "gem install #{request}"
                    response, body_bytes = Fiber.yield(["Gem::Request#perform_request", [request, @uri]])
                    if body_bytes.is_a?(Array)
                        body_str = body_bytes.pack("C*")
                    else
                        body_str = body_bytes.inspect
                    end
                    body_str = Net::BufferedIO.new(StringIO.new(body_str))

                    puts response
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

            Fiber.new {
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
            const uri = args.call("at", this.vm.eval("1")).toString();
            const handle = async () => {
                const response = await fetch(uri, {
                    method: request.call("method").toString(),
                    headers: RbToJs.Hash(this.vm, request.call("each").call("to_h")),
                })
                let body: RbValue;
                if (uri.endsWith(".rz")) {
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
