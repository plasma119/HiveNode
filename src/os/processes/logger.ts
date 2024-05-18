import exitHelper from '../../lib/exitHelper.js';
import HiveCommand from '../../lib/hiveCommand.js';
import Logger, { LoggerStream } from '../../lib/logger.js';
import HiveOS from '../os.js';
import HiveProcess from '../process.js';

/*
https://stackoverflow.com/questions/2031163/when-to-use-the-different-log-levels
Trace - Only when I would be "tracing" the code and trying to find one part of a function specifically.
Debug - Information that is diagnostically helpful to people more than just developers (IT, sysadmins, etc.).
Info - Generally useful information to log (service start/stop, configuration assumptions, etc). Info I want to
    always have available but usually don't care about under normal circumstances. This is my out-of-the-box config level.
Warn - Anything that can potentially cause application oddities, but for which I am automatically recovering. (Such as
    switching from a primary to backup server, retrying an operation, missing secondary data, etc.)
Error - Any error which is fatal to the operation, but not the service or application (can't open a required file,
    missing data, etc.). These errors will force user (administrator, or direct user) intervention. These are usually
    reserved (in my apps) for incorrect connection strings, missing services, etc.
Fatal - Any error that is forcing a shutdown of the service or application to prevent data loss (or further data loss).
    I reserve these only for the most heinous errors and situations where there is guaranteed to have been data corruption
    or loss.
*/
export type logLevelKeyType = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export const logLevelKey: logLevelKeyType[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
export const logLevel: Record<logLevelKeyType, number> = {
    fatal: 1,
    error: 2,
    warn: 3,
    info: 4,
    debug: 5,
    trace: 6,
};

export default class HiveProcessLogger extends HiveProcess {
    logger: Logger;
    crashLogger: Logger;

    logLevel: number = 4;

    constructor(name: string, os: HiveOS, pid: number, ppid: number) {
        super(name, os, pid, ppid);
        this.logger = new LoggerStream({
            name: 'HiveOS',
            logFolder: './log',
            logFileName: '',
            logFileTimestamp: 'date',
            newFilePerDay: false,
            appendLoggerName: true,
            toConsole: false,
        });
        this.crashLogger = new Logger({
            name: 'HiveOS-Crash',
            logFolder: './log',
            logFileName: 'crash',
            logFileTimestamp: 'full',
            newFilePerDay: false,
            appendLoggerName: false,
            toConsole: true,
        });
        exitHelper.setLogger(this.logger);
        exitHelper.setCrashLogger(this.crashLogger);
    }

    initProgram() {
        const program = new HiveCommand('logger', 'system logger for HiveOS');

        program
            .addNewCommand('log', 'log message to system')
            .addNewOption('-level <level>', 'log level')
            .addNewArgument('<message>')
            .setAction((args, opts) => {
                let parsed = this.parseLogLevelStringFromOption(opts['-level']);
                if (!parsed) throw new Error(`Invalid log level [${opts['-level']}]`);
                this.log(args['message'], parsed);
            });

        program
            .addNewCommand('level', 'show current log level setting')
            .addNewOption('-set <set>', 'set to new log level')
            .setAction((_args, opts) => {
                if (opts['-set']) {
                    let parsed = this.parseLogLevelNumberFromOption(typeof opts['-set']);
                    if (!parsed) throw new Error(`Invalid log level [${opts['-level']}]`);
                    this.logLevel = parsed;
                    return;
                }
                return this.logLevel;
            });

        return program;
    }

    log(message: any, level: keyof typeof logLevel) {
        let levelNumber = this.parseLogLevelNumber(level);
        if (!levelNumber) throw new Error(`Invalid log level [${level}]`);
        if (levelNumber == 1) this.crashLogger.log(message); // fatal
        if (levelNumber <= this.logLevel) this.logger.log(message);
    }

    parseLogLevelNumberFromOption(level: string | boolean | number) {
        if (typeof level == 'boolean') level = 'info'; // should not happen, just in case
        if (typeof level == 'string' && level.length == 1) level = Number.parseInt(level);
        return this.parseLogLevelNumber(level);
    }

    parseLogLevelStringFromOption(level: string | boolean | number) {
        let number = this.parseLogLevelNumberFromOption(level);
        if (number == null) return null;
        return logLevelKey[number - 1];
    }

    parseLogLevelNumber(level: string | number) {
        if (typeof level == 'string') {
            level = logLevel[level as logLevelKeyType];
        }
        if (!level) return null;
        if (level < 1 || level > 6) return null;
        return level;
    }

    parseLogLevelString(level: string | number) {
        let number = this.parseLogLevelNumber(level);
        if (number == null) return null;
        return logLevelKey[number - 1];
    }
}
