
import WebSocket from "ws";

import HiveSocket from "../network/socket.js";
import DataIO from "../network/dataIO.js";
import { DataSignature, DataSignaturesToString } from "../network/hiveNet.js";

function noop(_a: any) {

}
function log(label: string) {
    return (data: any, signatures: DataSignature[]) => {
        console.log(label);
        console.log(data);
        noop(DataSignaturesToString(signatures));
        console.log('');
    }
}

let io = new DataIO({}, 'client');
io.on('input', log('client'));

let hs = new HiveSocket('client-socket');
hs.stdIO.connect(io);
hs.dataIO.on('output', log('client-data'));


let io2 = new DataIO({}, 'server');
io2.on('input', log('server'));

let hs2 = new HiveSocket('server-socket');
hs2.stdIO.connect(io2);
hs2.dataIO.on('output', log('server-data'));

let port = 8090;
let wss = new WebSocket.Server({
    'port': port
});
wss.on('connection', (ws) => {
    hs2.use(ws).then(async () => {
        io2.input('handshake done!');
        io2.input(hs2.targetInfo);
        hs2.dataIO.input('server data');
    });
})

hs.new('localhost', port).then(async () => {
    io.input('handshake done!');
    io.input(hs.targetInfo);
    hs.dataIO.input('client data');
});

