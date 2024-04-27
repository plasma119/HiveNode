import { inspect } from 'util';

import WebSocket from 'ws';

import { version } from '../index.js';
import DataIO from './dataIO.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Encryption, Options, sleep, typeCheck } from '../lib/lib.js';
import HiveComponent from '../lib/component.js';
import { DataParsing, DataSerialize, DataSignature } from './hiveNet.js';

const VERSION = 'V1.1';
const BUILD = '2024-04-26';
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
type HiveSocketDataHeader = 'data' | 'buzz' | 'fuzz' | 'hive' | 'mind' | 'ready' | 'ping' | 'pong';
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
    handshakeMax: number; // handshake max retries per step
    pingInterval: number; // seconds between ping
    pingTimeout: number; // seconds to wait for timeout for ping
    pingMax: number; // numbers of failed pings before closing socket
    debug: boolean; // output debug info to stdIO
    HiveNodeName: string;
};

export const DEFAULTHIVESOCKETOPTIONS: HiveSocketOptions = {
    bufferData: true,
    serialization: true,
    connectTimeout: 20,
    handshakeTimeout: 5,
    handshakeMax: 5,
    pingInterval: 60,
    pingTimeout: 5,
    pingMax: 5,
    debug: false,
    HiveNodeName: 'null',
};

/*
    OSI model layer 3 - network layer
    TODO: controller program for advance socket control
*/
export default class HiveSocket extends HiveComponent<HiveSocketEvent> {
    options: HiveSocketOptions;
    stdIO: DataIO;
    dataIO: DataIO;
    info: SocketStatus;
    private _ss: SocketSecret;
    program: HiveCommand;

    ws?: WebSocket;
    socketHost?: SocketHost;
    socketReady: boolean = false;
    targetInfo: SocketStatus;
    handshakeDone: boolean = false;
    _handshakeCallback?: (header: HiveSocketDataHeader, data: string) => void;

    pingCount: number = 0;
    pingReceived: boolean = false;

    constructor(name: string, options?: Options<HiveSocketOptions>) {
        super(name);
        this.options = Object.assign({}, DEFAULTHIVESOCKETOPTIONS, options);
        this.stdIO = new DataIO(this, 'HiveSocket-stdIO');
        this.dataIO = new DataIO(this, 'HiveSocket-dataIO');
        this.info = Object.assign({}, DEFAULTSOCKETINFO);
        this._ss = Object.assign({}, DEFAULTSOCKETSECRET);
        this.targetInfo = Object.assign({}, DEFAULTSOCKETINFO);
        this.program = new HiveCommand('HiveSocket-Core');

        this.stdIO.passThrough(this.program.stdIO);
        this.dataIO.on(
            'input',
            (data, signatures) => {
                if (this.options.serialization) data = DataSerialize(data, signatures);
                this.sendData(data);
            },
            'write to socket'
        );
        this._init();
        this._updateInfo();
    }

    _init() {
        // const p = this.program;
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
        if (!this.ws) return this.stdIO.output(`[Info]: Socket already disconnected.`);
        this.ws.terminate(); // immediately destroys the connection
        this.ws = undefined;
        this.stdIO.output(`[Info]: Socket disconnected.${reason ? ` Reason: ${reason}` : ''}`);
        this.emit('disconnect', reason);
    }

    _connect(socket: WebSocket, isClient: boolean): Promise<SocketStatus> {
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
                this.socketReady = true;
                this.stdIO.output(`[Info]: WebSocket connected. Now exchanging secret key...`);
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
                        if (status instanceof Error) this.stdIO.output('[ERROR]: ' + status);
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
                this.stdIO.output('[ERROR]: ' + e.message);
                this.disconnect('error');
                reject(e);
            });
        });
    }

    _handshake(isClient: boolean): Promise<SocketStatus> {
        return new Promise(async (resolve, reject) => {
            const flags: { [key: string]: boolean } = {};
            let failed = false;

            const shake = async (func: () => [HiveSocketDataHeader, any], flag: string) => {
                let [header, data] = func();
                let i = 0;
                do {
                    if (this.options.debug) this.stdIO.output(`[DEBUG]: HiveSocket->shake: [${header}] for [${flag}]`);
                    this.send(header, data);
                    await sleep(this.options.handshakeTimeout * 1000);
                } while (i++ < this.options.handshakeMax && !flags[flag] && !this.targetInfo.handshakeDone && !failed);
                if (!flags[flag] && !this.targetInfo.handshakeDone && !failed) {
                    failed = true;
                    this.stdIO.output(`[ERROR]: handshake timeout: flag[${flag}]`);
                    reject(`handshake timeout: flag[${flag}]`);
                }
            };

            // client
            const buzz: () => [HiveSocketDataHeader, any] = () => {
                return [
                    'buzz',
                    JSON.stringify({
                        info: this.info,
                    }),
                ];
            };

            // server
            const fuzz: () => [HiveSocketDataHeader, any] = () => {
                this._ss.noise = Encryption.randomData().toString('base64');
                return [
                    'fuzz',
                    JSON.stringify({
                        info: this.info,
                        noise: this._ss.noise,
                    }),
                ];
            };

            // client
            const hive: () => [HiveSocketDataHeader, any] = () => {
                this._ss.noise2 = Encryption.randomData().toString('base64');
                const proof = Encryption.hash(this._ss.noise);
                proof.update(this._ss.salt);
                proof.update(this._ss.secret);
                const proofResult = proof.digest('base64');
                return [
                    'hive',
                    JSON.stringify({
                        proof: proofResult,
                        noise2: this._ss.noise2,
                    }),
                ];
            };

            // server
            const mind: () => [HiveSocketDataHeader, any] = () => {
                const proof = Encryption.hash(this._ss.noise2);
                proof.update(this._ss.salt2);
                proof.update(this._ss.secret);
                const proofResult = proof.digest('base64');
                return [
                    'mind',
                    JSON.stringify({
                        proof: proofResult,
                    }),
                ];
            };

            // both
            const ready: () => [HiveSocketDataHeader, any] = () => {
                const salt = Encryption.hash(this._ss.noise).update(this._ss.noise2).digest('base64');
                this._ss.key = Encryption.genKey(this._ss.secret, salt);
                this.handshakeDone = true;
                return ['ready', ''];
            };

            // state machine mess
            this._handshakeCallback = (header, data) => {
                if (this.options.debug) this.stdIO.output(`[DEBUG]: HiveSocket->handshakeCallback: recieved [${header}]`);
                switch (header) {
                    // both
                    case 'ready':
                        if (flags['ready']) break;
                        flags['ready'] = true;
                        this.targetInfo.handshakeDone = true;
                        this._handshakeCallback = undefined;
                        resolve(this.targetInfo);
                        break;

                    // client
                    case 'fuzz':
                        {
                            if (flags['fuzz']) break;
                            let json = this._parseJSON(data, {
                                info: 'object',
                                noise: 'string',
                            });
                            if (!json) break;
                            Object.assign(this.targetInfo, json.info);
                            this._ss.noise = json.noise;
                            flags['fuzz'] = true;
                            shake(hive, 'mind');
                        }
                        break;

                    case 'mind':
                        {
                            if (flags['mind']) break;
                            let json = this._parseJSON(data, {
                                proof: 'string',
                            });
                            if (!json) break;
                            const myproof = Encryption.hash(this._ss.noise2);
                            myproof.update(this._ss.salt2);
                            myproof.update(this._ss.secret);
                            if (myproof.digest('base64') == json.proof) {
                                flags['mind'] = true;
                                shake(ready, 'ready');
                            }
                        }
                        break;

                    // server
                    case 'buzz':
                        {
                            if (flags['buzz']) break;
                            let json = this._parseJSON(data, {
                                info: 'object',
                            });
                            if (!json) break;
                            Object.assign(this.targetInfo, json.info);
                            flags['buzz'] = true;
                            shake(fuzz, 'hive');
                        }
                        break;

                    case 'hive':
                        {
                            if (flags['hive']) break;
                            let json = this._parseJSON(data, {
                                proof: 'string',
                                noise2: 'string',
                            });
                            if (!json) break;
                            const myproof = Encryption.hash(this._ss.noise);
                            myproof.update(this._ss.salt);
                            myproof.update(this._ss.secret);
                            if (myproof.digest('base64') == json.proof) {
                                this._ss.noise2 = json.noise2;
                                flags['hive'] = true;
                                shake(mind, 'ready');
                                shake(ready, 'ready');
                            }
                        }
                        break;
                }
            };

            // client start handshake sequence
            if (isClient) shake(buzz, 'fuzz');
        });
    }

    // for _handshake only
    _parseJSON(data: string, structure: any) {
        try {
            if (data.length > 10000) return null; // no point to parse junk data
            const obj = JSON.parse(data);
            if (!typeCheck(obj, structure)) return null;
            return obj;
        } catch (e) {
            return null;
        }
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
        if (!this.ws) {
            this.stdIO.output(`[ERROR]: No target.`);
            return;
        }
        if (!this.socketReady) {
            this.stdIO.output(`[ERROR]: Socket not ready.`);
            return;
        }
        if (data instanceof Error) data = data.message;
        if (typeof data != 'string') data = inspect(data, false, 4, true);
        this.ws.send(this._encodeData(`${header} ${Encryption.base64Encode(data)}`));
        return;
    }

    sendData(data: any) {
        this.send('data', data);
    }

    _recieveHandler(encoded: WebSocket.Data) {
        const decoded = this._decodeData(encoded); // decoded: header [base64 data]
        const [header, base64] = decoded.split(' ') as [HiveSocketDataHeader, string];
        const data = Encryption.base64Decode(base64);
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
                        this.dataIO.output(parsed, signatures);
                    } else {
                        this.dataIO.output(data);
                    }
            }
        } else if (this._handshakeCallback) {
            try {
                this._handshakeCallback(header, data);
            } catch (e) {
                this.stdIO.output(e);
            }
        }
    }

    private _encodeData(data: string) {
        if (this.options.debug) this.stdIO.output(`[DEBUG]: HiveSocket->_encodeData: ${data}`);
        if (!this.targetInfo.handshakeDone) {
            return data;
        }
        if (!this._ss.key) {
            this.stdIO.output(`[ERROR]: Encoding failed. Secret key not ready`);
            return '';
        }
        const rand1 = HiveSocket._randomPaddingData();
        const rand2 = HiveSocket._randomPaddingData();
        const encoded = `${rand1.length}${rand2.length}${rand1}${data}${rand2}`;
        //if (this.options.debug) this.stdIO.output(`[DEBUG]: HiveSocket->_encodeData: partially encoded data: ${encoded}`);
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
        if (this.options.debug) this.stdIO.output(`[DEBUG]: HiveSocket->_decodeData: ${data}`);
        if (!this.targetInfo.handshakeDone) {
            return data.toString();
        }
        try {
            const decrypted = this._decodeDataHelper(data.toString());
            if (decrypted == '') return '';
            const l1 = Number.parseInt(decrypted[0]);
            const l2 = Number.parseInt(decrypted[1]);
            const decoded = decrypted.slice(2 + l1, decrypted.length - l2);
            if (this.options.debug) this.stdIO.output(`[DEBUG]: HiveSocket->_decodeData: decoded data: ${decoded}`);
            return decoded;
        } catch (e) {
            this.stdIO.output(`[ERROR]: Failed to decrypt data.`);
            this.stdIO.output(e);
        }
        return '';
    }

    private _decodeDataHelper(encrypted: string) {
        if (!this._ss.key) {
            this.stdIO.output(`[ERROR]: Decoding failed. Secret key not ready`);
            return '';
        }
        try {
            const tokens = encrypted.toString().split(' ');
            if (tokens.length != 3) {
                this.stdIO.output(`[ERROR]: Incorrect encoded data format.`);
                return '';
            }
            if (this._ss.algorithm == 'aes-256-gcm') {
                return Encryption.decryptGCM(this._ss.key, tokens[0], tokens[1], tokens[2]);
            } else {
                const hmac = Encryption.hmac(tokens[0], this._ss.secret);
                hmac.update(tokens[1]);
                if (hmac.digest().toString('base64') != tokens[2]) {
                    this.stdIO.output(`[ERROR]: Data authentication failed.`);
                    return '';
                }
                return Encryption.decrypt(this._ss.algorithm, this._ss.key, tokens[0], tokens[1]);
            }
        } catch (e) {
            this.stdIO.output(`[ERROR]: Failed to decrypt data.`);
            this.stdIO.output(e);
        }
        return '';
    }

    private static _randomPaddingData() {
        return Encryption.randomData(4)
            .toString('base64')
            .slice(0, 2 + Math.round(Math.random() * 6));
    }
}
