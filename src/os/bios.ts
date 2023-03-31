import { fork } from 'child_process';
import * as fs from 'fs';
import path from 'path';

export type BootConfig = {
    name: string;
    headless: boolean;
    debug: boolean;
    HiveNodePath: string;
    bootLoaderPath: string;
    programPath: string;
};

const configPath = process.argv[2] || 'config.json';
console.log(`[BIOS]: Loading config file from [${configPath}]...`);
const config: BootConfig = JSON.parse(fs.readFileSync(configPath).toString());

if (!config.HiveNodePath) config.HiveNodePath = '.';
const masterBootLoader = path.join(config.HiveNodePath, '/', 'os/bootLoader.js');

if (!config.bootLoaderPath) config.bootLoaderPath = masterBootLoader;
console.log(`[BIOS]: Using boot loader from [${config.bootLoaderPath}]`);

if (!fs.existsSync(config.bootLoaderPath)) {
    console.log(`[BIOS]: ERROR: Cannot find boot loader [${config.bootLoaderPath}]`);
    throw new Error();
}

let restartFlag = false;
console.log(`[BIOS]: Booting up...`);
bootup();

function bootup() {
    const child = fork(config.bootLoaderPath, [configPath, ...process.argv.slice(3)], {
        stdio: [0, 1, 2, 'ipc'],
    });

    child.on('message', (message) => {
        const data = message.toString();
        if (data == 'restart') {
            console.log(`[BIOS]: Recieved restart signal.`);
            restartFlag = true;
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
}
