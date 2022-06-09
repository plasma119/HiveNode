import { typeCheck } from '../lib/lib.js';

export type HiveNetFlags = {
    ping?: boolean;
    pong?: boolean;
    ack?: boolean;
    nak?: boolean;
    timeout?: boolean;
};

export type DataSignature = {
    by: object;
    name: string;
    timestamp: number;
    UUID: string;
    event: string;
};

export class HiveNetPacket {
    data: any;
    src: string;
    dest: string;
    sport: number;
    dport: number;
    ttl: number;
    flags: HiveNetFlags;

    constructor(o: { data: any; src?: string; dest?: string; sport?: number; dport?: number; ttl?: number; flags?: HiveNetFlags }) {
        this.data = o.data;
        this.sport = o.sport || 0;
        this.dport = o.dport || 0;
        this.src = o.src || '';
        this.dest = o.dest || '';
        this.ttl = o.ttl || 16;
        this.flags = {
            ping: false,
            pong: false,
            ack: false,
            nak: false,
            timeout: false,
        }
        if (o.flags) {
            this.flags = Object.assign(this.flags, o.flags);
        }
    }
}

export const HIVENETBROADCASTADDRESS = 'HiveNet-Broadcast-address';
export const HIVENETPORT = {
    DISCARD: 10,
    ECHO: 11,
    MESSAGE: 12,
    HTPSEND: 30,
}

const HiveNetPacketStructure = {
    data: 'any',
    src: 'string',
    dest: 'string',
    sport: 'number',
    dport: 'number',
    ttl: 'number',
    flags: {
        ping: 'boolean',
        pong: 'boolean',
        ack: 'boolean',
        nak: 'boolean',
        timeout: 'boolean'
    },
};

export function DataSignaturesToString(signatures: DataSignature[]) {
    // @ts-ignore
    return signatures.map((s) => `${s.name}[${s.by.name}]:${s.event}`).join('->');
}

export function DataSerialize(data: any) {
    return JSON.stringify(data);
}

export function DataParsing(data: string) {
    try {
        let obj = JSON.parse(data);
        // try to rebuild HiveNet data packets
        if (typeCheck(obj, HiveNetPacketStructure)) {
            obj = new HiveNetPacket(obj);
        }

        return obj;
    } catch (e) {
        return data;
    }
}
