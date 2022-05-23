import { typeCheck } from "../lib/lib";

export type HiveNetFlags = {
    ping?: boolean;
    pong?: boolean;
    ack?: boolean;
    nak?: boolean;
};

export type DataSignature = {
    by: object;
    name: string;
    timestamp: number;
    UUID: string;
    event: string;
};

export class HiveNetFrame {
    data: any;
    src: string;
    dest: string;
    ttl: number = 16;
    flags: HiveNetFlags = {
        ping: false,
        pong: false,
        ack: false,
        nak: false,
    };

    constructor(data: any, src: string, dest: string, flags?: HiveNetFlags) {
        this.data = data;
        this.src = src;
        this.dest = dest;
        if (flags) {
            this.flags = Object.assign(this.flags, flags);
        }
    }
}

export class HiveNetSegment {
    data: any;
    sport: number;
    dport: number;
    flags: HiveNetFlags = {
        ping: false,
        pong: false,
        ack: false,
        nak: false,
    };

    constructor(data: any, sport: number, dport: number, flags?: HiveNetFlags) {
        this.data = data;
        this.sport = sport;
        this.dport = dport;
        if (flags) {
            this.flags = Object.assign(this.flags, flags);
        }
    }
}

export const HIVENETBROADCASTADDRESS = 'HiveNet-Broadcast-address';
const HiveNetFrameStructure = {
    data: 'any',
    src: 'string',
    dest: 'string',
    ttl: 'number',
    flags: {
        ping: 'boolean',
        pong: 'boolean',
        ack: 'boolean',
        nak: 'boolean',
    }
};
const HiveNetSegmentStructure = {
    data: 'any',
    sport: 'number',
    dport: 'number',
    flags: {
        ping: 'boolean',
        pong: 'boolean',
        ack: 'boolean',
        nak: 'boolean',
    }
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
        if (typeCheck(obj, HiveNetFrameStructure)) {
            if (typeCheck(obj.data, HiveNetSegmentStructure)) {
                let segData = obj.data;
                let seg = new HiveNetSegment(segData.data, segData.sport, segData.dport, segData.flags);
                obj = new HiveNetFrame(seg, obj.src, obj.dest, obj.flags);
            } else {
                obj = new HiveNetFrame(obj.data, obj.src, obj.dest, obj.flags);
            }
        }

        return obj;
    } catch (e) {
        return data;
    }
}