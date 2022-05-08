import { randomUUID } from 'crypto';

import DataIO, { DataSignature } from './dataIO.js';
import { debounce, sleep } from './lib.js';

export type DataPacketFlags = {
    ping: boolean;
    pong: boolean;
    ack: boolean;
    noReturn: boolean;
    map: boolean;
    request: boolean;
};

let packetNumber = 0;

export class DataPacket {
    data: any;
    src: string;
    dest: string;
    ttl: number = 16;
    packetID: number;
    flags: DataPacketFlags = {
        ping: false,
        pong: false,
        ack: false,
        noReturn: false,
        map: false,
        request: false,
    };

    constructor(data: any, src: string, dest: string, packetID = packetNumber++) {
        this.data = data;
        this.src = src;
        this.dest = dest;
        this.packetID = packetID;
    }
}

export class Router {
    UUID: string = randomUUID();
    name: string;
    IOs: DataIO[] = [];
    loopbackIO: DataIO;
    IOMap: Map<string, DataIO> = new Map();
    distanceMap: Map<string, number> = new Map();
    MapMap: Map<DataIO, Map<string, number>> = new Map();

    debouncedPropagateMap: Function = debounce(this.propagateMap.bind(this), 100);

    constructor(name: string) {
        this.name = name;
        this.loopbackIO = this.newIO('loopback');
        this.distanceMap.set(this.UUID, 0);
        this.IOMap.set(this.UUID, this.loopbackIO);
    }

    newIO(label = 'RouterIO') {
        const io = new DataIO(this, label);
        this.IOs.push(io);
        io.on('input', this.routePacket.bind(this, io));
        io.on('disconnect', () => {
            if (this.MapMap.has(io)) this.MapMap.delete(io);
            this.IOMap.forEach((target, UUID) => {
                if (target == io) {
                    this.IOMap.delete(UUID);
                    this.distanceMap.delete(UUID);
                }
            });
            if (!io.destroyed) this.askMap(io);
            sleep(1000).then(() => this.debouncedPropagateMap());
        });
        return io;
    }

    connect(target: Router | DataIO) {
        if (target instanceof Router) target = target.newIO();
        const io = this.newIO();
        io.connect(target);
        this.askMap(io);
    }

    routePacket(io: DataIO, packet: DataPacket, signatures: DataSignature[], retryFlag = false) {
        if (!(packet instanceof DataPacket)) {
            io.output('invalid data type to router!');
            return;
        }

        // should not happen
        if (packet.src === this.UUID) return;

        // to this router
        if (packet.dest === this.UUID || packet.dest === '') {
            // ping
            if (packet.flags.ping) {
                let r = new DataPacket('pong', this.UUID, packet.src, packet.packetID);
                r.flags.pong = true;
                r.flags.noReturn = true;
                io.output(r);
            }
            if (packet.flags.map) {
                if (packet.flags.request) {
                    // map request
                    let r = new DataPacket(this.distanceMap, this.UUID, packet.src, packet.packetID);
                    r.flags.map = true;
                    r.flags.noReturn = true;
                    io.output(r);
                } else {
                    if (packet.data instanceof Map) {
                        // router map data
                        let update = false;
                        this.MapMap.set(io, packet.data);
                        packet.data.forEach((distance, UUID) => {
                            let record = this.distanceMap.get(UUID);
                            if (record && record <= distance + 1) return;
                            update = true;
                            this.distanceMap.set(UUID, distance + 1);
                            this.IOMap.set(UUID, io);
                        });
                        if (update) this.debouncedPropagateMap();
                    } else if (typeof packet.data == 'string' && packet.data != '') {
                        // node UUID
                        this.distanceMap.set(packet.data, 1);
                        this.IOMap.set(packet.data, io);
                        this.debouncedPropagateMap();
                    }
                }
            }
            return;
        }

        // try find target io
        let target = this.IOMap.get(packet.dest);
        if (target) {
            packet.ttl--;
            if (packet.ttl === 0) {
                // ttl-timeout
                if (!packet.flags.noReturn) {
                    let r = new DataPacket('ttl-timeout', this.UUID, packet.src, packet.packetID);
                    r.flags.noReturn = true;
                    io.output(r);
                }
            } else {
                // route packet
                target.output(packet, signatures);
            }
        } else {
            if (retryFlag) {
                // failed
                if (!packet.flags.noReturn) {
                    let r = new DataPacket('destination not reachable', this.UUID, packet.src, packet.packetID);
                    r.flags.noReturn = true;
                    io.output(r);
                }
            } else {
                // try a bit later, maybe router map is rebuilding
                sleep(1000).then(() => this.routePacket(io, packet, signatures, true));

            }
        }
    }

    askMap(target: DataIO) {
        let packet = new DataPacket('', this.UUID, '');
        packet.flags.map = true;
        packet.flags.request = true;
        target.output(packet);
    }

    reloadMap() {
        this.IOMap.clear();
        this.distanceMap.clear();
        this.MapMap.clear();
        this.distanceMap.set(this.UUID, 0);
        this.IOMap.set(this.UUID, this.loopbackIO);
        this.IOs.forEach(this.askMap);
    }

    updateMap() {
        this.MapMap.forEach((map, io) => {
            map.forEach((distance, UUID) => {
                let record = this.distanceMap.get(UUID);
                if (record && record <= distance + 1) return;
                this.distanceMap.set(UUID, distance + 1);
                this.IOMap.set(UUID, io);
            });
        });
    }

    propagateMap() {
        this.IOs.forEach(o => {
            let p = new DataPacket(this.distanceMap, this.UUID, '');
            p.flags.map = true;
            o.output(p);
        })
    }
}
