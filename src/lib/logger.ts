import * as fs from 'fs';
import path from 'path';

import DataIO from '../network/dataIO.js';
import HiveComponent from './component.js';
import { Options } from './lib.js';

type LoggerOptions = {
    name: string;
    logFolder: string;
    timestampPolicy: 'day' | 'full';
    newFilePerDay: boolean;
    appendLoggerName: boolean;
    toConsole: boolean;
};

export default class Logger extends HiveComponent {
    options: LoggerOptions;
    stdIO: DataIO;

    fileTimestamp: string = '';
    logFileName: string = '';
    logFilePath: string = '';
    logFileStream?: fs.WriteStream;

    drainWaiting: boolean = false;
    queue: string[] = [];

    constructor(options: Options<LoggerOptions> = {}) {
        super(options.name || 'Logger');
        this.options = Object.assign(
            {
                name: 'Logger',
                logFolder: './log',
                timestampPolicy: 'day',
                newFilePerDay: true,
                appendLoggerName: false,
                toConsole: true,
            },
            options
        );
        this.stdIO = new DataIO(this, `${this.options.name}-stdIO`);
        this.stdIO.on('input', (data) => this.log(data));
        if (this.options.newFilePerDay) setInterval(() => this._updateLogFile(), 60 * 1000);
        if (!fs.existsSync(this.options.logFolder) || !fs.lstatSync(this.options.logFolder).isDirectory()) {
            fs.mkdirSync(this.options.logFolder, { recursive: true });
            this.log(`Generated log folder: ${options.logFolder}`);
        }
    }

    log(str: string, mute: boolean = false) {
        const log = this.options.appendLoggerName? `${this.name}: ${str}`: str;
        if (!mute) {
            if (this.options.toConsole) console.log(log);
            this.stdIO.output(log);
        }
        if (!this.logFileStream) {
            this.logFileStream = this._newLogFile();
            if (fs.existsSync(this.logFilePath)) {
                this.log(`Reusing log file: ${this.fileTimestamp}.txt`);
            } else {
                this.log(`Generating log file: ${this.fileTimestamp}.txt`);
            }
        }
        if (this.drainWaiting) {
            this.queue.push(str);
            return;
        }
        if (!this.logFileStream.write(log + '\n')) {
            this.drainWaiting = true;
            this.logFileStream.once('drain', this._drainCallback.bind(this));
            this.log(`[Warning] Waiting for log file drain...`);
        }
    }

    generateNewLogFile() {
        this.logFileStream = this._newLogFile();
        this.log(`Generating log file: ${this.fileTimestamp}.txt`);
    }

    _updateLogFile() {
        if (!this.logFileStream) return;
        if (this._getTimeStamp() != this.fileTimestamp) this._closeLogFile();
    }

    _newLogFile() {
        this._closeLogFile();
        this.fileTimestamp = this._getTimeStamp();
        const fileName = `${this.fileTimestamp}.txt`;
        this.logFileName = fileName;
        const file = path.join(this.options.logFolder, '/', fileName);
        this.logFilePath = file;
        const stream = fs.createWriteStream(file, { flags: 'a' });
        return stream;
    }

    _closeLogFile() {
        if (!this.logFileStream) return;
        this.logFileStream.destroy();
        this.logFileStream = undefined;
        this.logFileName = '';
        this.logFilePath = '';
    }

    _drainCallback() {
        this.drainWaiting = false;
        const queue = this.queue;
        this.queue = [];
        queue.forEach((q) => this.log(q, true));
        this.log(`Log file drain completed.`);
    }

    _getTimeStamp() {
        const time = new Date().toISOString();
        return this.options.timestampPolicy === 'day' ? time.slice(0, 10) : time;
    }
}
