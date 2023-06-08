import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import HiveOS from './os.js';
import { BootConfig } from './bios.js';
import DataIO from '../network/dataIO.js';

export const BOOTLOADERVERSION = 'v1.2';
export const BOOTLOADERVERSIONBUILD = '06-07-2023';

process.on('message', async (message) => {
    console.log(`[Boot Loader]: Boot Loader version ${BOOTLOADERVERSION} build ${BOOTLOADERVERSIONBUILD}`);

    const { config, argv } = message as { config: BootConfig; argv: string[] };

    if (config.debugDataIO) {
        console.log(`[Boot Loader]: DataIO debug flag set`);
        DataIO.debugMode();
    }

    const os = new HiveOS(config.name);
    os.buildTerminal(config.headless, config.debug);

    if (config.HiveNetServer) {
        os.stdIO.output(`[Boot Loader]: Starting HiveNet server...`);
        //os.kernel.program.stdIO.input('net listen');
        await os.shell.execute('net listen');
    }

    if (config.HiveNetIP) {
        os.stdIO.output(`[Boot Loader]: Connecting to HiveNet [${config.HiveNetIP}]...`);
        //os.kernel.program.stdIO.input(`net connect ${config.HiveNetIP}`);
        await os.shell.execute(`net connect ${config.HiveNetIP}`);
    }

    if (config.programFile) {
        os.stdIO.output(`[Boot Loader]: Running main program from [${config.programFile}]...`);
        if (!fs.existsSync(config.programFile)) {
            os.stdIO.output(`[Boot Loader]: ERROR: Cannot find main program file.`);
        } else {
            try {
                let relativePath = path.relative(__dirname, path.resolve(config.programFile)); // need relative path from this file
                let program = await import(relativePath.replace('\\', '/')); // stupid path
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
