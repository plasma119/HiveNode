
import { inspect } from 'util';

import WebSocket from 'ws';

import { version } from '../index.js';
import DataIO from './dataIO.js';
import HiveProgram from '../lib/hiveProgram.js';
import { Encryption, sleep } from '../lib/lib.js';

export type SocketInfo = {
    name: string
    version: string
    handShakeDone: boolean
}

const DEFAULTSOCKETINFO: SocketInfo = {
    name: 'unknown',
    version: 'unknwon',
    handShakeDone: false
}

export type SocketSecret = {
    algorithm: string;
    noise: string;
    noise2: string;
    salt: string;
    salt2: string;
    secret: string;
    key?: Buffer;
}

const DEFAULTSOCKETSECRET: SocketSecret = {
    algorithm: "aes-256-ctr",
    noise: '',
    noise2: '',
    salt: 'cake',
    salt2: 'lie',
    secret: ''
}

export default class HiveSocket {
    name: string;
    stdIO: DataIO;
    dataIO: DataIO;
    info: SocketInfo;
    private _ss: SocketSecret;
    program: HiveProgram;
    decoder: HiveProgram;

    ws?: WebSocket;
    targetInfo: SocketInfo;
    handShakeDone: boolean = false;
    _handShakeCallback?: (header: string, data: string) => void;

    constructor(name: string) {
        this.name = name;
        this.stdIO = new DataIO(this, 'HiveSocket-stdIO');
        this.dataIO = new DataIO(this, 'HiveSocket-dataIO');
        this.info = Object.create(DEFAULTSOCKETINFO);
        this._ss = Object.create(DEFAULTSOCKETSECRET);
        this.targetInfo = Object.create(DEFAULTSOCKETINFO);
        this.program = new HiveProgram('HiveSocket-Core');
        this.decoder = new HiveProgram('HiveSocket-Decoder');

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

    new(host: string, port: string | number): Promise<HiveSocket> {
        if (this.ws) this.disconnect();
        this.ws = new WebSocket(`ws://${host}:${port}`);
        return this._connect(this.ws, true);
    }

    use(socket: WebSocket): Promise<HiveSocket> {
        if (this.ws) this.disconnect();
        this.ws = socket;
        return this._connect(socket, false);
    }

    disconnect() {
        if (!this.ws) return;
        this.ws.close();
        this.ws = undefined;
    }

    _connect(socket: WebSocket, newConnection: boolean): Promise<HiveSocket> {
        this.updateInfo();
        this._ss = Object.create(DEFAULTSOCKETSECRET);
        this.targetInfo = Object.create(DEFAULTSOCKETINFO);
        this.handShakeDone = false;

        return new Promise(async (resolve, reject) => {
            const ready = async () => {
                this.stdIO.output(`WebSocket Connected. Now exchanging secret key...`);
                await this._handShake(newConnection).catch(() => {
                    this._handShakeCallback = undefined;
                    reject();
                });
                return resolve(this);
            }
            socket.on('message', this._recieveHandler.bind(this));
            socket.on('error', (e) => {
                this.stdIO.output(e.message);
                this.ws = undefined;
                return reject();
            });
            if (newConnection) {
                socket.on('open', ready);
            } else {
                ready();
            }
        });
    }

    _handShake(startHandshake: boolean): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const flags: {[key: string]: boolean} = {};

            const shake = async (func: Function, flag: string) => {
                let i = 0;
                while (i++ < 5 && !flags[flag] && !this.targetInfo.handShakeDone) {
                    func();
                    await sleep(1000);
                }
                if (!flags[flag] && !this.targetInfo.handShakeDone) {
                    this.stdIO.output(`ERROR: HandShake timeout`);
                    reject();
                }
            }

            const buzz = () => {
                this._send('buzz', JSON.stringify({
                    info: this.info
                }));
            }
            const fuzz = () => {
                this._ss.noise = Encryption.randomData().toString('base64');
                this._send('fuzz', JSON.stringify({
                    info: this.info,
                    noise: this._ss.noise
                }));
            }
            const hive = () => {
                this._ss.noise2 = Encryption.randomData().toString('base64');
                const proof = Encryption.hash(this._ss.noise);
                proof.update(this._ss.salt);
                proof.update(this._ss.secret);
                this._send('hive', JSON.stringify({
                    proof: proof.digest('base64'),
                    noise2: this._ss.noise2
                }));
            }
            const mind = () => {
                const proof = Encryption.hash(this._ss.noise2);
                proof.update(this._ss.salt2);
                proof.update(this._ss.secret);
                this._send('mind', JSON.stringify({
                    proof: proof.digest('base64')
                }));
            }
            const ready = () => {
                const salt = Encryption.hash(this._ss.noise).update(this._ss.noise).digest('base64');
                this._ss.key = Encryption.genKey(this._ss.secret, salt);
                this.handShakeDone = true;
                this._send('ready', '');
            }

            this._handShakeCallback = (header, data) => {
                // this.stdIO.output(`DEBUG: recieved: ${header}`);
                switch(header) {
                    case 'ready':
                        flags['ready'] = true;
                        this.targetInfo.handShakeDone = true;
                        this._handShakeCallback = undefined;
                        resolve();
                        break;

                    // client
                    case 'fuzz':
                        {
                            let json = this._parseJSON(data);
                            if (typeof json != 'object') break;
                            let info = json.info
                            let noise = json.noise
                            if (typeof info == 'object' && typeof noise == 'string') {
                                Object.assign(this.targetInfo, info);
                                this._ss.noise = noise;
                                flags['fuzz'] = true;
                                shake(hive, 'mind');
                            }
                        }
                        break;

                    case 'mind':
                        {
                            let json = this._parseJSON(data);
                            if (typeof json != 'object') break;
                            let proof = json.proof;
                            if (typeof proof == 'string') {
                                const myproof = Encryption.hash(this._ss.noise2);
                                myproof.update(this._ss.salt2);
                                myproof.update(this._ss.secret);
                                if (myproof.digest('base64') == proof) {
                                    flags['mind'] = true;
                                    shake(ready, 'ready');
                                }
                            }
                        }
                        break;

                    // server
                    case 'buzz':
                        {
                            let json = this._parseJSON(data);
                            if (typeof json != 'object') break;
                            let info = json.info;
                            if (typeof info == 'object') Object.assign(this.targetInfo, info);
                            flags['buzz'] = true;
                            shake(fuzz, 'hive');
                        }
                        break;

                    case 'hive':
                        {
                            let json = this._parseJSON(data);
                            if (typeof json != 'object') break;
                            let proof = json.proof;
                            let noise2 = json.noise2;
                            if (typeof proof == 'string' && typeof noise2 == 'string') {
                                const myproof = Encryption.hash(this._ss.noise);
                                myproof.update(this._ss.salt);
                                myproof.update(this._ss.secret);
                                if (myproof.digest('base64') == proof) {
                                    this._ss.noise2 = noise2;
                                    flags['hive'] = true;
                                    shake(mind, 'ready');
                                    shake(ready, 'ready');
                                }
                            }
                        }
                        break;
                }
            }
            if (startHandshake) shake(buzz, 'fuzz');
        });
    }

    _parseJSON(data: string) {
        try {
            return JSON.parse(data);
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
            } catch(e) {
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

