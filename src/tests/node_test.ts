import { DataSignature, DataSignaturesToString } from "../network/hiveNet.js";
import HiveNetNode from "../network/node.js";
import HiveNetSwitch from "../network/switch.js";

function log(data: any, signatures: DataSignature[]) {
    console.log(data);
    console.log(DataSignaturesToString(signatures));
    let t = signatures[signatures.length - 1].timestamp - signatures[0].timestamp;
    console.log(`${t} ms timestamp\n`);
};

let sw = new HiveNetSwitch('switch');

let nodeA = new HiveNetNode('node-A');
let nodeB = new HiveNetNode('node-B');
let nodeC = new HiveNetNode('node-C');

let intA = nodeA.netInterface;
let intB = nodeB.netInterface;
let intC = nodeC.netInterface;

intA.connect(sw, 'net');
intB.connect(sw, 'net');
intC.connect(sw, 'net');

nodeA.stdIO.on('output', log);
nodeB.stdIO.on('output', log);
nodeC.stdIO.on('output', log);

// nodeA.netping(intA.UUID).then(console.log)
// nodeA.netping(intB.UUID).then(console.log)
// nodeA.netping(intC.UUID).then(console.log)

// nodeB.message(intC.UUID, 'from node-B');
