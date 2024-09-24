import { fork } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { sleep } from '../lib/lib.js';
import { parseBIOSConfig, mergeBIOSConfig, BootConfig } from './bootConfig.js';

export const BIOSVERSION = 'v1.21';
export const BIOSVERSIONBUILD = '11-27-2023';

(async () => {
    console.log(`[BIOS]: BIOS version ${BIOSVERSION} build ${BIOSVERSIONBUILD}`);

    // extract config from argv
    let processArgvString = process.argv.slice(2).join(' ');
    console.log(`[BIOS]: Parsing argv [${processArgvString}]`);
    let result = await parseBIOSConfig(processArgvString);

    let { config: configArgv, argv } = result;
    let config = mergeBIOSConfig(configArgv);

    // extract config from file
    // TODO: reload this file on reboot?
    if (config.configFile) {
        console.log(`[BIOS]: Loading config file from [${config.configFile}]...`);
        if (!fs.existsSync(config.configFile)) {
            console.log(`[BIOS]: ERROR: Cannot find config file`);
            throw new Error();
        }
        let configFile: BootConfig = JSON.parse(fs.readFileSync(config.configFile).toString());
        // argv has higher priority than config file
        config = mergeBIOSConfig(configFile, configArgv);
    } else {
        console.log(`[BIOS]: No config file specified.`);
    }

    // hiveNode folder path
    if (!config.HiveNodePath) {
        config.HiveNodePath = path.relative(process.cwd(), path.join(__dirname, '/..')) + '/';
        console.log(`[BIOS]: Auto set HiveNodePath to ${config.HiveNodePath}`);
    } else {
        console.log(`[BIOS]: Set HiveNodePath to ${config.HiveNodePath}`);
    }

    // boot loader
    const masterBootLoader = path.join(config.HiveNodePath, '/', 'os/bootLoader.js');
    if (!config.bootLoaderFile) config.bootLoaderFile = masterBootLoader;
    console.log(`[BIOS]: Using boot loader from [${config.bootLoaderFile}]`);

    if (!fs.existsSync(config.bootLoaderFile)) {
        console.log(`[BIOS]: ERROR: Cannot find boot loader [${config.bootLoaderFile}]`);
        throw new Error();
    }

    // booting up
    let restartFlag = false;
    console.log(`[BIOS]: Booting up...`);
    bootup();

    async function bootup() {
        let booted = false;
        const child = fork(config.bootLoaderFile, [config.configFile, argv], {
            stdio: [0, 1, 2, 'ipc'],
        });

        const bootFunction = () => {
            child.send({ config, argv });
            booted = true;
        };

        child.on('spawn', bootFunction);

        child.on('message', (message) => {
            const data = message.toString();
            switch (data) {
                case 'restart':
                    console.log(`[BIOS]: Recieved restart signal.`);
                    restartFlag = true;
                    break;

                case 'requestBootConfig':
                    bootFunction();
                    break;
            }
        });

        child.on('close', () => {
            console.log(`[BIOS]: System stopped.`);
            if (restartFlag) {
                restartFlag = false;
                process.nextTick(() => {
                    console.log(`[BIOS]: Restarting now...`);
                    bootup();
                });
            }
        });

        await sleep(1000);
        if (!booted) {
            console.log(`[BIOS]: Resending data to boot loader...`);
            bootFunction();
        }
    }
})();
