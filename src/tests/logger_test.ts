import { sleep } from '../lib/lib.js';
import Logger, { LoggerStream } from '../os/lib/logger.js';

(async () => {
    let logger = new Logger({
        logFileName: 'test sync',
        appendLoggerName: true,
        name: `Test`
    });

    let logger2 = new LoggerStream({
        logFileName: 'test stream',
        appendLoggerName: true,
        name: `Test 2`
    });

    while (true) {
        console.log('waiting 5s...');
        await sleep(5000);

        console.log('logging stuff...');
        logger.log('testing');
        logger2.log('testing');
        await logger.log('testing await');
        await logger2.log('testing await');
        for (let i = 0; i < 3; i++) logger.log(Math.random().toFixed(2));
        for (let i = 0; i < 3; i++) logger2.log(Math.random().toFixed(2));
    }
})();
