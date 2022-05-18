
import Bee from "../bee.js";
import DataIO from "../network/dataIO.js";

let bee = new Bee('dumdum');
let io = new DataIO({}, 'io');
io.connect(bee.stdIO);
io.on('input', (data, signatures) => {
    console.log(data);
    // @ts-ignore
    console.log(signatures.map(s => `${s.name}[${s.by.name}]:${s.event}`).join('->'));
})

let list = [
    'help',
    'testInvalid',
    'help rickroll',
    'rickroll',
]

for (let i = 0; i < list.length; i++) {
    io.output(list[i]);
}



