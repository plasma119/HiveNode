import { fork } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { sleep } from '../lib/lib.js';
import { parseBootConfig, mergeBootConfig, BootConfig } from './bootConfig.js';

export const BIOSVERSION = 'v1.3';
export const BIOSVERSIONBUILD = '3-15-2026';

(async () => {
    console.log(`[BIOS]: BIOS version ${BIOSVERSION} build ${BIOSVERSIONBUILD}`);

    // extract config from argv
    let processArgvString = process.argv.slice(2).join(' ');
    console.log(`[BIOS]: Parsing argv [${processArgvString}]`);
    let { config: configArgv, argv } = await parseBootConfig(processArgvString);
    let config = mergeBootConfig(configArgv);

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
        config = mergeBootConfig(configFile, configArgv);
    } else {
        console.log(`[BIOS]: No config file specified.`);
    }

    // hiveNode dist folder path
    if (config.HiveNodePath) {
        console.log(`[BIOS]: Set HiveNodePath to [${config.HiveNodePath}]`);
    } else {
        config.HiveNodePath = path.relative(process.cwd(), path.join(__dirname, '..')) + '/';
        console.log(`[BIOS]: Auto set HiveNodePath to [${config.HiveNodePath}]`);
    }

    // boot loader
    if (!config.bootLoaderFile) config.bootLoaderFile = path.join(config.HiveNodePath, 'os', 'bootLoader.js');
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
        const child = fork(config.bootLoaderFile, undefined, {
            stdio: [0, 1, 2, 'ipc'],
        });

        const sendBootConfig = () => {
            child.send({ config, argv });
            booted = true;
        };

        child.on('spawn', sendBootConfig);

        child.on('message', (message) => {
            const data = message.toString();
            switch (data) {
                case 'restart':
                    console.log(`[BIOS]: Recieved restart signal.`);
                    restartFlag = true;
                    break;

                case 'requestBootConfig':
                    sendBootConfig();
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
            sendBootConfig();
        }
    }
})();
