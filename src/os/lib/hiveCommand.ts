// strip down version of Commander.js
// argument value persistent bug is the main reason to write this whole thing
// also it just too messy to work with customizing Commander.js

import DataIO from '../network/dataIO.js';
import { DataSignature, HiveNetPacket, TerminalControlPacket } from '../network/hiveNet.js';
import HiveComponent from './hiveComponent.js';
import { commonPrefix, findFirstWord, formatTab, typeCheck } from '../../lib/lib.js';

export type HiveCommandCallback = (args: { [key: string]: string }, opts: { [key: `-${string}`]: boolean | string }, info: HiveCommandInfo) => any;

export type HiveCommandInfo = {
    rawData: any;
    rawInput: string;
    signatures: DataSignature[];
    currentProgram: HiveCommand;
    currentInput: string;
    programChain: HiveCommand[];
    terminalControl?: TerminalControlPacket;
    reply: (message: any, forceReply?: boolean) => void;
};

export type HiveCommandExport = {
    name: string;
    description: string;
    defaultCommand: string;
    args: {
        name: string;
        description: string;
        defaultValue: string | number;
    }[];
    opts: {
        name: string;
        description: string;
        defaultValue: boolean | string | number;
    }[];
    cmds: HiveCommandExport[];
    action?: HiveCommandCallback;
};

const HiveCommandStructure = {
    name: 'string',
    description: 'string',
    defaultCommand: 'string',
    args: [
        {
            name: 'string',
            description: 'string',
            defaultValue: 'string|number',
        },
    ],
    opts: [
        {
            name: 'string',
            description: 'string',
            defaultValue: 'boolean|string|number',
        },
    ],
    cmds: 'array',
};

class HiveCommandError extends Error {}

export default class HiveCommand extends HiveComponent {
    commands: Map<String, HiveCommand> = new Map();
    defaultCommand?: HiveCommand; // TODO: add this to export
    stdIO: DataIO;
    description: string;
    isHelpCmd: boolean; // for auto-generated help command

    constructor(name: string = 'HiveCommand', description: string = '', stdIO?: DataIO, helpCmd: HiveSubCommand | boolean = true) {
        super(name);
        this.stdIO = stdIO || new DataIO(this, 'HiveCommand-stdIO');
        this.description = description;
        this.isHelpCmd = false;
        if (!(this instanceof HiveSubCommand)) {
            // only HiveCommand can listen to input from stdIO
            this.stdIO.on('input', this._inputHandler.bind(this), 'hiveCommand input');
        }
        if (helpCmd instanceof HiveSubCommand) {
            this.addCommand(helpCmd);
            //this.defaultCommand = helpCmd;
        } else if (helpCmd) {
            // this one is basic help command, so it needs sub-command 'help' for detailed help
            let help = this.addNewCommand('help', 'display help')
                .addNewArgument('[cmd]', 'display help for specific command')
                .setAction(this.helpCallback.bind(this));
            help.isHelpCmd = true; // it's help command with 'help' sub-command
            //this.defaultCommand = help;
        }
    }

    // direct command execution, bypassing DataIO
    async execute(input: any, onReply?: (data: any) => void) {
        const results: any[] = [];
        await this._inputHandler(input, [], (data) => {
            results.push(data);
            if (onReply) onReply(data);
        });
        return results;
    }

    async _inputHandler(data: any, signatures: DataSignature[], replyOverride?: (data: any) => void) {
        // unpack data
        let input = data instanceof HiveNetPacket ? data.data : data;
        let eoc = false;
        const info: HiveCommandInfo = {
            rawData: data,
            rawInput: input,
            signatures: signatures,
            currentProgram: this,
            currentInput: input,
            programChain: [],
            reply: (message, forceReply) => {
                if (!forceReply && (message === undefined || message === null)) return;
                let returnData: any;
                if (data instanceof HiveNetPacket) {
                    // re-pack data
                    returnData = new HiveNetPacket({
                        data: message,
                        dest: data.src,
                        dport: data.sport,
                        flags: { eoc: eoc },
                    });
                } else {
                    returnData = message;
                }
                if (replyOverride) {
                    replyOverride(returnData);
                } else {
                    this.stdIO.output(returnData, signatures);
                }
            },
        };

        let result: any = '';
        // execute command
        try {
            if (typeof input == 'object' && input.terminalControl) {
                // terminal control packet
                info.terminalControl = input as TerminalControlPacket;
                info.rawInput = typeof info.terminalControl.input == 'string' ? info.terminalControl.input : '';
            }
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
        eoc = true;
        info.reply(result, true);
    }

    parse(str: string, info: HiveCommandInfo): any {
        info.programChain.push(this);
        info.currentInput = str;

        if (str.length == 0 && info.rawInput.length == 0) {
            // empty input
            if (info.terminalControl && info.terminalControl.request == 'completer') return this.terminalCompleter(info);
            return '';
        }

        const o = HiveCommand.splitCommandStr(str);
        if (!o.name) {
            // empty current input, possibly as sub-command
            if (info.terminalControl && info.terminalControl.request == 'completer') return this.terminalCompleter(info);
            if (str.length == 0) {
                if (this.defaultCommand) {
                    return this.defaultCommand.parse('', info);
                }
                let help = this.findCommand('help');
                if (help) {
                    return help.parse('', info);
                }
            }
            throw new HiveCommandError(`Invalid command.`);
        }

        const cmd = this.findCommand(o.name);
        if (cmd) {
            return cmd.parse(o.args, info);
        } else {
            // has arguments, but cannot find corresponding command
            if (info.terminalControl && info.terminalControl.request == 'completer') return this.terminalCompleter(info);
            if (this.defaultCommand) {
                return this.defaultCommand.parse(str, info);
            }
            throw new HiveCommandError(`Command not found: ${o.name}`);
        }
    }

    addCommand(cmd: HiveCommand) {
        if (this.commands.has(cmd.name)) this.stdIO.output(`[Warning]: Overwriting HiveSubCommand: ${cmd.name}`);
        this.commands.set(cmd.name, cmd);
        return cmd;
    }

    addNewCommand(name: string, description = '', isHelpCmd = false) {
        const cmd = new HiveSubCommand(this, name, description, isHelpCmd);
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
            let output = this.name;
            if (this.description) output += ` - ${this.description}`;
            if (this.defaultCommand) output += `\nDefault command: ${this.defaultCommand.name}`;
            output += `\nAvaliable commands:\n`;
            let rows: string[] = [];
            this.commands.forEach((c) => {
                rows.push(`    ${c.name}    \t${c.description}`);
            });
            output += formatTab(rows);
            return output;
        }
    }

    setDefaultCommand(cmd: HiveCommand) {
        this.defaultCommand = cmd;
    }

    import(data: HiveCommandExport, typeChecked: boolean = false) {
        if (!typeChecked && !typeCheck(data, HiveCommandStructure)) throw new HiveCommandError('Invalid HiveCommandExport data!');
        this.name = data.name;
        this.description = data.description;
        this.commands.forEach((cmd, key) => {
            if (!cmd.isHelpCmd) this.commands.delete(key);
        });
        data.cmds.forEach((cmdData) => {
            if (!typeCheck(cmdData, HiveCommandStructure)) throw new HiveCommandError('Invalid HiveCommandExport data!');
            let cmd = this.addNewCommand(cmdData.name, cmdData.description);
            cmd.import(cmdData);
        });
        if (data.defaultCommand) {
            let cmd = this.findCommand(data.defaultCommand);
            if (!cmd) throw new HiveCommandError(`HiveCommandExport cannot find default Command [${data.defaultCommand}]!`);
            this.setDefaultCommand(cmd);
        }
    }

    export(includeAction: boolean = false) {
        let result: HiveCommandExport = {
            name: this.name,
            description: '',
            defaultCommand: this.defaultCommand?.name || '',
            args: [],
            opts: [],
            cmds: [],
        };
        this.commands.forEach((cmd) => {
            if (!cmd.isHelpCmd) result.cmds.push(cmd.export(includeAction));
        });
        return result;
    }

    terminalCompleter(info: HiveCommandInfo): TerminalControlPacket {
        let chain = info.programChain.map((p) => p.name);
        chain.shift();
        let base = chain.join(' ');
        let cmds = Array.from(this.commands).map((i) => i[0]) as string[];
        let rebuildcmd = (str: string) => (base ? base + ' ' : '') + str;

        // find possible commands
        let hits = cmds.filter((c) => c.startsWith(info.currentInput));
        if (hits.length == 0) {
            // no hit, set to list of cmds
            hits = cmds;
            hits.push(' '); // to stop auto complete
        } else if (hits.length === 1) {
            // single hit
            hits = [rebuildcmd(hits[0])]; // reconstruct full command
        } else if (hits.length > 1) {
            // multiple hits, extract prefix for auto complete
            let prefix = commonPrefix(hits as string[]) || '';
            if (info.currentInput != '' && info.currentInput != prefix && prefix != '') {
                hits = [rebuildcmd(prefix)];
            } else {
                hits.sort();
                hits.push(' '); // to stop auto prefix trimming
            }
        }

        if (hits.length == 0 || hits[0] == ' ') hits = []; // no auto complete result

        return {
            terminalControl: true,
            completer: hits,
            local: info.terminalControl?.local,
        };
    }

    toString(input: boolean | string) {
        if (typeof input == 'boolean') return '';
        return input;
    }

    toBoolean(input: boolean | string) {
        return !!input;
    }

    toInt(input: boolean | string) {
        if (typeof input == 'boolean') return 0;
        return Number.parseInt(input);
    }

    static splitCommandStr(command: string) {
        let str = command.trim();
        for (let i = 0; i < str.length; i++) {
            if (str[i] === ' ') {
                return { name: str.substring(0, i), args: str.substring(i + 1) };
            }
        }
        return { name: str, args: '' };
    }

    static escapeString(str: string) {
        // assume only either ' or " in the string, not both
        if (str.includes('"')) return `'${str}'`;
        return `"${str}"`;
    }

    static fromImport(data: HiveCommandExport) {
        let cmd = new HiveCommand();
        cmd.import(data);
        return cmd;
    }
}

export class HiveSubCommand extends HiveCommand {
    program: HiveCommand;
    baseProgram: HiveCommand;
    arguments: Map<String, HiveArgument> = new Map();
    options: Map<String, HiveOption> = new Map();
    callback?: HiveCommandCallback;
    hasVariadicArgument: boolean = false;

    constructor(program: HiveCommand, name: string, description = '', isHelpCmd = false) {
        super(name, description, program.stdIO, false);
        this.program = program;
        this.baseProgram = this.getBaseProgram();
        this.isHelpCmd = isHelpCmd;
        if (!isHelpCmd) {
            this.addNewCommand('help', 'display help', true)
                .addNewArgument('[cmd]', 'display help for specific sub-command')
                .setAction(this.helpCallback.bind(this));
        }
    }

    parse(str: string, info: HiveCommandInfo): any {
        info.programChain.push(this);
        info.currentInput = str;

        // check sub-command
        const o = HiveCommand.splitCommandStr(str);
        const cmd = this.findCommand(o.name);
        if (cmd) {
            return cmd.parse(o.args, info);
        }

        // terminal control
        if (info.terminalControl && info.terminalControl.request == 'completer') return this.terminalCompleter(info);

        // initialize
        info.currentProgram = this;
        this.reset();
        let argumentCount = 0;
        let argumentArr = Array.from(this.arguments.values());

        // parse command
        let start = 0;
        do {
            const positions = findFirstWord(str, start);
            if (!positions) break;
            const arg = str.substring(positions[0], positions[1]);
            start = positions[1] + 1;

            // check option
            if (arg.length > 1 && arg[0] === '-') {
                const option = this.findOption(arg);
                if (!option) throw new HiveCommandError(`Invalid Option: ${arg}`);
                if (option.argument) {
                    // try to get argument for flag
                    const nextPositions = findFirstWord(str, start);
                    const nextArg = nextPositions ? str.substring(nextPositions[0], nextPositions[1]) : '';
                    if (option.argument.required) {
                        // required argument
                        if (!nextArg) throw new HiveCommandError(`Missing required argument for option: ${option.name}`);
                        option.setValue(nextArg);
                        if (nextPositions) start = nextPositions[1] + 1;
                    } else {
                        // optional argument
                        if (nextArg && !this.findOption(nextArg)) {
                            // next string is not option flag, so must be argument
                            option.setValue(nextArg);
                            if (nextPositions) start = nextPositions[1] + 1;
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
            }

            // not option, so must be argument
            if (argumentCount < this.arguments.size) {
                let currentArgument = argumentArr[argumentCount++];
                if (currentArgument.variadic) {
                    // variadic argument
                    currentArgument.setValue(str.substring(positions[0]));
                    break;
                } else {
                    currentArgument.setValue(arg);
                }
                continue;
            }

            // ran out of defined arguments
            break;
        } while (start < str.length);

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

        // action not set, try find help command
        let help = this.findCommand('help');
        if (help) {
            return help.parse('', info);
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
        if (argument.variadic) {
            if (this.hasVariadicArgument) throw new HiveCommandError('Already has one variadic argument');
            this.hasVariadicArgument = true;
        }
        this.arguments.set(argument.name, argument);
        return this;
    }

    addNewArgument(name: string, description = '', defaultValue: string | number = '') {
        const argument = new HiveArgument(name, description, defaultValue);
        this.addArgument(argument);
        return this;
    }

    addNewArguments(
        argumentArr: {
            name: string;
            description?: string;
            defaultValue?: string | number;
        }[]
    ) {
        argumentArr.forEach((arg) => this.addNewArgument(arg.name, arg.description, arg.defaultValue));
        return this;
    }

    addOption(option: HiveOption) {
        if (this.commands.has(option.name)) this.stdIO.output(`[Warning]: Overwriting HiveCommandOption: ${option.name}`);
        this.options.set(option.name, option);
        return this;
    }

    addNewOption(name: string, description = '', defaultValue: boolean | string | number = false) {
        const option = new HiveOption(name, description, defaultValue);
        this.addOption(option);
        return this;
    }

    addNewOptions(
        optionArr: {
            name: string;
            description?: string;
            defaultValue?: boolean | string | number;
        }[]
    ) {
        optionArr.forEach((opt) => this.addNewOption(opt.name, opt.description, opt.defaultValue));
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

    import(data: HiveCommandExport, typeChecked: boolean = false) {
        super.import(data, typeChecked);
        this.description = data.description;
        this.addNewArguments(data.args);
        this.addNewOptions(data.opts);
    }

    export(includeAction: boolean = false) {
        let result = super.export(includeAction);
        result.description = this.description;
        this.arguments.forEach((arg) => {
            result.args.push({
                name: arg.name,
                description: arg.description,
                defaultValue: arg.defaultValue,
            });
        });
        this.options.forEach((opt) => {
            result.opts.push({
                name: opt.name,
                description: opt.description,
                defaultValue: opt.defaultValue,
            });
        });
        if (includeAction) result.action = this.callback;
        return result;
    }
}

export class HiveArgument {
    name: string;
    baseName: string;
    description: string;
    defaultValue: string;

    required: boolean;
    variadic: boolean;
    value: string;

    constructor(name: string, description = '', defaultValue: string | number = '') {
        this.baseName = name;
        this.description = description;
        this.defaultValue = typeof defaultValue == 'number' ? defaultValue.toString() : defaultValue;
        this.required = false;
        this.variadic = false;
        this.value = this.defaultValue;
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
                // default to <required>
                this.required = true;
                this.name = name;
                this.baseName = `<${name}>`;
                break;
        }

        if (this.name.endsWith('...')) {
            // variadic argument, e.g. <strings...>
            this.variadic = true;
            this.name = this.name.slice(0, -3);
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
    name: string;
    baseName: string;
    description: string;
    defaultValue: boolean | string;
    argument?: HiveArgument;
    value: boolean | string;

    constructor(name: string, description = '', defaultValue: boolean | string | number = false) {
        this.baseName = name;
        this.description = description;
        this.defaultValue = typeof defaultValue == 'number' ? defaultValue.toString() : defaultValue;
        this.value = this.defaultValue;
        let o = HiveCommand.splitCommandStr(name);
        if (!o) throw new HiveCommandError('Invalid option flag');
        if (o.args) {
            this.argument = new HiveArgument(o.args);
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
