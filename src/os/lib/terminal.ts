import { inspect } from 'util';

import * as ReadLine from 'readline';
import MuteStream from 'mute-stream';

import Encryption from '../../lib/encryption.js';
import DataIO from '../network/dataIO.js';
import { DataSignature, DataSignaturesToString } from '../network/hiveNet.js';
import HiveComponent from './hiveComponent.js';

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
    _passwordIV: string = '';
    _passwordCallback?: (passwordHash: string) => void;

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
            removeHistoryDuplicates: true,
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
        this.stdIO.on('input', this.inputHandler.bind(this), 'write to terminal');
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

    // https://github.com/nodejs/node/blob/b9153af4ccac49ed8a509ac659f10722cbe82ee3/lib/internal/readline/interface.js#L648
    // !! completer will pause readline until resolved
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
            if (this.debug) {
                this.stdIO.input(`[DEBUG] Terminal->_completer: [${completions.join('|')}]`);
            }
            callback(null, [completions, line]);
        } catch (e) {
            callback(e as Error, [[], line]);
        }
    }

    setCompleter(completer: completer) {
        this.completer = completer;
    }

    // set terminal into password mode
    getPassword(iv: string, callback: (passwordHash: string) => void) {
        this._passwordMode = true;
        this._clearNextHistory = true;
        this._passwordIV = iv;
        this._passwordCallback = callback;
        this._passwordPrompt = this._prompt;
        this.setPrompt(this._prompt + '[Enter Password]:');
        this.muteStream.mute();
    }

    // input from terminal(user)
    outputHandler(str: string) {
        if (this._passwordMode) {
            // hash password with iv
            const hash = Encryption.hash(this._passwordIV).update(str).digest('base64');
            str = '';
            this._passwordMode = false;
            this._passwordIV = '';
            this.muteStream.unmute();
            this.setPrompt(this._passwordPrompt);
            if (this._passwordCallback) this._passwordCallback(hash);
            this._passwordCallback = undefined;
        } else {
            this.stdIO.output(str);
        }
    }

    // write to terminal
    inputHandler(data: any, signatures: DataSignature[]) {
        this.redraw(() => {
            if (this.debug) this.stdout.write(`[DEBUG] signatures: ${DataSignaturesToString(signatures)}\n`);
            if (typeof data == 'string') {
                const c = data.charAt(data.length - 1);
                this.stdout.write(`${data}${c != '\n' && c != '\r' && data != '' ? '\n' : ''}`);
            } else {
                this.stdout.write(inspect(data, false, 4, true));
                const p = this.interface.getCursorPos();
                if (p.cols != 0) this.stdout.write('\n');
            }
        });
    }

    redraw(f?: Function) {
        const p = this.interface.getCursorPos();
        const l = this._prompt.length;
        const rows = Math.floor((l + this.interface.line.length) / this.stdout.columns); // end of input rows
        const cols = (l + this.interface.line.length) % this.stdout.columns; // end of input cols
        ReadLine.cursorTo(this.stdout, 0); // back to col 0
        // clear all input and back to input line row 0
        ReadLine.clearLine(this.stdout, 0);
        for (let i = 0; i < p.rows; i++) {
            this.stdout.moveCursor(0, -1); // will throw error if terminal is not set properly in VScode
            ReadLine.clearLine(this.stdout, 0);
        }
        if (f) f(); // output function
        this.prompt(); // print prompt
        if (!this._passwordMode) this.stdout.write(this.interface.line); // print user input
        this.stdout.moveCursor(p.cols - cols, p.rows - rows); // return cursor to previous position
    }
}
