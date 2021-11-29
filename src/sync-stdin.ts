const STDIN_INDEX_STATE = 0;
const STDIN_INDEX_INPUT = 1;
const STDIN_STATE_NORMAL = 0;
const STDIN_STATE_WAITING = 1;

export class StdinConsumer {
    private buffer: Int32Array;
    private requestStdinByte: () => void;

    constructor(buffer: Int32Array, requestStdinByte: () => void) {
        this.buffer = buffer;
        this.requestStdinByte = requestStdinByte;
    }

    readSync() {
        const oldState = Atomics.compareExchange(this.buffer, STDIN_INDEX_STATE, STDIN_STATE_NORMAL, STDIN_STATE_WAITING)
        if (oldState != STDIN_STATE_NORMAL) {
            throw new Error(`unexpected state before readSync: ${oldState}`)
        }
        this.requestStdinByte();
        Atomics.wait(this.buffer, STDIN_INDEX_STATE, STDIN_STATE_WAITING);
        const byte = Atomics.load(this.buffer, STDIN_INDEX_INPUT);
        console.log("term -> irb: ", byte)
        return byte;
    }
}

export class StdinProducer {
    waitingQueue: number[];
    buffer: Int32Array;
    textEncoder: TextEncoder;

    constructor(buffer: Int32Array) {
        this.waitingQueue = [];
        this.buffer = buffer;
        this.textEncoder = new TextEncoder();
    }

    writeLine(line) {
        console.log(`writeLine ${line}`);
        line.forEach((char) => {
            const bytes = this.textEncoder.encode(char);
            bytes.forEach((byte) => {
                this.waitingQueue.push(byte);
            });
        })
        this._sendByteIfPossible()
    }

    onNewRequest() {
        this._sendByteIfPossible()
    }

    _sendByteIfPossible() {
        const byte = this.waitingQueue.shift();
        if (!byte) {
            return;
        }
        const state = Atomics.load(this.buffer, STDIN_INDEX_STATE);
        switch (state) {
            case STDIN_STATE_NORMAL: {
                break;
            }
            case STDIN_STATE_WAITING: {
                Atomics.store(this.buffer, STDIN_INDEX_INPUT, byte);
                Atomics.store(this.buffer, STDIN_INDEX_STATE, STDIN_STATE_NORMAL);
                Atomics.notify(this.buffer, STDIN_INDEX_STATE)
                break;
            }
        }
    }
}
