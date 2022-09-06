import * as Comlink from "comlink"
import jQuery from "jquery"
// @ts-ignore
import initTerminalPlugin from "jquery.terminal";
import initUnixFormatting from "jquery.terminal/js/unix_formatting"
import "jquery.terminal/css/jquery.terminal.css"
import { IRB } from "./irb-worker";

initTerminalPlugin(jQuery)
initUnixFormatting(window, jQuery)

function checkAvailability() {
    if (typeof SharedArrayBuffer == "undefined") {
        alert("Your browser doesn't support SharedArrayBuffer now. Please use the latest Chrome.")
        throw new Error("no SharedArrayBuffer");
    }
}

async function init() {
    checkAvailability()
    const irbWorker = new IRB();

    const term = jQuery("#terminal").terminal((line) => {
        irbWorker.writeLine(line + "\n");
    }, {
        greetings: null,
        prompt: "",
    });
    // @ts-ignore
    window.irbWorker = irbWorker
    console.log("irbWorker", irbWorker)
    // @ts-ignore
    window.term = term;
    // @ts-ignore
    window.termEchoRaw = (str: string) => {
        term.echo(str, {raw: true})
    }

    await irbWorker.init(
        /* termWriter: */(text) => {
            term.echo(text, { newline: false })
        },
    )

    irbWorker.start();
}

init()
