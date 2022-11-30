import { RubyVM } from "ruby-head-wasm-wasi";

export type Term = {
    write: (line: string) => void,
    set_prompt: (prompt: string) => void,
    startIRB: (vm: RubyVM) => void,
} & Record<string, any>;
