// strip down version of Commander.js
// argument value persistent bug is the main reason to write this whole thing
// also it just too messy to work with customizing Commander.js

import { parseArgsStringToArgv } from 'string-argv';

import DataIO from '../network/dataIO.js';
import { DataSignature, HiveNetPacket } from '../network/hiveNet.js';
import HiveComponent from './component.js';
import { formatTab } from './lib.js';

export type HiveCommandCallback = (args: { [key: string]: string }, opts: { [key: string]: boolean | string }, info: HiveCommandInfo) => any;

export type HiveCommandInfo = {
    rawData: any;
    rawInput: string;
    signatures: DataSignature[];
    currentProgram: HiveCommand;
    reply: (message: any) => void;
};

class HiveCommandError extends Error {}

export default class HiveCommand extends HiveComponent {
    commands: Map<String, HiveSubCommand> = new Map();
    stdIO: DataIO;

    constructor(name: string = 'HiveCommand', stdIO?: DataIO, helpCmd: HiveSubCommand | boolean = true) {
        super(name);
        this.stdIO = stdIO || new DataIO(this, 'HiveCommand-stdIO');
        if (!(this instanceof HiveSubCommand)) {
            this.stdIO.on('input', this._inputHandler.bind(this));
        }
        if (helpCmd instanceof HiveSubCommand) {
            this.addCommand(helpCmd);
        } else if (helpCmd) {
            this.addNewCommand('help', 'display help')
                .addNewArgument('[cmd]', 'display help for specific command')
                .setAction(this.helpCallback.bind(this));
        }
    }

    async _inputHandler(data: any, signatures: DataSignature[]) {
        // unpack data
        let input = data;
        if (input instanceof HiveNetPacket) {
            input = input.data;
        }
        const info: HiveCommandInfo = {
            rawData: data,
            rawInput: input,
            signatures: signatures,
            currentProgram: this,
            reply: (message) => {
                if (message === undefined || message === null) return;
                if (data instanceof HiveNetPacket) {
                    // re-pack data
                    const packet = new HiveNetPacket({
                        data: message,
                        src: this.UUID,
                        dest: data.src,
                        dport: data.sport,
                    });
                    this.stdIO.output(packet, signatures);
                } else {
                    this.stdIO.output(message, signatures);
                }
            }
        };
        let result: any = '';

        // execute command
        try {
            if (typeof info.rawInput != 'string') {
                throw new HiveCommandError('Cannot recognize input data format');
            }
            result = await this.parse(info.rawInput, info);
        } catch (e) {
            if (e instanceof HiveCommandError) {
                result = e.message;
            } else {
                result = e;
            }
        }

        // return result
        info.reply(result);
    }

    parse(str: string, info: HiveCommandInfo) {
        const o = HiveCommand.splitCommandStr(str);
        if (!o) throw new HiveCommandError('Invalid command');
        const cmd = this.findCommand(o.name);
        if (cmd) {
            return cmd.parse(o.args, info);
        } else {
            throw new HiveCommandError(`Command not found: ${o.name}`);
        }
    }

    addCommand(cmd: HiveSubCommand) {
        if (this.commands.has(cmd.name)) this.stdIO.output(`[Warning]: Overwriting HiveSubCommand: ${cmd.name}`);
        this.commands.set(cmd.name, cmd);
        return cmd;
    }

    addNewCommand(nameAndArgs: string, description = '', isHelpCmd = false) {
        const o = HiveCommand.splitCommandStr(nameAndArgs);
        if (!o) throw new HiveCommandError('Invalid command format');
        const cmd = new HiveSubCommand(this, o.name, description, isHelpCmd);
        if (o.args) cmd.addNewArguments(o.args);
        this.addCommand(cmd);
        return cmd;
    }

    findCommand(name: string) {
        return this.commands.get(name);
    }

    helpCallback(args: { [key: string]: string }): string {
        if (args['cmd']) {
            const cmd = this.findCommand(args['cmd']);
            if (cmd) {
                return cmd.helpCallback({});
            } else {
                return `Help: Command not found: ${args['cmd']}`;
            }
        } else {
            let output = `Avaliable commands:\n`;
            let rows: string[] = [];
            this.commands.forEach((c) => {
                rows.push(`    ${c.name}    \t${c.description}`);
            });
            output += formatTab(rows);
            return output;
        }
    }

    static splitCommandStr(command: string) {
        const result = command.match(/([^ ]+) *(.*)/);
        if (!result) return null;
        const [, name, args] = result;
        return { name, args };
    }
}

export class HiveSubCommand extends HiveCommand {
    program: HiveCommand;
    baseProgram: HiveCommand;
    description: string;
    arguments: Map<String, HiveArgument> = new Map();
    options: Map<String, HiveOption> = new Map();
    callback?: HiveCommandCallback;

    constructor(program: HiveCommand, name: string, description = '', isHelpCmd = false) {
        super(name, program.stdIO, false);
        this.program = program;
        this.baseProgram = this.getBaseProgram();
        this.description = description;
        if (!isHelpCmd) {
            this.addNewCommand('help', 'display help', true)
                .addNewArgument('[cmd]', 'display help for specific sub-command')
                .setAction(this.helpCallback.bind(this));
        }
    }

    parse(str: string, info: HiveCommandInfo): any {
        // check sub-command
        const o = HiveCommand.splitCommandStr(str);
        if (o) {
            const cmd = this.findCommand(o.name);
            if (cmd) {
                return cmd.parse(o.args, info);
            }
        }

        // initialize
        info.currentProgram = this;
        this.reset();
        const args = parseArgsStringToArgv(str);
        let argumentCount = 0;
        let argumentArr = Array.from(this.arguments.values());

        // parse command
        while (args.length) {
            const arg = args.shift();
            if (!arg) continue;

            // check option
            if (arg.length > 1 && arg[0] === '-') {
                const option = this.findOption(arg);
                if (option) {
                    if (option.argument) {
                        // try to get argument for flag
                        if (option.argument.required) {
                            const value = args.shift();
                            if (!value) throw new HiveCommandError(`Missing required argument for option: ${option.name}`);
                            option.setValue(value);
                        } else {
                            if (args.length > 0 && args[0] && !this.findOption(args[0])) {
                                option.setValue(args[0]);
                                args.shift();
                            } else {
                                // no argument
                                option.setValue(true);
                            }
                        }
                    } else {
                        // boolean flag
                        option.setValue(true);
                    }
                    continue;
                } else {
                    throw new HiveCommandError(`Invalid Option: ${arg}`);
                }
            }

            // not option, so must be argument
            if (argumentCount < this.arguments.size) {
                argumentArr[argumentCount].setValue(arg);
                argumentCount++;
                continue;
            }

            // ran out of defined arguments
            break;
        }

        // check required arguments
        let required = 0;
        this.arguments.forEach((a) => {
            if (a.required) required++;
        });
        if (argumentCount < required) {
            throw new HiveCommandError(`Not enough arguments`);
        }

        if (this.callback) {
            return this.callback(this.getArguments(), this.getOptions(), info);
        }

        return 'HiveCommand action not set';
    }

    reset() {
        this.arguments.forEach((a) => a.reset());
        this.options.forEach((o) => o.reset());
    }

    getArguments() {
        let result: { [key: string]: string } = {};
        this.arguments.forEach((a) => (result[a.name] = a.value));
        return result;
    }

    getOptions() {
        let result: { [key: string]: boolean | string } = {};
        this.options.forEach((o) => (result[o.name] = o.value));
        return result;
    }

    getBaseProgram() {
        let t: HiveSubCommand = this;
        while (t.program instanceof HiveSubCommand) {
            t = t.program;
        }
        return t;
    }

    getFullName() {
        let name = this.name;
        let t: HiveSubCommand = this;
        while (t.program instanceof HiveSubCommand) {
            t = t.program;
            name = `${t.name} ${name}`;
        }
        return name;
    }

    addArgument(argument: HiveArgument) {
        if (this.commands.has(argument.name)) this.stdIO.output(`[Warning]: Overwriting HiveCommandArgument: ${argument.name}`);
        this.arguments.set(argument.name, argument);
        return this;
    }

    addNewArgument(name: string, description = '', defaultValue: string = '') {
        const argument = new HiveArgument(this, name, description, defaultValue);
        this.addArgument(argument);
        return this;
    }

    addNewArguments(names: string) {
        names.split(/ +/).forEach((name) => {
            this.addNewArgument(name);
        });
        return this;
    }

    addOption(option: HiveOption) {
        if (this.commands.has(option.name)) this.stdIO.output(`[Warning]: Overwriting HiveCommandOption: ${option.name}`);
        this.options.set(option.name, option);
        return this;
    }

    addNewOption(flag: string, description = '', defaultValue: boolean | string = false) {
        const option = new HiveOption(this, flag, description, defaultValue);
        this.addOption(option);
        return this;
    }

    addNewOptions(flags: string) {
        flags.split(/ +/).forEach((flag) => {
            this.addNewArgument(flag);
        });
        return this;
    }

    findArgument(name: string) {
        return this.arguments.get(name);
    }

    findOption(name: string) {
        return this.options.get(name);
    }

    setAction(callback: HiveCommandCallback) {
        this.callback = callback;
        return this;
    }

    helpCallback(args: { [key: string]: string }): string {
        if (args['cmd']) {
            const cmd = this.findCommand(args['cmd']);
            if (cmd) {
                return cmd.helpCallback({});
            } else {
                return `Help - ${this.getFullName()}: Sub-command not found: ${args['cmd']}`;
            }
        } else {
            let output = '';

            output += `Usage: ${this.getFullName()}`;
            if (this.options.size > 0) output += ` [...options]`;
            this.arguments.forEach((a) => {
                output += ` ${a.baseName}`;
            });
            output += `\n`;
            if (this.commands.size > 0) output += `       ${this.getFullName()} <sub-command>\n`;

            if (this.commands.size > 0) {
                let rows: string[] = [];
                output += `Avaliable sub-commands:\n`;
                this.commands.forEach((c) => {
                    rows.push(`    ${c.name}    \t${c.description}`);
                });
                output += formatTab(rows);
            }

            if (this.arguments.size > 0) {
                let rows: string[] = [];
                output += `Arguments:\n`;
                this.arguments.forEach((a) => {
                    rows.push(`    ${a.baseName}    \t${a.description}`);
                });
                output += formatTab(rows);
            }

            if (this.options.size > 0) {
                let rows: string[] = [];
                output += `Options:\n`;
                this.options.forEach((o) => {
                    rows.push(`    ${o.baseName}    \t${o.description}`);
                });
                output += formatTab(rows);
            }

            return output;
        }
    }
}

export class HiveArgument {
    program: HiveCommand;
    name: string;
    baseName: string;
    description: string;
    defaultValue: string;
    required: boolean;
    value: string;

    constructor(program: HiveCommand, name: string, description = '', defaultValue: string = '') {
        this.program = program;
        this.baseName = name;
        this.description = description;
        this.defaultValue = defaultValue;
        this.value = defaultValue;
        if (!name) throw new HiveCommandError('Invalid argument name');

        switch (name[0]) {
            case '<': // e.g. <required>
                this.required = true;
                this.name = name.slice(1, -1);
                break;
            case '[': // e.g. [optional]
                this.required = false;
                this.name = name.slice(1, -1);
                break;
            default:
                this.required = true;
                this.name = name;
                this.baseName = `<${name}>`;
                break;
        }
    }

    setValue(value: string) {
        this.value = value;
    }

    reset() {
        this.value = this.defaultValue;
    }
}

export class HiveOption {
    program: HiveCommand;
    name: string;
    baseName: string;
    description: string;
    defaultValue: boolean | string;
    argument?: HiveArgument;
    value: boolean | string;

    constructor(program: HiveCommand, name: string, description = '', defaultValue: boolean | string = false) {
        this.program = program;
        this.baseName = name;
        this.description = description;
        this.defaultValue = defaultValue;
        this.value = defaultValue;
        let o = HiveCommand.splitCommandStr(name);
        if (!o) throw new HiveCommandError('Invalid option flag');
        if (o.args) {
            this.argument = new HiveArgument(this.program, o.args);
        }
        this.name = o.name;
    }

    setValue(value: boolean | string) {
        this.value = value;
    }

    reset() {
        this.value = this.defaultValue;
    }
}
