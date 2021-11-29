import "xterm/css/xterm.css"
import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit";
import * as Comlink from "comlink"
import { StdinProducer } from "./sync-stdin";

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
    private stdinBuffer: string[];
    private stdinProducer: StdinProducer;
    private cursorPosition: number;
    private term: Terminal;

    constructor(stdinProducer: StdinProducer, term: Terminal) {
        this.stdinBuffer = [];
        this.cursorPosition = 0;
        this.stdinProducer = stdinProducer;
        this.term = term;
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
                this.stdinProducer.writeLine(sending);
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
}

function checkAvailability() {
    if (typeof SharedArrayBuffer == "undefined") {
        alert("Your browser doesn't support SharedArrayBuffer now. Please use the latest Chrome.")
        throw new Error("no SharedArrayBuffer");
    }
}

interface IrbWorker {
    init(
        termWriter: (_: string) => void,
        requestStdinByte: () => void,
        stdinBuffer: SharedArrayBuffer
    ): void;
}

async function init() {
    checkAvailability()
    const term = createTerminal();
    const irbWorker: Comlink.Remote<IrbWorker> = Comlink.wrap(
        // @ts-ignore
        new Worker(new URL("irb-worker.ts", import.meta.url), {
            type: "module"
        })
    );

    const stdinConnection = new SharedArrayBuffer(16);
    const stdinProducer = new StdinProducer(new Int32Array(stdinConnection));
    const lineBuffer = new LineBuffer(stdinProducer, term);
    irbWorker.init(
        /* termWriter: */ Comlink.proxy((text) => {
        term.write(text.replaceAll(/\n/g, '\r\n'))
    }),
        /* requestStdinByte: */ Comlink.proxy(() => {
        stdinProducer.onNewRequest();
    }),
        stdinConnection
    )

    term.onData((data) => { lineBuffer.handleTermData(data) })
    // @ts-ignore
    window.term = term;
}

init()
