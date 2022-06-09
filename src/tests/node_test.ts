import { DataSignature, DataSignaturesToString } from "../network/hiveNet.js";
import HiveNetInterface from "../network/interface.js";
import HiveNetNode from "../network/node.js";
import HTP from "../network/protocol.js";
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

let htpA = new HTP(intA);
let htpB = new HTP(intB);
let htpC = new HTP(intC);

let nodeA = new HiveNetNode('node-A', htpA);
let nodeB = new HiveNetNode('node-B', htpB);
let nodeC = new HiveNetNode('node-C', htpC);

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
