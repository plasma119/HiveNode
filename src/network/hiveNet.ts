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
        };
        if (o.flags) {
            this.flags = Object.assign(this.flags, o.flags);
        }
    }
}

export const HIVENETADDRESS = {
    BROADCAST: 'HiveNet-address-Broadcast',
    LOCAL: 'HiveNet-address-Local',
};
export const HIVENETPORT = {
    DISCARD: 10,
    PING: 11,
    MESSAGE: 12,
    SHELL: 20,
    STDIO: 21,
    SSH: 22,
    HTPSEND: 30,
};

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
        timeout: 'boolean',
    },
};

export function DataSignaturesToString(signatures: DataSignature[]) {
    // @ts-ignore
    return signatures.map((s) => `${s.name}[${s.by.name}]:${s.event}`).join('->');
}

export function DataSerialize(data: any, signatures: DataSignature[]) {
    if (data instanceof HiveNetPacket && data.data === undefined) data.data = '';
    if (data instanceof Error) data = data.message + data.stack;
    return JSON.stringify({ data, signatures: SignaturePreSerialize(signatures) });
}

function SignaturePreSerialize(signatures: DataSignature[]) {
    let s = signatures.slice()
    s.forEach((s) => {
        s.UUID = s.UUID;
        s.name = s.name;
        // @ts-ignore
        s.by = { name: s.by.name };
        s.event = s.event;
    });
    if (!s) s = [];
    return s;
}

export function DataParsing(data: string, signatures: DataSignature[]) {
    try {
        let obj = JSON.parse(data);
        if (obj.signatures && Array.isArray(obj.signatures)) {
            signatures.unshift(...obj.signatures);
            obj = obj.data;
        }
        return ObjectParsing(obj);
    } catch (e) {
        return data;
    }
}

function ObjectParsing(obj: any) {
    if (!obj) return obj;
    // try to rebuild HiveNet data packets
    if (typeCheck(obj, HiveNetPacketStructure)) {
        obj = new HiveNetPacket(obj);
    }
    return obj;
}
