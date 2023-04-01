import { inspect } from 'util';

import * as ReadLine from 'readline';
import MuteStream from 'mute-stream';

import DataIO from '../network/dataIO.js';
import { DataSignature, DataSignaturesToString } from '../network/hiveNet.js';
import HiveComponent from './component.js';
import { Encryption } from './lib.js';

export type completer = (line: string) => PromiseLike<string[]> | string[];

export default class Terminal extends HiveComponent {
    stdout: NodeJS.WriteStream;
    stdin: NodeJS.ReadStream;
    muteStream: MuteStream = new MuteStream({
        replace: '',
    });
    stdIO: DataIO;
    debug: boolean = false;

    _prompt: string;
    interface: ReadLine.Interface;
    completer?: completer;

    _passwordMode: boolean = false;
    _clearNextHistory: boolean = false;
    _passwordPrompt: string = '';
    _passwordSalt: string = '';
    _passwordCallback?: (passwordHash: string, pepper: string) => void;

    constructor(stdin: NodeJS.ReadStream = process.stdin, stdout: NodeJS.WriteStream = process.stdout, prompt: string | string[] = '>') {
        super('Terminal');
        this.stdin = stdin;
        this.stdout = stdout;
        this.stdIO = new DataIO(this, 'stdIO');
        this._prompt = typeof prompt == 'string' ? prompt : prompt.join('');
        this.muteStream.pipe(this.stdout, { end: false });
        this.muteStream.unmute();
        this.interface = ReadLine.createInterface({
            input: this.stdin,
            output: this.muteStream,
            prompt: this._prompt,
            completer: this._completer.bind(this),
            history: [],
        });
        this.interface.on('history', (history) => {
            if (this._clearNextHistory) {
                history[0] = '';
                this._clearNextHistory = false;
            }
        });
        this.interface.on('line', (str: string) => {
            if (!this._passwordMode) this.prompt();
            this.outputHandler(str);
        });
        this.interface.on('SIGINT', () => process.emit('SIGINT'));
        this.stdIO.on('input', this.inputHandler.bind(this));
        this.prompt();
    }

    prompt() {
        this.stdout.write(this._prompt);
    }

    setPrompt(prompt: string | string[]) {
        this.redraw(() => {
            this._prompt = typeof prompt == 'string' ? prompt : prompt.join('');
            this.interface.setPrompt(this._prompt);
        });
    }

    async _completer(line: string, callback: (err?: null | Error, result?: [string[], string]) => void) {
        try {
            let finished = false;
            setTimeout(() => {
                if (!finished) {
                    this.stdIO.input('[ERROR] Terminal: Completion timeout');
                    callback(null, [[], line]);
                }
            }, 3000);
            let completions = this.completer ? await this.completer(line) : [];
            finished = true;
            if (!Array.isArray(completions)) {
                completions = [];
                this.stdIO.input('[ERROR] Terminal: Completion error');
            }
            callback(null, [completions, line]);
        } catch (e) {
            callback(e as Error, [[], line]);
        }
    }

    setCompleter(completer: completer) {
        this.completer = completer;
    }

    getPassword(salt: string, callback: (passwordHash: string, iv: string) => void) {
        this._passwordMode = true;
        this._clearNextHistory = true;
        this._passwordSalt = salt;
        this._passwordCallback = callback;
        this._passwordPrompt = this._prompt;
        this.setPrompt(this._prompt + '[Enter Password]:');
        this.muteStream.mute();
    }

    outputHandler(str: string) {
        if (this._passwordMode) {
            //this.stdout.moveCursor(0, -1);
            //ReadLine.clearLine(this.stdout, 0); // clear input
            // hash password with iv
            const pepper = Encryption.randomData(16).toString('base64');
            const hash = Encryption.hash(str).update(this._passwordSalt).update(pepper).digest('base64');
            if (this._passwordCallback) this._passwordCallback(hash, pepper);
            str = '';
            this._passwordMode = false;
            this._passwordCallback = undefined;
            this._passwordSalt = '';
            this.muteStream.unmute();
            //this.stdIO.output(data);
            this.setPrompt(this._passwordPrompt);
        } else {
            this.stdIO.output(str);
        }
    }

    inputHandler(data: any, signatures: DataSignature[]) {
        this.redraw(() => {
            if (this.debug) this.stdout.write(`signatures: ${DataSignaturesToString(signatures)}\n`);
            if (typeof data == 'string') {
                const c = data.charAt(data.length - 1);
                this.stdout.write(`${data}${c != '\n' && c != '\r' && data != '' ? '\n' : ''}`);
            } else {
                this.stdout.write(inspect(data, false, 2, true));
                const p = this.interface.getCursorPos();
                if (p.cols != 0) this.stdout.write('\n');
            }
        });
    }

    redraw(f: Function) {
        const p = this.interface.getCursorPos();
        const l = this._prompt.length;
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
