// @ts-ignore
import { IRB } from "./irb-worker";
import { makeJQueryTerminal } from "./terminals/jquery-terminal"
import { makeXTermTerminal } from "./terminals/xterm";
import { makeXtermPtyTerminal } from "./terminals/xterm-pty";
import irb_3_3_wasm from "../node_modules/@ruby/3.3-wasm-wasi/dist/ruby.debug+stdlib.wasm?url";
import irb_3_4_wasm from "../node_modules/@ruby/3.4-wasm-wasi/dist/ruby.debug+stdlib.wasm?url";
import irb_head_wasm from "../node_modules/@ruby/head-wasm-wasi/dist/ruby.debug+stdlib.wasm?url"

function makeTerminal(rubyVersion: string) {
    const query = new URLSearchParams(window.location.search);
    const defaultTerminal = {
        // FIXME: irb (or reline?) in 3.3.3 seems not working well with xterm-pty
        "3.3": "jquery-terminal",
    }[rubyVersion] || "xterm-pty";
    const key = query.get("FEATURE_TERMINAL") || defaultTerminal;
    const terminals = {
        "xterm": makeXTermTerminal,
        "xterm-pty": makeXtermPtyTerminal,
        "jquery-terminal": makeJQueryTerminal,
    }
    if (terminals[key]) {
        return terminals[key]();
    }
    // If invalid terminal key is provided, fallback to default terminal
    return terminals[defaultTerminal]();
}

const rubyVersions = { "3.3": irb_3_3_wasm, "3.4": irb_3_4_wasm, "head": irb_head_wasm };
const defaultRubyVersion = "head";

function deriveCurrentRubyVersion() {
    const query = new URLSearchParams(window.location.search);
    const rubyVersion = query.get("RUBY_VERSION") || defaultRubyVersion;
    if (rubyVersions[rubyVersion]) {
        return { version: rubyVersion, url: rubyVersions[rubyVersion] };
    }
    return { version: defaultRubyVersion, url: rubyVersions[defaultRubyVersion] };
}

async function init() {
    const currentRubyVersion = deriveCurrentRubyVersion();
    const rubyVersionSelect = document.getElementById("ruby-version")! as HTMLSelectElement;
    rubyVersionSelect.appendChild((() => {
        const option = document.createElement("option");
        option.value = "";
        option.text = "Select Ruby version";
        option.disabled = true;
        return option;
    })())
    for (const version of Object.keys(rubyVersions).sort()) {
        const option = document.createElement("option");
        option.value = version;
        option.text = version;
        rubyVersionSelect.appendChild(option);
    }
    rubyVersionSelect.value = currentRubyVersion.version;
    rubyVersionSelect.addEventListener("change", () => {
        const version = rubyVersionSelect.value;
        if (version) {
            const params = new URLSearchParams(window.location.search);
            params.set("RUBY_VERSION", version);
            window.location.search = params.toString();
        }
    });

    if (visualViewport) {
        const vv = visualViewport;
        const updateViewportHeight = () => {
            document.documentElement.style.setProperty("--visual-viewport-height", `${vv.height}px`)
            globalThis.fitAddon?.fit();
        }
        vv.addEventListener("resize", updateViewportHeight);
        updateViewportHeight();
    } else {
        document.documentElement.style.setProperty("--visual-viewport-height", "100vh")
    }
    // Do not allow scrolling
    document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

    const irbWorker = new IRB();

    const term = makeTerminal(currentRubyVersion.version);
    // @ts-ignore
    window.irbWorker = irbWorker
    // @ts-ignore
    window.term = term;
    // @ts-ignore
    window.termEchoRaw = (str: string) => {
        term.write(str);
    }

    await irbWorker.init(term, currentRubyVersion)

    irbWorker.start();

    // Save history and .irbrc every 5 seconds
    setInterval(() => {
        irbWorker.snapshotHomeDir();
    }, 5000);
}

init()
