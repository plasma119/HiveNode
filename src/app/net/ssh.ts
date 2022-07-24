import WebSocket from 'ws';

import HiveCommand from '../../lib/hiveCommand.js';
import { DataTransformer } from '../../network/dataIO.js';
import { DataSerialize, DataParsing } from '../../network/hiveNet.js';
import HiveNetNode from '../../network/node.js';
import HiveSocket from '../../network/socket.js';
import HiveApp from '../app.js';

export default class HiveAppSSH extends HiveApp {
    constructor(node: HiveNetNode) {
        super(node, 'ssh');
    }

    initProgram(baseProgram: HiveCommand) {
        baseProgram.addNewCommand('ssh', 'remote shell directly to target node')
            .addNewArgument('<host>', 'target ip address')
            .addNewArgument('<port>', 'target port number')
            .setAction((args) => this.ssh(args['host'], args['port']));

        baseProgram.addNewCommand('ssh-server', 'enable remote shell access')
            .addNewArgument('<port>', 'port number')
            .setAction((args) => this.sshServer(args['port']));
    }
    
    ssh(host: string, port: string | number) {
        this.node.stdIO.output(`Connecting to ${host}:${port}...`);

        // TODO: rework with socket
        const socket = new HiveSocket('remote');
        const socketDT = new DataTransformer(socket.dataIO);
        socketDT.setInputTransform(DataSerialize);
        socketDT.setOutputTransform(DataParsing);
        if (this.node.stdIOPortIO) this.node.stdIO.unpassThrough(this.node.stdIOPortIO);
        this.node.stdIO.passThrough(socketDT.stdIO);

        socket.new(host, port).then(() => this.node.stdIO.output(`Handshake done.`));
    }

    sshServer(port: string | number) {
        if (typeof port === 'string') port = Number.parseInt(port);
        let server = new WebSocket.Server({ port });
        server.on('listening', () => this.node.stdIO.output(`SSH server now running on port ${port}.`));
        server.on('connection', (ws, req) => {
            this.node.stdIO.output(`New ssh connecting from ${req.socket.remoteAddress}.`);

            // TODO: rework with socket
            const client = new HiveSocket('');
            const dt = new DataTransformer(client.dataIO);
            dt.setInputTransform(DataSerialize);
            dt.setOutputTransform(DataParsing);
            
            let io = this.node.netInterface.newIO(this.node.netInterface.newRandomPortNumber());
            dt.stdIO.connect(io);

            client.use(ws).then(() => this.node.stdIO.output(`Handshake done.`));
        });
        server.on('error', (e) => this.node.stdIO.output(e.message + e.stack));
    }
}