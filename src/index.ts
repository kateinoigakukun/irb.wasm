import jQuery from "jquery"
// @ts-ignore
import initTerminalPlugin from "jquery.terminal";
import initUnixFormatting from "jquery.terminal/js/unix_formatting"
import "jquery.terminal/css/jquery.terminal.css"
import { IRB } from "./irb-worker";

initTerminalPlugin(jQuery)
initUnixFormatting(window, jQuery)

async function init() {
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
