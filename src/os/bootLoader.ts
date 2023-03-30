import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import HiveOS from './os.js';
import { BootConfig } from './bios.js';

const configPath = process.argv[2] || 'config.json';
const config: BootConfig = JSON.parse(fs.readFileSync(configPath).toString());

if (!config.HiveNodePath) config.HiveNodePath = '.';

const os = new HiveOS(config.name || 'HiveNode');
os.buildTerminal(config.headless, config.debug);

(async () => {
    if (config.programPath) {
        os.stdIO.output(`[Boot Loader]: Running main program from [${config.programPath}]...`);
        if (!fs.existsSync(config.programPath)) {
            os.stdIO.output(`[Boot Loader]: ERROR: Cannot find main program file.`);
        } else {
            try {
                let relativePath = path.relative(__dirname, path.resolve(config.programPath)); // need relative path from this file
                let program = await import(relativePath.replace('\\', '/')); // stupid path
                program.main(os);
            } catch (e) {
                os.stdIO.output(e);
            }
        }
    }
})();
