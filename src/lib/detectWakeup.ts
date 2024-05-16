import BasicEventEmitter from './basicEventEmitter';

type DetectWakeupEvents = {
    wakeup: (timePassed: number) => void;
};

class DetectWakeup extends BasicEventEmitter<DetectWakeupEvents> {
    constructor() {
        super();
        let worker = new Worker('DetectWakeupWorker.js');
        worker.addEventListener('message', (message) => {
            this.emit('wakeup', message.data as number);
        });
    }
}

export const detectWakeup = new DetectWakeup();
