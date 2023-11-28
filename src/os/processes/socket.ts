import WebSocket from 'ws';

import HiveCommand from '../../lib/hiveCommand.js';
import { DataTransformer } from '../../network/dataIO.js';
import { DataSerialize, DataParsing } from '../../network/hiveNet.js';
import HiveSocket from '../../network/socket.js';
import HiveProcess from '../process.js';

const VERSION = 'V1.0';
const BUILD = '2023-8-27';

export default class HiveProcessSocketDaemon extends HiveProcess {
    sockets: Map<number, HiveProcessSocket> = new Map();

    initProgram(): HiveCommand {
        // exposed to kernel->service
        const program = new HiveCommand('socketd', 'HiveSocket Daemon');

        program.addNewCommand('version', 'display current program version').setAction(() => `version ${VERSION} build ${BUILD}`);

        program.addNewCommand('spawn', 'spawn new socket process').setAction(() => {
            return this.spawnSocket(this).port;
        });

        return program;
    }

    spawnSocket(parentProcess: HiveProcess) {
        const shellProcess = parentProcess.spawnChild(HiveProcessSocket, 'shell');
        this.sockets.set(shellProcess.pid, shellProcess);
        shellProcess.once('exit', () => {
            this.sockets.delete(shellProcess.pid);
        });
        return shellProcess;
    }
}

// TODO: relay events from socket
export class HiveProcessSocket extends HiveProcess {
    port: number = this.os.netInterface.newRandomPortNumber();
    protocol: 'none' | 'HiveNet' | 'direct' = 'none';

    socketInfo?: {
        socket: HiveSocket;
        socketDT: DataTransformer;
        type: 'reciever' | 'sender';
    };

    initProgram(): HiveCommand {
        // exposed to RPort, should not be accessed by user
        const program = new HiveCommand('socket', 'HiveSocket');

        program.addNewCommand('pair', 'pair this socket to sender socket').setAction(() => {});

        return program;
    }

    main() {
        const portIO = this.os.netInterface.newIO(this.port);
        portIO.on('input', this.program.stdIO.inputBind, 'socket process program'); // switch to other io after connection
    }

    exit() {
        this.os.netInterface.closePort(this.port);
        super.exit();
    }

    receiveDirect(ws: WebSocket) {
        if (this.protocol != 'none') throw new Error('ERROR: Socket Process: Already connected');
        this.protocol = 'direct';

        const portIO = this.os.netInterface.getPort(this.port);
        if (!portIO) throw new Error(`ERROR: Socket Process: Unable to get portIO:${this.port}`);

        const socket = new HiveSocket('reciever');
        const socketDT = new DataTransformer(socket.dataIO);
        socketDT.setInputTransform(DataSerialize);
        socketDT.setOutputTransform(DataParsing);

        portIO.clear();
        portIO.passThrough(socketDT.stdIO);

        this.socketInfo = {
            socket: socket,
            socketDT: socketDT,
            type: 'reciever',
        };

        return socket.use(ws);
    }

    // wait, who is the listener to the socket output here?
    // maybe just send to NIC(portIO) and let client figure out the packet destination?
    connectDirect(host: string, port: string | number) {
        if (typeof port == 'string') port = Number.parseInt(port);

        if (this.protocol != 'none') throw new Error('ERROR: Socket Process: Already connected');
        this.protocol = 'direct';

        const portIO = this.os.netInterface.getPort(this.port);
        if (!portIO) throw new Error(`ERROR: Socket Process: Unable to get portIO:${this.port}`);

        // TODO: auto reconnect
        const socket = new HiveSocket('sender');
        const socketDT = new DataTransformer(socket.dataIO);
        socketDT.setInputTransform(DataSerialize);
        socketDT.setOutputTransform(DataParsing);

        portIO.clear();
        portIO.passThrough(socketDT.stdIO);

        this.socketInfo = {
            socket: socket,
            socketDT: socketDT,
            type: 'sender',
        };

        return socket.new(host, port);
    }

    connectHiveNet(_UUID: string) {
        // create and pair to target socket
    }
}
