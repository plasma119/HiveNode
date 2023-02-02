import HiveCommand from '../../lib/hiveCommand.js';
import Terminal from '../../lib/terminal.js';
import { DataTransformer } from '../../network/dataIO.js';
import { HIVENETADDRESS, HiveNetPacket, HIVENETPORT } from '../../network/hiveNet.js';
import HiveProcess from '../process.js';
import HiveProcessNet from './net.js';

export default class HiveProcessTerminal extends HiveProcess {
    terminalDest: string = HIVENETADDRESS.LOCAL;
    terminal?: Terminal;

    initProgram() {
        const program = new HiveCommand('terminal', 'Terminal Controller');

        program
            .addNewCommand('buildTerminal', 'Initialize Terminal')
            .addNewOption('-headless', 'Disable user input for server node', false)
            .addNewOption('-debug', 'Enable Terminal debug message', false)
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
                let uuid = await net.resolveUUID(args['target'], info.reply);
                if (!uuid) return;
                let targetInfo = await net.getInfo(uuid, true);
                if (!targetInfo) return 'Failed to get target node info.';
                this.terminalDest = uuid;
                return `Connected to target node: ${targetInfo.info.name} [HiveOS: ${targetInfo.info.HiveNodeVersion}]`;
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
        // TODO: rework with terminal
        const port = this.os.HTP.listen(HIVENETPORT.TERMINAL);
        const dt = new DataTransformer(port);
        dt.setInputTransform((data) => {
            // terminal -> os
            if (typeof data == 'string' && data[0] == '$') {
                // force input to local shell
                //this.terminalShell.stdIO.input(data.slice(1));
                return new HiveNetPacket({ data: data.slice(1), dest: HIVENETADDRESS.LOCAL, dport: HIVENETPORT.SHELL });
                //return StopPropagation;
            }
            // to target shell
            return new HiveNetPacket({ data, dest: this.terminalDest, dport: HIVENETPORT.SHELL });
        });
        dt.setOutputTransform((data) => {
            // os -> terminal
            if (data instanceof HiveNetPacket) {
                return data.data;
            }
            return data;
        });
        this.on('sigint', () => {
            if (this.terminalDest != HIVENETADDRESS.LOCAL) {
                this.terminalDest = HIVENETADDRESS.LOCAL;
                port.output('Returning to local shell');
            }
        });
        //this.terminalShell.stdIO.on('output', (data, signatures) => dt.stdIO.output(data, signatures));
        const terminal = new Terminal();
        this.terminal = terminal;
        terminal.connectDevice(process);
        terminal.connectDevice(dt.stdIO);
        this.os.stdIO.on('output', dt.stdIO.outputBind);
        if (terminal.prompt && debug) terminal.prompt.debug = debug;
    }
}
