import * as fs from 'fs';
import path from 'path';

import dateFormat from 'dateformat';

import DataIO from '../network/dataIO.js';
import HiveComponent from './component.js';
import { Options } from './lib.js';

type LoggerOptions = {
    name: string;
    logFolder: string;
    logFileName: string;
    logFileTimestamp: 'date' | 'full';
    newFilePerDay: boolean;
    appendLoggerName: boolean;
    toConsole: boolean;
};

export default class Logger extends HiveComponent {
    options: LoggerOptions;
    stdIO: DataIO;

    logFileName: string = '';
    logFilePath: string = '';
    logFileTimestamp: string = '';
    logFileStream?: fs.WriteStream;

    drainWaiting: boolean = false;
    queue: {
        str: string;
        resolve: (value: void | PromiseLike<void>) => void;
    }[] = [];

    constructor(options: Options<LoggerOptions> = {}) {
        super(`Logger[${options.name}]` || 'Logger');
        this.options = Object.assign(
            {
                name: 'Logger',
                logFolder: './log',
                logFileName: '',
                logFileTimestamp: 'date',
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

    log(str: string, mute: boolean = false): Promise<void> {
        return new Promise((resolve) => {
            const log = `[${this.getTimeStamp('full')}] ` + (this.options.appendLoggerName ? `[${this.options.name}]: ${str}` : str);
            if (!mute) {
                // copy to console/stdIO
                if (this.options.toConsole) {
                    console.log(log);
                } else {
                    this.stdIO.output(log);
                }
            }
            if (!this.logFileStream) {
                // get log file stream
                this.logFileStream = this._newLogFile();
                if (fs.existsSync(this.logFilePath)) {
                    this.log(`Reusing log file: ${this.logFileName}`);
                } else {
                    this.log(`Generating log file: ${this.logFileName}`);
                }
            }
            if (this.drainWaiting) {
                this.queue.push({
                    str: str,
                    resolve: resolve,
                });
                return;
            }
            // write log
            if (!this.logFileStream.write(log.endsWith('\n') ? log : log + '\n')) {
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

    generateNewLogFile() {
        this.logFileStream = this._newLogFile();
        this.log(`Generating log file: ${this.logFileName}`);
    }

    _updateLogFile() {
        if (!this.logFileStream) return;
        if (this.getTimeStamp('date') != this.logFileTimestamp) this._closeLogFile();
    }

    _newLogFile() {
        this._closeLogFile();
        this.logFileTimestamp = this.getTimeStamp('date');
        let fileName = '';
        if (this.options.logFileName) fileName += this.options.logFileName + '_';
        fileName += `${this.getTimeStamp(this.options.logFileTimestamp, '_', '_', '_')}.txt`;
        this.logFileName = fileName;
        const filePath = path.join(this.options.logFolder, '/', fileName);
        this.logFilePath = filePath;
        const stream = fs.createWriteStream(filePath, { flags: 'a' });
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
        queue.forEach((data) => this.log(data.str, true).then(() => data.resolve()));
        this.log(`Log file drain completed.`);
    }

    getTimeStamp(format: 'date' | 'time' | 'full', dateSeperator: string = '-', timeSeperator: string = ':', seperator: string = ' ') {
        let date = `yyyy'${dateSeperator}'mm'${dateSeperator}'dd`;
        let time = `HH'${timeSeperator}'MM'${timeSeperator}'ss`;
        switch (format) {
            case 'date':
                return dateFormat(new Date(), date);
            case 'time':
                return dateFormat(new Date(), time);
            case 'full':
            default:
                return dateFormat(new Date(), `${date}${seperator}${time}`);
        }
    }
}
