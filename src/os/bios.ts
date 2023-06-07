import { fork } from 'child_process';
import * as fs from 'fs';
import path from 'path';

import HiveCommand from '../lib/hiveCommand.js';
import { Options } from '../lib/lib.js';

export const BIOSVERSION = 'v1.1';
export const BIOSVERSIONDATE = '06-06-2023';

export type BootConfig = {
    name: string;
    headless: boolean;
    debug: boolean;
    debugDataIO: boolean;
    HiveNodePath: string;
    bootLoaderFile: string;
    programFile: string;
    configFile: string;
    HiveNetServer: boolean;
    HiveNetIP: string;
};

export const DEFAULTCONFIG: BootConfig = {
    name: 'HiveNode',
    headless: false,
    debug: false,
    debugDataIO: false,
    HiveNodePath: '',
    bootLoaderFile: '',
    programFile: '',
    configFile: '',
    HiveNetServer: false,
    HiveNetIP: '',
};

export function parseBIOSConfig(processArgvString: string): Promise<{ config: Options<BootConfig>; argv: string }> {
    return new Promise((resolve) => {
        // TODO: help command
        const program = new HiveCommand('config');
        program
            .addNewCommand('parse', 'parse config from argv')
            .addNewOption('-name <name>', 'OS name')
            .addNewOption('-headless', 'run without user input prompt')
            .addNewOption('-debug', 'set debug flag in OS')
            .addNewOption('-debugDataIO', 'set debug flag in DataIO')
            .addNewOption('-HiveNodePath <path>', 'path to HiveNode module')
            .addNewOption('-bootLoaderFile <path>', 'path to custom boot loader file')
            .addNewOption('-programFile <path>', 'path to main program file')
            .addNewOption('-configFile <path>', 'path to config file (override by arguments)')
            .addNewOption('-HiveNetServer', 'Auto start HiveNet server')
            .addNewOption('-HiveNetIP <ip>', 'Auto connect to HiveNet')
            .addNewArgument('[argv...]', 'arguments pass to main program', '')
            .setAction((args, opts) => {
                let config: Options<BootConfig> = {
                    name: (opts['-name'] as string) || undefined,
                    headless: (opts['-headless'] as boolean) || undefined,
                    debug: (opts['-debug'] as boolean) || undefined,
                    debugDataIO: (opts['-debugDataIO'] as boolean) || undefined,
                    HiveNodePath: (opts['-HiveNodePath'] as string) || undefined,
                    bootLoaderFile: (opts['-bootLoaderFile'] as string) || undefined,
                    programFile: (opts['-programFile'] as string) || undefined,
                    configFile: (opts['-configFile'] as string) || undefined,
                    HiveNetServer: (opts['-HiveNetServer'] as boolean) || undefined,
                    HiveNetIP: (opts['-HiveNetIP'] as string) || undefined,
                };
                resolve({
                    config: config,
                    argv: args['argv'],
                });
            });
        program.stdIO.input(`parse ${processArgvString}`);
    });
}

export function mergeBIOSConfig(...configs: (BootConfig | Options<BootConfig>)[]) {
    let config = Object.assign({}, DEFAULTCONFIG);
    if (configs.length == 0) return config;
    for (let nextConfig of configs) {
        let keys = Object.keys(nextConfig) as (keyof BootConfig)[];
        for (let key of keys) {
            let value = nextConfig[key];
            // @ts-ignore
            if (value !== undefined && value !== '') config[key] = value;
        }
    }
    return config;
}

(async () => {
    console.log(`[BIOS]: BIOS version ${BIOSVERSION} build ${BIOSVERSIONDATE}`);

    let processArgvString = process.argv.slice(2).join(' ');
    console.log(`[BIOS]: Parsing argv [${processArgvString}]`);
    let result = await parseBIOSConfig(processArgvString);
    let { config: configArgv, argv } = result;
    let config = mergeBIOSConfig(configArgv);

    if (config.configFile) {
        console.log(`[BIOS]: Loading config file from [${config.configFile}]...`);
        if (!fs.existsSync(config.configFile)) {
            console.log(`[BIOS]: ERROR: Cannot find config file`);
            throw new Error();
        }
        let configFile: BootConfig = JSON.parse(fs.readFileSync(config.configFile).toString());
        config = mergeBIOSConfig(configFile, configArgv);
    }

    if (!config.HiveNodePath) {
        console.log(`[BIOS]: Warning: HiveNodePath not set!`);
        config.HiveNodePath = '.';
    }
    const masterBootLoader = path.join(config.HiveNodePath, '/', 'os/bootLoader.js');

    if (!config.bootLoaderFile) config.bootLoaderFile = masterBootLoader;
    console.log(`[BIOS]: Using boot loader from [${config.bootLoaderFile}]`);

    if (!fs.existsSync(config.bootLoaderFile)) {
        console.log(`[BIOS]: ERROR: Cannot find boot loader [${config.bootLoaderFile}]`);
        throw new Error();
    }

    let restartFlag = false;
    console.log(`[BIOS]: Booting up...`);
    bootup();

    function bootup() {
        const child = fork(config.bootLoaderFile, [config.configFile, argv], {
            stdio: [0, 1, 2, 'ipc'],
        });

        child.on('spawn', () => {
            child.send({ config, argv });
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
})();
