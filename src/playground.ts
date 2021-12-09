import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
import ace from "ace-builds"
import "bootstrap/dist/css/bootstrap.min.css";
import "ace-builds/css/theme/github.css";
import "ace-builds/src-noconflict/mode-ruby";
import "ace-builds/src-noconflict/snippets/ruby";
import "ace-builds/src-noconflict/ext-language_tools";

import jQuery from "jquery"
// @ts-ignore
import initTerminalPlugin from "jquery.terminal";
import initUnixFormatting from "jquery.terminal/js/unix_formatting"
import "jquery.terminal/css/jquery.terminal.css"

initTerminalPlugin(jQuery)
initUnixFormatting(window, jQuery)

class RubyCache {
    cache: WebAssembly.Module | null;
    fetchStarted: boolean;
    onFetched: Promise<WebAssembly.Module>;
    onFetchedResolve: (module: WebAssembly.Module) => void;
    onFetchedReject: (error: Error) => void;

    constructor() {
        this.cache = null;
        this.fetchStarted = false;
        this.onFetched = new Promise((resolve, reject) => {
            this.onFetchedResolve = resolve;
            this.onFetchedReject = reject;
        });
    }
    async get(): Promise<WebAssembly.Module> {
        // fetch the wasm file if it's not in the cache, and return it.
        // if it's in the cache, return it.
        if (this.cache) {
            return this.cache;
        } else if (this.fetchStarted) {
            return this.onFetched;
        } else {
            this.fetchStarted = true;
            try {
                // @ts-ignore
                const result = await fetch("/ruby.wasm");
                const binary = await result.arrayBuffer();
                const module = await WebAssembly.compile(binary);
                this.cache = module;
                this.onFetchedResolve(module);
                return module;
            } catch (e) {
                this.onFetchedReject(e);
                throw e;
            }
        }
    }
}

const cache = new RubyCache();

const runRubyCode = async (code: string, writeResult: (text: string) => void) => {
    const wasmFs = new WasmFs();
    const originalWriteSync = wasmFs.fs.writeSync;
    // @ts-ignore
    wasmFs.fs.writeSync = (fd, buffer, offset, length, position) => {
        const text = new TextDecoder("utf-8").decode(buffer);
        switch (fd) {
            case 1:
                writeResult(text);
                break;
            case 2:
                writeResult(text);
                break;
        }
        return originalWriteSync(fd, buffer, offset, length, position);
    };
    const wasi = new WASI({
        args: ["ruby", "-e", code],
        bindings: {
            ...WASI.defaultBindings,
            fs: wasmFs.fs,
        }
    });
    const module = await cache.get();
    const instance = await WebAssembly.instantiate(module, {
        wasi_snapshot_preview1: wasi.wasiImport
    });
    wasi.start(instance);
};

const TEMPLATE_CODE = `
def fib(n)
  if n < 2
    return n
  else
    return fib(n-1) + fib(n-2)
  end
end
puts "fib(10) = #{fib(10)}"
`

type ViewState = {
    isExecuting: boolean,
}

async function init() {
    const editor = ace.edit("editor");
    editor.setOptions({
        enableBasicAutocompletion: true,
        enableSnippets: true,
        enableLiveAutocompletion: true,
        fontSize: "12pt",
    });
    editor.getSession().setMode("ace/mode/ruby");
    editor.setValue(TEMPLATE_CODE);
    editor.clearSelection();

    const term = jQuery("#output").terminal((line) => {
        console.log("->", line);
    }, {
        greetings: null,
        prompt: "",
    });

    const viewState: ViewState = {
        isExecuting: false,
    };

    const runButton = document.getElementById("run-button") as HTMLButtonElement;

    const updateView = () => {
        console.log("updateView", viewState);
        runButton.disabled = viewState.isExecuting;
        const buttonContent = document.getElementById("run-button-content");
        buttonContent.innerText = viewState.isExecuting ? "Executing..." : "Run";
    }

    const handleRunEvent = () => {
        if (viewState.isExecuting) {
            return;
        }
        viewState.isExecuting = true;
        updateView();
        term.clear();
        setTimeout(() => {
            runRubyCode(editor.getValue(), (output) => {
                console.log("<-", output);
                term.echo(output);
            })
            viewState.isExecuting = false;
            updateView();
        }, 10)
    };
    editor.commands.addCommand({
        name: "run",
        bindKey: {
            win: "Ctrl-Enter",
            mac: "Command-Enter",
        },
        exec: () => {
            handleRunEvent();
        }
    })

    runButton.addEventListener("click", () => {
        handleRunEvent();
    });

    // @ts-ignore
    window.term = term;
}

init()
