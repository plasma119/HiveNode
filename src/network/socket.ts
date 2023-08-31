import { inspect } from 'util';

import WebSocket from 'ws';

import { version } from '../index.js';
import DataIO from './dataIO.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Encryption, Options, sleep, typeCheck } from '../lib/lib.js';
import HiveComponent from '../lib/component.js';

export type SocketInfo = {
    name: string;
    version: string;
    handshakeDone: boolean;
};

const DEFAULTSOCKETINFO: SocketInfo = {
    name: 'unknown',
    version: 'unknwon',
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
const DEFAULTSOCKETSECRET: SocketSecret = {
    algorithm: 'aes-256-gcm',
    noise: '',
    noise2: '',
    salt: 'salt',
    salt2: 'salt2',
    secret: 'nothing',
};

type HiveSocketDataHeader = 'data' | 'buzz' | 'fuzz' | 'hive' | 'mind' | 'ready' | 'ping' | 'pong';

type HiveSocketEvent = {
    socketClosed: () => void;
};

// TODO: auto reconnect, buffer data
export type HiveSocketOptions = {
    bufferData: boolean; // buffer data packets if socket not ready
    connectTimeout: number; // seconds to wait for timeout for connect attempts
    handshakeTimeout: number;
    handshakeMax: number;
    pingInterval: number; // seconds between ping
    pingTimeout: number; // seconds to wait for timeout for ping
    pingMax: number; // numbers of failed pings before closing socket
    reconnectInterval: number; // seconds to wait between reconnect attempts
    reconnectMax: number; // numbers of reconnect attempts before timeout, reset after success
    debug: boolean; // output debug info to stdIO
};

const DEFAULTHIVESOCKETOPTIONS: HiveSocketOptions = {
    bufferData: true,
    connectTimeout: 20,
    handshakeTimeout: 5,
    handshakeMax: 5,
    pingInterval: 300,
    pingTimeout: 10,
    pingMax: 5,
    reconnectInterval: 20,
    reconnectMax: 5,
    debug: false,
};

/*
    OSI model layer 3 - network layer
    TODO: decoder program for advance socket control
*/
export default class HiveSocket extends HiveComponent<HiveSocketEvent> {
    options: HiveSocketOptions;
    stdIO: DataIO;
    dataIO: DataIO;
    info: SocketInfo;
    private _ss: SocketSecret;
    program: HiveCommand;

    ws?: WebSocket;
    socketReady: boolean = false;
    targetInfo: SocketInfo;
    handshakeDone: boolean = false;
    _handshakeCallback?: (header: HiveSocketDataHeader, data: string) => void;

    pingCount: number = 0;
    pingReceived: boolean = false;
    reconnectCount: number = 0;
    reconnect: boolean = true;

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
        this.dataIO.on('input', (data) => this.sendData(data));
        this._init();
        this.updateInfo();
    }

    _init() {
        //const d = this.decoder;
    }

    updateInfo() {
        this.info.name = this.name;
        this.info.version = version;
    }

    setSecret(secret: string, salt: string, salt2: string) {
        const pepper = '458f4a35dd57';
        this._ss.secret = Encryption.hash(secret).update(pepper).digest('base64');
        this._ss.salt = Encryption.hash(salt).update(pepper).digest('base64');
        this._ss.salt2 = Encryption.hash(salt2).update(pepper).digest('base64');
    }

    // client socket
    new(host: string, port: string | number): Promise<SocketInfo> {
        if (this.ws) this._disconnect();
        this.ws = new WebSocket(`ws://${host}:${port}`);
        return this._connect(this.ws, true);
    }

    // server socket
    use(socket: WebSocket): Promise<SocketInfo> {
        if (this.ws) this._disconnect();
        this.ws = socket;
        return this._connect(socket, false);
    }

    disconnect(reason?: string) {
        this.reconnect = false;
        this._disconnect(reason);
    }

    _disconnect(reason?: string) {
        this.socketReady = false;
        if (!this.ws) return this.stdIO.output(`Socket already disconnected.`);
        this.ws.terminate(); // immediately destroys the connection
        this.ws = undefined;
        this.stdIO.output(`Socket disconnected.${reason ? ` Reason: ${reason}` : ''}`);
        // TODO: reconnect
    }

    _connect(socket: WebSocket, isClient: boolean): Promise<SocketInfo> {
        this.updateInfo();
        this._ss.noise = '';
        this._ss.noise2 = '';
        this.targetInfo = Object.assign({}, DEFAULTSOCKETINFO);
        this.socketReady = false;
        this.handshakeDone = false;

        return new Promise(async (resolve, reject) => {
            if (this.options.connectTimeout > 0) {
                setTimeout(() => {
                    if (!this.socketReady) {
                        this._disconnect('Socket timeout.');
                        reject('Socket timeout.');
                    }
                }, this.options.connectTimeout * 1000);
            }
            let onReady = async () => {
                this.socketReady = true;
                this.stdIO.output(`WebSocket connected. Now exchanging secret key...`);
                this._handshake(isClient)
                    .then((info) => {
                        this._pingHandler();
                        resolve(info);
                    })
                    .catch((status) => {
                        this._handshakeCallback = undefined;
                        if (status instanceof Error) this.stdIO.output(status);
                        let reason = typeof status == 'string' ? status : 'handshake failed.';
                        this._disconnect(reason);
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
                this.stdIO.output(e.message);
                this._disconnect('Socket error.');
                reject(e);
            });
            socket.on('close', () => {
                this.emit('socketClosed');
            });
        });
    }

    _handshake(isClient: boolean): Promise<SocketInfo> {
        return new Promise(async (resolve, reject) => {
            const flags: { [key: string]: boolean } = {};
            let failed = false;

            const shake = async (func: () => [HiveSocketDataHeader, any], flag: string) => {
                let [header, data] = func();
                let i = 0;
                do {
                    //console.log(`shake :[${header}] for [${flag}]`); // DEBUG
                    this.send(header, data);
                    await sleep(this.options.handshakeTimeout * 1000);
                } while (i++ < this.options.handshakeMax && !flags[flag] && !this.targetInfo.handshakeDone && !failed);
                if (!flags[flag] && !this.targetInfo.handshakeDone && !failed) {
                    failed = true;
                    this.stdIO.output(`ERROR: handshake timeout: flag[${flag}]`);
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

            this._handshakeCallback = (header, data) => {
                // this.stdIO.output(`DEBUG: recieved: ${header}`);
                // console.log(`recieved: [${header}]`); // debug
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

    _parseJSON(data: string, structure: any) {
        try {
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
            this._disconnect('Target not responsive.');
        }
    }

    // seems ws can send binary data directly, if needed just prepend 'JSON' to JSON data and manually seperate the binary data
    send(header: HiveSocketDataHeader, data: any) {
        if (!this.ws) {
            this.stdIO.output(`ERROR: No target.`);
            return;
        }
        if (!this.socketReady) {
            this.stdIO.output(`ERROR: Socket not ready.`);
            return;
        }
        if (data instanceof Error) data = data.message;
        if (typeof data != 'string') data = inspect(data, false, 2, true);
        this.ws.send(this._encodeData(`${header} ${Encryption.base64Encode(data)}`));
        return;
    }

    sendData(data: any) {
        // todo: use HiveProgram somewhere to set correct header
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
                    this.dataIO.output(data);
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
        if (this.options.debug) this.stdIO.output(`DEBUG: encode: ${data}`);
        if (!this.targetInfo.handshakeDone) {
            return data;
        }
        if (!this._ss.key) {
            this.stdIO.output(`ERROR: Encoding failed. Secret key not ready`);
            return '';
        }
        const rand1 = HiveSocket._randomPaddingData();
        const rand2 = HiveSocket._randomPaddingData();
        const encoded = `${rand1.length}${rand2.length}${rand1}${data}${rand2}`;
        //if (this.options.debug) this.stdIO.output(`DEBUG: encoded: ${encoded}`);
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
        if (this.options.debug) this.stdIO.output(`DEBUG: decode: ${data}`);
        if (!this.targetInfo.handshakeDone) {
            return data.toString();
        }
        try {
            const decrypted = this._decodeDataHelper(data.toString());
            if (decrypted == '') return '';
            const l1 = Number.parseInt(decrypted[0]);
            const l2 = Number.parseInt(decrypted[1]);
            const decoded = decrypted.slice(2 + l1, decrypted.length - l2);
            if (this.options.debug) this.stdIO.output(`DEBUG: decoded data: ${decoded}`);
            return decoded;
        } catch (e) {
            this.stdIO.output(`ERROR: Failed to decrypt data.`);
            this.stdIO.output(e);
        }
        return '';
    }

    private _decodeDataHelper(encrypted: string) {
        if (!this._ss.key) {
            this.stdIO.output(`ERROR: Decoding failed. Secret key not ready`);
            return '';
        }
        try {
            const tokens = encrypted.toString().split(' ');
            if (tokens.length != 3) {
                this.stdIO.output(`ERROR: Incorrect encoded data format.`);
                return '';
            }
            if (this._ss.algorithm == 'aes-256-gcm') {
                return Encryption.decryptGCM(this._ss.key, tokens[0], tokens[1], tokens[2]);
            } else {
                const hmac = Encryption.hmac(tokens[0], this._ss.secret);
                hmac.update(tokens[1]);
                if (hmac.digest().toString('base64') != tokens[2]) {
                    this.stdIO.output(`ERROR: Data authentication failed.`);
                    return '';
                }
                return Encryption.decrypt(this._ss.algorithm, this._ss.key, tokens[0], tokens[1]);
            }
        } catch (e) {
            this.stdIO.output(`ERROR: Failed to decrypt data.`);
            this.stdIO.output(e);
        }
        return '';
    }

    private static _randomPaddingData() {
        return Encryption.randomData(4).toString('base64').slice(0, 2 + Math.round(Math.random() * 6));
    }
}
