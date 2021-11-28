import "xterm/css/xterm.css"
import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit";
import * as Comlink from "comlink"
import { STDIN_INDEX_INPUT, STDIN_INDEX_STATE, STDIN_STATE_NORMAL, STDIN_STATE_WAITING } from "./sync-stdin";

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

class LineBuffer {
    constructor(stdinConnection, term) {
        this.stdinBuffer = [];
        this.sendingQueue = [];
        this.stdinConnection = stdinConnection;
        this.term = term;
        this.textEncoder = new TextEncoder();
    }
    handleTermData(data) {
        if (data.length > 1) {
            throw new Error(`FIXME(katei): input data is larger than 1, data = ${data}`);
        }
        console.log(data.charCodeAt(0))
        switch (data) {
            case "\r": {
                this.term.write("\r\n");
                console.log(this.stdinBuffer)
                this.stdinBuffer.push("\n");

                const sending = this.stdinBuffer;
                this.stdinBuffer = [];
                for (const byte of sending) {
                    // FIXME(katei): Don't wait by busy loop
                    while (!this.isReadyToSend()) {}
                    this.sendToWorker(byte)
                }
                break;
            }
            case "\x7f": {
                if (this.stdinBuffer.length > 0) {
                    this.stdinBuffer.pop();
                    this.term.write("\b \b");
                }
                console.log(this.stdinBuffer)
                break;
            }
            default: {
                this.stdinBuffer.push(data);
                this.term.write(data);
                break;
            }
        }
    }

    sendToWorker(char) {
        const buf = new Int32Array(this.stdinConnection);
        const bytes = this.textEncoder.encode(char);
        Atomics.store(buf, STDIN_INDEX_INPUT, bytes[0]);
        Atomics.store(buf, STDIN_INDEX_STATE, STDIN_STATE_NORMAL);
        Atomics.notify(buf, STDIN_INDEX_STATE)
    }

    isReadyToSend() {
        const buf = new Int32Array(this.stdinConnection);
        const state = Atomics.load(buf, STDIN_INDEX_STATE)
        return state == STDIN_STATE_WAITING;
    }
}

async function init() {
    const term = createTerminal();
    const irbWorker = Comlink.wrap(
        new Worker(new URL("irb-worker.js", import.meta.url), {
            type: "module"
        })
    );

    const stdinConnection = new SharedArrayBuffer(16);
    const lineBuffer = new LineBuffer(stdinConnection, term);
    irbWorker.init(
        Comlink.proxy((text) => {
            term.write(text.replaceAll(/\n/g, '\r\n'))
        }),
        stdinConnection
    )

    term.onData((data) => { lineBuffer.handleTermData(data) })
    window.term = term;
}

init()
