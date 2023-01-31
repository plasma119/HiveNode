import HiveOS from "../os/os.js";

let node = new HiveOS('client');
node.buildTerminal(false, true);
node.kernel.program.stdIO.input('net connect 127.0.0.1');
