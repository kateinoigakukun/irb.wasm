import * as Comlink from "comlink"
import { StdinProducer } from "./sync-stdin";
import jQuery from "jquery"
// @ts-ignore
import initTerminalPlugin from "jquery.terminal";
import initUnixFormatting from "jquery.terminal/js/unix_formatting"
import "jquery.terminal/css/jquery.terminal.css"

initTerminalPlugin(jQuery)
initUnixFormatting(window, jQuery)

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
    start(): void;
}

async function init() {
    checkAvailability()
    const irbWorker: Comlink.Remote<IrbWorker> = Comlink.wrap(
        // @ts-ignore
        new Worker(new URL("irb-worker.ts", import.meta.url), {
            type: "module"
        })
    );

    const stdinConnection = new SharedArrayBuffer(16);
    const stdinProducer = new StdinProducer(new Int32Array(stdinConnection));

    const term = jQuery("#terminal").terminal((line) => {
        stdinProducer.writeLine(Array.from(line + "\n"))
    }, {
        greetings: null,
        prompt: "",
    });
    // @ts-ignore
    window.irbWorker = irbWorker
    console.log("irbWorker", irbWorker)
    // @ts-ignore
    window.term = term;

    await irbWorker.init(
        /* termWriter: */ Comlink.proxy((text) => {
        term.echo(text, { newline: false })
    }),
        /* requestStdinByte: */ Comlink.proxy(() => {
        stdinProducer.onNewRequest();
    }),
        stdinConnection
    )

    irbWorker.start();
}

init()
