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
        this.cursorPosition = 0;
        this.sendingQueue = [];
        this.stdinConnection = stdinConnection;
        this.term = term;
        this.textEncoder = new TextEncoder();
    }
    handleTermData(data) {
        const ord = data.charCodeAt(0);

        if (ord == 0x1b) {
            switch (data.substr(1)) {
                case "[D": { // Left Arrow
                    this.moveCursorLeft();
                    break;
                }
                case "[C": { // Right Arrow
                    this.moveCursorRight();
                    break;
                }
                default: {
                    // ignore
                    break;
                }
            }
            return;
        }

        if (data.length > 1) {
            throw new Error(`FIXME(katei): input data is larger than 1 and not ANSI escape sequence, data = ${data}`);
        }
        switch (data) {
            case "\r": {
                this.term.write("\r\n");
                // always put a newline at last
                this.cursorPosition = this.stdinBuffer.length;
                this._pushChar("\n");

                const sending = this.stdinBuffer;
                this.stdinBuffer = [];
                this.cursorPosition = 0;
                for (const byte of sending) {
                    // FIXME(katei): Don't wait by busy loop
                    while (!this.isReadyToSend()) { }
                    this.sendToWorker(byte)
                }
                break;
            }
            case "\x06": { // CTRL+F
                this.moveCursorRight();
                break;
            }
            case "\x02": { // CTRL+B
                this.moveCursorLeft();
                break;
            }
            case "\x7f": { // CTRL + BACKSPACE
                if (this.stdinBuffer.length > 0) {
                    this.stdinBuffer.pop();
                    this.term.write("\b \b");
                }
                break;
            }
            default: {
                const ord = data.charCodeAt(0);
                const shouldIgnore = ord < 32 || ord === 0x7f;
                if (shouldIgnore) {
                    break;
                }

                const trailing = this.stdinBuffer.slice(this.cursorPosition);
                this._pushChar(data);
                this.term.write(data);

                // If cursor is not at the tail, shift the trailing chars
                // and restore the current cursor
                for (const char of trailing) {
                    this.term.write(char);
                }
                for (let idx = 0; idx < trailing.length; idx++) {
                    this.term.write("\x1b[D");
                }
                break;
            }
        }
    }

    moveCursorLeft() {
        if (this.cursorPosition > 0) {
            this.cursorPosition -= 1;
            this.term.write("\x1b[D")
        }
    }
    moveCursorRight() {
        if (this.cursorPosition < this.stdinBuffer.length) {
            this.cursorPosition += 1;
            this.term.write("\x1b[C")
        }
    }
    _pushChar(char) {
        this.stdinBuffer.splice(this.cursorPosition, 0, char);
        this.cursorPosition += 1;
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

function checkAvailability() {
    if (typeof SharedArrayBuffer == "undefined") {
        alert("Your browser doesn't support SharedArrayBuffer now. Please use the latest Chrome.")
        throw new Error("no SharedArrayBuffer");
    }
}

async function init() {
    checkAvailability()
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
