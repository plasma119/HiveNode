import fs from 'fs';
import { spawn } from 'child_process';

import { IgnoreSIGINT, Signal } from './signals.js';
import Logger from './logger.js';

class ExitHelper {
    _exitState: number = 0;
    _restarting: boolean = false;
    cleanUpList: ((exitCode: NodeJS.Signals | Error) => void | Promise<void>)[] = [];

    exitCallback?: Function;
    SIGINTCallback?: Function;

    logger?: Logger;
    crashLogger?: Logger;

    constructor() {
        const handler = this._exitHandler.bind(this);
        //do something when app is closing
        //process.on('exit', exitHandler);
        process.on('SIGTERM', handler);
        process.on('SIGHUP', handler);

        //catches ctrl+c event
        process.on('SIGINT', (exitCode) => {
            if (this.SIGINTCallback) {
                if (this.SIGINTCallback(exitCode) === IgnoreSIGINT) return;
            }
            handler(exitCode);
        });

        // catches "kill pid" (for example: nodemon restart)
        process.on('SIGUSR1', handler);
        process.on('SIGUSR2', handler);

        //catches uncaught exceptions
        process.on('uncaughtException', handler);
        process.on('unhandledRejection', handler);
    }

    async _exitHandler(exitCode: NodeJS.Signals | Error) {
        this._exitState++;
        if (this._exitState >= 3) process.exit(); // failed very hard
        if (this._exitState == 2) {
            // sigint/error during exit handling
            this.cleanUpList = [];
            this.SIGINTCallback = undefined;
            this.exitCallback = undefined;
        }

        // !! synchronous writes to stdout
        if (exitCode instanceof Error && exitCode.stack) {
            // crashing
            fs.writeSync(1, exitCode.stack + '\n');
            // must write crash log first, incase normal streamlogger crash on stackoverflow
            if (this.crashLogger) await this.crashLogger.log(exitCode.stack);

            if (this.logger) {
                await this.logger.log(`Exit logger detected`);
                if (this.crashLogger) await this.logger.log(`Crash logger detected`);
            }
            if (this.logger) await this.logger.log(exitCode.stack);
        } else {
            // normal exiting
            fs.writeSync(1, exitCode.toString() + '\n');
            if (this.logger) await this.logger.log(exitCode.toString() + '\n');
        }

        if (this.cleanUpList && this.cleanUpList.length > 0) {
            fs.writeSync(1, `Cleaning up...\n`);
            if (this.logger) await this.logger.log(`Cleaning up...\n`);
            //await Promise.allSettled(this.cleanUpList.map(cleanup => cleanup()).filter(notVoid => notVoid));
            for (let i = 0; i < this.cleanUpList.length; i++) {
                try {
                    await this.cleanUpList[i](exitCode);
                } catch (e: any) {
                    console.log(e);
                    if (this.logger) await this.logger.log(e instanceof Error ? e.stack : e);
                }
            }
        }

        if (this.exitCallback) this.exitCallback(exitCode);

        if (this._restarting) {
            fs.writeSync(1, `Restarting...\n`);
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
            fs.writeSync(1, `Exiting...\n`);
            if (this.logger) await this.logger.log(`Exiting...\n`);
        }

        if (this.logger) await this.logger.end();
        if (this.crashLogger) await this.crashLogger.end();

        process.exit();
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

    exit() {
        this._exitHandler('SIGTERM');
    }

    restart() {
        this._restarting = true;
        if (this._exitState === 0) this.exit();
    }
}

const exitHelper = new ExitHelper();
export default exitHelper;
