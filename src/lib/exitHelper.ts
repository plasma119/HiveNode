import { IgnoreSIGINT, Signal } from './signals.js';

class ExitHelper {
    exiting: boolean = false;
    cleanUpList: ((exitCode: NodeJS.Signals) => void | Promise<void>)[] = [];

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

    async _exitHandler(exitCode: NodeJS.Signals) {
        if (this.exiting) process.exit(); // user really want to exit/error during exit handling
        this.exiting = true;
        process.stdout.write(exitCode);
        process.stdout.write(`\nExiting...\n`);
        if (this.cleanUpList) {
            process.stdout.write(`Cleaning up...\n`);
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
        process.exit();
    }

    addCleanUp(callback: (exitCode: NodeJS.Signals) => void | Promise<void>) {
        this.cleanUpList.push(callback);
    }

    onProgramExit(callback: (exitCode: NodeJS.Signals) => void) {
        this.exitCallback = callback;
    }

    onSIGINT(callback: (exitCode: NodeJS.Signals) => void | Signal) {
        this.SIGINTCallback = callback;
    }
}

const exitHelper = new ExitHelper();
export default exitHelper;
