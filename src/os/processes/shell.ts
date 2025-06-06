import HiveCommand from '../lib/hiveCommand.js';
import { HIVENETADDRESS, HIVENETPORTREVERSEMAP, HiveNetPacket } from '../network/hiveNet.js';
import HiveProcess from '../process.js';

// TODO: maintain persistent shell interaction history

const VERSION = 'V1.2';
const BUILD = '2023-12-18';

type HiveProcessShellDaemonEvents = {
    registerShellProgram: (program: HiveCommand) => void;
};

export default class HiveProcessShellDaemon extends HiveProcess<HiveProcessShellDaemonEvents> {
    shells: Map<number, HiveProcessShell> = new Map();
    shellPrograms: HiveCommand[] = [];

    initProgram() {
        // kernel->service->shelld
        const program = new HiveCommand('shelld', `Shell Daemon`);

        program.addNewCommand('version', 'display current program version').setAction(() => `version ${VERSION} build ${BUILD}`);

        program.addNewCommand('spawn', 'spawn new shell process').setAction(() => {
            return this.spawnShell(this).port;
        });

        return program;
    }

    // to all shell processes
    registerShellProgram(program: HiveCommand) {
        this.shellPrograms.push(program);
        this.emit('registerShellProgram', program);
    }

    spawnShell(parentProcess: HiveProcess, port?: number) {
        const shellProcess = parentProcess.spawnChild(HiveProcessShell, 'shell', port ? [port.toString()] : []);
        shellProcess.injectShellDaemon(this);
        this.shells.set(shellProcess.pid, shellProcess);
        shellProcess.once('exit', () => {
            this.shells.delete(shellProcess.pid);
        });
        return shellProcess;
    }
}

export class HiveProcessShell extends HiveProcess {
    port: number = this.os.netInterface.newRandomPortNumber();
    shelld?: HiveProcessShellDaemon;
    registerShellProgramBind?: (program: HiveCommand) => void;

    initProgram() {
        const program = new HiveCommand('shell', `Basic HiveOS Shell`);
        const shell = program.addNewCommand('shell', 'Shell command');

        shell.addNewCommand('info', `display current shell's info`).setAction(() => {
            let info = `[${this.program.name}] - ${this.program.description}`;
            info += `\nShell version ${VERSION} build ${BUILD}`;
            info += `\nPid: ${this.pid}`;
            info += `\nPort: ${this.port}`;
            let parent = this.os.getProcess(HiveProcess, this.ppid);
            info += `\nParent: ${parent ? `[${parent.name}] pid: ${parent.pid}` : 'null'}`;
            return info;
        });

        shell
            .addNewCommand('rename', `rename current shell's name`)
            .addNewArgument('<name>')
            .addNewArgument('[description...]')
            .setAction((args) => {
                this.rename(args['name'], args['description']);
            });

        const util = shell.addNewCommand('util', 'For testing purpose');

        util.addNewCommand('ls', 'list all running shells').setAction(async (_args, _opts, info) => {
            if (!this.shelld) {
                return `WHAT? CAN'T FIND SHELLD!`;
            }
            for (let s of this.shelld.shells.values()) {
                await s.program.execute('shell info').then((data) => {
                    info.reply(data.join('\n'));
                });
            }
            return;
        });

        // very wacky way to extract info from portIO system
        util.addNewCommand('portIO', 'list all portIOs').setAction(() => {
            let str = '';

            this.os.netInterface.ports.forEach((port, n) => {
                let sign = port.getSignature();
                str += `port[${n}]: [${sign.by.name}] ${port.getListenerCount('input')}I ${port.getListenerCount('output')}O\n`;
                if (HIVENETPORTREVERSEMAP.has(n)) str += `    [${HIVENETPORTREVERSEMAP.get(n)}]\n`;
                port.connectTable.forEach((_, targetIO) => {
                    str += `    <-> ${targetIO.name}[${targetIO.owner.name}]\n`;
                });
                port.passThroughTable.forEach((baseIO, targetIO) => {
                    let targetIsBase = baseIO == targetIO;
                    if (targetIsBase) {
                        str += `    O<=>I ${targetIO.name}[${targetIO.owner.name}]\n`;
                    } else {
                        str += `    I<=>O ${targetIO.name}[${targetIO.owner.name}]\n`;
                    }
                });
                let listeners = port.getListeners('input');
                for (let listener of listeners) {
                    let label = listener.label || 'unknown';
                    str += `    I -> [${label}]\n`;
                }
                listeners = port.getListeners('output');
                for (let listener of listeners) {
                    let label = listener.label || 'unknown';
                    str += `    O -> [${label}]\n`;
                }
            });

            return str;
        });

        util.addNewCommand('packet', 'send a HiveNetPacket')
            .addNewOption('-dest <dest>', 'destination address')
            .addNewOption('-dport <dport>', 'destination port')
            .addNewOption('-log', 'enable packet tracing (experimental)')
            .addNewOption('-full', 'display full packet content')
            .addNewArgument('[data...]')
            .setAction(async (args, opts) => {
                let packet = new HiveNetPacket({
                    data: args['data'],
                    // src: opts['-src'],
                    dest: program.toStr(opts['-dest']) || HIVENETADDRESS.LOCAL,
                    // sport: opts['-sport'],
                    dport: program.toInt(opts['-dport']),
                    // ttl: opts['-ttl'],
                    flags: {
                        log: !!opts['-log'],
                    },
                });
                let result = await this.os.HTP.sendAndReceiveOnce(packet.data, packet.dest, packet.dport, packet.flags, {
                    rawPacket: !!opts['-full'],
                    waitForEOC: true,
                });
                return result.length == 1 ? result[0] : result;
            });

        return program;
    }

    main(argv: string[]) {
        if (argv[0]) this.port = Number.parseInt(argv[0]);
        const portIO = this.os.netInterface.newIO(this.port, this);
        portIO.connect(this.program.stdIO);
    }

    rename(name: string, description?: string) {
        this.name = name;
        this.program.name = name;
        if (description) this.program.description = description;
    }

    exit() {
        if (!this.alive) return;
        if (this.shelld && this.registerShellProgramBind) this.shelld.off('registerShellProgram', this.registerShellProgramBind);
        this.os.netInterface.closePort(this.port);
        super.exit();
    }

    injectShellDaemon(shelld: HiveProcessShellDaemon) {
        this.shelld = shelld;
        this.registerShellProgramBind = this.registerShellProgram.bind(this);
        shelld.shellPrograms.forEach(this.registerShellProgramBind);
        shelld.on('registerShellProgram', this.registerShellProgramBind);
    }

    // to this shell process only
    registerShellProgram(program: HiveCommand) {
        this.program.addCommand(program);
    }
}
