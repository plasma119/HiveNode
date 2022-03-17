
import { IgnoreSIGINT, Signal } from './signals.js';

export default class ExitHelper {
    exiting: boolean = false;
    cleanUpList: (() => void | Promise<void>)[] = [];

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
        //process.on('uncaughtException', this.exitHandler);
    }

    async _exitHandler(exitCode: NodeJS.Signals) {
        if (this.exiting) process.exit(); // user really want to exit
        this.exiting = true;
        process.stdout.write(exitCode + '\n');
        process.stdout.write(`Exiting...\n`);
        if (this.cleanUpList) {
            process.stdout.write(`Cleaning up...\n`);
            try {
                await Promise.allSettled(this.cleanUpList.map(c => c()).filter(r => r));
            } catch (e) {
                console.log(e);
            }
        }
        if (this.exitCallback) await this.exitCallback(exitCode);
        process.exit();
    }

    addCleanUp(callback: () => void | Promise<void>) {
        this.cleanUpList.push(callback);
    }

    onProgramExit(callback: (exitCode: NodeJS.Signals) => void) {
        this.exitCallback = callback;
    }

    onSIGINT(callback: (exitCode: NodeJS.Signals) => void | Signal) {
        this.SIGINTCallback = callback;
    }
}
