import Encryption from '../../lib/encryption.js';
import HiveCommand from '../lib/hiveCommand.js';
import { StopPropagation } from '../lib/signals.js';
import Terminal from '../lib/terminal.js';
import { DataTransformer } from '../network/dataIO.js';
import { HIVENETPORT, HIVENETADDRESS, HiveNetPacket, TerminalControlPacket } from '../network/hiveNet.js';
import HiveProcess from '../process.js';
import HiveProcessNet from './net.js';
import HiveProcessShellDaemon from './shell.js';

export default class HiveProcessTerminal extends HiveProcess {
    shellPort: number = HIVENETPORT.SHELL;
    terminalDest: string = HIVENETADDRESS.LOCAL;
    terminalDestPort: number = HIVENETPORT.SHELL;
    terminal?: Terminal;

    promptBuilder: PromptBuilder = new PromptBuilder();

    completerCallback?: (value: string[] | PromiseLike<string[]>) => void;

    initProgram() {
        const program = new HiveCommand('terminal', 'Terminal Controller');

        program
            .addNewCommand('buildTerminal', 'initialize terminal')
            .addNewOption('-headless', 'disable user input for server node', false)
            .addNewOption('-debug', 'enable Terminal debug message', false)
            .setAction((_args, opts) => {
                this.buildTerminal(opts['-headless'] as boolean, opts['-debug'] as boolean);
            });

        program.addNewCommand('debug', 'toggle debug mode').setAction(() => {
            if (this.terminal) {
                this.terminal.debug = !this.terminal.debug;
                return `Debug = ${this.terminal.debug}`;
            } else {
                return 'terminal is not initialized.';
            }
        });

        program
            .addNewCommand('remote', 'remote terminal to target node via HiveNet')
            .addNewOption('-d', 'disconnect remote terminal')
            .addNewArgument('[target...]', 'target UUID or name')
            .setAction(async (args, opts, info) => {
                if (info.rawData instanceof HiveNetPacket && info.rawData.src != this.os.netInterface.UUID) {
                    return 'Only local terminal can use this command.';
                } else if (opts['-d']) {
                    if (this.terminalDest != HIVENETADDRESS.LOCAL || this.terminalDestPort != this.shellPort) {
                        this.terminalDest = HIVENETADDRESS.LOCAL;
                        this.terminalDestPort = this.shellPort;
                        this.setPrompt('');
                        return 'Returning to local shell';
                    } else {
                        return 'Already in local shell';
                    }
                } else if (!args['target']) {
                    return 'Target not specified.';
                } else if (args['target'] == this.os.NodeName || args['target'] == this.os.netInterface.UUID) {
                    return 'Cannot remote terminal to self.';
                }
                const net = this.os.getProcess(HiveProcessNet);
                if (!net) throw new Error('[ERROR] Terminal->Remote failed, cannot find net process');
                const uuid = await net.resolveUUID(args['target'], info.reply);
                if (!uuid) return;
                const targetInfo = await net.getInfo(uuid, true);
                if (!targetInfo) return 'Failed to get target node info.';
                // TODO: integrate with shellDaemon system
                this.terminalDest = uuid;
                this.terminalDestPort = HIVENETPORT.SHELL;
                this.setPrompt(`->[${targetInfo.info.name}]`);
                return `Connected to target node: ${targetInfo.info.name} [HiveOS: ${targetInfo.info.HiveNodeVersion}]`;
            });

        program.addNewCommand('getPassword', 'get password from user').setAction((_args, _opts, info) => {
            let invalid = false;
            if (info.rawData instanceof HiveNetPacket) {
                if (this.terminalDest == HIVENETADDRESS.LOCAL) {
                    invalid = info.rawData.src != this.os.netInterface.UUID;
                } else {
                    invalid = info.rawData.src != this.terminalDest;
                }
                invalid = invalid || info.rawData.sport != this.terminalDestPort;
            }
            if (invalid) return 'Only current terminal target can ask for password';
            return this.getPassword();
        });

        this.os.registerShellProgram(program);
        return program;
    }

    buildTerminal(headless: boolean = false, debug: boolean = false) {
        if (headless) {
            // output only
            this.os.stdIO.on('output', (data) => console.log(data), 'headless output to terminal');
            return;
        }

        // user shell
        let shelld = this.os.getProcess(HiveProcessShellDaemon);
        if (!shelld) throw new Error('[ERROR] Failed to initialize system shell, cannot find shell daemon process');
        let shell = shelld.spawnShell(this);
        shell.rename('terminal');
        this.shellPort = shell.port;
        this.terminalDestPort = shell.port;

        // data piping
        const port = this.os.HTP.listen(HIVENETPORT.TERMINAL);
        const dt = new DataTransformer(port);
        dt.setInputTransform((data) => {
            // terminal -> os -> shell
            if (typeof data == 'string' && data[0] == '$') {
                // force input to local shell
                return new HiveNetPacket({ data: data.slice(1), dest: HIVENETADDRESS.LOCAL, dport: this.shellPort });
            }
            if (typeof data == 'object' && data.terminalControl) {
                // terminal control packet to local shell
                const control = data as TerminalControlPacket;
                if (control.input && control.input[0] == '$') {
                    control.input = control.input.slice(1);
                    control.local = true;
                    return new HiveNetPacket({ data: control, dest: HIVENETADDRESS.LOCAL, dport: this.shellPort });
                }
            }
            // to target shell
            return new HiveNetPacket({ data, dest: this.terminalDest, dport: this.terminalDestPort });
        });
        dt.setOutputTransform((packet) => {
            // shell -> os -> terminal
            const data = packet instanceof HiveNetPacket ? packet.data : packet;
            if (typeof data == 'object' && data.terminalControl && this.terminal) {
                // terminal control system
                const control = data as TerminalControlPacket;
                if (this.completerCallback && control.completer && Array.isArray(control.completer)) {
                    if (control.local) control.completer = control.completer.map((str) => `$${str}`);
                    this.completerCallback(control.completer);
                    this.completerCallback = undefined;
                }
                if (typeof control.progressPrompt == 'string') {
                    this.promptBuilder.progressPrompt = control.progressPrompt;
                    this.terminal.setPrompt(this.promptBuilder.build());
                }
                return StopPropagation;
            }
            return data;
        });

        this.os.on('sigint', () => {
            if (this.terminalDest != HIVENETADDRESS.LOCAL) {
                this.terminalDest = HIVENETADDRESS.LOCAL;
                port.output('Returning to local shell');
            }
        });

        // terminal init
        const terminal = new Terminal();
        this.terminal = terminal;
        terminal.stdIO.connect(dt.stdIO);
        // TODO: buffer screen for os.stdIO
        this.os.stdIO.on('output', dt.stdIO.outputBind, 'route os.stdIO to terminal');
        if (terminal && debug) terminal.debug = debug;
        this.promptBuilder.basePrompt = `[${this.os.NodeName}]`;
        terminal.setPrompt(this.promptBuilder.build());

        // completer
        terminal.setCompleter((line) => {
            return new Promise((resolve) => {
                const packet: TerminalControlPacket = {
                    terminalControl: true,
                    input: line,
                    request: 'completer',
                };
                terminal.stdIO.output(packet);
                setTimeout(() => {
                    if (this.completerCallback) resolve([]);
                    this.completerCallback = undefined;
                }, 10000);
                this.completerCallback = resolve;
            });
        });

        // console.log capture
        this.os.on('consoleLog', (param) => {
            param.suppressBubble = true;
            terminal.redraw(() => param.log(...param.data)); // -> terminal.redraw(console.log(data))
        });
    }

    setPrompt(prompt: string) {
        if (!this.terminal) return;
        this.promptBuilder.prompt = prompt;
        this.terminal.setPrompt(this.promptBuilder.build());
    }

    // TODO: WIP - testing
    getPassword(): Promise<string | { iv: string; hash: string }> {
        return new Promise((resolve) => {
            if (this.terminal) {
                let iv = Encryption.randomData(16).toString('base64');
                this.terminal.getPassword(iv, (hash) => {
                    resolve({
                        iv: iv,
                        hash: hash,
                    });
                });
            } else {
                resolve('Terminal is not avaliable.');
            }
        });
    }
}

class PromptBuilder {
    finalPrompt: string = '>';
    basePrompt: string = '';
    prompt: string = '';
    progressPrompt: string = '';

    build() {
        let pp = this.progressPrompt;
        return `${pp}${pp && !(pp.endsWith('\n') || pp.endsWith('\r')) ? '\n' : ''}${this.basePrompt}${this.prompt}${this.finalPrompt}`;
    }
}
