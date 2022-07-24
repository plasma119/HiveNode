import WebSocket from 'ws';

import HiveComponent from './lib/component.js';
import { DataTransformer } from './network/dataIO.js';
import { DataSerialize, DataParsing, HIVENETADDRESS, HiveNetPacket, HIVENETPORT, DataSignaturesToString } from './network/hiveNet.js';
import HiveNetNode from './network/node.js';
import HiveSocket from './network/socket.js';
import HiveNetSwitch from './network/switch.js';
import Terminal from './lib/terminal.js';
import { StopPropagation } from './lib/signals.js';
import HiveCommand from './lib/hiveCommand.js';

export default class Hive extends HiveComponent {
    node: HiveNetNode;
    switch: HiveNetSwitch;
    server?: WebSocket.Server;

    terminalShell: HiveCommand;
    _terminalDest: string = HIVENETADDRESS.LOCAL;

    constructor(name: string) {
        super(name);
        this.node = new HiveNetNode(name);
        this.switch = new HiveNetSwitch(`${name}-switch`);
        this.switch.connect(this.node.netInterface.netIO);
        this.terminalShell = new HiveCommand(`${name}-terminalShell`);
        this.initShell();
    }

    initShell() {
        let h = this.terminalShell.addNewCommand('hivenet', 'HiveNet Commands');
        h.addNewCommand('connect', 'Connect terminal to target node via HiveNet')
            .addNewArgument('<UUID>', 'target UUID')
            .setAction((args) => (this._terminalDest = args['UUID']));
        h.addNewCommand('disconnect', 'Connect terminal back to local node')
            .setAction(() => (this._terminalDest = HIVENETADDRESS.LOCAL));
    }

    listen(port: number, debug: boolean = false) {
        this.server = new WebSocket.Server({ port });
        this.server.on('listening', () => this.node.stdIO.output(`Listening on port:${port}`));
        this.server.on('connection', (ws, req) => {
            this.node.stdIO.output(`New client connecting from ${req.socket.remoteAddress}.`);

            // TODO: rework with socket
            const client = new HiveSocket('');
            const dt = new DataTransformer(client.dataIO);
            dt.setInputTransform(DataSerialize);
            dt.setOutputTransform(DataParsing);
            this.switch.connect(dt.stdIO);

            // debug
            if (debug)
                dt.stdIO.on('output', (d, s) => {
                    console.log(DataSignaturesToString(s));
                    console.log(d);
                });

            client.use(ws).then(() => this.node.stdIO.output(`Handshake done.`));
        });
        this.server.on('error', (e) => this.node.stdIO.output(e.message + e.stack));
        return this.server;
    }

    async connect(host: string, port: number) {
        this.node.stdIO.output(`Connecting to ${host}:${port}...`);

        // TODO: rework with socket
        const socket = new HiveSocket('remote');
        const socketDT = new DataTransformer(socket.dataIO);
        socketDT.setInputTransform(DataSerialize);
        socketDT.setOutputTransform(DataParsing);
        this.switch.connect(socketDT.stdIO);

        await socket.new(host, port).then(() => this.node.stdIO.output(`Handshake done.`));
        return socket;
    }

    buildTerminal(headless?: boolean, debug?: boolean) {
        // TODO: rework with terminal
        const dt = new DataTransformer(this.node.stdIO);
        dt.setInputTransform((data) => {
            if (typeof data == 'string' && data[0] == '$') {
                this.terminalShell.stdIO.input(data.slice(1));
                return StopPropagation;
            }
            return new HiveNetPacket({ data, dest: this._terminalDest, dport: HIVENETPORT.SHELL });
        });
        dt.setOutputTransform((data) => {
            if (data instanceof HiveNetPacket) {
                return data.data;
            }
            return data;
        });
        this.terminalShell.stdIO.on('output', (data, signatures) => dt.stdIO.output(data, signatures));
        if (headless) {
            dt.stdIO.on('output', (data) => console.log(data));
        } else {
            const terminal = new Terminal();
            terminal.connectDevice(process);
            terminal.connectDevice(dt.stdIO);
            if (terminal.prompt && debug) terminal.prompt.debug = debug;
        }
    }
}
