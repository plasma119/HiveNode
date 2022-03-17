
// strip down version of Commander.js
// argument value persistent bug is the main reason to write this whole thing
// also it just too messy to work with customizing Commander.js

import { parseArgsStringToArgv } from "string-argv";

import DataIO from "./dataIO.js";
import { formatTab } from "./lib.js";

export type HiveCommandCallback = (
    args: {[key: string]: string},
    opts: {[key: string]: boolean | string},
    rawInput: string
) => void | null | string

export default class HiveProgram {
    name: string;
    commands: HiveCommand[] = [];
    stdIO: DataIO;
    currentInput: string = '';

    constructor(name: string = 'default', stdIO?: DataIO, helpCmd: HiveCommand | boolean = true) {
        this.name = name;
        this.stdIO = stdIO || new DataIO(this, 'stdIO');
        if (!(this instanceof HiveCommand)) {
            this.stdIO.on('input', data => {
                if (typeof data == 'string') {
                    this.parse(data);
                } else {
                    throw new Error('Input must be string');
                }
            });
        }
        if (helpCmd instanceof HiveCommand) {
            this.addCommand(helpCmd);
        } else if (helpCmd) {
            this.addNewCommand('help', 'display help')
                .addNewArgument('[cmd]', 'display help for specific command')
                .setAction(this.helpCallback.bind(this));
        }
    }

    parse(str: string) {
        this.currentInput = str;
        const o = HiveProgram.splitCommandStr(str);
        if (!o) throw new Error('Invalid command');
        const cmd = this._findCommand(o.name);
        if (cmd) {
            cmd.parse(o.args);
        } else {
            throw new Error(`Command not found: ${o.name}`);
        }
    }

    addCommand(cmd: HiveCommand) {
        this.commands.push(cmd);
        return cmd;
    }

    addNewCommand(nameAndArgs: string, description = '', isHelpCmd = false) {
        const o = HiveProgram.splitCommandStr(nameAndArgs);
        if (!o) throw new Error('Invalid command format');
        const cmd = new HiveCommand(this, o.name, description, isHelpCmd);
        if (o.args) cmd.addNewArguments(o.args);
        this.addCommand(cmd);
        return cmd;
    }

    _findCommand(name: string) {
        return this.commands.find(commands => commands.name === name);
    };

    helpCallback(args: {[key: string]: string}): string {
        if (args['cmd']) {
            const cmd = this._findCommand(args['cmd']);
            if (cmd) {
                return cmd.helpCallback({});
            } else {
                return `Help: Command not found: ${args['cmd']}`;
            }
        } else {
            let output = `Avaliable commands:\n`;
            let rows: string[] = [];
            this.commands.forEach(c => {
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
        return {name, args};
    }
}

export class HiveCommand extends HiveProgram {
    program: HiveProgram;
    baseProgram: HiveProgram;
    description: string;
    arguments: HiveArgument[] = [];
    options: HiveOption[] = [];
    callback?: HiveCommandCallback;

    constructor(program: HiveProgram, name: string, description = '', isHelpCmd = false) {
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

    parse(str: string): void {
        this.reset();
        const args = parseArgsStringToArgv(str);
        let i = 0;

        // check sub-command
        const o = HiveProgram.splitCommandStr(str);
        if (o) {
            const cmd = this._findCommand(o.name);
            if (cmd) {
                return cmd.parse(o.args);
            }
        }

        while (args.length) {
            const arg = args.shift();
            if (!arg) continue;

            // check option
            if (arg.length > 1 && arg[0] === '-') {
                const option = this._findOption(arg);
                if (option) {
                    if (option.argument) {
                        // try to get argument for flag
                        if (option.argument.required) {
                            const value = args.shift();
                            if (!value) throw new Error(`Missing argument for option ${option.flag}`);
                            option.setValue(value);
                        } else {
                            if (args.length > 0 && args[0] && !this._findOption(args[0])) {
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
                }
            }

            // not option, so must be argument
            if (i < this.arguments.length) {
                this.arguments[i].setValue(arg);
                i++;
                continue;
            }

            // ran out of defined arguments
            break;
        }

        // check required arguments
        let j = 0;
        this.arguments.forEach(a => {if (a.required) j++;});
        if (i < j) {
            throw new Error(`Not enough arguments`);
        }

        if (this.callback) {
            const result = this.callback(this.getArguments(), this.getOptions(), this.getRawInput());
            if (result) this.stdIO.output(result);
        }
    }

    reset() {
        this.arguments.forEach(a => a.reset());
        this.options.forEach(o => o.reset());
    }

    getArguments() {
        let result: {[key: string]: string} = {};
        this.arguments.forEach(a => result[a.name] = a.value);
        return result;
    }

    getOptions() {
        let result: {[key: string]: boolean | string} = {};
        this.options.forEach(o => result[o.flag] = o.value);
        return result;
    }

    getRawInput() {
        return this.baseProgram.currentInput;
    }

    getBaseProgram() {
        let t: HiveCommand = this;
        while (t.program instanceof HiveCommand) {
            t = t.program;
        }
        return t;
    }

    getFullName() {
        let name = this.name;
        let t: HiveCommand = this;
        while (t.program instanceof HiveCommand) {
            t = t.program;
            name = `${t.name} ${name}`;
        }
        return name;
    }

    addArgument(argument: HiveArgument) {
        this.arguments.push(argument);
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
        this.options.push(option);
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

    _findOption(arg: string) {
        return this.options.find(option => option.flag === arg);
    };

    setAction(callback: HiveCommandCallback) {
        this.callback = callback;
        return this;
    }

    helpCallback(args: {[key: string]: string}): string {
        if (args['cmd']) {
            const cmd = this._findCommand(args['cmd']);
            if (cmd) {
                return cmd.helpCallback({});
            } else {
                return `Help - ${this.getFullName()}: Sub-command not found: ${args['cmd']}`;
            }
        } else {
            let output = '';

            output += `Usage: ${this.getFullName()}`;
            if (this.options.length > 0) output += ` [...options]`;
            this.arguments.forEach(a => {
                output += ` ${a.baseName}`;
            });
            output += `\n`;
            if (this.commands.length > 0) output += `       ${this.getFullName()} <sub-command>\n`;

            if (this.commands.length > 0) {
                let rows: string[] = [];
                output += `Avaliable sub-commands:\n`;
                this.commands.forEach(c => {
                    rows.push(`    ${c.name}    \t${c.description}`);
                });
                output += formatTab(rows);
            }

            if (this.arguments.length > 0) {
                let rows: string[] = [];
                output += `Arguments:\n`;
                this.arguments.forEach(a => {
                    rows.push(`    ${a.baseName}    \t${a.description}`);
                });
                output += formatTab(rows);
            }
            if (this.options.length > 0) {
                let rows: string[] = [];
                output += `Options:\n`;
                this.options.forEach(o => {
                    rows.push(`    ${o.baseFlag}    \t${o.description}`);
                });
                output += formatTab(rows);
            }

            return output;
        }
    }
}

export class HiveArgument {
    program: HiveProgram;
    name: string;
    baseName: string;
    description: string;
    defaultValue: string;
    required: boolean;
    value: string;

    constructor(program: HiveProgram, name: string, description = '', defaultValue: string = '') {
        this.program = program;
        this.baseName = name;
        this.description = description;
        this.defaultValue = defaultValue;
        this.value = defaultValue;
        if (!name) throw new Error('Invalid argument name');

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
    program: HiveProgram;
    flag: string;
    baseFlag: string;
    description: string;
    defaultValue: boolean | string;
    argument?: HiveArgument;
    value: boolean | string;

    constructor(program: HiveProgram, flag: string, description = '', defaultValue: boolean | string = false) {
        this.program = program;
        this.baseFlag = flag;
        this.description = description;
        this.defaultValue = defaultValue;
        this.value = defaultValue;
        let o = HiveProgram.splitCommandStr(flag);
        if (!o) throw new Error('Invalid option flag');
        if (o.args) {
            this.argument = new HiveArgument(this.program, o.args);
        }
        this.flag = o.name;
    }

    setValue(value: boolean | string) {
        this.value = value;
    }

    reset() {
        this.value = this.defaultValue;
    }
}
