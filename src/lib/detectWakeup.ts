import { Worker } from 'node:worker_threads';

import BasicEventEmitter from './basicEventEmitter.js';
import { resolveFilePath } from '../os/loader.js';

type DetectWakeupEvents = {
    wakeup: (timePassed: number) => void;
};

class DetectWakeup extends BasicEventEmitter<DetectWakeupEvents> {
    init() {
        // cannot get loader during import stage
        // also that stupid './'
        let worker = new Worker('./' + resolveFilePath('lib/detectWakeupWorker.js'));
        worker.on('message', (message) => {
            this.emit('wakeup', message as number);
        });
    }
}

export const detectWakeup = new DetectWakeup();
