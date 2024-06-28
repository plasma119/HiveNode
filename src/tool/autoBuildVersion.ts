import * as fs from 'fs';
import path from 'path';
import * as Crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonFilePath = path.join(__dirname, 'autoBuildVersion.json');

type version = {
    buildTime: number;
    files: srcFile[];
    map: Map<string, srcFile>;
};

type srcFile = {
    filename: string;
    path: string;
    lastModified: number;
    size: number;
    hash: string;
};

export const VERSION: version = loadVersion();
for (let file of VERSION.files) {
    VERSION.map.set(file.path, file);
}

if (process.argv[2] == '-build') {
    let srcFolder = process.argv[3] || './src';
    console.log(`Src folder: ${srcFolder}`);
    if (!fs.existsSync(srcFolder)) throw new Error(`Cannot find src folder!`);
    buildVersion(srcFolder);
}

function loadVersion() {
    let emptyVersion: version = {
        buildTime: 0,
        files: [],
        map: new Map(),
    };
    if (!fs.existsSync(jsonFilePath)) return emptyVersion;
    try {
        let content = fs.readFileSync(jsonFilePath);
        let version = JSON.parse(content.toString()) as version;
        version.map = new Map();
        return version;
    } catch (e) {
        console.log(e);
        return emptyVersion;
    }
}

function buildVersion(srcFolder: string) {
    // scan newest version data
    let files: srcFile[] = recursiveScan(srcFolder);
    let newVersion: version = {
        buildTime: Date.now(),
        files: files,
        map: new Map(),
    };
    for (let file of newVersion.files) {
        newVersion.map.set(file.path, file);
    }

    console.log(`Build time: ${new Date(newVersion.buildTime).toISOString()}`);
    for (let file of files) {
        let srcFile = VERSION.map.get(file.path);
        if (!srcFile) {
            // new file
            file.hash = fileHash(file.path);
            console.log(`${file.path}: new File`);
        } else if (srcFile.lastModified < file.lastModified) {
            // modified file
            file.hash = fileHash(file.path);
            if (srcFile.size == file.size && srcFile.hash == file.hash) {
                // actually not updated
                file.lastModified = srcFile.lastModified;
                continue;
            }
            // updated file
            console.log(`${file.path}: ${new Date(srcFile.lastModified).toISOString()}`);
        }
    }

    for (let srcFile of VERSION.files) {
        let file = newVersion.map.get(srcFile.path);
        if (!file) {
            console.log(`${srcFile.path}: deleted`);
        }
    }

    fs.writeFileSync(jsonFilePath, JSON.stringify(newVersion, undefined, 2));
}

function recursiveScan(directory: string, srcFiles: srcFile[] = []) {
    let scan = fs.readdirSync(directory, { withFileTypes: true });
    for (let file of scan) {
        if (file.isFile()) {
            let filePath = path.join(directory, file.name);
            let stat = fs.statSync(filePath);
            srcFiles.push({
                filename: file.name,
                path: filePath,
                lastModified: stat.mtime.getTime(),
                size: stat.size,
                hash: '',
            });
        } else if (file.isDirectory()) {
            recursiveScan(path.join(directory, file.name), srcFiles);
        }
    }
    return srcFiles;
}

function fileHash(filepath: string) {
    const hash = Crypto.createHash('md5');
    hash.update(fs.readFileSync(filepath).toString());
    return hash.digest('base64');
}
