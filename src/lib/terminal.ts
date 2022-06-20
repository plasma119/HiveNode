import { inspect } from 'util';

import * as ReadLine from 'readline';
import MuteStream from 'mute-stream';

import DataIO from '../network/dataIO.js';
import { DataSignature, DataSignaturesToString } from '../network/hiveNet.js';

export default class Terminal {
    stdIO: DataIO;
    prompt?: TerminalPrompt;

    constructor() {
        this.stdIO = new DataIO(this, 'Terminal');
    }

    connectDevice(target: DataIO | NodeJS.Process) {
        if (target instanceof DataIO) {
            this.stdIO.connect(target);
        } else {
            this.prompt = new TerminalPrompt(target.stdin, target.stdout, '>');
            this.stdIO.passThrough(this.prompt.stdIO);
        }
    }
}

export class TerminalPrompt {
    stdout: NodeJS.WriteStream;
    stdin: NodeJS.ReadStream;
    muteStream: MuteStream = new MuteStream({
        replace: '*',
    });
    stdIO: DataIO;
    debug: boolean = false;

    _promptString: string;
    interface: ReadLine.Interface;
    _completions: string[] = [];

    _passwordMode: boolean = false;
    _clearNextHistory: boolean = false;
    private _passwordIV: string = '';

    constructor(stdin: NodeJS.ReadStream = process.stdin, stdout: NodeJS.WriteStream = process.stdout, promptString: string = '>') {
        this.stdin = stdin;
        this.stdout = stdout;
        this.stdIO = new DataIO(this, 'TerminalPrompt');
        this._promptString = promptString;
        this.muteStream.pipe(this.stdout, { end: false });
        this.muteStream.unmute();
        this.interface = ReadLine.createInterface({
            input: this.stdin,
            output: this.muteStream,
            prompt: this._promptString,
            completer: this._completer.bind(this),
            history: [],
        });
        this.interface.on('history', (history) => {
            if (this._clearNextHistory) history[0] = '';
        });
        this.interface.on('line', (str: string) => {
            this.prompt();
            this.outputHandler(str);
        });
        this.stdIO.on('input', this.inputHandler.bind(this));
        this.prompt();
    }

    prompt() {
        this.stdout.write(this._promptString);
    }

    setPrompt(str: string) {
        this.redraw(() => {
            this._promptString = str;
            this.interface.setPrompt(str);
        });
    }

    _completer(line: string) {
        if (line.charAt(0) != '/') return ['', line];
        const hits = this._completions.filter((c) => c.startsWith(line));
        // Show all completions if none found
        return [hits.length ? hits : this._completions, line];
    }

    setCompleter(arr: string[]) {
        this._completions = arr;
    }

    askPassword(iv: string) {
        this._passwordMode = true;
        this._passwordIV = iv;
        this._clearNextHistory = true;
        this.muteStream.mute();
    }

    outputHandler(str: string) {
        if (this._passwordMode) {
            this.stdout.moveCursor(0, -1);
            ReadLine.clearLine(this.stdout, 0); // clear input
            // todo: hash password with iv
            // maybe add datatype class?
            let data = {
                type: 'password',
                iv: this._passwordIV,
                password: str,
            };
            str = '';
            this._passwordIV = '';
            this._passwordMode = false;
            this.muteStream.unmute();
            this.stdIO.output(data);
        } else {
            this.stdIO.output(str);
        }
    }

    inputHandler(data: any, signatures: DataSignature[]) {
        this.redraw(() => {
            if (this.debug) this.stdout.write(`signatures: ${DataSignaturesToString(signatures)}\n`);
            if (typeof data == 'string') {
                const c = data.charAt(data.length - 1);
                this.stdout.write(`${data}${c != '\n' && c != '\r' ? '\n' : ''}`);
            } else {
                this.stdout.write(inspect(data, false, 2, true));
                const p = this.interface.getCursorPos();
                if (p.cols != 0) this.stdout.write('\n');
            }
        });
    }

    redraw(f: Function) {
        const p = this.interface.getCursorPos();
        const l = this._promptString.length;
        const rows = Math.floor((l + this.interface.line.length) / this.stdout.columns); // end of input rows
        const cols = (l + this.interface.line.length) % this.stdout.columns; // end of input cols
        ReadLine.cursorTo(this.stdout, 0); // back to col 0
        // clear all input and back to input line row 0
        ReadLine.clearLine(this.stdout, 0);
        for (let i = 0; i < p.rows; i++) {
            this.stdout.moveCursor(0, -1);
            ReadLine.clearLine(this.stdout, 0);
        }
        f(); // output function
        this.prompt(); // print prompt
        this.stdout.write(this.interface.line);
        this.stdout.moveCursor(p.cols - cols, p.rows - rows); // return cursor to previous position
    }
}
