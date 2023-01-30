import fs from 'fs';
import { spawn } from 'child_process';

import { IgnoreSIGINT, Signal } from './signals.js';

class ExitHelper {
    _exiting: number = 0;
    _restarting: boolean = false;
    cleanUpList: ((exitCode: NodeJS.Signals | Error) => void | Promise<void>)[] = [];

    exitCallback?: Function;
    SIGINTCallback?: Function;

    constructor() {
        //do something when app is closing
        //process.on('exit', exitHandler);
        process.on('SIGTERM', this._exitHandler);
        process.on('SIGHUP', this._exitHandler);

        //catches ctrl+c event
        process.on('SIGINT', (exitCode) => {
            if (this.SIGINTCallback) {
                let r = this.SIGINTCallback(exitCode);
                if (r === IgnoreSIGINT) return;
            }
            this._exitHandler(exitCode);
        });

        // catches "kill pid" (for example: nodemon restart)
        process.on('SIGUSR1', this._exitHandler);
        process.on('SIGUSR2', this._exitHandler);

        //catches uncaught exceptions
        process.on('uncaughtException', this._exitHandler);
        process.on('unhandledRejection', this._exitHandler);
    }

    async _exitHandler(exitCode: NodeJS.Signals | Error) {
        this._exiting++;
        if (this._exiting >= 3) process.exit(); // failed very hard
        if (this._exiting == 2) {
            // sigint/error during exit handling
            this.cleanUpList = [];
            this.SIGINTCallback = undefined;
            this.exitCallback = undefined;
        }

        // synchronous writes to stdout
        if (exitCode instanceof Error && exitCode.stack) {
            fs.writeSync(1, exitCode.stack + '\n');
        } else {
            fs.writeSync(1, exitCode.toString() + '\n');
        }

        if (this.cleanUpList) {
            fs.writeSync(1, `Cleaning up...\n`);
            //await Promise.allSettled(this.cleanUpList.map(cleanup => cleanup()).filter(notVoid => notVoid));
            for (let i = 0; i < this.cleanUpList.length; i++) {
                try {
                    await this.cleanUpList[i](exitCode);
                } catch (e) {
                    console.log(e);
                }
            }
        }

        if (this.exitCallback) this.exitCallback(exitCode);

        if (this._restarting) {
            fs.writeSync(1, `Restarting...\n`);
            process.argv.shift();
            spawn(process.argv0, process.argv, {
                cwd: process.cwd(),
                shell: true,
                detached: true,
                stdio: 'inherit',
            });
        } else {
            fs.writeSync(1, `Exiting...\n`);
        }

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

    exit() {
        this._exitHandler('SIGTERM');
    }

    restart() {
        this._restarting = true;
        this.exit();
    }
}

const exitHelper = new ExitHelper();
export default exitHelper;
