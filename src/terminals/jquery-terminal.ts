import jQuery from "jquery"
// @ts-ignore
import initTerminalPlugin from "jquery.terminal";
import initUnixFormatting from "jquery.terminal/js/unix_formatting"
import "jquery.terminal/css/jquery.terminal.css"
import { Term } from "./terminal";

import stdlib_compat from "../ruby/stdlib_compat.rb?url";
import rubygems_compat from "../ruby/rubygems_compat.rb?url";
import bundler_compat from "../ruby/bundler_compat.rb?url";

initTerminalPlugin(jQuery)
initUnixFormatting(window, jQuery)

class LineBuffer {
    private resolve: ((value: string) => void) | null = null;
    private buffer: string[] = [];

    writeLine(line: string) {
        if (this.resolve) {
            const rslv = this.resolve;
            this.resolve = null;
            rslv(line);
        } else {
            this.buffer.push(line);
        }
    }

    async readLine(): Promise<string> {
        if (this.buffer.length > 0) {
            return this.buffer.shift()!;
        }
        return new Promise((resolve) => {
            this.resolve = resolve;
        });
    }
}

export function makeJQueryTerminal(): Term {
    const lineBuffer = new LineBuffer();
    const term = jQuery("#terminal").terminal((line) => {
        lineBuffer.writeLine(line + "\n");
    }, {
        greetings: null,
        prompt: "",
    });
    return {
        term, lineBuffer,
        write(line: string) {
            term.echo(line, { newline: false, exec: false });
        },
        set_prompt(prompt) {
            term.set_prompt(prompt);
        },
        startIRB(vm) {
            vm.evalAsync(`
            require "stringio"
            require "/bundle/setup"
            require "js"
            def require_remote(path)
                response = JS.global.fetch(path).await
                text = response.text.await
                Kernel.eval(text.to_s, TOPLEVEL_BINDING, path)
            end
            require_remote "${stdlib_compat}"

            class NonBlockingIO
              def gets
                JS.global[:irbWorker][:term][:lineBuffer].readLine.await.to_s
              end

              def external_encoding
                "UTF-8"
              end

              def wait_readable(timeout = nil)
                true
              end

              def getc = "x"
              def ungetc(c) = nil
            end

            require_remote "${rubygems_compat}"
            require_remote "${bundler_compat}"
            class Term
                def self.echo(text)
                    JS.global.call("termEchoRaw", text)
                end
            end

            require "irb"
            ap_path = __FILE__
            STDOUT.sync = true
            $0 = File::basename(ap_path, ".rb") if ap_path
            IRB.setup(ap_path)
            irb = IRB::Irb.new(nil, IRB::StdioInputMethod.new)
            irb.run(IRB.conf)
        `)
        }
    }
}
