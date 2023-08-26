import HiveCommand from '../../lib/hiveCommand.js';
import { StopPropagation } from '../../lib/signals.js';
import Terminal from '../../lib/terminal.js';
import { DataTransformer } from '../../network/dataIO.js';
import { HIVENETADDRESS, HiveNetPacket, HIVENETPORT, TerminalControlPacket } from '../../network/hiveNet.js';
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

        program
            .addNewCommand('remote', 'remote terminal to target node via HiveNet')
            .addNewArgument('[target]', 'target UUID or name')
            .addNewOption('-d', 'disconnect remote terminal')
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
                } else if (args['target'] == this.os.name || args['target'] == this.os.netInterface.UUID) {
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

        program
            .addNewCommand('getPassword', 'get password from user')
            .addNewArgument('<salt>', 'salt for hashing')
            .setAction((args, _opts, info) => {
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
                return this.getPassword(args['salt']);
            });

        this.os.registerShellProgram(program);
        return program;
    }

    buildTerminal(headless: boolean = false, debug: boolean = false) {
        if (headless) {
            // output only
            this.os.stdIO.on('output', (data) => console.log(data));
            return;
        }

        let shelld = this.os.getProcess(HiveProcessShellDaemon);
        if (!shelld) throw new Error('[ERROR] Failed to initialize system shell, cannot find shell daemon process');
        let shell = shelld.spawnShell();
        shell.rename('terminal');
        this.shellPort = shell.port;
        this.terminalDestPort = shell.port;

        const port = this.os.HTP.listen(HIVENETPORT.TERMINAL);
        const dt = new DataTransformer(port);
        dt.setInputTransform((data) => {
            // terminal -> os
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
            // os -> terminal
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

        const terminal = new Terminal();
        this.terminal = terminal;
        terminal.stdIO.connect(dt.stdIO);
        // TODO: buffer screen for os.stdIO
        this.os.stdIO.on('output', dt.stdIO.outputBind);
        if (terminal && debug) terminal.debug = debug;
        this.promptBuilder.basePrompt = `[${this.os.name}]`;
        terminal.setPrompt(this.promptBuilder.build());

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

        this.os.on('consoleLog', () => terminal.redraw());
    }

    setPrompt(prompt: string) {
        if (!this.terminal) return;
        this.promptBuilder.prompt = prompt;
        this.terminal.setPrompt(this.promptBuilder.build());
    }

    getPassword(salt: string): Promise<string | { hash: string; pepper: string }> {
        return new Promise((resolve) => {
            if (this.terminal) {
                this.terminal.getPassword(salt, (hash, pepper) => {
                    resolve({
                        hash: hash,
                        pepper: pepper,
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
        return `${this.progressPrompt}${this.progressPrompt ? '\n' : ''}${this.basePrompt}${this.prompt}${this.finalPrompt}`;
    }
}
