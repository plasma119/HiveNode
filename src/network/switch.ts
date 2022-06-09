import HiveComponent from '../lib/component.js';
import DataIO from './dataIO.js';
import { HIVENETBROADCASTADDRESS, HiveNetPacket, DataSignature } from './hiveNet.js';

/*
    OSI model layer 2 - datalink layer
    use ttl to replace spanning tree for handling loop paths
*/

export default class HiveNetSwitch extends HiveComponent {
    IOs: DataIO[] = [];
    IOsTarget: { io: DataIO; targetIO: DataIO; target: DataIO | HiveNetSwitch }[] = [];
    addressTable: Map<string, { io: DataIO; timestamp: number }> = new Map();
    expireTime: number = 300000;

    private _signature: DataSignature;

    constructor(name: string) {
        super(name);
        this._signature = {
            by: this,
            name: this.name,
            timestamp: 0,
            UUID: this.UUID,
            event: 'route',
        }
    }

    newIO(label = 'SwitchIO') {
        const io = new DataIO(this, label);
        this.IOs.push(io);
        io.on('input', this.routePacket.bind(this, io));
        return io;
    }

    connect(target: HiveNetSwitch | DataIO, label?: string) {
        let targetIO = target instanceof HiveNetSwitch ? target.newIO(label) : target;
        const io = this.newIO(label);
        io.connect(targetIO);
        this.IOsTarget.push({ io, targetIO, target });
    }

    disconnect(target: HiveNetSwitch | DataIO) {
        this.IOsTarget.forEach((o) => {
            if (o.target === target) o.io.disconnect(o.targetIO);
        });
    }

    routePacket(sender: DataIO, packet: HiveNetPacket, signatures: DataSignature[]) {
        if (!(packet instanceof HiveNetPacket)) {
            sender.output('invalid data type to router!');
            return;
        }

        // ignore self packet
        if (packet.src === this.UUID) return;

        // learn address
        this.addressTable.set(packet.src, { io: sender, timestamp: Date.now() });

        // to this router
        if (packet.dest === this.UUID || packet.dest === '' || packet.dest === HIVENETBROADCASTADDRESS) {
            // ping
            if (packet.flags.ping) {
                sender.output(
                    new HiveNetPacket({
                        data: Date.now(),
                        src: this.UUID,
                        dest: packet.src,
                        dport: packet.sport,
                        flags: { pong: true },
                    })
                );
            }
            if (packet.dest != HIVENETBROADCASTADDRESS) return;
        }

        // ttl check
        packet.ttl--;
        if (packet.ttl === 0 && !packet.flags.timeout) {
            // ttl-timeout
            if (packet.dest != HIVENETBROADCASTADDRESS) {
                sender.output(
                    new HiveNetPacket({
                        data: 'ttl-timeout',
                        src: this.UUID,
                        dest: packet.src,
                        dport: packet.sport,
                        flags: { timeout: true },
                    })
                );
            }
            return;
        }

        // loopback prevention for broadcast
        if (packet.dest === HIVENETBROADCASTADDRESS) {
            for (let signature of signatures) {
                if (signature.UUID === this.UUID) return;
            }
        }

        // sign packet
        const signature: DataSignature = Object.create(this._signature);
        signature.timestamp = Date.now();
        signatures.push(signature);

        // routing
        if (packet.dest != HIVENETBROADCASTADDRESS) {
            // try find target io
            let target = this.addressTable.get(packet.dest);
            if (target && target.timestamp > Date.now() + this.expireTime) {
                // expired
                target = undefined;
                this.addressTable.delete(packet.dest);
            }

            if (target) {
                // route packet
                target.io.output(packet, signatures.slice());
                return;
            }
        }

        // flood
        this.IOs.forEach((io) => {
            if (io != sender) io.output(packet, signatures.slice());
        });
    }
}
