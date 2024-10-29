import DataIO from './dataIO.js';
import { HIVENETADDRESS, HiveNetPacket, DataSignature, HiveNetFlags, HiveNetDevice, HIVENETPORT } from './hiveNet.js';

/*
    OSI model layer 2 - datalink layer
    use ttl to replace spanning tree for handling loop paths
*/

export default class HiveNetSwitch extends HiveNetDevice {
    IOs: DataIO[] = [];
    IOsTarget: { io: DataIO; targetIO: DataIO; target: DataIO | HiveNetSwitch }[] = [];
    addressTable: Map<string, { io: DataIO; timestamp: number }> = new Map();
    expireTime: number = 300000;

    constructor(name: string) {
        super(name, 'switch');
    }

    newIO(label = 'SwitchIO') {
        const io = new DataIO(this, label);
        this.IOs.push(io);
        io.on('input', this.routePacket.bind(this, io), 'switch input');
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
        if (packet instanceof HiveNetPacket) {
            this.logEvent(packet.toString(true, true), 'route', 'switchIO');
        } else {
            // ignore invalid packet
            return this.logEvent(`[direct]: ${packet}`, 'route', 'switchIO');
        }

        // ignore self packet
        if (packet.src === this.UUID) return;

        // learn address
        this.addressTable.set(packet.src, { io: sender, timestamp: Date.now() });

        // to this router
        if (packet.dest === this.UUID || packet.dest === '' || packet.dest === HIVENETADDRESS.BROADCAST) {
            if (packet.flags.ping) {
                // ping
                this._returnPacket(sender, packet, Date.now());
            } else if (packet.dport === HIVENETPORT.INFO) {
                // info
                this._returnPacket(sender, packet, this.getDeviceInfo());
            }
            // forward broadcast packet
            if (packet.dest != HIVENETADDRESS.BROADCAST) return;
        }

        // ttl check
        packet.ttl--;
        if (packet.ttl === 0 && !packet.flags.error) {
            // ttl-timeout
            if (packet.dest != HIVENETADDRESS.BROADCAST) {
                this._returnPacket(sender, packet, 'ttl-timeout', {
                    error: true,
                });
            }
            return;
        }

        // loopback prevention for broadcast
        if (packet.dest === HIVENETADDRESS.BROADCAST) {
            for (let signature of signatures) {
                if (signature.UUID === this.UUID) return;
            }
        }

        // sign packet
        const signature = this.getSignature();
        signatures.push(signature);

        // routing
        if (packet.dest != HIVENETADDRESS.BROADCAST) {
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

    _returnPacket(sender: DataIO, packet: HiveNetPacket, data: any, flags?: Partial<HiveNetFlags>) {
        sender.output(
            new HiveNetPacket({
                data: data,
                src: this.UUID,
                sport: 0,
                dest: packet.src,
                dport: packet.sport,
                flags: flags,
            })
        );
    }

    getSignature(): DataSignature {
        return {
            by: this,
            name: this.name,
            timestamp: Date.now(),
            UUID: this.UUID,
            event: 'route',
        };
    }
}
