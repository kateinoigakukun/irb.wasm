import { Term } from "./terminal";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openpty } from "xterm-pty";

import main_rb from "../ruby/xterm_pty_main.rb?url";


const setupTerminal = () => {
    const div = document.getElementById("terminal")!;

    const xterm = new Terminal();
    xterm.open(div);

    const { master, slave } = openpty();
    xterm.loadAddon(master);

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    new ResizeObserver(() => fitAddon.fit()).observe(div);
    fitAddon.fit();

    xterm.loadAddon(new WebLinksAddon());

    return slave;
}


export function makeXtermPtyTerminal(): Term {
    const slave = setupTerminal();

    const waitTimeout = (timeout) => new Promise((resolve) => {
        setTimeout(() => resolve(false), timeout * 1000)
    });
    const waitReadable = () => new Promise<boolean>((resolve) => {
        const handle = slave.onReadable(() => {
            handle.dispose();
            resolve(true);
        });
    });
    return {
        write(line) {
            slave.write(line);
        },
        set_prompt(prompt) {
            slave.write(`\r\x1B[K\r${prompt}\r`);
        },
        async startIRB(vm) {
            vm.eval("-> js_funcs { JSFuncs = js_funcs }").call("call", vm.wrap({
                winsize: () => slave.ioctl("TIOCGWINSZ"),
                setRaw: (min, intr) => {
                    const oldTermios = slave.ioctl("TCGETS");
                    const newTermios = JSON.parse(JSON.stringify(oldTermios));
                    newTermios.lflag &= ~0x807b; // ECHO|ECHOE|ECHOK|ECHONL|ICANON|ISIG|IEXTEN
                    newTermios.iflag &= ~0x2de0; // ISTRIP|INLCR|IGNCR|ICRNL|IXON|IXOFF|IXANY|IMAXBEL
                    newTermios.oflag &= ~0x0001; // OPOST
                    newTermios.cc[6] = min; // VMIN
                    if (intr) {
                        newTermios.lflag |= 0x0001; // ISIG
                        newTermios.oflag |= 0x0001; // OPOST
                    }
                    slave.ioctl("TCSETS", newTermios);
                    return oldTermios;
                },
                setCooked: () => {
                    const oldTermios = slave.ioctl("TCGETS");
                    const newTermios = JSON.parse(JSON.stringify(oldTermios));
                    newTermios.iflag |= 0x0520; // ISTRIP|ICRNL|IXON
                    newTermios.oflag |= 0x0001; // OPOST
                    newTermios.lflag |= 0x807b; // ECHO|ECHOE|ECHOK|ECHONL|ICANON|ISIG|IEXTEN
                    slave.ioctl("TCSETS", newTermios);
                    return oldTermios;
                },
                setTermios: (termios) => {
                    slave.ioctl("TCSETS", termios);
                },
                waitReadable: async (timeout) => {
                    if (slave.readable) return true;
                    if (timeout == 0) return false;
                    return await Promise.race([waitTimeout(timeout), waitReadable()]);
                },
                getByte: async () => {
                    if (slave.readable) return slave.read(1)[0];

                    const termios = slave.ioctl("TCGETS");
                    const min = termios.cc[6]; // VMIN
                    if (!min) return null;

                    await waitReadable();

                    if (slave.readable) return slave.read(1)[0];
                    return null;
                },
                readNonblock: async (size) => {
                    if (slave.readable) {
                            return (new TextDecoder).decode(new Uint8Array(slave.read(size)));
                    }
                    return null;
                },
                sleep: async (duration) => {
                    await waitTimeout(duration);
                },
            }));

            slave.onSignal((signal) => vm.eval(`Process.kill(:${signal}, $$)`));

            const code = await fetch(main_rb);
            vm.evalAsync(await code.text());
        },
    }
}
