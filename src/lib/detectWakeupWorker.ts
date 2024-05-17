import { parentPort } from 'node:worker_threads';

if (parentPort) {
    let lastTime = Date.now();
    let checkInterval = 10 * 1000;

    setInterval(() => {
        if (!parentPort) return;
        let currentTime = Date.now();
        if (currentTime > lastTime + checkInterval * 2) {
            parentPort.postMessage(currentTime - lastTime);
        }
        lastTime = currentTime;
    }, checkInterval);
}
