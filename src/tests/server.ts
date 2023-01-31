import HiveOS from "../os/os.js";

let node = new HiveOS('server');
node.buildTerminal(false, true);
node.kernel.program.stdIO.input('net listen');
