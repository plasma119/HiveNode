import DataIOScreen from '../network/dataIOScreen.js';

let screen = new DataIOScreen({ maxSize: 5 });
for (let i = 0; i < 12; i++) {
    screen.stdIO.input(i);
}

screen.stdIO.input({data: 'junk'});

console.log(screen.get());
console.log(screen.get(0, -2));
console.log(screen.get(3, 4));
