import WebSocket from 'ws';

import HiveCommand from '../lib/hiveCommand.js';
import HiveSocket, { DEFAULTHIVESOCKETOPTIONS, HiveSocketOptions } from '../network/socket.js';
import HiveProcess from '../process.js';
import { HIVENETPORT } from '../network/hiveNet.js';
import { PortIO } from '../network/interface.js';

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

export type SocketInfo =
    | {
          protocol: 'HiveNet';
          type: 'reciever' | 'sender';
          sessionID: number;
          options: HiveSocketOptions;
      }
    | {
          protocol: 'ws';
          type: 'reciever' | 'sender';
          sessionID: number;
          options: HiveSocketOptions;
          socket: HiveSocket;
      };

export default class HiveProcessSocketDaemon extends HiveProcess {
    sockets: Map<number, HiveProcessSocket> = new Map();

    initProgram(): HiveCommand {
        // kernel->service->socketd
        const program = new HiveCommand('socketd', 'HiveSocket Daemon');

        program.addNewCommand('version', 'display current program version').setAction(() => `version ${VERSION} build ${BUILD}`);

        program.addNewCommand('spawn', 'spawn new socket process').setAction(() => {
            return new Promise((resolve) => {
                const process = this.spawnSocket(this);
                process.on('ready', () => {
                    resolve(process.portIO?.portID);
                });
            });
        });

        return program;
    }

    main(_argv: string[]): void {
        this.program.stdIO.connect(this.os.HTP.listen(HIVENETPORT.SOCKET));
        DEFAULTHIVESOCKETOPTIONS.HiveNodeName = this.os.name;
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
// TODO: actually using this
export class HiveProcessSocket extends HiveProcess {
    portIO?: PortIO; // API port
    socketPortIO?: PortIO; // socket port

    // dataIO: TODO

    socketInfo?: SocketInfo;

    initProgram(): HiveCommand {
        const program = new HiveCommand('socket', 'HiveSocket');

        // I forgor what I was doing with this
        // I think this was for virtual socket via HiveNet
        program.addNewCommand('pair', 'pair this socket to sender socket').setAction(() => {});

        return program;
    }

    main() {
        // init portIO
        this.portIO = this.os.netInterface.newRandomIO(this);
        this.portIO.passThrough(this.program.stdIO);
        this.socketPortIO = this.os.netInterface.newRandomIO(this);
    }

    exit() {
        if (this.portIO) this.os.netInterface.closePort(this.portIO);
        if (this.socketPortIO) this.os.netInterface.closePort(this.socketPortIO);
        super.exit();
    }

    receiveDirect(ws: WebSocket) {
        if (this.socketInfo) throw new Error('ERROR: Socket Process: Already connected');
        if (!this.socketPortIO) throw new Error(`ERROR: Socket Process: Unable to get socket portIO`);

        const socket = new HiveSocket('reciever');

        this.socketPortIO.clear();
        this.socketPortIO.passThrough(socket.dataIO);

        this.socketInfo = {
            protocol: 'ws',
            type: 'reciever',
            sessionID: 0,
            options: DEFAULTHIVESOCKETOPTIONS,
            socket: socket,
        };

        socket.on('ready', () => {
            // TODO: request sessionID here
        });

        return socket.use(ws);
    }

    // wait, who is the listener to the socket output here?
    // maybe just send to NIC(portIO) and let client figure out the packet destination?
    connectDirect(host: string, port: string | number) {
        if (typeof port == 'string') port = Number.parseInt(port);
        if (this.socketInfo) throw new Error('ERROR: Socket Process: Already connected');
        if (!this.socketPortIO) throw new Error(`ERROR: Socket Process: Unable to get socket portIO`);

        const socket = new HiveSocket('sender');

        this.socketPortIO.clear();
        this.socketPortIO.passThrough(socket.dataIO);

        this.socketInfo = {
            protocol: 'ws',
            type: 'sender',
            sessionID: nextSessionID++,
            options: DEFAULTHIVESOCKETOPTIONS,
            socket: socket,
        };

        socket.on('ready', () => {
            // TODO: send sessionID here
        });

        // TODO: save socket.stdIO output to main logging system(TODO)
        // TODO: setSecret

        return socket.new(host, port);
    }

    // virtual socket
    connectHiveNet(_UUID: string) {
        // create and pair to target socket
    }
}
