import HiveComponent from '../lib/component.js';
import DataIO from './dataIO.js';
import { DataSignature, HiveNetFlags, HiveNetPacket, HIVENETPORT } from './hiveNet.js';
import HiveNetInterface from './interface.js';

/*
    HiveNet Transmission Protocol
    OSI model layer 5 - session layer
*/

type sendAndReceiveOnce<rawPacket, waitForEOC> = waitForEOC extends true
    ? rawPacket extends true
        ? HiveNetPacket[]
        : any[]
    : rawPacket extends true
    ? HiveNetPacket
    : any;

// only HiveNetPacket is routed by interface to port
type HTPCallback = (data: HiveNetPacket, signatures: DataSignature[], portIO: DataIO) => any;

// HTP ports are anonymous
export default class HTP extends HiveComponent {
    netInterface: HiveNetInterface;

    constructor(netInterface: HiveNetInterface) {
        super('HTP');
        this.netInterface = netInterface;
    }

    send(data: any, dest: string, dport: number, flags?: Partial<HiveNetFlags>) {
        let port = this.netInterface.getPort(HIVENETPORT.HTPSEND);
        if (!port) port = this.netInterface.newIO(HIVENETPORT.HTPSEND, this);
        port.input(new HiveNetPacket({ data, dest, dport, flags }));
    }

    // TODO: check packet actually reached target
    sendAndReceiveOnce<Raw extends boolean, EOC extends boolean>(
        data: any,
        dest: string,
        dport: number,
        flags: Partial<HiveNetFlags> | undefined,
        options: { rawPacket: Raw; waitForEOC: EOC }
    ): Promise<sendAndReceiveOnce<Raw, EOC>> {
        return new Promise((resolve) => {
            const port = this.netInterface.newIO(this.netInterface.newRandomPortNumber(), this);
            const reply = (result: any) => {
                port.destroy();
                resolve(result);
            };
            if (options.waitForEOC) {
                let collector = this.newEOCCollector((results) => {
                    if (options.rawPacket) return reply(results);
                    reply(results.map((p) => p.data));
                });
                port.on('output', collector, 'HTP - sendAndReceiveOnce: EOC');
            } else {
                port.on(
                    'output',
                    (packet) => {
                        if (options.rawPacket) return reply(packet);
                        reply(packet.data);
                    },
                    'HTP - sendAndReceiveOnce'
                );
            }
            port.input(new HiveNetPacket({ data, dest, dport, flags }));
        });
    }

    listen(sport: number, callback?: HTPCallback) {
        const port = this.netInterface.newIO(sport, this);
        if (callback) this._bindCallback(port, callback);
        return port;
    }

    newConnection(dest: string, dport: number, callback: HTPCallback, sport = this.netInterface.newRandomPortNumber()) {
        const port = this.netInterface.newIO(sport, this);
        this._bindCallback(port, callback);
        return (data: any, flags?: HiveNetFlags) => {
            port.input(new HiveNetPacket({ data, dest, dport, flags }));
        };
    }

    release(port: number) {
        return this.netInterface.closePort(port);
    }

    newEOCCollector(callback: (results: HiveNetPacket[]) => void) {
        let results: HiveNetPacket[] = [];
        let collector = (packet: HiveNetPacket) => {
            results.push(packet);
            if (packet.flags.eoc) callback(results);
        };
        return collector;
    }

    // auto respond packet if callback returns non-null/undefined value
    _bindCallback(portIO: DataIO, callback: HTPCallback) {
        portIO.on(
            'output',
            async (data: HiveNetPacket, signatures) => {
                let res = await callback(data, signatures, portIO);
                if (res !== undefined && res !== null) {
                    if (res instanceof HiveNetPacket) {
                        res.dest = data.src;
                        res.dport = data.sport;
                        portIO.input(res);
                    } else {
                        portIO.input(new HiveNetPacket({ data: res, dest: data.src, dport: data.sport }));
                    }
                }
            },
            'HTP - listening'
        );
    }
}
