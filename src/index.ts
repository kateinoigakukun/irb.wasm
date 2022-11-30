// @ts-ignore
import { IRB } from "./irb-worker";
import { makeJQueryTerminal } from "./terminals/jquery-terminal"
import { makeXTermTerminal } from "./terminals/xterm";

function makeTerminal() {
    const query = new URLSearchParams(window.location.search);
    return query.get("FEATURE_XTERM_RELINE") === "1" ? makeXTermTerminal() : makeJQueryTerminal();
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
