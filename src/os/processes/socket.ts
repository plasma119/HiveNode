import WebSocket from 'ws';

import HiveCommand from '../../lib/hiveCommand.js';
import DataIO, { DataTransformer } from '../../network/dataIO.js';
// import { DataSerialize, DataParsing } from '../../network/hiveNet.js';
import HiveSocket, { DEFAULTHIVESOCKETOPTIONS, HiveSocketOptions } from '../../network/socket.js';
import HiveProcess from '../process.js';
import { HIVENETPORT } from '../../network/hiveNet.js';

const VERSION = 'V1.0';
const BUILD = '2023-12-18';

/*
[Socket Service]
2024-1-20
description:
mid-level controller for socket system
handle both direct socket via ssh / virtual socket via HiveNet

client:
direct ssh:
create new HiveSocket
ask server's socket service for a new session/resume session

virtual socket:
ask server's socket daemon for a new socket process
ask server's socket service for a new session/resume session


server:
direch ssh:
create new HiveSocket
create/retrieve session

virtual socket:
create new socket process
create/retrieve session
*/

let nextSessionID = 0;

export type SocketInfo = {
    socket: HiveSocket;
    socketDT: DataTransformer;
    type: 'reciever' | 'sender';
    protocol: 'none' | 'HiveNet' | 'direct';
    options: HiveSocketOptions;
    sessionID: number;
};

export default class HiveProcessSocketDaemon extends HiveProcess {
    sockets: Map<number, HiveProcessSocket> = new Map();

    initProgram(): HiveCommand {
        // kernel->service->socketd
        const program = new HiveCommand('socketd', 'HiveSocket Daemon');

        program.addNewCommand('version', 'display current program version').setAction(() => `version ${VERSION} build ${BUILD}`);

        program.addNewCommand('spawn', 'spawn new socket process').setAction(() => {
            return this.spawnSocket(this).port;
        });

        return program;
    }

    main(_argv: string[]): void {
        this.program.stdIO.connect(this.os.HTP.listen(HIVENETPORT.SOCKET));
    }

    spawnSocket(parentProcess: HiveProcess) {
        const process = parentProcess.spawnChild(HiveProcessSocket, 'socket');
        this.sockets.set(process.pid, process);
        process.once('exit', () => {
            this.sockets.delete(process.pid);
        });
        return process;
    }
}

// TODO: relay events from socket
// TODO: sessionID
export class HiveProcessSocket extends HiveProcess {
    port: number = 0;
    portIO?: DataIO; // API port
    socketPort: number = 0;
    socketPortIO?: DataIO; // socket port

    socketInfo?: SocketInfo;

    initProgram(): HiveCommand {
        const program = new HiveCommand('socket', 'HiveSocket');

        // I forgor what I was doing with this
        // I think this was for virtual socket via HiveNet
        program.addNewCommand('pair', 'pair this socket to sender socket').setAction(() => {});

        return program;
    }

    main() {
        this.port = this.os.netInterface.newRandomPortNumber();
        this.portIO = this.os.netInterface.newIO(this.port);
        this.portIO.passThrough(this.program.stdIO);
        this.socketPort = this.os.netInterface.newRandomPortNumber();
        this.socketPortIO = this.os.netInterface.newIO(this.socketPort);
    }

    exit() {
        this.os.netInterface.closePort(this.port);
        super.exit();
    }

    receiveDirect(ws: WebSocket) {
        if (this.socketInfo) throw new Error('ERROR: Socket Process: Already connected');
        if (!this.socketPortIO) throw new Error(`ERROR: Socket Process: Unable to get socket portIO:${this.socketPort}`);

        const socket = new HiveSocket('reciever');
        const socketDT = new DataTransformer(socket.dataIO);
        // socketDT.setInputTransform(DataSerialize);
        // socketDT.setOutputTransform(DataParsing);

        this.socketPortIO.clear();
        this.socketPortIO.passThrough(socketDT.stdIO);

        this.socketInfo = {
            socket: socket,
            socketDT: socketDT,
            type: 'reciever',
            protocol: 'direct',
            sessionID: nextSessionID++,
            options: DEFAULTHIVESOCKETOPTIONS,
        };

        return socket.use(ws);
    }

    // wait, who is the listener to the socket output here?
    // maybe just send to NIC(portIO) and let client figure out the packet destination?
    connectDirect(host: string, port: string | number) {
        if (typeof port == 'string') port = Number.parseInt(port);
        if (this.socketInfo) throw new Error('ERROR: Socket Process: Already connected');
        if (!this.socketPortIO) throw new Error(`ERROR: Socket Process: Unable to get socket portIO:${this.socketPort}`);

        const socket = new HiveSocket('sender');
        const socketDT = new DataTransformer(socket.dataIO);
        // socketDT.setInputTransform(DataSerialize);
        // socketDT.setOutputTransform(DataParsing);

        this.socketPortIO.clear();
        this.socketPortIO.passThrough(socketDT.stdIO);

        this.socketInfo = {
            socket: socket,
            socketDT: socketDT,
            type: 'sender',
            protocol: 'direct',
            sessionID: nextSessionID++,
            options: DEFAULTHIVESOCKETOPTIONS,
        };

        return socket.new(host, port);
    }

    // virtual socket
    connectHiveNet(_UUID: string) {
        // create and pair to target socket
    }
}
