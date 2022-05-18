import HiveComponent from '../lib/component.js';
import DataIO, { DataSignature } from './dataIO.js';

export const HIVENETBROADCASTADDRESS = 'HiveNet-Broadcast-address';

export type HiveNetFrameFlags = {
    ping?: boolean;
    pong?: boolean;
    ack?: boolean;
    nak?: boolean;
};

let frameNumber = 0;

/*
    OSI model layer 2 - datalink layer
    use ttl to replace spanning tree for handling loop paths
*/
export class HiveNetFrame {
    data: any;
    src: string;
    dest: string;
    ttl: number = 16;
    frameID: number;
    flags: HiveNetFrameFlags = {
        ping: false,
        pong: false,
        ack: false,
        nak: false,
    };

    constructor(data: any, src: string, dest: string, flags?: HiveNetFrameFlags, frameID = frameNumber++) {
        this.data = data;
        this.src = src;
        this.dest = dest;
        this.frameID = frameID;
        if (flags) {
            this.flags = Object.assign(this.flags, flags);
        }
    }
}

export class HiveNetSwitch extends HiveComponent {
    IOs: DataIO[] = [];
    IOsTarget: { io: DataIO; targetIO: DataIO; target: DataIO | HiveNetSwitch }[] = [];
    addressTable: Map<string, { io: DataIO; timestamp: number }> = new Map();
    expireTime: number = 300000;

    newIO(label = 'SwitchIO') {
        const io = new DataIO(this, label);
        this.IOs.push(io);
        io.on('input', this.routeFrame.bind(this, io));
        return io;
    }

    connect(target: HiveNetSwitch | DataIO) {
        let targetIO = target instanceof HiveNetSwitch ? target.newIO() : target;
        const io = this.newIO();
        io.connect(targetIO);
        this.IOsTarget.push({ io, targetIO, target });
    }

    disconnect(target: HiveNetSwitch | DataIO) {
        this.IOsTarget.forEach((o) => {
            if (o.target === target) o.io.disconnect(o.targetIO);
        });
    }

    routeFrame(sender: DataIO, frame: HiveNetFrame, signatures: DataSignature[]) {
        if (!(frame instanceof HiveNetFrame)) {
            sender.output('invalid data type to router!');
            return;
        }

        // ignore self packet
        if (frame.src === this.UUID) return;

        // learn address
        this.addressTable.set(frame.src, { io: sender, timestamp: Date.now() });

        // to this router
        if (frame.dest === this.UUID || frame.dest === '' || frame.dest === HIVENETBROADCASTADDRESS) {
            // ping
            if (frame.flags.ping) {
                sender.output(new HiveNetFrame('pong', this.UUID, frame.src, { pong: true }, frame.frameID));
            }
            if (frame.dest != HIVENETBROADCASTADDRESS) return;
        }

        if (frame.dest != HIVENETBROADCASTADDRESS) {
            // try find target io
            let target = this.addressTable.get(frame.dest);
            if (target && target.timestamp > Date.now() + this.expireTime) {
                // expired
                target = undefined;
                this.addressTable.delete(frame.dest);
            }

            if (target) {
                frame.ttl--;
                if (frame.ttl === 0) {
                    // ttl-timeout
                    sender.output(new HiveNetFrame('ttl-timeout', this.UUID, frame.src, {}, frame.frameID));
                    return;
                } else {
                    // route packet
                    target.io.output(frame, signatures);
                    return;
                }
            }
        }

        // flood
        this.IOs.forEach((io) => {
            if (io != sender) io.output(frame, signatures);
        });
    }
}
