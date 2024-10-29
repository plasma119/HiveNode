import * as fs from 'fs';

import HiveOS from './os.js';
import DataIO from './network/dataIO.js';
import { sleep } from '../lib/lib.js';
import { getLoader, resolveFileImport, setLoader } from './loader.js';
import { BootConfig } from './bootConfig.js';

export const BOOTLOADERVERSION = 'v1.25';
export const BOOTLOADERVERSIONBUILD = '10-29-2024';

console.log(`[Boot Loader]: Boot Loader version ${BOOTLOADERVERSION} build ${BOOTLOADERVERSIONBUILD}`);

let booted = false;
let bootConfig: BootConfig | null = null;
// TODO: inject boot config via argv
sleep(3000).then(async () => {
    if (!booted && process.send) process.send('requestBootConfig');
    await sleep(3000);
    if (!booted) throw new Error(`Failed to get boot config.`);
});

process.on('message', async (message) => {
    if (booted) return;
    booted = true;
    const { config, argv } = message as { config: BootConfig; argv: string[] };
    bootConfig = config;
    console.log(`[Boot Loader]: Boot config recieved.`);

    // set loader data
    if (getLoader()) {
        console.log(`[Boot Loader]: ERROR: Loader already set!`);
        return;
    }
    setLoader({
        type: 'os',
        argv: argv,
        bootConfig,
    });

    // debug flag
    if (config.debugDataIO) {
        console.log(`[Boot Loader]: DataIO debug flag set`);
        DataIO.debugMode();
    }

    // init HiveOS
    const os = new HiveOS(config.name);
    await os.kernel.onReadyAsync();
    os.log(`[Boot Loader]: Building terminal: Headless[${config.headless}], Debug[${config.debug}]`, 'info');
    os.buildTerminal(config.headless, config.debug);

    // start HiveNet server
    if (config.HiveNetServer) {
        os.log(`[Boot Loader]: Starting HiveNet server...`, 'info');
        //os.kernel.program.stdIO.input('net listen');
        await os.shell.execute('net listen');
    }

    // connect to HiveNet server
    if (config.HiveNetIP) {
        os.log(`[Boot Loader]: Connecting to HiveNet [${config.HiveNetIP}]...`, 'info');
        //os.kernel.program.stdIO.input(`net connect ${config.HiveNetIP}`);
        await os.shell.execute(`net connect ${config.HiveNetIP}`);
    }

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
