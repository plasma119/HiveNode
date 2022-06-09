import DataIO from './dataIO.js';
import { DataSignature, HiveNetFlags, HiveNetPacket, HIVENETPORT } from './hiveNet.js';
import HiveNetInterface from './interface.js';

/*
    HiveNet Transmission Protocol
    OSI model layer 5 - session layer
*/

// only HiveNetPacket is routed by interface to port
type HTPCallback = (data: HiveNetPacket, signatures: DataSignature[], portIO: DataIO) => any;

export default class HTP {
    netInterface: HiveNetInterface;

    constructor(netInterface: HiveNetInterface) {
        this.netInterface = netInterface;
    }

    send(data: any, dest: string, dport: number, flags?: HiveNetFlags) {
        let port = this.netInterface.getPort(HIVENETPORT.HTPSEND);
        if (!port) port = this.netInterface.newIO(HIVENETPORT.HTPSEND);
        port.input(new HiveNetPacket({ data, dest, dport, flags }));
    }

    sendAndReceiveOnce(
        data: any,
        dest: string,
        dport: number,
        flags?: HiveNetFlags,
        sport = this.netInterface.newRandomPortNumber()
    ): Promise<HiveNetPacket> {
        return new Promise((resolve, reject) => {
            try {
                const port = this.netInterface.newIO(sport);
                port.on('output', (data) => {
                    port.destroy();
                    resolve(data);
                });
                port.input(new HiveNetPacket({ data, dest, dport, flags }));
            } catch (e) {
                reject(e);
            }
        });
    }

    listen(sport: number, callback?: HTPCallback) {
        const port = this.netInterface.newIO(sport);
        if (callback) this._bindCallback(port, callback);
        return port;
    }

    newConnection(dest: string, dport: number, callback: HTPCallback, sport = this.netInterface.newRandomPortNumber()) {
        const port = this.netInterface.newIO(sport);
        this._bindCallback(port, callback);
        return (data: any, flags?: HiveNetFlags) => {
            port.input(new HiveNetPacket({ data, dest, dport, flags }));
        };
    }

    release(port: number) {
        return this.netInterface.closePort(port);
    }

    _bindCallback(portIO: DataIO, callback: HTPCallback) {
        portIO.on('output', (data: HiveNetPacket, signatures) => {
            let res = callback(data, signatures, portIO);
            if (res !== undefined && res !== null) {
                if (res instanceof HiveNetPacket) {
                    res.dest = data.src;
                    res.dport = data.sport;
                    portIO.input(res);
                } else {
                    portIO.input(new HiveNetPacket({ data: res, dest: data.src, dport: data.sport }));
                }
            }
        });
    }
}
