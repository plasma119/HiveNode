import { DataParsing, DataSerialize, HiveNetPacket } from "../network/hiveNet.js";


let data = new HiveNetPacket({
    data: 'test data',
    src: 'src-000',
    dest: 'dest-001',
    sport: 0,
    dport: 1,
});
let s = DataSerialize(data);
let p = DataParsing(s);
console.log(p);
console.log(p instanceof HiveNetPacket);


