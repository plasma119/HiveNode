import exitHelper from '../../lib/exitHelper.js';
import HiveCommand from '../../lib/hiveCommand.js';
import Logger, { LoggerStream } from '../../lib/logger.js';
import HiveOS from '../os.js';
import HiveProcess from '../process.js';

export default class HiveProcessLogger extends HiveProcess {
    logger: Logger;
    crashLogger: Logger;

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
            .addNewArgument('<message>')
            .setAction((args) => {
                this.log(args['message']);
            });

        return program;
    }

    log(message: any) {
        this.logger.log(message);
    }
}
