let lastTime = Date.now();
let checkInterval = 10 * 1000;

setInterval(() => {
    let currentTime = Date.now();
    if (currentTime > lastTime + checkInterval * 2) {
        postMessage(currentTime - lastTime);
    }
    lastTime = currentTime;
}, checkInterval);
