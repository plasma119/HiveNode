import * as fs from 'fs';
import path from 'path';

type LoggerOptions = {
    logFolder: string;
    toConsole?: boolean;
};

export default class Logger {
    options: LoggerOptions;
    fileTimestamp: string = '';
    logFile?: fs.WriteStream;

    drainWaiting: boolean = false;
    queue: string[] = [];

    constructor(
        options: LoggerOptions = {
            logFolder: './log',
            toConsole: true
        }
    ) {
        this.options = options;
        if (!fs.existsSync(options.logFolder) || !fs.lstatSync(options.logFolder).isDirectory()) {
            fs.mkdirSync(options.logFolder);
        }
        setInterval(() => {
            if (!this.logFile) return;
            const time = new Date().toISOString().slice(0, 10);
            if (time != this.fileTimestamp) {
                this.logFile.destroy();
                this.logFile = undefined;
            }
        }, 60 * 1000);
    }

    log(str: string, mute: boolean = false) {
        if (!mute) console.log(str);
        if (!this.logFile) this.logFile = this._newLogFile();
        if (this.drainWaiting) {
            this.queue.push(str);
            return;
        }
        if (!this.logFile.write(str + '\n')) {
            this.drainWaiting = true;
            this.logFile.once('drain', this._drainCallback.bind(this));
        }
    }

    _newLogFile() {
        const time = new Date().toISOString().slice(0, 10);
        this.fileTimestamp = time;
        const fileName = `${time}.txt`;
        const file = path.join(this.options.logFolder, '/', fileName);
        const stream = fs.createWriteStream(file, { flags: 'a' });
        return stream;
    }

    _drainCallback() {
        this.drainWaiting = false;
        const queue = this.queue;
        this.queue = [];
        queue.forEach((q) => this.log(q, true));
    }
}
