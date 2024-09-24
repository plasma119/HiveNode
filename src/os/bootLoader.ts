import * as fs from 'fs';

import HiveOS from './os.js';
import DataIO from '../network/dataIO.js';
import { sleep } from '../lib/lib.js';
import { getLoader, resolveFileImport, setLoader } from './loader.js';
import { BootConfig } from './bootConfig.js';

export const BOOTLOADERVERSION = 'v1.24';
export const BOOTLOADERVERSIONBUILD = '11-27-2023';

console.log(`[Boot Loader]: Boot Loader version ${BOOTLOADERVERSION} build ${BOOTLOADERVERSIONBUILD}`);

let booted = false;
let bootConfig: BootConfig | null = null;
// TODO: boot like worker to prevent missing boot message
sleep(3000).then(() => {
    if (!booted && process.send) process.send('requestBootConfig');
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
    console.log(`[Boot Loader]: Building terminal: Headless[${config.headless}], Debug[${config.debug}]`);
    os.buildTerminal(config.headless, config.debug);

    // start HiveNet server
    if (config.HiveNetServer) {
        os.stdIO.output(`[Boot Loader]: Starting HiveNet server...`);
        //os.kernel.program.stdIO.input('net listen');
        await os.shell.execute('net listen');
    }

    // connect to HiveNet server
    if (config.HiveNetIP) {
        os.stdIO.output(`[Boot Loader]: Connecting to HiveNet [${config.HiveNetIP}]...`);
        //os.kernel.program.stdIO.input(`net connect ${config.HiveNetIP}`);
        await os.shell.execute(`net connect ${config.HiveNetIP}`);
    }

    // execute program
    if (config.programFile) {
        os.stdIO.output(`[Boot Loader]: Running main program from [${config.programFile}]...`);
        if (!fs.existsSync(config.programFile)) {
            os.stdIO.output(`[Boot Loader]: ERROR: Cannot find main program file.`);
        } else {
            try {
                let program = await import(resolveFileImport(import.meta.url, config.programFile));
                program.main(os, argv);
            } catch (e) {
                os.stdIO.output(e);
            }
        }
    } else {
        os.stdIO.output(`[Boot Loader]: No main program file specified.`);
    }

    os.stdIO.output(`[Boot Loader]: Finished boot up sequence.`);
});
