// @ts-ignore
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { IRB } from "./irb-worker";


async function init() {
    const irbWorker = new IRB();

    const term = new Terminal({ scrollback: 999999 });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));
    term._initialized = true;

    // @ts-ignore
    window.irbWorker = irbWorker
    console.log("irbWorker", irbWorker)
    // @ts-ignore
    window.term = term;
    // @ts-ignore
    window.termEchoRaw = (str: string) => {
        term.write(str);
    }

    await irbWorker.init({
        ...term,
        write: (line) => term.write(line.replace(/\n/g, "\r\n"))
    })

    term.onKey(e => {
        code = e.key.charCodeAt(0);
        if ([3, 8, 9, 10, 13, 27].includes(code) || 31 < code ) {
            irbWorker.write(e.key);
        }
    })

    term.onData(data => {
        code = data.charCodeAt(0);
        if ([3, 8, 9, 10, 13, 27].includes(code) || 31 < code ) {
            irbWorker.write(data);
        }
    })

    term.attachCustomKeyEventHandler((e) => {
        if (e.type === "keydown") {
            if (((e.ctrlKey && !e.metaKey) || (!e.ctrlKey && e.metaKey)) && e.code === "KeyV") {
                // "Ctrl + V" or "Cmd + V" to Paste
                navigator.clipboard.readText().then(text => {
                    irbWorker.write(""); // I don't know why I need this...
                    [...text].forEach(c => irbWorker.write(c));
                })
            } else if (((e.ctrlKey && !e.metaKey && e.shiftKey) || (!e.ctrlKey && e.metaKey)) && e.code === "KeyC") {
                // "Ctrl + Shift + C" or "Cmd + C" to Copy (Ctrl + C is to send SIGINT)
                const copyStatus = document.execCommand('copy');
                console.log('Copy succeeded?:', copyStatus);
            }
        }
        return true;
    });

    addEventListener("resize", (event) => {
        fitAddon.fit();
    });
    fitAddon.fit();

    // FIXME: Scrolling by mouse doesn't work
    addEventListener("wheel", (event) => {
        //event.preventDefault();
        event.stopPropagation();
        if (0 < event.deltaY) {
            //console.log("scroll down");
            term.scrollLines(1);
        } else {
            //console.log("scroll up");
            term.scrollLines(-1);
        }
    });

    irbWorker.start();
}

init()
