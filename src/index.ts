import * as Comlink from "comlink"
import { StdinProducer } from "./sync-stdin";
import jQuery from "jquery"
// @ts-ignore
import initTerminalPlugin from "jquery.terminal";
import "jquery.terminal/css/jquery.terminal.css"

initTerminalPlugin(jQuery)

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
    const irbWorker: Comlink.Remote<IrbWorker> = Comlink.wrap(
        // @ts-ignore
        new Worker(new URL("irb-worker.ts", import.meta.url), {
            type: "module"
        })
    );

    const stdinConnection = new SharedArrayBuffer(16);
    const stdinProducer = new StdinProducer(new Int32Array(stdinConnection));

    const term = jQuery("#terminal").terminal((line, term) => {
        stdinProducer.writeLine(Array.from(line + "\n"))
    }, {
        greetings: null,
        prompt: "",
    });

    irbWorker.init(
        /* termWriter: */ Comlink.proxy((text) => {
        term.echo(text, { newline: false })
    }),
        /* requestStdinByte: */ Comlink.proxy(() => {
        stdinProducer.onNewRequest();
    }),
        stdinConnection
    )

    // @ts-ignore
    window.term = term;
}

init()
