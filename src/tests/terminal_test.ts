
import Terminal from "../lib/terminal.js";
import Bee from '../bee.js';

let bee = new Bee('dumdum');
let t = new Terminal();
t.connectDevice(process);
t.stdIO.connect(bee.stdIO);
if (t.prompt) t.prompt.debug = true;
