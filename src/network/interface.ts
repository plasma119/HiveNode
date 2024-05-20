import HiveComponent from '../lib/component.js';
import DataIO from './dataIO.js';
import { HIVENETADDRESS, HiveNetPacket, HIVENETPORT } from './hiveNet.js';
import HTP from './protocol.js';
import HiveNetSwitch from './switch.js';

export class PortIO extends DataIO {
    portID: number;

    constructor(owner: HiveComponent, name: string, portID: number) {
        super(owner, name);
        this.portID = portID;
    }
}

/*
    OSI model layer 4 - transport layer
*/
export default class HiveNetInterface extends HiveComponent {
    netIO: DataIO = new DataIO(this, 'netIO');
    ports: Map<number, PortIO> = new Map();
    addressTable: Map<string, number> = new Map();

    nextPortNumber: number = HIVENETPORT.BASERANDOMPORT;

    HTP: HTP;

    NATMode: boolean = false;

    constructor(name: string) {
        super(name);
        // port routing
        this.netIO.on(
            'input',
            (data, signatures) => {
                if (data instanceof HiveNetPacket) {
                    this.addressTable.set(data.src, Date.now());
                    if (
                        data.dest != this.UUID &&
                        data.dest != HIVENETADDRESS.LOCAL &&
                        data.dest != HIVENETADDRESS.BROADCAST &&
                        !data.dest.startsWith('NAT')
                    ) {
                        // wrong destination, ignore it
                        return;
                    }
                    const port = this.ports.get(data.dport);
                    if (port) {
                        // route packet
                        if (data.dest.startsWith('NAT')) {
                            // NAT unpacking
                            let tokens = data.dest.split('|');
                            data.dport = Number.parseInt(tokens[1]);
                            data.dest = tokens.slice(2).join('|');
                        }
                        port.output(data, signatures);
                    } else {
                        // not a open port, ignore it
                    }
                }
                // not via hiveNet, ignore it
            },
            'interface netIO input'
        );
        this.HTP = new HTP(this);
    }

    connect(target: HiveNetSwitch | DataIO, type: 'net' | 'port', port: number = this.newRandomPortNumber()) {
        let io: DataIO;
        switch (type) {
            case 'net':
                io = this.netIO;
                break;
            case 'port':
            default:
                io = this.newIO(port, this);
                break;
        }
        target.connect(io);
    }

    newIO(port: number, owner: HiveComponent) {
        if (this.ports.has(port)) throw new Error(`HiveNetInterface: port ${port} is in use already`);
        const io = new PortIO(owner, `portIO:${port}`, port);
        this.ports.set(port, io);
        io.on(
            'input',
            (data, signatures) => {
                // ignore invalid packet
                if (!(data instanceof HiveNetPacket)) return;

                // stamp packet
                if (!data.flags.nat) data.src = this.UUID;
                data.sport = port;

                // stamp NAT
                // TODO: more options
                if (this.NATMode) {
                    data.dest = HIVENETADDRESS.NET;
                    data.flags.nat = true;
                }

                if (data.src === data.dest || data.dest === HIVENETADDRESS.LOCAL || data.dest.startsWith('NAT')) {
                    // loopback address
                    this.netIO.input(data, signatures);
                } else {
                    if (data.flags.nat) {
                        // NAT
                        if (data.dest == HIVENETADDRESS.NET) {
                            // forward to next layer as local
                            data.dest = HIVENETADDRESS.LOCAL;
                            // stuff the sport data (will be overwritten by layer above) into src
                            data.src = `NAT|${data.sport}|` + data.src;
                        }
                    }
                    // send to netIO
                    this.netIO.output(data, signatures);
                }
            },
            'portIO input'
        );
        io.on('destroy', () => this.closePort(port));
        return io;
    }

    newRandomIO(owner: HiveComponent) {
        return this.newIO(this.newRandomPortNumber(), owner);
    }

    newRandomPortNumber() {
        let port = this.nextPortNumber++;
        if (this.ports.has(port)) throw new Error('HiveNetInterface: failed to generate new port number');
        return port;
    }

    getPort(port: number) {
        return this.ports.get(port);
    }

    closePort(port: number | PortIO) {
        if (port instanceof PortIO) port = port.portID;
        const io = this.ports.get(port);
        if (io && !io.destroyed) io.destroy();
        return this.ports.delete(port);
    }

    setNATMode(bool: boolean) {
        this.NATMode = bool;
        return this.NATMode;
    }
}
