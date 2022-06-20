import WebSocket from 'ws';

import HiveComponent from '../lib/component.js';
import HiveCommand from '../lib/hiveCommand.js';
import DataIO, { DataTransformer } from './dataIO.js';
import { DataParsing, DataSerialize, DataSignaturesToString, HIVENETADDRESS, HiveNetPacket, HIVENETPORT } from './hiveNet.js';
import HTP from './protocol.js';
import HiveNetInterface from './interface.js';
import { version } from '../index.js';
import { format, sleep } from '../lib/lib.js';
import HiveSocket from './socket.js';

/*
    OSI model layer 6 - presentation layer
*/
export default class HiveNetNode extends HiveComponent {
    stdIO: DataIO = new DataIO(this, 'stdIO');
    netInterface: HiveNetInterface;
    HTP: HTP;
    shell: HiveCommand;

    stdIOPortIO?: DataIO;

    constructor(name: string) {
        super(name);
        this.netInterface = new HiveNetInterface(name);
        this.HTP = new HTP(this.netInterface);
        this.shell = new HiveCommand();
        this.initShell(this.shell);
        this.initPorts();
    }

    initShell(shell: HiveCommand) {
        let s = shell.addNewCommand('shell', 'Shell command line');

        s.addNewCommand('version', 'display HiveNode version').setAction(() => {
            return version;
        });

        s.addNewCommand('whoami', 'display UUID of node net interface').setAction(() => this.netInterface.UUID);

        let net = s.addNewCommand('net', 'HiveNet commands');

        net.addNewCommand('view', 'Display current connected network nodes').setAction(() => this.netview());

        net.addNewCommand('ping', 'Ping target node')
            .addNewArgument('<UUID>', 'target UUID')
            .setAction((args) => this.netping(args['UUID']));

        net.addNewCommand('message', 'Message target node')
            .addNewArgument('<UUID>', 'target UUID')
            .addNewArgument('<text>', 'message to send')
            .setAction((args) => this.message(args['UUID'], args['text']));

        s.addNewCommand('ssh', 'remote shell directly to target node')
            .addNewArgument('<host>', 'target ip address')
            .addNewArgument('<port>', 'target port number')
            .setAction((args) => this.ssh(args['host'], args['port']));

        s.addNewCommand('ssh-server', 'enable remote shell access')
            .addNewArgument('<port>', 'port number')
            .setAction((args) => this.sshServer(args['port']));
    }

    initPorts() {
        // ping port
        this.HTP.listen(HIVENETPORT.PING, (packet) => {
            if (packet.flags.ping) return new HiveNetPacket({ data: Date.now(), flags: { pong: true } });
            return null;
        });

        // void
        this.HTP.listen(HIVENETPORT.DISCARD);

        // message port
        this.HTP.listen(HIVENETPORT.MESSAGE, (packet, signatures) => {
            this.stdIO.output(packet.data, signatures);
        });

        // shell port
        let shellPortIO = this.HTP.listen(HIVENETPORT.SHELL);
        shellPortIO.connect(this.shell.stdIO);

        // stdIO port
        this.stdIOPortIO = this.HTP.listen(HIVENETPORT.STDIO);
        this.stdIO.passThrough(this.stdIOPortIO);
    }

    message(dest: string, data: any) {
        this.HTP.send(data, dest, HIVENETPORT.MESSAGE);
    }

    async netview() {
        let list: string[][] = [];
        let t = Date.now();
        let port = this.HTP.listen(this.netInterface.newRandomPortNumber(), (packet, signatures) => {
            list.push([packet.src + ':', `${Date.now() - t}ms`, DataSignaturesToString(signatures)]);
        });
        port.input(new HiveNetPacket({ data: t, dest: HIVENETADDRESS.BROADCAST, dport: HIVENETPORT.PING, flags: { ping: true } }));
        await sleep(3000);
        return format(list, ' ');
    }

    netping(dest: string, options: { timeout?: number; dport?: number } = {}): Promise<string | number[]> {
        return new Promise((resolve) => {
            if (!options.timeout) options.timeout = 3000;
            if (!options.dport) options.dport = HIVENETPORT.PING;
            let timeout = false;
            let t1 = Date.now();

            let timer = setTimeout(() => {
                timeout = true;
                resolve('timeout');
            }, options.timeout);

            this.HTP.sendAndReceiveOnce(t1, dest, options.dport, { ping: true })
                .then((data) => {
                    if (timeout) return;
                    clearTimeout(timer);
                    resolve([Date.now() - t1, data.data - t1]);
                })
                .catch(() => resolve('Error'));
        });
    }

    ssh(host: string, port: string | number) {
        this.stdIO.output(`Connecting to ${host}:${port}...`);

        // TODO: rework with socket
        const socket = new HiveSocket('remote');
        const socketDT = new DataTransformer(socket.dataIO);
        socketDT.setInputTransform(DataSerialize);
        socketDT.setOutputTransform(DataParsing);
        if (this.stdIOPortIO) this.stdIO.unpassThrough(this.stdIOPortIO);
        this.stdIO.passThrough(socketDT.stdIO);

        socket.new(host, port).then(() => this.stdIO.output(`Handshake done.`));
    }

    sshServer(port: string | number) {
        if (typeof port === 'string') port = Number.parseInt(port);
        let server = new WebSocket.Server({ port });
        server.on('listening', () => this.stdIO.output(`SSH server now running on port ${port}.`));
        server.on('connection', (ws, req) => {
            this.stdIO.output(`New ssh connecting from ${req.socket.remoteAddress}.`);

            // TODO: rework with socket
            const client = new HiveSocket('');
            const dt = new DataTransformer(client.dataIO);
            dt.setInputTransform(DataSerialize);
            dt.setOutputTransform(DataParsing);
            
            let io = this.netInterface.newIO(this.netInterface.newRandomPortNumber());
            dt.stdIO.connect(io);

            client.use(ws).then(() => this.stdIO.output(`Handshake done.`));
        });
        server.on('error', (e) => this.stdIO.output(e.message + e.stack));
    }
}
