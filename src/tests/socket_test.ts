import WebSocket from 'ws';

import HiveSocket, { HiveSocketOptions } from '../os/network/socket.js';
import DataIO from '../os/network/dataIO.js';
import { DataSignature, DataSignaturesToString } from '../os/network/hiveNet.js';
import HiveComponent from '../os/lib/hiveComponent.js';

function noop(_a: any) {}
function logWrapper(label: string) {
    return (data: any, signatures: DataSignature[]) => {
        noop(DataSignaturesToString(signatures));
        console.log(DataSignaturesToString(signatures));
        console.log(label);
        console.log(data);
        console.log('');
    };
}

const options: Partial<HiveSocketOptions> = {
    bufferData: true,
    serialization: true,
    connectTimeout: 20,
    handshakeTimeout: 5,
    handshakeMax: 5,
    pingInterval: 5,
    pingTimeout: 10,
    pingMax: 5,
    debug: true,
};

// client dummy
let io = new DataIO(new HiveComponent('test'), 'client');
io.on('input', logWrapper('client'));

let log = logWrapper('client-data');
let hs = new HiveSocket('client-socket', options);
hs.stdIO.connect(io);
hs.dataIO.on('output', log);

// server dummy
let io2 = new DataIO(new HiveComponent('test'), 'server');
io2.on('input', logWrapper('server'));

let log2 = logWrapper('server-data');
let hs2 = new HiveSocket('server-socket', options);
hs2.stdIO.connect(io2);
hs2.dataIO.on('output', log2);

let port = 8099;
let wss = new WebSocket.Server({
    port: port,
});
wss.on('connection', (ws) => {
    hs2.use(ws)
        .then(async () => {
            io2.input('handshake done!');
            io2.input(hs2.targetInfo);
            hs2.dataIO.input('server data');
        })
        .catch((e) => log2(e, []));
});

hs.new('localhost', port)
    .then(async () => {
        io.input('handshake done!');
        io.input(hs.targetInfo);
        hs.dataIO.input('client data');
    })
    .catch((e) => log(e, []));
