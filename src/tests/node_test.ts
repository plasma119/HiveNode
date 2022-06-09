import { DataSignature, DataSignaturesToString } from "../network/hiveNet.js";
import HiveNetInterface from "../network/interface.js";
import HiveNetNode from "../network/node.js";
import HiveNetSwitch from "../network/switch.js";

function log(data: any, signatures: DataSignature[]) {
    console.log(data);
    console.log(DataSignaturesToString(signatures));
    let t = signatures[signatures.length - 1].timestamp - signatures[0].timestamp;
    console.log(`${t} ms timestamp\n`);
};

let sw = new HiveNetSwitch('switch');

let intA = new HiveNetInterface('interface-A');
let intB = new HiveNetInterface('interface-B');
let intC = new HiveNetInterface('interface-C');

let nodeA = new HiveNetNode('node-A', intA);
let nodeB = new HiveNetNode('node-B', intB);
let nodeC = new HiveNetNode('node-C', intC);

intA.connect(sw, 'net');
intB.connect(sw, 'net');
intC.connect(sw, 'net');

nodeA.stdIO.on('output', log);
nodeB.stdIO.on('output', log);
nodeC.stdIO.on('output', log);

nodeA.ping(intA.UUID).then(console.log)
nodeA.ping(intB.UUID).then(console.log)
nodeA.ping(intC.UUID).then(console.log)

nodeB.message(intC.UUID, 'from node-B');
