import HiveCommand from '../../lib/hiveCommand.js';
import HiveProcess from '../process.js';

// TODO: process for maintaining persistent shell interaction history
export default class HiveProcessShellDaemon extends HiveProcess {
    shells: HiveProcessShellProcess[] = [];

    initProgram() {
        const program = new HiveCommand('shelld', `Shell Daemon`);

        program.addNewCommand('spawn', 'spawn new shell process').setAction(() => {
            return this.spawnShell().port;
        });

        return program;
    }

    spawnShell() {
        const shellProcess = this.spawnChild(HiveProcessShellProcess, 'shell');
        return shellProcess;
    }
}

export class HiveProcessShellProcess extends HiveProcess {
    port: number = this.os.netInterface.newRandomPortNumber();

    initProgram() {
        const program = new HiveCommand('shell', `Shell`);
        const shell = program.addNewCommand('shell', 'Shell command');

        shell.addNewCommand('port', "display current shell's portIO").setAction(() => {
            return this.port;
        });

        this.os.shellPrograms.forEach((p) => program.addCommand(p));

        return program;
    }

    main() {
        let portIO = this.os.netInterface.newIO(this.port);
        portIO.connect(this.program.stdIO);
    }
}
