import { RubyVM, consolePrinter } from "@ruby/wasm-wasi"
import { Term } from "./terminals/terminal";
import { Directory, File, OpenFile, PreopenDirectory, WASI, strace } from "@bjorn3/browser_wasi_shim";

export type RubyVersion = {
    version: string,
    url: string,
}

export class IRB {
    private instance: WebAssembly.Instance | null;
    private wasi: WASI;
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

    async init(termWriter: Term, rubyVersion: RubyVersion) {
        this.term = termWriter;
        const buffer = await this.fetchWithProgress(rubyVersion.url, "Downloading irb.wasm", termWriter);

        const args = [
            "irb.wasm", "-e_=0", "-I/gems/lib"
        ];
        termWriter.write("$ #\r\n");
        termWriter.write("$ # \x1B[32;1m irb.wasm - IRB on CRuby on WebAssembly\x1B[m\r\n");
        termWriter.write("$ #\r\n");
        termWriter.write("$ # Source code is available at https://github.com/kateinoigakukun/irb.wasm\r\n");
        termWriter.write("$ cat EXAMPLES.rb \r\n");
        termWriter.write(" \r\n");
        termWriter.write("puts \"Hello, world!\"\r\n");
        termWriter.write(" \r\n");
        termWriter.write(`RubyVM::AbstractSyntaxTree.parse("puts :hello")\r\n`)
        termWriter.write(" \r\n");
        termWriter.write("require \"prism\"\r\n");
        termWriter.write(`Prism.parse("puts :hello")\r\n`);
        termWriter.write(" \r\n");
        const fds = [
            new OpenFile(new File([])),
            new OpenFile(new File([])),
            new OpenFile(new File([])),
            new PreopenDirectory("/home/me", new Map([
                [".gem", new Directory(new Map([
                    ["specs", new Directory(new Map([]))],
                ]))]
            ])),
            new PreopenDirectory("/dev", new Map([
                ["null", new File([])],
            ]))
        ]
        const env = [
            "HOME=/home/me",
            "GEM_PATH=/gems:/home/me/.gem/ruby/3.2.0+2",
            "GEM_SPEC_CACHE=/home/me/.gem/specs",
            "TERM=xterm-256color",
        ]
        const wasi = new WASI(args, env, fds);
        const vm = new RubyVM();
        const printer = consolePrinter({
            stdout: termWriter.write.bind(termWriter),
            stderr: termWriter.write.bind(termWriter),
        });
        const imports = {
            wasi_snapshot_preview1: strace(wasi.wasiImport, []),
        }
        printer.addToImports(imports)
        vm.addToImports(imports)
        const { instance } = await WebAssembly.instantiate(buffer, imports);
        printer.setMemory(instance.exports.memory as any);
        await vm.setInstance(instance);

        wasi.initialize(instance as any);
        (instance.exports._initialize as Function)();
        vm.initialize(args);

        termWriter.write("$ ruby --version\r\n");
        vm.printVersion();
        termWriter.write("$ " + args.join(" ") + "\r\n");

        this.instance = instance;
        this.wasi = wasi
        this.vm = vm;
    }

    start() {
        this.vm.eval(`require "/bundle/setup"`)
        this.term.startIRB(this.vm);
    }

    async sleep_ms(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

}
