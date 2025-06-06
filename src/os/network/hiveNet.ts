import { ListenerSignature, DefaultListener } from '../../lib/basicEventEmitter.js';
import { reverseMapObj, typeCheck } from '../../lib/lib.js';
import { version } from '../../index.js';
import HiveComponent from '../lib/hiveComponent.js';

export type DataSignature = {
    by: HiveComponent;
    name: string;
    timestamp: number;
    UUID: string;
    event: 'input' | 'output' | 'DT' | 'route' | '';
};

export type HiveNetFlags = {
    ping: boolean;
    log: boolean;
    error: boolean;
    nat: boolean;
    eoc: boolean; // end of command
};

export type TerminalControlPacket = {
    terminalControl: true;
    request?: 'completer';
    input?: string;
    completer?: string[];
    progressPrompt?: string;
    local?: boolean;
};

export class HiveNetPacket {
    data: any;
    src: string;
    dest: string;
    sport: number;
    dport: number;
    ttl: number;
    flags: HiveNetFlags;

    constructor(o: { data: any; src?: string; dest?: string; sport?: number; dport?: number; ttl?: number; flags?: Partial<HiveNetFlags> }) {
        this.data = o.data;
        this.sport = o.sport || 0;
        this.dport = o.dport || 0;
        this.src = o.src || '';
        this.dest = o.dest || '';
        this.ttl = o.ttl || 16;
        this.flags = {
            ping: false,
            log: false,
            error: false,
            nat: false,
            eoc: false,
        };
        if (o.flags) {
            this.flags = Object.assign(this.flags, o.flags);
        }
    }

    toString(src: boolean = false, dest: boolean = false) {
        let str = '';
        if (src) str += `[${this.src}:${this.sport}]`;
        if (src || dest) str += `->`;
        if (dest) str += `[${this.dest}:${this.dport}]`;
        let arr = [];
        for (let [key, value] of Object.entries(this.flags)) if (value) arr.push(key);
        if (arr.length > 0) str += `[flags:${arr}]`;
        if (str.length > 0) str += ': ';
        str += `${this.data}`;
        return str;
    }
}

// TODO: auto test to prevent failing to reconstruct packet
// TODO: packet ID? for debugging/tracking
// TODO: packet creator? maybe extra metadata?
const HiveNetPacketStructure = {
    // data: 'any',
    src: 'string',
    dest: 'string',
    sport: 'number',
    dport: 'number',
    ttl: 'number',
    flags: {
        // don't care about the actual type, also for compatibility
        // ping: 'boolean',
        // log: 'boolean',
        // error: 'boolean',
        // nat: 'boolean',
        // eoc: 'boolean',
    },
};

export type HiveNetDeviceType = 'switch' | 'node' | 'unknown';

export type HiveNetDeviceInfo = {
    UUID: string;
    name: string;
    type: HiveNetDeviceType;
    HiveNodeVersion: string;
};

export class HiveNetDevice<EventList extends ListenerSignature<EventList> = DefaultListener> extends HiveComponent<EventList> {
    deviceType: HiveNetDeviceType;

    constructor(name: string, deviceType: HiveNetDeviceType) {
        super(name);
        this.deviceType = deviceType;
    }

    getDeviceInfo(): HiveNetDeviceInfo {
        return {
            UUID: this.UUID,
            name: this.name,
            type: this.deviceType,
            HiveNodeVersion: version,
        };
    }
}

export const HIVENETADDRESS = {
    BROADCAST: 'HiveNet-address-Broadcast',
    LOCAL: 'HiveNet-address-Local',
    NET: 'HiveNet-address-Net',
};

export const HIVENETPORT = {
    // basic system
    DISCARD: 10, // kernel
    PING: 11, // net
    MESSAGE: 12, // net
    INFO: 13, // net, switch

    // shell related
    SHELL: 20, // kernel, net, terminal
    STDIO: 21, // kernel
    SSH: 22, //
    SOCKET: 23, // socketd

    // protocol core
    HTPSEND: 30, // protocol(HTP)

    // kernel
    KERNEL: 80, // reserved?
    TERMINAL: 81, // terminal

    // app related
    APP: 100, // reserved
    APPMANAGER: 101,

    // not hiveNet
    HIVENETPORT: 8081, // net !! via WebSocket

    // dynamic ports
    BASERANDOMPORT: 10000,
};
export const HIVENETPORTREVERSEMAP = reverseMapObj(HIVENETPORT);

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
    let s = signatures.slice();
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
    if (typeof obj == 'string') return obj;
    // try to rebuild HiveNet data packets
    if (typeCheck(obj, HiveNetPacketStructure)) {
        obj = new HiveNetPacket(obj);
    }
    return obj;
}
