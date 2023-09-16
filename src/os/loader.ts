import { BootConfig } from './bios.js';
import { WorkerConfig } from './worker.js';

// Identify current process's loader & retrieve configs

type Loader =
    | {
          type: 'os';
          bootConfig: BootConfig;
          argv: string[];
      }
    | {
          type: 'workerProcess';
          bootConfig: BootConfig;
          workerConfig: WorkerConfig;
      };

let currentLoader: Loader | null = null;

export function setLoader(loader: Loader) {
    currentLoader = loader;
}

export function getLoader() {
    return currentLoader;
}
