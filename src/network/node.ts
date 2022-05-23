import HiveComponent from '../lib/component';
import DataIO from './dataIO';
import { HiveNetFlags, HiveNetFrame, HiveNetSegment } from './hiveNet';
import HiveNetInterface from './interface';
import HiveNetSwitch from './switch';

export default class HiveNetNode extends HiveComponent {
    stdIO: DataIO = new DataIO(this, 'stdIO');

    constructor(name: string) {
        super(name);
    }

    connect(
        target: HiveNetInterface | HiveNetSwitch | DataIO,
        options: {
            port?: number;
        } = {}
    ) {
        if (target instanceof HiveNetInterface) {
            target.connect(this.stdIO, 'port', options.port);
        } else if (target instanceof HiveNetSwitch) {
            target.connect(this.stdIO);
        } else {
            this.stdIO.connect(target);
        }
        return true;
    }
    
    send(data: any, dest: string, dport: number, flags?: HiveNetFlags) {
        const segment = new HiveNetSegment(data, 0, dport, flags);
        const frame = new HiveNetFrame(segment, '', dest, flags);
        this.stdIO.output(frame);
    }
}
