import HiveOS from "../os/os.js";

export function main(os: HiveOS) {
    os.kernel.program.stdIO.input('net connect 127.0.0.1');
}
