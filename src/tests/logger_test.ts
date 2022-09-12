import { sleep } from '../lib/lib.js';
import Logger from '../lib/logger.js';

(async () => {
    let logger = new Logger({
        name: `Logger ${Math.random().toFixed(2)}`
    });

    while (true) {
        console.log('waiting 5s...');
        await sleep(5000);

        console.log('logging stuff...');
        logger.log('testing');
        for (let i = 0; i < 3; i++) logger.log(Math.random().toFixed(2));
    }
})();
