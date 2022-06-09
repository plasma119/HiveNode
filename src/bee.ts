
import WebSocket from 'ws';

import DataIO, { DataTransformer } from './network/dataIO.js';
import { StopPropagation } from './lib/signals.js';
import HiveCommand from './lib/hiveCommand.js';
import HiveSocket from './network/socket.js';
import { DataSignature } from './network/hiveNet.js';
import { version } from './index.js'
import HiveComponent from './lib/component.js';

type DataLog = {
    data: any,
    signatures: DataSignature[]
}

export default class Bee extends HiveComponent {
    stdIO: DataIO;
    program: HiveCommand;
    programDT: DataTransformer;
    screen: DataLog[];
    screenLimit: number = 1000;

    socket: HiveSocket;
    wss?: WebSocket.Server;
    clients: HiveSocket[] = [];
    _onNewConnection?: (client: HiveSocket) => void;

    constructor(name: string) {
        super(name);
        this.stdIO = new DataIO(this, `${name}-stdIO`);
        this.program = new HiveCommand(`${name}-Core`);
        this.screen = [];
        this.programDT = new DataTransformer(this.program.stdIO);
        this.stdIO.passThrough(this.programDT.stdIO);
        this.programDT.inputTransform = (data, signatures) => {
            this._record({data, signatures});
            try {
                this.program.stdIO.input(data, signatures);
            } catch (e) {
                if (e instanceof Error) {
                    this.program.stdIO.output(e.message);
                } else {
                    this.program.stdIO.output(e);
                }
            }
            return StopPropagation;
        }
        this.programDT.outputTransform = (data, signatures) => {
            this._record({data, signatures});
            return data;
        }
        this.socket = new HiveSocket(name);
        this.initProgram();
    }

    initProgram() {
        this.program.addNewCommand('version', 'display current HiveNode version')
            .setAction(() => {
                return version;
            })
    }

    _record(log: DataLog) {
        this.screen.push(log);
        if (this.screen.length > this.screenLimit) this.screen.shift();
    }

    connect(host: string, port: number) {
        return this.socket.new(host, port);
    }

    listen(port: number): Promise<WebSocket.Server> {
        return new Promise(async (resolve) => {
            this.clients.forEach(c => c.disconnect());
            if (this.wss) await this.stopListen();
            this.clients = [];
            this.wss = new WebSocket.Server({
                'port': port
            });
            this.wss.on('listening', resolve);
            this.wss.on('connection', (ws) => {
                const client = new HiveSocket('')
                client.use(ws).then(() => {
                    if (this._onNewConnection) this._onNewConnection(client);
                });
            })
        })
    }

    stopListen(): Promise<Error | undefined> {
        return new Promise((resolve) => {
            this.wss?.close(resolve);
        })
    }

    setOnNewConnection(cb: (client: HiveSocket) => void) {
        this._onNewConnection = cb;
    }
}