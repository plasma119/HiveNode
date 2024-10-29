import HiveComponent from '../lib/hiveComponent.js';
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
        const packet = new HiveNetPacket({ data, dest, dport, flags });
        this.logEvent(packet.toString(false, true), 'send', 'HTP');
        let portIO = this.netInterface.getPort(HIVENETPORT.HTPSEND);
        if (!portIO) portIO = this.netInterface.newIO(HIVENETPORT.HTPSEND, this);
        portIO.input(packet);
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
            const portIO = this.netInterface.newIO(this.netInterface.newRandomPortNumber(), this);
            const packet = new HiveNetPacket({ data, dest, dport, flags });
            this.logEvent(packet.toString(false, true), 'send', 'HTP-SARO');
            const returnResult = (result: any) => {
                portIO.destroy();
                resolve(result);
            };
            if (options.waitForEOC) {
                let collector = this.newEOCCollector((results) => {
                    this.logEvent(`EOC: ${results}`, 'receive', 'HTP-SARO');
                    if (options.rawPacket) return returnResult(results);
                    returnResult(results.map((p) => p.data));
                });
                portIO.on('output', collector, 'HTP-SARO: EOC');
            } else {
                portIO.on(
                    'output',
                    (packet2) => {
                        this.logEvent(`Packet: ${packet2}`, 'receive', 'HTP-SARO');
                        if (options.rawPacket) return returnResult(packet2);
                        returnResult(packet2.data);
                    },
                    'HTP-SARO'
                );
            }
            portIO.input(packet);
        });
    }

    listen(port: number, callback?: HTPCallback) {
        this.logEvent(`port:${port}`, 'listen', 'HTP');
        const portIO = this.netInterface.newIO(port, this);
        if (callback) this._bindCallback(portIO, callback);
        return portIO;
    }

    newConnection(dest: string, dport: number, callback: HTPCallback, sport = this.netInterface.newRandomPortNumber()) {
        this.logEvent(`->[${dest}:${dport}]`, 'new connection', 'HTP');
        const portIO = this.netInterface.newIO(sport, this);
        this._bindCallback(portIO, callback);
        return (data: any, flags?: HiveNetFlags) => {
            portIO.input(new HiveNetPacket({ data, dest, dport, flags }));
        };
    }

    release(port: number) {
        this.logEvent(`port:${port}`, 'release', 'HTP');
        return this.netInterface.closePort(port);
    }

    newEOCCollector(callback: (results: HiveNetPacket[]) => void) {
        let results: HiveNetPacket[] = [];
        let collector = (packet: HiveNetPacket) => {
            this.logEvent(`Packet: ${packet}`, 'receive', 'HTP-EOC');
            results.push(packet);
            if (packet.flags.eoc) callback(results);
        };
        return collector;
    }

    // auto respond packet if callback returns non-null/undefined value
    _bindCallback(portIO: DataIO, callback: HTPCallback) {
        portIO.on(
            'output',
            async (packet: HiveNetPacket, signatures) => {
                let res = await callback(packet, signatures, portIO);
                if (res !== undefined && res !== null) {
                    this.logEvent(packet.toString(true), 'callback respond', 'HTP');
                    if (res instanceof HiveNetPacket) {
                        // ... wait this is sender address hacking...
                        // does this even works?
                        res.dest = packet.src;
                        res.dport = packet.sport;
                        portIO.input(res);
                    } else {
                        portIO.input(new HiveNetPacket({ data: res, dest: packet.src, dport: packet.sport }));
                    }
                }
            },
            'HTP - listening'
        );
    }
}
