import { inspect } from 'util';

import WebSocket from 'ws';

import { version } from '../index.js';
import DataIO from './dataIO.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Encryption, sleep, typeCheck } from '../lib/lib.js';
import HiveComponent from '../lib/component.js';

export type SocketInfo = {
    name: string;
    version: string;
    handShakeDone: boolean;
};

const DEFAULTSOCKETINFO: SocketInfo = {
    name: 'unknown',
    version: 'unknwon',
    handShakeDone: false,
};

type SocketSecret = {
    algorithm: string;
    noise: string;
    noise2: string;
    salt: string;
    salt2: string;
    secret: string;
    key?: Buffer;
};

const DEFAULTSOCKETSECRET: SocketSecret = {
    algorithm: 'aes-256-ctr',
    noise: '',
    noise2: '',
    salt: 'cake',
    salt2: 'lie',
    secret: '',
};

/*
    OSI model layer 3 - network layer
    TODO: decoder program for advance socket control
*/
export default class HiveSocket extends HiveComponent {
    stdIO: DataIO;
    dataIO: DataIO;
    info: SocketInfo;
    private _ss: SocketSecret;
    program: HiveCommand;
    decoder: HiveCommand;

    ws?: WebSocket;
    targetInfo: SocketInfo;
    handShakeDone: boolean = false;
    _handShakeCallback?: (header: string, data: string) => void;

    constructor(name: string) {
        super(name);
        this.stdIO = new DataIO(this, 'HiveSocket-stdIO');
        this.dataIO = new DataIO(this, 'HiveSocket-dataIO');
        this.info = Object.create(DEFAULTSOCKETINFO);
        this._ss = Object.create(DEFAULTSOCKETSECRET);
        this.targetInfo = Object.create(DEFAULTSOCKETINFO);
        this.program = new HiveCommand('HiveSocket-Core');
        this.decoder = new HiveCommand('HiveSocket-Decoder');

        this.stdIO.passThrough(this.program.stdIO);
        this.dataIO.on('input', (data) => this.send(data));
        this.init();
        this.updateInfo();
    }

    init() {
        //const d = this.decoder;
    }

    updateInfo() {
        this.info.name = this.name;
        this.info.version = version;
    }

    setSecret(secret: string) {
        this._ss.secret = Encryption.hash(secret).digest('base64');
    }

    // client socket
    new(host: string, port: string | number): Promise<SocketInfo> {
        if (this.ws) this.disconnect();
        this.ws = new WebSocket(`ws://${host}:${port}`);
        return this._connect(this.ws, true);
    }

    // server socket
    use(socket: WebSocket): Promise<SocketInfo> {
        if (this.ws) this.disconnect();
        this.ws = socket;
        return this._connect(socket, false);
    }

    disconnect() {
        if (!this.ws) return;
        this.ws.close();
        this.ws = undefined;
    }

    _connect(socket: WebSocket, isClient: boolean): Promise<SocketInfo> {
        this.updateInfo();
        this._ss = Object.create(DEFAULTSOCKETSECRET);
        this.targetInfo = Object.create(DEFAULTSOCKETINFO);
        this.handShakeDone = false;

        return new Promise(async (resolve, reject) => {
            const ready = async () => {
                this.stdIO.output(`WebSocket Connected. Now exchanging secret key...`);
                this._handShake(isClient)
                    .then((info) => {
                        resolve(info);
                    })
                    .catch((status) => {
                        this._handShakeCallback = undefined;
                        reject(typeof status == 'string' ? status : 'HandShake failed.');
                    });
            };
            socket.on('message', this._recieveHandler.bind(this));
            socket.on('error', (e) => {
                this.stdIO.output(e.message);
                this.ws = undefined;
                reject(e);
            });
            if (isClient) {
                socket.on('open', ready);
            } else {
                ready();
            }
        });
    }

    _handShake(isClient: boolean): Promise<SocketInfo> {
        return new Promise(async (resolve, reject) => {
            const flags: { [key: string]: boolean } = {};

            const shake = async (func: () => [string, any], flag: string) => {
                let [header, data] = func();
                let i = 0;
                do {
                    //console.log(`shake :[${header}] for [${flag}]`); // DEBUG
                    this._send(header, data);
                    await sleep(1000);
                } while (i++ < 10 && !flags[flag] && !this.targetInfo.handShakeDone);
                if (!flags[flag] && !this.targetInfo.handShakeDone) {
                    this.stdIO.output(`ERROR: HandShake timeout: flag[${flag}]`);
                    reject(`HandShake timeout: flag[${flag}]`);
                }
            };

            // client
            const buzz: () => [string, any] = () => {
                return [
                    'buzz',
                    JSON.stringify({
                        info: this.info,
                    }),
                ];
            };

            // server
            const fuzz: () => [string, any] = () => {
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
            const hive: () => [string, any] = () => {
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
            const mind: () => [string, any] = () => {
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
            const ready: () => [string, any] = () => {
                const salt = Encryption.hash(this._ss.noise).update(this._ss.noise).digest('base64');
                this._ss.key = Encryption.genKey(this._ss.secret, salt);
                this.handShakeDone = true;
                return ['ready', ''];
            };

            this._handShakeCallback = (header, data) => {
                // this.stdIO.output(`DEBUG: recieved: ${header}`);
                // console.log(`recieved: [${header}]`); // debug
                switch (header) {
                    // both
                    case 'ready':
                        if (flags['ready']) break;
                        flags['ready'] = true;
                        this.targetInfo.handShakeDone = true;
                        this._handShakeCallback = undefined;
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

            // client start handShake sequence
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

    send(data: any) {
        // todo: use HiveProgram somewhere to set correct header
        this._send('data', data);
    }

    _send(header: string, data: any) {
        if (!this.ws) {
            this.stdIO.output(`ERROR: No target`);
            return;
        }
        if (data instanceof Error) data = data.message;
        if (typeof data != 'string') data = inspect(data, false, 2, true);
        this.ws.send(this._encodeData(`${header} ${Encryption.base64Encode(data)}`));
        return;
    }

    _recieveHandler(encoded: WebSocket.Data) {
        const decoded = this._decodeData(encoded); // decoded: header [base64 data]
        const [header, base64] = decoded.split(' ');
        const data = Encryption.base64Decode(base64);
        if (this.targetInfo.handShakeDone) {
            // todo: use HiveProgram to decode header
            this.dataIO.output(data); // placeholder
        } else if (this._handShakeCallback) {
            try {
                this._handShakeCallback(header, data);
            } catch (e) {
                this.stdIO.output(e);
            }
        }
    }

    private _encodeData(data: string) {
        //this.stdIO.output(`DEBUG: encode ${data}`);
        if (!this.targetInfo.handShakeDone) {
            return data;
        }
        if (!this._ss.key) {
            this.stdIO.output(`ERROR: Encoding failed. Secret key not ready`);
            return '';
        }
        const [iv, encrypted] = Encryption.encrypt(this._ss.algorithm, this._ss.key, data);
        const hmac = Encryption.hmac(iv, this._ss.secret);
        hmac.update(encrypted);
        return `${iv} ${encrypted} ${hmac.digest().toString('base64')}`;
    }

    private _decodeData(data: WebSocket.Data) {
        //this.stdIO.output(`DEBUG: decode ${data}`);
        if (!this.targetInfo.handShakeDone) {
            return data.toString();
        }
        if (!this._ss.key) {
            this.stdIO.output(`ERROR: Decoding failed. Secret key not ready`);
            return '';
        }
        const tokens = data.toString().split(' ');
        try {
            if (tokens.length != 3) {
                this.stdIO.output(`ERROR: Incorrect encoded data format.`);
                return '';
            }
            const hmac = Encryption.hmac(tokens[0], this._ss.secret);
            hmac.update(tokens[1]);
            if (hmac.digest().toString('base64') != tokens[2]) {
                this.stdIO.output(`ERROR: Data corrupted.`);
                return '';
            }
            const decrypted = Encryption.decrypt(this._ss.algorithm, this._ss.key, tokens[0], tokens[1]);
            return decrypted;
        } catch (e) {
            this.stdIO.output(`ERROR: Failed to decrypt data.`);
            this.stdIO.output(e);
        }
        return '';
    }
}
