import HiveOS from "../os/os.js";

export function main(os: HiveOS) {
    os.kernel.program.stdIO.input('net listen');
}
