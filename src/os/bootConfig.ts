import HiveCommand from './lib/hiveCommand.js';

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
    HiveNetPort: number;
    HiveNetSecret: string;
    HiveNetSalt: string;
    HiveNetSalt2: string;
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
    HiveNetPort: 8082,
    HiveNetSecret: 'Secret',
    HiveNetSalt: 'Salt',
    HiveNetSalt2: 'Salt2',
};

export const PARSERVERSION = 'v1.3';
export const PARSERVERSIONBUILD = '3-15-2026';

export const BootConfigParserProgram = new HiveCommand('config');
BootConfigParserProgram.addNewCommand('parse', 'parse config from argv')
    .addNewOption('-version', `Boot config parser version ${PARSERVERSION} build ${PARSERVERSIONBUILD}`)
    .addNewOption('-name <name>', 'OS name')
    .addNewOption('-headless', 'run without user input prompt')
    .addNewOption('-debug', 'set debug flag in OS')
    .addNewOption('-debugDataIO', 'set debug flag in DataIO')
    .addNewOption('-HiveNodePath <path>', 'path to HiveNode module (default auto resolve)')
    .addNewOption('-bootLoaderFile <path>', 'path to custom boot loader file')
    .addNewOption('-programFile <path>', 'path to main program file')
    .addNewOption('-configFile <path>', 'path to config file (override by argv)')
    .addNewOption('-HiveNetServer', 'Auto start HiveNet server')
    .addNewOption('-HiveNetIP <ip>', 'Auto connect to HiveNet')
    .addNewOption('-HiveNetPort <port>', 'HiveNet port')
    .addNewOption('-HiveNetSecret <secret>', '')
    .addNewOption('-HiveNetSalt <salt>', '')
    .addNewOption('-HiveNetSalt2 <salt2>', '')
    .addNewArgument('[argv...]', 'arguments to be passed to main program', '')
    .setAction((args, opts) => {
        const config: Partial<BootConfig> = {
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
            HiveNetPort: Number.parseInt(opts['-HiveNetPort'] as string) || 8082,
            HiveNetSecret: (opts['-HiveNetSecret'] as string) || undefined,
            HiveNetSalt: (opts['-HiveNetSalt'] as string) || undefined,
            HiveNetSalt2: (opts['-HiveNetSalt2'] as string) || undefined,
        };
        return {
            config: config,
            argv: args['argv'].split(' '),
        };
    });

export async function parseBootConfig(processArgvString: string): Promise<{ config: Partial<BootConfig>; argv: string }> {
    const result = await BootConfigParserProgram.execute(`parse ${processArgvString}`);
    if (!result[0]) throw new Error('[parseBIOSConfig]: ERROR: Empty result');
    return result[0];
}

export function mergeBootConfig(...configs: (BootConfig | Partial<BootConfig>)[]) {
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
