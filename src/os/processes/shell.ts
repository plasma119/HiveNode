import HiveCommand from '../../lib/hiveCommand.js';
import HiveProcess from '../process.js';

// TODO: maintain persistent shell interaction history

type HiveProcessShellDaemonEvents = {
    registerShellProgram: (program: HiveCommand) => void;
};

export default class HiveProcessShellDaemon extends HiveProcess<HiveProcessShellDaemonEvents> {
    shells: HiveProcessShellProcess[] = [];
    shellPrograms: HiveCommand[] = [];

    initProgram() {
        const program = new HiveCommand('shelld', `Shell Daemon`);

        program.addNewCommand('spawn', 'spawn new shell process').setAction(() => {
            return this.spawnShell().port;
        });

        return program;
    }

    registerShellProgram(program: HiveCommand) {
        this.shellPrograms.push(program);
        this.emit('registerShellProgram', program);
    }

    spawnShell() {
        const shellProcess = this.spawnChild(HiveProcessShellProcess, 'shell');
        shellProcess.injectShellDaemon(this);
        return shellProcess;
    }
}

export class HiveProcessShellProcess extends HiveProcess {
    port: number = this.os.netInterface.newRandomPortNumber();
    shelld?: HiveProcessShellDaemon;
    registerShellProgramBind?: (program: HiveCommand) => void;

    initProgram() {
        const program = new HiveCommand('shell', `Shell`);
        const shell = program.addNewCommand('shell', 'Shell command');

        shell.addNewCommand('port', "display current shell's portIO").setAction(() => {
            return this.port;
        });

        return program;
    }

    main() {
        let portIO = this.os.netInterface.newIO(this.port);
        portIO.connect(this.program.stdIO);
    }

    exit() {
        if (this.shelld && this.registerShellProgramBind) this.shelld.off('registerShellProgram', this.registerShellProgramBind);
        super.exit();
    }

    injectShellDaemon(shelld: HiveProcessShellDaemon) {
        this.shelld = shelld;
        this.registerShellProgramBind = this.registerShellProgram.bind(this);
        shelld.shellPrograms.forEach(this.registerShellProgramBind);
        shelld.on('registerShellProgram', this.registerShellProgramBind);
    }

    registerShellProgram(program: HiveCommand) {
        this.program.addCommand(program);
    }
}
