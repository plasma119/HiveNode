
import WebSocket from "ws";

import DataIO, { DataSignature, DataTransformer } from "./network/dataIO.js";
import { StopPropagation } from './lib/signals.js';
import HiveProgram from "./lib/hiveProgram.js";
import HiveSocket from "./network/HiveSocket.js";

let id = 1;

type DataLog = {
    data: any,
    signatures: DataSignature[]
}

export default class Bee {
    name: string;
    UID: number;
    stdIO: DataIO;
    program: HiveProgram;
    programDT: DataTransformer;
    screen: DataLog[];
    screenLimit: number = 1000;

    socket: HiveSocket;
    wss?: WebSocket.Server;
    clients: HiveSocket[] = [];
    _onNewConnection?: (client: HiveSocket) => void;

    constructor(name: string) {
        this.name = name;
        this.UID = id++;
        this.stdIO = new DataIO(this, `${name}-stdIO`);
        this.program = new HiveProgram(`${name}-Core`);
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
        this.program.addNewCommand('rickroll', 'lol')
            .addNewArgument('[never]', 'gonna')
            .addNewArgument('[give]', 'you')
            .addNewArgument('[up]', ':)')
            .setAction(() => {
                return 'DUM\n';
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