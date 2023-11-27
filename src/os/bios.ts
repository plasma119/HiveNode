import { fork } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import HiveCommand from '../lib/hiveCommand.js';
import { Options, sleep } from '../lib/lib.js';

export const BIOSVERSION = 'v1.21';
export const BIOSVERSIONBUILD = '11-27-2023';

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

// TODO: help command
export const BootConfigParserProgram = new HiveCommand('config');
BootConfigParserProgram.addNewCommand('parse', 'parse config from argv')
    .addNewOption('-name <name>', 'OS name')
    .addNewOption('-headless', 'run without user input prompt')
    .addNewOption('-debug', 'set debug flag in OS')
    .addNewOption('-debugDataIO', 'set debug flag in DataIO')
    .addNewOption('-HiveNodePath <path>', 'path to HiveNode module (default auto resolve)')
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
        return {
            config: config,
            argv: args['argv'].split(' '),
        };
    });

export async function parseBIOSConfig(processArgvString: string): Promise<{ config: Options<BootConfig>; argv: string }> {
    const result = await BootConfigParserProgram.execute(`parse ${processArgvString}`);
    if (!result[0]) throw new Error('[parseBIOSConfig]: ERROR: Empty result');
    return result[0];
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
    console.log(`[BIOS]: BIOS version ${BIOSVERSION} build ${BIOSVERSIONBUILD}`);

    // extract config from argv
    let processArgvString = process.argv.slice(2).join(' ');
    console.log(`[BIOS]: Parsing argv [${processArgvString}]`);
    let result = await parseBIOSConfig(processArgvString);

    let { config: configArgv, argv } = result;
    let config = mergeBIOSConfig(configArgv);

    // extract config from file
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
