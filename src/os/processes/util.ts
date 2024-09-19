import * as fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import HiveCommand from '../../lib/hiveCommand.js';
import HiveProcess from '../process.js';
import { uuidv7 } from '../../lib/lib.js';

type copyFolder = {
    name: string;
    path: string; // relative path
    fullPath: string;
    files: copyFile[];
    folders: copyFolder[];
    totalFiles: number;
    totalFolders: number;
    totalSize: number;
};

type copyFile = {
    name: string;
    path: string; // full path
    size: number;
    hash?: string;
};

type copyListItem = {
    hashMap: Map<number, copyFile[]>;
    dest: string;
    destExist: boolean;
    list: {
        srcFile: copyFile;
        copy: boolean;
        hashMapHit: boolean;
        hashHit: boolean;
        reason: 'size' | 'hash' | 'none';
    }[];
};

export default class HiveProcessUtil extends HiveProcess {
    initProgram(): HiveCommand {
        const program = new HiveCommand('util', 'utility commands');

        program
            .addNewCommand('uuid', 'return new uuid, default v7')
            .addNewOption('-v4', 'use uuid v4')
            .setAction((_args, opts) => {
                if (opts['-v4']) return randomUUID();
                return uuidv7();
            });

        program
            .addNewCommand('copy-no-dup', 'copy with no duplicate files based on file size/hash')
            .addNewOption('-test', 'list files to be copied but do not execute')
            .addNewArgument('<src>', 'source folder')
            .addNewArgument('<dest>', 'destination folder')
            .setAction((args, opts, info) => {
                const src = args['src'];
                const dest = args['dest'];
                const isTest = !!opts['-test'];
                if (!fs.existsSync(src)) return `Cannot find source folder: ${src}`;
                if (!fs.existsSync(dest)) return `Cannot find desination folder: ${dest}`;

                if (isTest) info.reply('Option: -test');
                info.reply('Scanning source...');
                const srcFolder = this.scanFolder(src);
                info.reply(`Total files: ${srcFolder.totalFiles}`);
                info.reply(`Total folders: ${srcFolder.totalFolders}`);
                info.reply(`Total size: ${srcFolder.totalSize}`);
                info.reply('Scanning destination...');
                const destFolder = this.scanFolderMirror(srcFolder, dest);
                info.reply(`Total files: ${destFolder.totalFiles}`);
                info.reply(`Total folders: ${destFolder.totalFolders}`);
                info.reply(`Total size: ${destFolder.totalSize}`);

                // TODO:
                // create copyFolder of dest - done
                // create hashmap with filesize of dest files as index - done
                // put miss of src files to list - done
                //
                // check hit of small size file with file hash (ignore 0 size)
                // put hash mis-match to list
                //
                // check filenames of list
                // figure out how to solve filename used in dest
                //
                // copy files - done
                info.reply('Creating copy list...');
                const copyList = this.createCopyList(srcFolder, destFolder);
                if (isTest) {
                    info.reply('Skipping copy execution.');
                }
                for (let item of copyList) {
                    info.reply(`Folder: ${item.dest}`);
                    if (item.destExist) {
                        item.list.forEach((f) => {
                            if (f.copy) {
                                info.reply(`copyFile[${f.reason}]: ${f.srcFile.name}`);
                                if (!isTest) {
                                    let destPath = path.join(item.dest, f.srcFile.name);
                                    // execute copy command
                                    info.reply(`copying file`);
                                    info.reply(`target file path: ${destPath}`);
                                    if (fs.existsSync(destPath)) {
                                        info.reply(`ERROR: filename used in destination folder`);
                                    } else {
                                        try {
                                            fs.copyFileSync(f.srcFile.path, destPath, fs.constants.COPYFILE_EXCL);
                                        } catch (e) {
                                            info.reply(e);
                                        }
                                    }
                                }
                            }
                        });
                    } else {
                        info.reply('target folder not found, TODO');
                    }
                }
                return 'Done!';
            });

        return program;
    }

    scanFolder(basePath: string, relativePath: string = '', noRecursive: boolean = false) {
        const folder: copyFolder = {
            name: (relativePath ? relativePath.split(path.sep).pop() : basePath.split(path.sep).pop()) || 'undefined',
            path: relativePath,
            fullPath: path.join(basePath, relativePath),
            files: [],
            folders: [],
            totalFiles: 0,
            totalFolders: 0,
            totalSize: 0,
        };
        if (!fs.existsSync(folder.fullPath)) return folder;
        const files = fs.readdirSync(folder.fullPath, { withFileTypes: true });
        for (const file of files) {
            if (file.isDirectory() && !noRecursive) {
                const newFolder = this.scanFolder(basePath, path.join(relativePath, file.name));
                folder.folders.push(newFolder);
                folder.totalFiles += newFolder.totalFiles;
                folder.totalFolders += newFolder.totalFolders + 1;
                folder.totalSize += newFolder.totalSize;
            } else if (file.isFile()) {
                const filePath = path.join(folder.fullPath, file.name);
                const stat = fs.statSync(filePath);
                folder.files.push({
                    name: file.name,
                    path: filePath,
                    size: stat.size,
                });
                folder.totalSize += stat.size;
            }
        }
        folder.totalFiles += folder.files.length;
        return folder;
    }

    // avoid scanning useless folders
    scanFolderMirror(srcFolder: copyFolder, destPath: string) {
        const destFolder: copyFolder = this.scanFolder(destPath, srcFolder.path, true);
        srcFolder.folders.forEach((folder) => {
            const newFolder = this.scanFolderMirror(folder, destPath);
            destFolder.folders.push(newFolder);
            destFolder.totalFiles += newFolder.totalFiles;
            destFolder.totalFolders += newFolder.totalFolders + 1;
            destFolder.totalSize += newFolder.totalSize;
        });
        return destFolder;
    }

    createCopyList(srcFolder: copyFolder, destFolder: copyFolder) {
        const item: copyListItem = {
            hashMap: new Map(),
            dest: destFolder.fullPath,
            destExist: fs.existsSync(destFolder.fullPath),
            list: [],
        };
        let arr: copyListItem[] = [item];
        if (item.destExist) {
            // create filesize hashMap
            destFolder.files.forEach((file) => {
                if (item.hashMap.has(file.size)) {
                    let files = item.hashMap.get(file.size);
                    if (!files) files = [];
                    files.push(file);
                } else {
                    item.hashMap.set(file.size, [file]);
                }
            });

            // first round of filter
            srcFolder.files.forEach((file) => {
                let f: copyListItem['list'][number] = {
                    srcFile: file,
                    copy: false,
                    hashMapHit: item.hashMap.has(file.size),
                    hashHit: false,
                    reason: 'none',
                };
                if (!f.hashMapHit) {
                    f.copy = true;
                    f.reason = 'size';
                }
                item.list.push(f);
            });

            // second round of filter
            // TODO
        }

        for (let i = 0; i < srcFolder.folders.length; i++) {
            arr = arr.concat(this.createCopyList(srcFolder.folders[i], destFolder.folders[i]));
        }
        return arr;
    }
}
