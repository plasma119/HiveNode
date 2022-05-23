import HiveComponent from '../lib/component';
import DataIO from './dataIO';
import { HiveNetFrame, HiveNetSegment } from './hiveNet';
import HiveNetNode from './node';
import HiveNetSwitch from './switch';

/*
    OSI model layer 4 - transport layer
    between node and HiveNet
*/
export default class HiveNetInterface extends HiveComponent {
    nodeIO: DataIO = new DataIO(this, 'nodeIO');
    netIO: DataIO = new DataIO(this, 'netIO');
    ports: Map<number, DataIO> = new Map();
    addressTable: Map<string, number> = new Map();

    constructor(name: string) {
        super(name);
        this.netIO.on('input', (data, signatures) => {
            if (data instanceof HiveNetFrame) {
                const frame = data;
                this.addressTable.set(frame.src, Date.now());
                if (frame.data instanceof HiveNetSegment) {
                    const segment = frame.data;
                    const portData = this.ports.get(segment.dport);
                    if (portData) {
                        // passing segment with flags for further processing
                        portData.output(segment, signatures);
                    } else {
                        // not a open port, ignore it
                    }
                } else {
                    // not via interface, pass to direct io
                    this.nodeIO.output(frame.data, signatures);
                }
            } else {
                // not via hiveNet, direct io interaction
                this.nodeIO.output(data, signatures);
            }
        });
    }

    connect(target: HiveNetSwitch | HiveNetNode | DataIO, type: 'net' | 'port' | 'node', port: number = this.newRandomPortNumber()) {
        let io: DataIO;
        switch (type) {
            case 'net':
                io = this.netIO;
                break;
            case 'port':
                let o = this.newIO(port);
                io = o.io;
                break;
            case 'node':
            default:
                io = this.nodeIO;
                break;
        }
        target.connect(io);
    }

    newIO(port: number) {
        if (this.ports.has(port)) throw new Error(`HiveNetInterface: port ${port} is in use already`);
        const io = new DataIO(this, `portIO:${port}`);
        this.ports.set(port, io);
        io.on('input', (data, signatures) => {
            if (data instanceof HiveNetFrame) {
                data.src = this.UUID;
                if (data.data instanceof HiveNetSegment) {
                    data.data.sport = port;
                }
            } else if (data instanceof HiveNetSegment) {
                data.sport = port;
            }
            this.netIO.output(data, signatures);
        });
        io.on('destroy', () => this.closePort(port));
        return { io, port };
    }

    newRandomPortNumber() {
        let port = 0;
        let i = 0;
        do {
            port = 10000 + Math.floor(Math.random() * 10000);
        } while (i++ < 20 && this.ports.has(port));
        return port;
    }

    closePort(port: number) {
        return this.ports.delete(port);
    }
}
