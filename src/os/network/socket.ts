import { inspect } from 'util';

import WebSocket from 'ws';

import { version } from '../../index.js';
import Encryption from '../../lib/encryption.js';
import { sleep } from '../../lib/lib.js';
import HiveComponent from '../lib/hiveComponent.js';
import { DataParsing, DataSerialize, DataSignature } from './hiveNet.js';
import DataIO from './dataIO.js';
import HandShake from './handshake.js';

const VERSION = 'V1.2';
const BUILD = '2025-01-11';
const PEPPER = '458f4a35dd57';

export type SocketStatus = {
    HiveNodeName: string;
    socketName: string;
    HiveNodeVersion: string;
    socketVersion: string;
    handshakeDone: boolean;
};

const DEFAULTSOCKETINFO: SocketStatus = {
    HiveNodeName: 'unknown',
    socketName: 'unknown',
    HiveNodeVersion: 'unknwon',
    socketVersion: 'unknown',
    handshakeDone: false,
};

type SocketSecret = {
    algorithm: 'aes-256-ctr' | 'aes-256-cbc' | 'aes-256-gcm';
    noise: string;
    noise2: string;
    salt: string;
    salt2: string;
    secret: string;
    key?: Buffer;
};

// TODO: negotiate algorithm to use
// TODO: check how user/system input secret key
const DEFAULTSOCKETSECRET: SocketSecret = {
    algorithm: 'aes-256-gcm',
    noise: '',
    noise2: '',
    salt: 'salt',
    salt2: 'salt2',
    secret: 'nothing',
};

type SocketHost = { host: string; port: number };
type HiveSocketDataHeader = 'handshake' | 'data' | 'ping' | 'pong';
type HiveSocketReason = 'timeout' | 'handshake' | 'ping' | 'closed' | 'restart' | 'unknown' | 'error';

type HiveSocketEvent = {
    ready: (targetInfo: SocketStatus) => void;
    disconnect: (reason: HiveSocketReason) => void;
};

// TODO: ~auto reconnect~, buffer data
// TODO: move reconnect stuff back up to controller to handle
export type HiveSocketOptions = {
    bufferData: boolean; // buffer data packets if socket not ready - TODO
    serialization: boolean; // serialize data for HiveNetPacket
    connectTimeout: number; // seconds to wait for timeout for connect attempts
    handshakeTimeout: number; // handshake step time
    // handshakeMax: number; // handshake max retries per step
    pingInterval: number; // seconds between ping
    pingTimeout: number; // seconds to wait for timeout for ping
    pingMax: number; // numbers of failed pings before closing socket
    HiveNodeName: string;
    debugData: boolean; // log data during send/receive to event logger
    debugRawData: boolean; // log raw data during send/receive to event logger
};

export const DEFAULTHIVESOCKETOPTIONS: HiveSocketOptions = {
    bufferData: true,
    serialization: true,
    connectTimeout: 20,
    handshakeTimeout: 5,
    // handshakeMax: 5,
    pingInterval: 60,
    pingTimeout: 5,
    pingMax: 5,
    HiveNodeName: 'null',
    debugData: false,
    debugRawData: false,
};

/*
    OSI model layer 3 - network layer
    TODO: controller program for advance socket control
*/
export default class HiveSocket extends HiveComponent<HiveSocketEvent> {
    options: HiveSocketOptions;
    dataIO: DataIO;
    info: SocketStatus;
    private _ss: SocketSecret;

    ws?: WebSocket;
    socketHost?: SocketHost;
    socketReady: boolean = false;
    targetInfo: SocketStatus;
    handshakeDone: boolean = false;
    private _handshakeCallback?: (header: HiveSocketDataHeader, data: string) => void;

    pingCount: number = 0;
    pingReceived: boolean = false;

    constructor(name: string, options?: Partial<HiveSocketOptions>) {
        super(name);
        this.options = Object.assign({}, DEFAULTHIVESOCKETOPTIONS, options);
        this.dataIO = new DataIO(this, 'HiveSocket-dataIO');
        this.info = Object.assign({}, DEFAULTSOCKETINFO);
        this._ss = Object.assign({}, DEFAULTSOCKETSECRET);
        this.targetInfo = Object.assign({}, DEFAULTSOCKETINFO);

        this.dataIO.on(
            'input',
            (data, signatures) => {
                if (this.options.debugData) this.logEvent(`${data}`, 'input', 'socket');
                if (this.options.serialization) data = DataSerialize(data, signatures);
                this.send('data', data);
            },
            'write to socket'
        );
        this._updateInfo();
    }

    _updateInfo() {
        this.info.HiveNodeName = this.options.HiveNodeName || 'null';
        this.info.socketName = this.name;
        this.info.HiveNodeVersion = version;
        this.info.socketVersion = `version ${VERSION} build ${BUILD}`;
    }

    // TODO: use this
    setSecret(secret: string, salt: string, salt2: string) {
        this._ss.secret = Encryption.hash(secret).update(PEPPER).digest('base64');
        this._ss.salt = Encryption.hash(salt).update(PEPPER).digest('base64');
        this._ss.salt2 = Encryption.hash(salt2).update(PEPPER).digest('base64');
    }

    // client socket
    new(host: string, port: number): Promise<SocketStatus> {
        if (this.ws) this.disconnect();
        this.socketHost = { host, port };
        this.ws = new WebSocket(`ws://${host}:${port}`);
        return this._connect(this.ws, true);
    }

    // server socket
    use(socket: WebSocket): Promise<SocketStatus> {
        if (this.ws) this.disconnect();
        this.ws = socket;
        return this._connect(socket, false);
    }

    // TODO: send reason to target?
    disconnect(reason?: HiveSocketReason) {
        this.socketReady = false;
        if (!this.ws) return;
        this.ws.terminate(); // immediately destroys the connection
        this.ws = undefined;
        this.logEvent(`socket disconnected.${reason ? ` Reason: ${reason}` : ''}`, 'connect', 'socket');
        this.emit('disconnect', reason || 'unknown');
    }

    _connect(socket: WebSocket, isClient: boolean): Promise<SocketStatus> {
        this.logEvent(`websocket init`, 'connect', 'socket');
        this._updateInfo();
        this._ss.noise = '';
        this._ss.noise2 = '';
        this.targetInfo = Object.assign({}, DEFAULTSOCKETINFO);
        this.socketReady = false;
        this.handshakeDone = false;

        return new Promise(async (resolve, reject) => {
            // connect timeout handler
            if (this.options.connectTimeout > 0) {
                setTimeout(() => {
                    if (!this.socketReady) {
                        this.disconnect('timeout');
                        reject('Socket timeout.');
                    }
                }, this.options.connectTimeout * 1000);
            }

            let onReady = async () => {
                // socket connected, to handshake phase
                this.logEvent(`websocket ready`, 'connect', 'socket');
                this.socketReady = true;
                this._handshake(isClient)
                    .then((info) => {
                        // handshake done
                        this._pingHandler();
                        this.emit('ready', info);
                        resolve(info);
                    })
                    .catch((status) => {
                        // handshake failed
                        // TODO: relay status/error back to controller
                        this._handshakeCallback = undefined;
                        this.logEvent(`Handshake failed: ${status}`, 'connect', 'socket');
                        let reason = typeof status == 'string' ? status : 'handshake failed.';
                        this.disconnect('handshake');
                        reject(reason);
                    });
            };

            if (isClient) {
                socket.on('open', onReady);
            } else {
                onReady();
            }
            socket.on('message', this._recieveHandler.bind(this));
            socket.on('error', (e) => {
                this.logEvent(`${e}`, 'connect', 'socket');
                this.disconnect('error');
                reject(e);
            });
        });
    }

    _handshake(isClient: boolean): Promise<SocketStatus> {
        return new Promise(async (resolve, reject) => {
            type states = 'C1' | 'C2' | 'C3' | 'S1' | 'S2' | 'ready';
            const handshake = new HandShake<states>();
            handshake.setEventLogger(this.logEvent);
            handshake.timeout = this.options.handshakeTimeout * 1000;
            const handshakeRespond = (data: any) => {
                this.send('handshake', JSON.stringify(data));
            };
            handshake.addPath('START', 'C1', () => {
                // initial handshake
                // basic client info
                handshakeRespond({
                    keyword: 'HiveNet',
                    info: this.info,
                });
                return 'C2';
            });
            handshake.addPath('START', 'S1', async () => {
                let json = await handshake.getNextData({
                    keyword: 'string',
                    info: 'object',
                });
                if (!json) return 'ERROR';
                if (json.keyword !== 'HiveNet') return 'ERROR';
                Object.assign(this.targetInfo, json.info);
                this._ss.noise = Encryption.randomData().toString('base64');
                // basic server info
                // server noise
                handshakeRespond({
                    info: this.info,
                    noise: this._ss.noise,
                });
                return 'S2';
            });
            handshake.addPath('C1', 'C2', async () => {
                let json = await handshake.getNextData({
                    info: 'object',
                    noise: 'string',
                });
                if (!json) return 'ERROR';
                Object.assign(this.targetInfo, json.info);
                this._ss.noise = json.noise;
                this._ss.noise2 = Encryption.randomData().toString('base64');
                const proof = Encryption.hash(this._ss.noise);
                proof.update(this._ss.salt);
                proof.update(this._ss.secret);
                const proofResult = proof.digest('base64');
                // client proof
                // client noise
                handshakeRespond({
                    proof: proofResult,
                    noise2: this._ss.noise2,
                });
                return 'C3';
            });
            handshake.addPath('S1', 'S2', async () => {
                let json = await handshake.getNextData({
                    proof: 'string',
                    noise2: 'string',
                });
                if (!json) return 'ERROR';

                // check client proof
                const proofCheck = Encryption.hash(this._ss.noise);
                proofCheck.update(this._ss.salt);
                proofCheck.update(this._ss.secret);
                if (proofCheck.digest('base64') !== json.proof) return 'ERROR';
                this._ss.noise2 = json.noise2;

                // send server proof
                const proof = Encryption.hash(this._ss.noise2);
                proof.update(this._ss.salt2);
                proof.update(this._ss.secret);
                handshakeRespond({
                    proof: proof.digest('base64'),
                });
                return 'ready';
            });
            handshake.addPath('C2', 'C3', async () => {
                let json = await handshake.getNextData({
                    proof: 'string',
                });
                if (!json) return 'ERROR';

                // check server proof
                const proofCheck = Encryption.hash(this._ss.noise2);
                proofCheck.update(this._ss.salt2);
                proofCheck.update(this._ss.secret);
                if (proofCheck.digest('base64') !== json.proof) return 'ERROR';
                return 'ready';
            });
            const readyFunc = async () => {
                // generate encryption key
                const salt = Encryption.hash(this._ss.noise).update(this._ss.noise2).digest('base64');
                this._ss.key = Encryption.genKey(this._ss.secret, salt);
                this.handshakeDone = true;
                handshakeRespond({
                    ready: true,
                });
                let json = await handshake.getNextData({
                    ready: 'boolean',
                });
                if (!json) return 'ERROR';
                this.targetInfo.handshakeDone = true;
                this._handshakeCallback = undefined;
                resolve(this.targetInfo);
                return 'END';
            };
            handshake.addPath('S2', 'ready', readyFunc);
            handshake.addPath('C3', 'ready', readyFunc);
            handshake.addPath('ready', 'END', () => {});

            this._handshakeCallback = (_header, data) => {
                try {
                    if (data.length > 10000) handshake.inputData(null); // no point to parse junk data
                    handshake.inputData(JSON.parse(data));
                } catch (e) {
                    handshake.inputData(null);
                }
            };
            await handshake.start(isClient ? 'C1' : 'S1');
            if (handshake.status != 'OK') reject(handshake.message);
        });
    }

    async _pingHandler() {
        if (this.options.pingInterval <= 0) return;
        this.pingCount = 0;
        do {
            this.pingReceived = false;
            this.send('ping', '');
            await sleep(this.options.pingTimeout * 1000);
            if (this.pingReceived) {
                this.pingCount = 0;
                await sleep((this.options.pingInterval - this.options.pingTimeout) * 1000);
            } else {
                this.pingCount++;
            }
        } while ((this.pingCount < this.options.pingMax || this.options.pingMax <= 0) && this.ws);
        if (this.ws) {
            this.disconnect('ping');
        }
    }

    // seems ws can send binary data directly, if needed just prepend 'JSON' to JSON data and manually seperate the binary data
    send(header: HiveSocketDataHeader, data: any) {
        if (this.options.debugRawData) this.logEvent(`[${header}] ${data}`, 'send', 'socket');
        if (!this.ws) return this.logEvent(`websocket not initiated.`, 'send', 'socket');
        if (!this.socketReady) return this.logEvent(`websocket not ready.`, 'send', 'socket');
        // if (data instanceof Error) data = data.message;
        if (typeof data != 'string') data = inspect(data, false, 4, true);
        this.ws.send(this._encodeData(`${header} ${Encryption.base64Encode(data)}`));
        return;
    }

    _recieveHandler(encoded: WebSocket.Data) {
        const decoded = this._decodeData(encoded); // decoded: header [base64 data]
        const [header, base64] = decoded.split(' ') as [HiveSocketDataHeader, string];
        const data = Encryption.base64Decode(base64);
        if (this.options.debugRawData) this.logEvent(`[${header}] ${data}`, 'recieve', 'socket');
        if (this.targetInfo.handshakeDone) {
            switch (header) {
                case 'ping':
                    this.send('pong', '');
                    break;

                case 'pong':
                    this.pingReceived = true;
                    break;

                case 'data':
                default:
                    if (this.options.serialization) {
                        let signatures: DataSignature[] = [];
                        let parsed = DataParsing(data, signatures);
                        if (this.options.debugData) this.logEvent(`${parsed}`, 'output', 'socket');
                        this.dataIO.output(parsed, signatures);
                    } else {
                        if (this.options.debugData) this.logEvent(`${data}`, 'output', 'socket');
                        this.dataIO.output(data);
                    }
            }
        } else if (this._handshakeCallback) {
            try {
                this._handshakeCallback(header, data);
            } catch (e) {
                this.logEvent(`${e}`, '_handshakeCallback', 'socket');
            }
        }
    }

    private _encodeData(data: string) {
        if (!this.targetInfo.handshakeDone) {
            return data;
        }
        if (!this._ss.key) {
            this.logEvent(`Secret key not ready!`, 'encode', 'socket');
            return '';
        }
        const rand1 = HiveSocket._randomPaddingData();
        const rand2 = HiveSocket._randomPaddingData();
        const encoded = `${rand1.length}${rand2.length}${rand1}${data}${rand2}`;
        if (this._ss.algorithm == 'aes-256-gcm') {
            const [iv, encrypted, authTag] = Encryption.encryptGCM(this._ss.key, encoded);
            return `${iv} ${encrypted} ${authTag}`;
        } else {
            const [iv, encrypted] = Encryption.encrypt(this._ss.algorithm, this._ss.key, encoded);
            const hmac = Encryption.hmac(iv, this._ss.secret);
            hmac.update(encrypted);
            return `${iv} ${encrypted} ${hmac.digest().toString('base64')}`;
        }
    }

    private _decodeData(data: WebSocket.Data) {
        if (!this.targetInfo.handshakeDone) {
            return data.toString();
        }
        try {
            const decrypted = this._decodeDataHelper(data.toString());
            if (decrypted == '') return '';
            const l1 = Number.parseInt(decrypted[0]);
            const l2 = Number.parseInt(decrypted[1]);
            const decoded = decrypted.slice(2 + l1, decrypted.length - l2);
            return decoded;
        } catch (e) {
            this.logEvent(`${e}`, 'decode', 'socket');
        }
        return '';
    }

    private _decodeDataHelper(encrypted: string) {
        if (!this._ss.key) {
            this.logEvent(`Secret key not ready!`, 'decode', 'socket');
            return '';
        }
        try {
            const tokens = encrypted.toString().split(' ');
            if (tokens.length != 3) {
                this.logEvent(`Invalid encoding format!`, 'decode', 'socket');
                return '';
            }
            if (this._ss.algorithm == 'aes-256-gcm') {
                return Encryption.decryptGCM(this._ss.key, tokens[0], tokens[1], tokens[2]);
            } else {
                const hmac = Encryption.hmac(tokens[0], this._ss.secret);
                hmac.update(tokens[1]);
                if (hmac.digest().toString('base64') != tokens[2]) {
                    this.logEvent(`HMAC authentication failed!`, 'decode', 'socket');
                    return '';
                }
                return Encryption.decrypt(this._ss.algorithm, this._ss.key, tokens[0], tokens[1]);
            }
        } catch (e) {
            this.logEvent(`${e}`, 'decode', 'socket');
        }
        return '';
    }

    private static _randomPaddingData() {
        return Encryption.randomData(4)
            .toString('base64')
            .slice(0, 2 + Math.round(Math.random() * 6));
    }
}
