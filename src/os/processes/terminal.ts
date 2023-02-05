import HiveCommand from '../../lib/hiveCommand.js';
import { StopPropagation } from '../../lib/signals.js';
import Terminal from '../../lib/terminal.js';
import { DataTransformer } from '../../network/dataIO.js';
import { HIVENETADDRESS, HiveNetPacket, HIVENETPORT, TerminalControlPacket } from '../../network/hiveNet.js';
import HiveProcess from '../process.js';
import HiveProcessNet from './net.js';

export default class HiveProcessTerminal extends HiveProcess {
    terminalDest: string = HIVENETADDRESS.LOCAL;
    terminal?: Terminal;

    completerCallback?: (value: string[] | PromiseLike<string[]>) => void;

    initProgram() {
        const program = new HiveCommand('terminal', 'Terminal Controller');

        program
            .addNewCommand('buildTerminal', 'initialize terminal')
            .addNewOption('-headless', 'disable user input for server node', false)
            .addNewOption('-debug', 'enable Terminal debug message', false)
            .setAction((_args, opts) => {
                this.buildTerminal(!!opts['headless'], !!opts['debug']);
            });

        program
            .addNewCommand('remote', 'remote terminal to target node via HiveNet')
            .addNewArgument('[target]', 'target UUID or name')
            .addNewOption('-d', 'disconnect remote terminal')
            .setAction(async (args, opts, info) => {
                if (info.rawData instanceof HiveNetPacket && info.rawData.src != this.os.netInterface.UUID) {
                    return 'Only local terminal can use this command.';
                } else if (opts['-d']) {
                    if (this.terminalDest != HIVENETADDRESS.LOCAL) {
                        this.terminalDest = HIVENETADDRESS.LOCAL;
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
                this.terminalDest = uuid;
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
                    invalid = invalid || info.rawData.sport != HIVENETPORT.SHELL;
                }
                if (invalid) return 'Only current terminal target can ask for password';
                return this.getPassword(args['salt']);
            });

        this.os.registerService(program);
        return program;
    }

    buildTerminal(headless: boolean = false, debug: boolean = false) {
        if (headless) {
            // output only
            this.os.stdIO.on('output', (data) => console.log(data));
            return;
        }
        const port = this.os.HTP.listen(HIVENETPORT.TERMINAL);
        const dt = new DataTransformer(port);
        dt.setInputTransform((data) => {
            // terminal -> os
            if (typeof data == 'string' && data[0] == '$') {
                // force input to local shell
                return new HiveNetPacket({ data: data.slice(1), dest: HIVENETADDRESS.LOCAL, dport: HIVENETPORT.SHELL });
            }
            // to target shell
            return new HiveNetPacket({ data, dest: this.terminalDest, dport: HIVENETPORT.SHELL });
        });
        dt.setOutputTransform((packet) => {
            // os -> terminal
            const data = packet instanceof HiveNetPacket ? packet.data : packet;
            if (typeof data == 'object' && data.terminalControl) {
                const control = data as TerminalControlPacket;
                if (this.completerCallback && control.completer && Array.isArray(control.completer)) {
                    this.completerCallback(control.completer);
                    this.completerCallback = undefined;
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
        terminal.setCompleter((line) => {
            return new Promise((resolve) => {
                const packet: TerminalControlPacket = {
                    terminalControl: true,
                    input: line,
                    request: 'completer'
                }
                terminal.stdIO.output(packet);
                setTimeout(() => {
                    if (this.completerCallback) resolve([]);
                    this.completerCallback = undefined;
                }, 10000);
                this.completerCallback = resolve;
            });
        });
    }

    setPrompt(prompt: string | string[]) {
        if (!this.terminal) return;
        this.terminal.setPrompt(prompt);
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
