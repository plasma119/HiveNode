import fs from 'fs';
import { spawn } from 'child_process';
import { inspect } from 'util';

import { IgnoreSIGINT, Signal } from './signals.js';
import Logger from './logger.js';

// Singleton
class ExitHelper {
    _exitState: number = 0;
    _restarting: boolean = false;
    _silent: boolean = false;

    crashing: boolean = false;
    cleanUpList: ((exitCode: NodeJS.Signals | Error) => void | Promise<void>)[] = [];
    exitCallback?: Function;
    SIGINTCallback?: Function;

    logger?: Logger;
    crashLogger?: Logger;

    constructor() {
        const exitHandler = this._exitHandler.bind(this);

        // catches closing application
        process.on('SIGTERM', exitHandler);
        process.on('SIGHUP', exitHandler);

        // catches ctrl+c event
        process.on('SIGINT', (exitCode) => {
            if (this.SIGINTCallback) {
                if (this.SIGINTCallback(exitCode) === IgnoreSIGINT) return;
            }
            exitHandler(exitCode);
        });

        // catches "kill pid" (for example: nodemon restart)
        process.on('SIGUSR1', exitHandler);
        process.on('SIGUSR2', exitHandler);

        // catches uncaught exceptions
        process.on('uncaughtException', exitHandler);
        process.on('unhandledRejection', exitHandler);
    }

    // synchronous writes to stdout
    async _exitHandler(exitCode: NodeJS.Signals | Error) {
        this._exitState++;
        if (this._exitState >= 3) process.exit(); // failed very hard
        if (this._exitState == 2) {
            // sigint/error during exit handling
            this.crashing = true;
            this.cleanUpList = [];
            this.SIGINTCallback = undefined;
            this.exitCallback = undefined;
        }

        if (exitCode instanceof Error && exitCode.stack) {
            // crashing
            this.crashing = true;
            fs.writeSync(1, exitCode.stack + '\n');
            // must write crash log first, incase normal streamlogger crash on stackoverflow
            if (this.crashLogger) await this.crashLogger.log(exitCode.stack);

            if (this.logger) {
                if (this.crashLogger) await this.logger.log(`Crash logger detected`);
                await this.logger.log(`Writing crash log:`);
                await this.logger.log(exitCode.stack);
            }
        } else {
            // normal exiting
            if (!this._silent) fs.writeSync(1, exitCode.toString() + '\n');
            if (this.logger) await this.logger.log(exitCode.toString() + '\n');
        }

        // cleanup callbacks
        if (this.cleanUpList && this.cleanUpList.length > 0) {
            if (!this._silent) fs.writeSync(1, `Cleaning up...\n`);
            if (this.logger) await this.logger.log(`Cleaning up...\n`);
            for (let i = 0; i < this.cleanUpList.length; i++) {
                try {
                    await this.cleanUpList[i](exitCode);
                } catch (e: any) {
                    const str = e instanceof Error ? e.stack : inspect(e, false, 4, false);
                    fs.writeSync(1, str + '\n');
                    if (this.logger) await this.logger.log(str);
                }
            }
        }

        // exit callback
        if (this.exitCallback) this.exitCallback(exitCode);

        if (this._restarting) {
            if (!this._silent) fs.writeSync(1, `Restarting...\n`);
            if (this.logger) await this.logger.log(`Restarting...\n`);
            if (process.send) {
                // have parent node process with ipc, ask parent to restart this process
                process.send('restart');
            } else {
                // spawn a new one and exit old one, might not work
                process.argv.shift();
                spawn(process.argv0, process.argv, {
                    cwd: process.cwd(),
                    shell: true,
                    detached: true,
                    stdio: 'inherit',
                });
            }
        } else {
            if (!this._silent) fs.writeSync(1, `Exiting...\n`);
            if (this.logger) await this.logger.log(`Exiting...\n`);
        }

        if (this.logger) await this.logger.end();
        if (this.crashLogger) await this.crashLogger.end();

        process.exit(this.crashing ? 1 : 0);
    }

    addCleanUp(callback: (exitCode: NodeJS.Signals | Error) => void | Promise<void>) {
        this.cleanUpList.push(callback);
    }

    onProgramExit(callback: (exitCode: NodeJS.Signals | Error) => void) {
        this.exitCallback = callback;
    }

    onSIGINT(callback: (exitCode: NodeJS.Signals | Error) => void | Signal) {
        this.SIGINTCallback = callback;
    }

    setLogger(logger: Logger) {
        this.logger = logger;
    }

    setCrashLogger(logger: Logger) {
        this.crashLogger = logger;
    }

    exit(silent: boolean = false) {
        this._silent = silent;
        this._exitHandler('SIGTERM');
    }

    restart() {
        this._restarting = true;
        if (this._exitState === 0) this.exit();
    }
}

const exitHelper = new ExitHelper();
export default exitHelper;
