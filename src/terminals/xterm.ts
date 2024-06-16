// @ts-ignore
import { RubyVM } from "ruby-head-wasm-wasi";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Term } from "./terminal";

import stdlib_compat from "../ruby/stdlib_compat.rb?url";
import rubygems_compat from "../ruby/rubygems_compat.rb?url";
import bundler_compat from "../ruby/bundler_compat.rb?url";
import reline_compat from "../ruby/reline_compat.rb?url";

class KeyBuffer {
    private resolve: ((value: string) => void) | null = null;
    private buffer: string = "";

    async getc(): Promise<string> {
        if (0 < this.buffer.length) {
            const ch = this.buffer.charAt(0);
            this.buffer = this.buffer.substr(1);
            return ch;
        }
        return new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    readable() {
        return (0 < this.buffer.length);
    }

    async block_until_readable(): Promise<any> {
        if (0 < this.buffer.length) {
            return;
        }
        return new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    async timeout(msec) {
        return new Promise((_, reject) => setTimeout(reject, msec))
    }

    async wait_readable(sec: number) {
        return Promise.race([this.block_until_readable(), this.timeout(sec * 1000)])
    }

    ungetc(c: string) {
        this.buffer = c.concat(this.buffer);
    }

    getch() {
        if (0 < this.buffer.length) {
            const ch = this.buffer.charAt(0);
            this.buffer = this.buffer.substr(1);
            return ch;
        } else {
            return null;
        }
    }

    push(key: string) {
        if (this.resolve) {
            const rslv = this.resolve;
            this.resolve = null;
            rslv(key);
        } else {
            const rslv = this.resolve;
            this.buffer = this.buffer.concat(key);
        }
    }

}

export function makeXTermTerminal(): Term {
    const keyBuffer = new KeyBuffer();
    const term = new Terminal({ scrollback: 999999 });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal')!);
    // @ts-ignore
    term._initialized = true;

    term.onKey(e => {
        const code = e.key.charCodeAt(0);
        if ([3, 8, 9, 10, 13, 27].includes(code) || 31 < code) {
            keyBuffer.push(e.key);
        }
    });

    term.onData(data => {
        const code = data.charCodeAt(0);
        if ([3, 8, 9, 10, 13, 27].includes(code) || 31 < code) {
            keyBuffer.push(data);
        }
    })

    term.attachCustomKeyEventHandler((e) => {
        if (e.type === "keydown") {
            if (((e.ctrlKey && !e.metaKey) || (!e.ctrlKey && e.metaKey)) && e.code === "KeyV") {
                // "Ctrl + V" or "Cmd + V" to Paste
                navigator.clipboard.readText().then(text => {
                    keyBuffer.push(""); // I don't know why I need this...
                    [...text].forEach(c => keyBuffer.push(c));
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


    return {
        term, keyBuffer,
        write(line) {
            term.write(line.replace(/\n/g, "\r\n"))
        },
        set_prompt(prompt) { },
        startIRB(vm: RubyVM) {
            vm.evalAsync(`
            require "js"
            ap_path = __FILE__
            STDOUT.sync = true
            $0 = File::basename(ap_path, ".rb") if ap_path

            def require_remote(path)
                response = JS.global.fetch(path).await
                text = response.text.await
                Kernel.eval(text.to_s, TOPLEVEL_BINDING, path)
            end

            # This order works fine
            require_remote "${stdlib_compat}"
            require_remote "${rubygems_compat}"
            require_remote "${bundler_compat}"
            require "irb"
            require "stringio"
            require "js"
            require "reline"
            require_remote "${reline_compat}"

            # This is to avoid stack overflow when Reline tries
            # retrieving documentation at the first time
            require "rdoc/rdoc"

            class Term
                def self.echo(text)
                    JS.global.call("termEchoRaw", text)
                end
            end

            IRB.setup(ap_path)

            ENV["HOME"] = Dir.home # needed in reline/config.rb
            ENV["TERM"] = "screen-256color" # makes IRB::Color.colorable? true
            irb = IRB::Irb.new(nil, IRB::RelineInputMethod.new(IRB::RegexpCompletor.new))
            IRB.conf[:HISTORY_FILE] = File.join Dir.home, ".irb_history"
            irb.run(IRB.conf)
        `)
        }
    }
}
