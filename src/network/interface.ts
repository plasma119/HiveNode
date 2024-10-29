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

    debugPortIO: boolean = false;

    constructor(name: string) {
        super(name);
        // port routing
        this.netIO.on(
            'input',
            (packet, signatures) => {
                if (packet instanceof HiveNetPacket) {
                    this.logEvent(packet.toString(true, true), 'input', 'netIO');
                    this.addressTable.set(packet.src, Date.now());
                    if (
                        packet.dest != this.UUID &&
                        packet.dest != HIVENETADDRESS.LOCAL &&
                        packet.dest != HIVENETADDRESS.BROADCAST &&
                        !packet.dest.startsWith('NAT')
                    ) {
                        // wrong destination, ignore it
                        this.logEvent(`wrong destination`, 'input', 'netIO');
                        return;
                    }
                    const port = this.ports.get(packet.dport);
                    if (port) {
                        // route packet
                        if (packet.dest.startsWith('NAT')) {
                            // NAT unpacking
                            let tokens = packet.dest.split('|');
                            packet.dport = Number.parseInt(tokens[1]);
                            packet.dest = tokens.slice(2).join('|');
                            this.logEvent(`NAT unpacking->[${packet.dest}:${packet.dport}]`, 'input', 'netIO');
                        }
                        return port.output(packet, signatures);
                    } else {
                        // not a open port, ignore it
                        this.logEvent(`portIO:${packet.dport} is not open`, 'input', 'netIO');
                    }
                } else {
                    // not via hiveNet, ignore it
                    this.logEvent(`not HiveNetPacket: ${packet}`, 'input', 'netIO');
                }
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
                this.logEvent(`${target.name} <-> netIO`, 'connect', 'event');
                break;
            case 'port':
            default:
                io = this.newIO(port, this);
                this.logEvent(`${target.name} <-> portIO:${port}`, 'connect', 'event');
                break;
        }
        target.connect(io);
    }

    newIO(port: number, owner: HiveComponent) {
        if (this.ports.has(port)) throw new Error(`HiveNetInterface: port ${port} is in use already`);
        const io = new PortIO(owner, `portIO:${port}`, port);
        this.ports.set(port, io);
        this.logEvent(`${owner.name} -> portIO:${port}`, 'create', 'portIO');
        io.on(
            'input',
            (packet, signatures) => {
                if (!(packet instanceof HiveNetPacket)) {
                    // not HiveNetPacket, but still forward it
                    if (this.debugPortIO) this.logEvent(`[direct]: ${packet}`, 'input', 'portIO');
                    return this.netIO.output(packet, signatures);
                }
                if (this.debugPortIO) this.logEvent(packet.toString(true, true), 'input', 'portIO');

                // stamp packet
                if (!packet.flags.nat) packet.src = this.UUID;
                packet.sport = port;

                // stamp NAT
                // TODO: more options
                if (this.NATMode) {
                    packet.dest = HIVENETADDRESS.NET;
                    packet.flags.nat = true;
                }

                if (packet.src === packet.dest || packet.dest === HIVENETADDRESS.LOCAL || packet.dest.startsWith('NAT')) {
                    // loopback address
                    this.netIO.input(packet, signatures);
                } else {
                    if (packet.flags.nat) {
                        // NAT
                        if (packet.dest == HIVENETADDRESS.NET) {
                            // forward to next layer as local
                            packet.dest = HIVENETADDRESS.LOCAL;
                            // stuff the sport data (will be overwritten by layer above) into src
                            packet.src = `NAT|${packet.sport}|` + packet.src;
                            if (this.debugPortIO) this.logEvent(`NAT packing->[${packet.dest}:${packet.dport}]`, 'input', 'portIO');
                        }
                    }
                    // send to netIO
                    this.netIO.output(packet, signatures);
                }
            },
            'portIO input'
        );
        io.on(
            'output',
            (data) => {
                if (!this.debugPortIO) return;
                if (data instanceof HiveNetPacket) {
                    this.logEvent(data.toString(true, true), 'output', 'portIO');
                } else {
                    this.logEvent(`[direct]: ${data}`, 'output', 'portIO');
                }
            },
            'portIO output'
        );
        io.on('destroy', () => {
            this.logEvent(`portIO:${port}`, 'close', 'portIO');
            this.closePort(port);
        });
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
