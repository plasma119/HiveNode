import { inspect } from 'util';

import DataIOBuffer from '../os/network/dataIOBuffer.js';

let log = (data: any) => {
    console.log(inspect(data,false, 4, true))
}

let buffer = new DataIOBuffer({ maxSize: 5 });

for (let i = 0; i < 12; i++) {
    buffer.stdIO.input(i);
}
buffer.stdIO.input({data: 'junk'});

log(buffer.slice());
log(buffer.slice(0, -2));
log(buffer.slice(3, 4));

buffer.resize(8);

log(buffer.slice());
log(buffer.slice(0, -2));
log(buffer.slice(3, 9));

for (let i = 0; i < 12; i++) {
    buffer.stdIO.input(i);
}
buffer.stdIO.input({data: 'junk'});

log(buffer.slice());
log(buffer.slice(0, -2));
log(buffer.slice(3, 9));
