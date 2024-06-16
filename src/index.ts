// @ts-ignore
import { IRB } from "./irb-worker";
import { makeJQueryTerminal } from "./terminals/jquery-terminal"
import { makeXTermTerminal } from "./terminals/xterm";
import { makeXtermPtyTerminal } from "./terminals/xterm-pty";

function makeTerminal() {
    const query = new URLSearchParams(window.location.search);
    const key = query.get("FEATURE_TERMINAL") || (
        query.get("FEATURE_XTERM_RELINE") === "1" ? "xterm" : "jquery-terminal"
    )
    switch (key) {
        case "xterm":
            return makeXTermTerminal();
        case "xterm-pty":
            return makeXtermPtyTerminal();
        case "jquery-terminal":
        default:
            return makeJQueryTerminal();
    }
}

async function init() {
    const irbWorker = new IRB();


    const term = makeTerminal();
    // @ts-ignore
    window.irbWorker = irbWorker
    console.log("irbWorker", irbWorker)
    // @ts-ignore
    window.term = term;
    // @ts-ignore
    window.termEchoRaw = (str: string) => {
        term.write(str);
    }

    await irbWorker.init(term)

    irbWorker.start();
}

init()
