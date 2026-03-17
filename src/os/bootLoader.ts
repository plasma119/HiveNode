import * as fs from 'fs';

import HiveOS from './os.js';
import DataIO from './network/dataIO.js';
import { sleep } from '../lib/lib.js';
import { hasLoader, resolveFileImport, setLoader } from './loader.js';
import { BootConfig } from './bootConfig.js';

export const BOOTLOADERVERSION = 'v1.4';
export const BOOTLOADERVERSIONBUILD = '3-17-2026';

console.log(`[Boot Loader]: Boot Loader version ${BOOTLOADERVERSION} build ${BOOTLOADERVERSIONBUILD}`);

let booted = false;

sleep(3000).then(async () => {
    if (!booted && process.send) process.send('requestBootConfig');
    await sleep(3000);
    if (!booted) throw new Error(`Failed to get boot config.`);
});

process.on('message', async (message) => {
    if (booted) return;
    booted = true;
    const { config, argv } = message as { config: BootConfig; argv: string[] };
    console.log(`[Boot Loader]: Boot config recieved.`);

    // set loader data
    if (hasLoader()) {
        console.log(`[Boot Loader]: ERROR: Loader already set!`);
        return;
    }
    setLoader({
        type: 'os',
        argv: argv,
        bootConfig: config,
    });

    // debug flag
    if (config.debugDataIO) {
        console.log(`[Boot Loader]: DataIO debug flag set`);
        DataIO.debugMode();
    }

    // init HiveOS
    const os = new HiveOS(config.name);
    await os.kernel.onReadyAsync();

    // execute program
    if (config.programFile) {
        os.log(`[Boot Loader]: Running main program from [${config.programFile}]...`, 'info');
        if (!fs.existsSync(config.programFile)) {
            os.log(`[Boot Loader]: ERROR: Cannot find main program file.`, 'error');
        } else {
            try {
                let program = await import(resolveFileImport(import.meta.url, config.programFile));
                program.main(os, argv);
            } catch (e) {
                os.log(e, 'error');
            }
        }
    } else {
        os.log(`[Boot Loader]: No main program file specified.`, 'info');
    }

    os.log(`[Boot Loader]: Finished boot up sequence.`, 'info');
});
