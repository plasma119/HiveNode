
import exitHelper from "../lib/exitHelper.js";
import { sleep } from "../lib/lib.js";
import { IgnoreSIGINT } from "../lib/signals.js";

let foo = false;
let boo = false;
exitHelper.onSIGINT(() => {
    if (boo) return;
    boo = true;
    console.log('boo SIGINT');
    return IgnoreSIGINT;
});
exitHelper.addCleanUp(() => {
    return new Promise(async (resolve) => {
        resolve();
        while (!foo) {
            await sleep(3000);
            console.log('Zzz...');
        }
    })
});
exitHelper.addCleanUp(async () => {
    await sleep(10000);
    console.log('BANG!');
    foo = true;
});
exitHelper.onProgramExit(() => {
    console.log('really exiting.');
});

(async () => {
    while (true) {
        console.log('UwU');
        await sleep(3000);
    }
})();
