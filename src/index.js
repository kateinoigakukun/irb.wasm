import "xterm/css/xterm.css"
import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit";
import * as Comlink from "comlink"
import { STDIN_INDEX_INPUT, STDIN_INDEX_STATE, STDIN_STATE_NORMAL } from "./sync-stdin";

function createTerminal() {
    const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'SauceCodePro MonoWindows, courier-new, monospace',
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(document.getElementById("terminal"));
    window.addEventListener("resize", () => {
        fitAddon.fit();
    });
    fitAddon.fit();

    term.focus()
    return term;
}

async function init() {
    const term = createTerminal();
    const irbWorker = Comlink.wrap(
        new Worker(new URL("irb-worker.js", import.meta.url), {
            type: "module"
        })
    );

    const stdinBuffer = new SharedArrayBuffer(16);
    irbWorker.init(Comlink.proxy((text) => {
        term.write(text.replaceAll(/\n/g, '\r\n'))
    }), stdinBuffer)

    term.onKey(event => {
        const ev = event.domEvent
        const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;

        if (ev.key == "Enter") {
            term.write("\r\n");
        } else if (printable) {
            term.write(ev.key);
        }
    });

    const textEncoder = new TextEncoder();
    term.onData((data) => {
        const buf = new Int32Array(stdinBuffer);
        const bytes = textEncoder.encode(data);
        if (bytes.length > 1) {
            throw new Error(`FIXME(katei): input data is larger than 1 byte, bytes = ${bytes}`);
        }
        Atomics.store(buf, STDIN_INDEX_INPUT, bytes[0]);
        Atomics.store(buf, STDIN_INDEX_STATE, STDIN_STATE_NORMAL);
        Atomics.notify(buf, STDIN_INDEX_STATE)
    })
    window.term = term;
}

init()
