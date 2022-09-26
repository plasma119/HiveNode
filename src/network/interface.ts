import HiveComponent from '../lib/component.js';
import DataIO from './dataIO.js';
import { HIVENETADDRESS, HiveNetPacket } from './hiveNet.js';
import HiveNetSwitch from './switch.js';

/*
    OSI model layer 4 - transport layer
*/
export default class HiveNetInterface extends HiveComponent {
    netIO: DataIO = new DataIO(this, 'netIO');
    ports: Map<number, DataIO> = new Map();
    addressTable: Map<string, number> = new Map();

    constructor(name: string) {
        super(name);
        // port routing
        this.netIO.on('input', (data, signatures) => {
            if (data instanceof HiveNetPacket) {
                this.addressTable.set(data.src, Date.now());
                if (data.dest != this.UUID) {
                    // wrong destination, ignore it
                    return;
                }
                const port = this.ports.get(data.dport);
                if (port) {
                    // route packet
                    port.output(data, signatures);
                } else {
                    // not a open port, ignore it
                }
            }
            // not via hiveNet, ignore it
        });
    }

    connect(target: HiveNetSwitch | DataIO, type: 'net' | 'port', port: number = this.newRandomPortNumber()) {
        let io: DataIO;
        switch (type) {
            case 'net':
                io = this.netIO;
                break;
            case 'port':
            default:
                io = this.newIO(port);
                break;
        }
        target.connect(io);
    }

    newIO(port: number) {
        if (this.ports.has(port)) throw new Error(`HiveNetInterface: port ${port} is in use already`);
        const io = new DataIO(this, `portIO:${port}`);
        this.ports.set(port, io);
        io.on('input', (data, signatures) => {
            if (data instanceof HiveNetPacket) {
                data.src = this.UUID;
                data.sport = port;
            }
            if (data.src === data.dest || data.dest === HIVENETADDRESS.LOCAL) {
                // loopback address
                this.netIO.input(data, signatures);
            } else {
                this.netIO.output(data, signatures);
            }
        });
        io.on('destroy', () => this.closePort(port));
        return io;
    }

    newRandomPortNumber() {
        let port = 0;
        let i = 0;
        do {
            port = 10000 + Math.floor(Math.random() * 50000);
        } while (i++ < 20 && this.ports.has(port));
        return port;
    }

    getPort(port: number) {
        return this.ports.get(port);
    }

    closePort(port: number) {
        const io = this.ports.get(port);
        if (io && !io.destroyed) io.destroy();
        return this.ports.delete(port);
    }
}
