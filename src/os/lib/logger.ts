import * as fs from 'fs';
import path from 'path';
import { inspect } from 'util';

import DataIO from '../network/dataIO.js';
import HiveComponent from './hiveComponent.js';
import { dateTimeFormat } from '../../lib/unitFormat.js';

type LoggerOptions = {
    name: string;
    logFolder: string;
    logFileName: string;
    logFileTimestamp: 'date' | 'full';
    newFilePerDay: boolean;
    appendLoggerName: boolean;
    toStdIO: boolean;
    toConsole: boolean;
};

export default class Logger extends HiveComponent {
    options: LoggerOptions;
    stdIO: DataIO;

    logFileName: string = '';
    logFilePath: string = '';
    logFileTimestamp: string = '';
    logFileHandle?: number;

    constructor(options: Partial<LoggerOptions> = {}) {
        super(`Logger[${options.name}]` || 'Logger');
        this.options = Object.assign(
            {
                name: 'Logger',
                logFolder: './log',
                logFileName: '',
                logFileTimestamp: 'date',
                newFilePerDay: true,
                appendLoggerName: false,
                toStdIO: true,
                toConsole: true,
            },
            options
        );
        this.stdIO = new DataIO(this, `${this.options.name}-stdIO`);
        this.stdIO.on('input', (data) => this.log(data), 'write to logger');
        if (this.options.newFilePerDay) setInterval(() => this._updateLogFile(), 60 * 1000);
        if (!fs.existsSync(this.options.logFolder) || !fs.lstatSync(this.options.logFolder).isDirectory()) {
            fs.mkdirSync(this.options.logFolder, { recursive: true });
            this.log(`Generated log folder: ${options.logFolder}`);
        }
    }

    log(message: any, mute: boolean = false) {
        if (typeof message != 'string') message = inspect(message, false, 2, false);
        const log = this._stamp(message);
        if (!this.logFileHandle) {
            // get log file
            this._newLogFile();
            let t = '';
            if (fs.existsSync(this.logFilePath)) {
                t = `Reusing log file: ${this.logFileName}`;
            } else {
                t = `Generating log file: ${this.logFileName}`;
            }
            this.logFileHandle = this._newLogFileHandle();
            this.log(t);
        }
        fs.writeSync(this.logFileHandle, log + (log.endsWith('\n') ? '' : '\n'));
        if (!mute) this._echo(log); // finish write first, as _echo might crash during crash logging
        return;
    }

    generateNewLogFile() {
        this._newLogFile();
        this.log(`Generating log file: ${this.logFileName}`);
    }

    _stamp(message: string) {
        return `[${dateTimeFormat('full')}] ` + (this.options.appendLoggerName ? `[${this.options.name}]: ${message}` : message);
    }

    _echo(log: string) {
        // copy to console/stdIO
        if (this.options.toStdIO) this.stdIO.output(log);
        if (this.options.toConsole) console.log(log);
    }

    _newLogFileHandle() {
        const handle = fs.openSync(this.logFilePath, 'a');
        return handle;
    }

    _newLogFile() {
        this._closeLogFile();
        this.logFileTimestamp = dateTimeFormat('date');
        let fileName = '';
        if (this.options.logFileName) fileName += this.options.logFileName + '_';
        fileName += `${dateTimeFormat(this.options.logFileTimestamp, '_', '_', '_')}.txt`;
        this.logFileName = fileName;
        const filePath = path.join(this.options.logFolder, '/', fileName);
        this.logFilePath = filePath;
    }

    _closeLogFile() {
        if (!this.logFileName) return false;
        this.logFileName = '';
        this.logFilePath = '';
        this.logFileTimestamp = '';
        if (this.logFileHandle) fs.closeSync(this.logFileHandle);
        this.logFileHandle = undefined;
        return true;
    }

    _updateLogFile() {
        if (!this.logFileName) return false;
        if (dateTimeFormat('date') != this.logFileTimestamp) return this._closeLogFile();
        return false;
    }

    end(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.logFileHandle) return resolve();
            this._closeLogFile();
            resolve();
        });
    }
}

export class LoggerStream extends Logger {
    logFileStream?: fs.WriteStream;

    drainWaiting: boolean = false;
    queue: {
        message: string;
        resolve: (value: void | PromiseLike<void>) => void;
    }[] = [];

    log(message: any, mute: boolean = false): Promise<void> {
        return new Promise((resolve) => {
            if (typeof message != 'string') message = inspect(message, false, 4, false);
            const log = this._stamp(message);
            if (!mute) this._echo(log);
            if (!this.logFileStream) {
                // get log file stream
                this._newLogFile();
                let t = '';
                if (fs.existsSync(this.logFilePath)) {
                    t = `Reusing log file: ${this.logFileName}`;
                } else {
                    t = `Generating log file: ${this.logFileName}`;
                }
                this.logFileStream = this._newLogFileStream();
                this.log(t);
            }
            if (this.drainWaiting) {
                this.queue.push({
                    message: message,
                    resolve: resolve,
                });
                return;
            }
            // write log
            if (!this.logFileStream.write(log + (log.endsWith('\n') ? '' : '\n'))) {
                // waiting for drain
                this.drainWaiting = true;
                this.logFileStream.once('drain', () => {
                    resolve();
                    this._drainCallback();
                });
                this.log(`[Warning] Waiting for log file drain...`);
            }
            resolve();
        });
    }

    _newLogFileStream() {
        const stream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
        this.logFileStream = stream;
        return stream;
    }

    _closeLogFile() {
        if (!this.logFileStream) return false;
        this.logFileStream.end();
        super._closeLogFile();
        return true;
    }

    _drainCallback() {
        this.drainWaiting = false;
        const queue = this.queue;
        this.queue = [];
        queue.forEach((data) => this.log(data.message, true).then(() => data.resolve()));
        this.log(`Log file drain completed.`);
    }

    end(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.logFileStream) return resolve();
            this.logFileStream.end();
            this.logFileStream.on('finish', resolve);
            this.logFileStream.on('error', reject);
        });
    }
}
