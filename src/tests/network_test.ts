import { DataParsing, DataSerialize, HiveNetFrame, HiveNetSegment } from "../network/hiveNet.js";


let data = new HiveNetFrame(new HiveNetSegment({name: 'packet', data: 'stuff'}, 0, 1), 'source', 'destination');
let s = DataSerialize(data);
let p = DataParsing(s);
console.log(p);
console.log(p instanceof HiveNetFrame);
console.log(p.data instanceof HiveNetSegment);


