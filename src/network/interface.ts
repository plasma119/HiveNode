import HiveComponent from '../lib/component';
import DataIO from './dataIO';
import { HiveNetFlags, HiveNetFrame, HiveNetSegment } from './hiveNet';

/*
    OSI model layer 4 - transport layer
    between node and HiveNet
*/
export default class HiveNetInterface extends HiveComponent {
    nodeIO: DataIO = new DataIO(this, 'nodeIO');
    netIO: DataIO = new DataIO(this, 'netIO');
    ports: Map<number, { io: DataIO }> = new Map();
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
                        portData.io.output(segment, signatures);
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

    newIO(port: number) {
        if (this.ports.has(port)) return null;
        const io = new DataIO(this, `portIO:${port}`);
        this.ports.set(port, { io });
        io.on('input', (data, signatures) => {
            this.netIO.output(data, signatures);
        });
        return { io, port };
    }

    closePort(port: number) {
        return this.ports.delete(port);
    }

    send(portData: { io: DataIO; port: number }, data: any, dest: string, dport: number, flags?: HiveNetFlags) {
        const segment = new HiveNetSegment(data, portData.port, dport, flags);
        const frame = new HiveNetFrame(segment, this.UUID, dest, flags);
        this.netIO.output(frame);
    }
}
