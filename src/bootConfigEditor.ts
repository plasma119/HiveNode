import * as fs from 'fs';

import HiveCommand, { HiveSubCommand } from './os/lib/hiveCommand.js';
import Terminal from './os/lib/terminal.js';
import { BootConfig, BootConfigParserProgram, DEFAULTCONFIG, mergeBIOSConfig } from './os/bootConfig.js';

let terminal = new Terminal();

let program = new HiveCommand('bootConfigEditor');
program.stdIO.connect(terminal.stdIO);

let currentConfig: Partial<BootConfig> = DEFAULTCONFIG;
let currentFile = '';

program.addNewCommand('ls', 'display config files').setAction(() => {
    let files = getConfigFiles();
    let str = `Found ${files.length} config files.`;
    for (let file of files) {
        str += `\n${file}`;
    }
    return str;
});

program.addNewCommand('config', 'display current config setting').setAction((_args, _opts, info) => {
    if (currentFile) info.reply(`Current config file: ${currentFile}`);
    return currentConfig;
});

let parserProgram = BootConfigParserProgram.commands.get('parse') as HiveSubCommand;
let parserProgramAction = parserProgram.callback;
program.addCommand(parserProgram);
parserProgram.setAction((args, opts, info) => {
    if (!parserProgramAction) return 'ERROR';
    let { config } = parserProgramAction(args, opts, info);
    currentConfig = mergeBIOSConfig(currentConfig, config);
    return currentConfig;
});

program
    .addNewCommand('load', 'load config from file')
    .addNewArgument('<file>')
    .setAction((args, _opts, info) => {
        let file = args['file'];
        if (!fs.existsSync(file)) return 'File does not exist!';
        currentFile = file;
        info.reply(`Loading config file: ${currentFile}`);
        let json = JSON.parse(fs.readFileSync(file).toString());
        currentConfig = mergeBIOSConfig(json);
        return currentConfig;
    });

program
    .addNewCommand('save', 'save config to file')
    .addNewArgument('[file]')
    .setAction((args, _opts, info) => {
        let file = args['file'];
        if (!file) file = currentFile;
        if (!file) return 'Please specify file to save to';
        info.reply(`Saving to config file: ${file}`);
        fs.writeFileSync(file, JSON.stringify(currentConfig, undefined, 2));
        return 'Done!';
    });

program.addNewCommand('clear', 'clear current config').setAction(() => {
    currentConfig = DEFAULTCONFIG;
    currentFile = '';
    return currentConfig;
});

let excludeList: string[] = ['package.json', 'package-lock.json', 'tsconfig.json'];
function getConfigFiles() {
    let configFiles = [];
    let files = fs.readdirSync(process.cwd(), { withFileTypes: true });
    for (let file of files) {
        try {
            if (!file.isFile()) continue;
            if (!file.name.endsWith('.json')) continue;
            if (excludeList.includes(file.name)) continue;
            if (fs.statSync(file.name).size > 10 * 1024) continue; // big file, should not be config file
            let json = JSON.parse(fs.readFileSync(file.name).toString());
            let checkPass = false;
            for (let prop in DEFAULTCONFIG) {
                // @ts-ignore
                if (json[prop] && typeof json[prop] == typeof DEFAULTCONFIG[prop]) {
                    checkPass = true;
                    break;
                }
            }
            if (checkPass) configFiles.push(file.name);
        } catch (e) {}
    }
    return configFiles;
}
