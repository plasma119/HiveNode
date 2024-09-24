import { WebSocketServer } from 'ws';

import HiveCommand from '../../lib/hiveCommand.js';
import { format, sleep } from '../../lib/lib.js';
import { DataTransformer } from '../../network/dataIO.js';
import {
    // DataParsing,
    // DataSerialize,
    DataSignaturesToString,
    HIVENETADDRESS,
    HiveNetDeviceInfo,
    HiveNetPacket,
    HIVENETPORT,
} from '../../network/hiveNet.js';
import HiveSocket from '../../network/socket.js';
import HiveNetSwitch from '../../network/switch.js';
import HiveProcess from '../process.js';
import HiveProcessTerminal from './terminal.js';

export default class HiveProcessNet extends HiveProcess {
    infoMap: Map<string, { timestamp: number; info: HiveNetDeviceInfo }> = new Map();
    nameMap: Map<string, string> = new Map(); // Map<name, UUID>

    switch: HiveNetSwitch = new HiveNetSwitch(this.os.name);
    server?: WebSocketServer;
    sshServer?: WebSocketServer;

    initProgram() {
        const program = new HiveCommand('net', 'HiveNet Commands');

        // message
        this.os.HTP.listen(HIVENETPORT.MESSAGE, (packet, signatures) => {
            this.os.stdIO.output(packet.data, signatures);
        });
        program
            .addNewCommand('message', 'message target node')
            .addNewArgument('<target>', 'target UUID or name')
            .addNewArgument('<text...>', 'message to send')
            .setAction(async (args, _opts, info) => {
                let uuid = await this.resolveUUID(args['target'], info.reply);
                if (!uuid) return;
                this.message(uuid, args['text']);
                return 'Message sent.';
            });

        // ping
        this.os.HTP.listen(HIVENETPORT.PING, () => {
            return new HiveNetPacket({ data: Date.now() });
        });
        program
            .addNewCommand('ping', 'ping target node')
            .addNewArgument('<target>', 'target UUID or name')
            .setAction(async (args, _opts, info) => {
                let uuid = await this.resolveUUID(args['target'], info.reply);
                if (!uuid) return;
                let result = await this.ping(uuid);
                if (typeof result == 'string') return result;
                let [rt, ht] = result;
                return `Round trip: ${rt}ms, Half trip: ${ht}ms`;
            });

        // info
        this.os.HTP.listen(HIVENETPORT.INFO, () => this.os.getDeviceInfo());
        program
            .addNewCommand('info', 'get node device info')
            .addNewArgument('[target]', 'target UUID or name')
            .setAction(async (args, _opts, info) => {
                if (!args['target']) {
                    return this.os.getDeviceInfo();
                }
                let uuid = await this.resolveUUID(args['target'], info.reply);
                if (!uuid) return;
                let targetInfo = await this.getInfo(uuid);
                if (targetInfo) return targetInfo;
                return 'Failed to get target device info.';
            });

        // view
        program
            .addNewCommand('view', 'display current connected hiveNet nodes')
            .addNewOption('-detail', 'display data signatures')
            .setAction((_, opts) => this.netview(!!opts['-detail']));

        // view
        program
            .addNewCommand('resolveUUID', 'resolve UUID for target server')
            .addNewArgument('<server>', 'server name')
            .setAction((args) => this.resolveUUID(args['server']));

        // connect
        program
            .addNewCommand('connect', 'new HiveNet connection')
            .addNewArgument('<host>', 'host to connect')
            .addNewOption('-port <port>', 'port to connect', HIVENETPORT.HIVENETPORT)
            .setAction(async (args, opts) => {
                await this.connect(args['host'], typeof opts['-port'] == 'string' ? Number.parseInt(opts['-port']) : HIVENETPORT.HIVENETPORT);
                return 'Connected.';
            });

        // listen
        program
            .addNewCommand('listen', 'enable HiveNet connection')
            .addNewOption('-port <port>', 'port to listen', HIVENETPORT.HIVENETPORT)
            .setAction((_args, opts) => {
                this.listen(typeof opts['-port'] == 'string' ? Number.parseInt(opts['-port']) : HIVENETPORT.HIVENETPORT);
                return;
            });

        // ssh
        program
            .addNewCommand('ssh', 'remote shell directly to target node')
            .addNewArgument('<host>', 'target ip address')
            .addNewArgument('<port>', 'target port number')
            .setAction((args) => {
                this.connect(args['host'], args['port'], true);
                return;
            });

        // ssh-server
        program
            .addNewCommand('ssh-server', 'enable remote shell access')
            .addNewArgument('<port>', 'port number')
            .setAction((args) => {
                this.listen(args['port'], true);
                return;
            });

        this.os.registerShellProgram(program);
        return program;
    }

    main() {
        this.os.netInterface.connect(this.switch, 'net');
    }

    // TODO: resolve fail seems to be stuck
    async resolveUUID(target: string, reply?: (message: any) => void) {
        // TODO: figure out how to deal with disconnected target
        // let uuid = target.startsWith('UUID') ? target : this.nameMap.get(target);
        let uuid: string | undefined = target;
        if (reply) reply('Resolving target UUID...');
        await this.netview();
        uuid = this.nameMap.get(target);
        if (!uuid) {
            if (reply) reply('Target not found.');
            return null;
        }
        if (reply) reply(`Resolved UUID: ${uuid}`);
        return uuid;
    }

    message(dest: string, data: any) {
        this.os.HTP.send(data, dest, HIVENETPORT.MESSAGE);
    }

    // return [roundtrip time, first half-trip time]
    ping(dest: string, options: { timeout?: number; dport?: number } = {}): Promise<string | number[]> {
        return new Promise((resolve) => {
            if (!options.timeout) options.timeout = 3000;
            if (!options.dport) options.dport = HIVENETPORT.PING;
            let timeout = false;
            let t1 = Date.now();

            let timer = setTimeout(() => {
                timeout = true;
                resolve('Timeout');
            }, options.timeout);

            this.os.HTP.sendAndReceiveOnce('ping', dest, options.dport, { ping: true })
                .then((data) => {
                    if (timeout) return;
                    clearTimeout(timer);
                    resolve([Date.now() - t1, data.data - t1]); //[roundtrip time, first half-trip time]
                })
                .catch(() => resolve('Error'));
        });
    }

    getInfo(UUID: string, noCache: boolean = false): Promise<{ timestamp: number; info: HiveNetDeviceInfo } | null> {
        return new Promise(async (resolve) => {
            let resolved = false;
            let result = this.infoMap.get(UUID);
            if (result && !noCache) {
                // in cache
                resolve(result);
                resolved = true;
                return;
            }

            sleep(10000).then(() => {
                // failed to resolve
                if (resolved) return;
                resolve(null);
                resolved = true;
            });

            // try to resolve through HiveNet
            const data = await this.os.HTP.sendAndReceiveOnce('', UUID, HIVENETPORT.INFO).catch(() => resolve(null));
            if (resolved || !data) return;
            result = {
                timestamp: Date.now(),
                info: data.data,
            };
            this.infoMap.set(UUID, result);
            this.nameMap.set(result.info.name, UUID);
            resolve(result);
            resolved = true;
        });
    }

    async netview(detail: boolean = false) {
        let list: string[][] = [];
        let t = Date.now();

        let port = this.os.HTP.listen(this.os.netInterface.newRandomPortNumber(), async (packet, signatures) => {
            let info = (await this.getInfo(packet.src, true))?.info;
            let time = Date.now() - t;
            if (!info)
                info = {
                    name: 'unknown',
                    UUID: packet.src,
                    type: 'unknown',
                    HiveNodeVersion: 'unknown',
                };
            if (detail) {
                list.push([`${info.name}[${packet.src}]:`, `${info.type}`, `${time}ms`, DataSignaturesToString(signatures)]);
            } else {
                list.push([`${info.name}:`, `${info.type}`, `${time}ms`, `${info.UUID}`]);
            }
        });

        // TODO: figure out how to fix the 3s delay to output
        port.input(new HiveNetPacket({ data: 'ping', dest: HIVENETADDRESS.BROADCAST, dport: HIVENETPORT.PING, flags: { ping: true } }));
        await sleep(3000);
        port.destroy();
        return format(list, ' ');
    }

    // TODO: integrate with shellDaemon system
    async connect(host: string, port: string | number, directSSH: boolean = false) {
        if (typeof port == 'string') port = Number.parseInt(port);
        if (directSSH) {
            this.os.stdIO.output(`Direct ssh connecting to ${host}:${port}...`);
        } else {
            this.os.stdIO.output(`HiveNet connecting to ${host}:${port}...`);
        }

        // TODO: rework with socket
        const socket = new HiveSocket('remote');
        const socketDT = new DataTransformer(socket.dataIO);
        // socketDT.setInputTransform(DataSerialize);
        // socketDT.setOutputTransform(DataParsing);

        if (directSSH) {
            // TODO: fix input routing
            let terminal = this.os.getProcess(HiveProcessTerminal);
            if (!terminal) throw new Error('Cannot find Terminal process');
            let terminalPort = this.os.netInterface.getPort(HIVENETPORT.TERMINAL);
            if (!terminalPort) throw new Error('Cannot find Terminal port');
            //if (this.os.stdIOPortIO) this.os.stdIO.unpassThrough(this.os.stdIOPortIO);
            let sport = this.os.netInterface.newRandomPortNumber();
            this.os.HTP.listen(sport, (data, signatures) => {
                data.dport = HIVENETPORT.SHELL;
                socketDT.stdIO.input(data, signatures);
            });
            socketDT.stdIO.on(
                'output',
                (data, signatures) => {
                    if (data instanceof HiveNetPacket) data = data.data;
                    // @ts-ignore
                    terminalPort.output(data, signatures);
                },
                'write to terminal'
            );
            //this.os.stdIO.passThrough(socketDT.stdIO);
            terminal.terminalDestPort = sport;
            terminal.setPrompt(`->${host}:${port}`);
        } else {
            this.switch.connect(socketDT.stdIO);
        }

        await socket
            .new(host, port)
            .then(() => this.os.stdIO.output(`Handshake done.`))
            .catch((e) => this.os.stdIO.output(e));
        return socket;
    }

    listen(port: string | number, directSSH: boolean = false) {
        if (typeof port == 'string') port = Number.parseInt(port);
        const server = new WebSocketServer({ port });
        if (directSSH) {
            this.sshServer = server;
            server.on('listening', () => this.os.stdIO.output(`SSH server now listening on port:${port}`));
        } else {
            this.server = server;
            server.on('listening', () => this.os.stdIO.output(`HiveNet server now listening on port:${port}`));
        }
        server.on('connection', (ws, req) => {
            // new client
            if (directSSH) {
                this.os.stdIO.output(`New ssh connecting from ${req.socket.remoteAddress}.`);
            } else {
                this.os.stdIO.output(`New hiveNet connecting from ${req.socket.remoteAddress}.`);
            }

            // TODO: rework with socket
            const client = new HiveSocket('');
            const dt = new DataTransformer(client.dataIO);
            // dt.setInputTransform(DataSerialize);
            // dt.setOutputTransform(DataParsing);

            // connect socket to netInterface
            if (directSSH) {
                let io = this.os.netInterface.newIO(this.os.netInterface.newRandomPortNumber(), this);
                dt.stdIO.connect(io);
            } else {
                this.switch.connect(dt.stdIO);
            }

            // debug
            if (this.os.debugMode)
                dt.stdIO.on(
                    'output',
                    (d, s) => {
                        console.log(DataSignaturesToString(s));
                        console.log(d);
                    },
                    'debug'
                );

            client
                .use(ws)
                .then(() => this.os.stdIO.output(`Handshake done.`))
                .catch((e) => this.os.stdIO.output(e));
        });
        server.on('error', (e) => this.os.stdIO.output(e.stack));
        return server;
    }
}
