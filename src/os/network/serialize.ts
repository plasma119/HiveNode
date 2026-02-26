import { typeCheck } from '../../lib/lib.js';
import { DataSignature, HiveNetPacket, HiveNetPacketStructure } from './hiveNet.js';

export function DataSignaturesToString(signatures: DataSignature[]) {
    return signatures.map((s) => `${s.name}[${s.by.name}]:${s.event}`).join('->');
}

export function DataSerialize(data: any, signatures: DataSignature[]) {
    if (data instanceof HiveNetPacket && data.data === undefined) data.data = ''; // TODO: ...maybe remove this?
    if (data instanceof Error) data = data.message + data.stack;
    return JSON.stringify({
        data,
        signatures: SignaturePreSerialize(signatures),
    });
}

function SignaturePreSerialize(signatures: DataSignature[]) {
    let copy = signatures.slice();
    for (let signature of copy) {
        signature.by = { name: signature.by.name } as any;
    }
    return copy;
}

export function DataParsing(data: string, signatures: DataSignature[]) {
    try {
        let obj = JSON.parse(data);
        if (obj.signatures && Array.isArray(obj.signatures)) {
            // extract signatures
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
