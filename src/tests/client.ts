import HiveCommand from "../os/lib/hiveCommand.js";
import HiveOS from "../os/os.js";

export function main(os: HiveOS) {
    let p = new HiveCommand('clientProgram');
    os.registerShellProgram(p);
}
