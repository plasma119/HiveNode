import { inspect } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TestItem = (assert: (value: any) => void) => any;

export type Test = {
    testItems: {
        name: string;
        testItem: TestItem;
    }[];
    answerList?: any[][];
};

let run = false;
let generateAnswer = false;
if (process.argv[2] == '-runTest') {
    run = true;
} else if (process.argv[2] == '-genTest') {
    run = true;
    generateAnswer = true;
}
if (run) {
    let files = process.argv.slice(3);
    RunTestFile(files, generateAnswer);
}

export async function RunTestFile(testFiles: string[], generateAnswer?: boolean) {
    let t1 = Date.now();
    for (let file of testFiles) {
        try {
            console.log(`Loading Test File [${file}]...`);
            if (!fs.existsSync(file)) {
                console.log(`Cannot find Test File [${file}]!`);
                continue;
            }
            let { test, answerJSONFile } = await loadTest(file);
            if (generateAnswer) test.answerList = [];
            let result = await RunTest(test);
            if (generateAnswer) {
                console.log(`Saving Answer...`);
                fs.writeFileSync(answerJSONFile, JSON.stringify(result, undefined, 2));
            }
        } catch (error) {
            console.log(error);
        }
    }
    let time = Date.now() - t1;
    console.log(`[${testFiles.length}] Test Files (${time.toFixed(1)} ms)`);
    console.log(`Done!`);
}

export async function RunTest(test: Test) {
    let t1 = Date.now();
    let passed = 0;
    let resultList = [];
    let answerList: any[][] = test.answerList || [];
    for (let i = 0; i < test.testItems.length; i++) {
        try {
            const testItem = test.testItems[i];
            const result: any[] = [];
            console.log(`Running Test [${testItem.name}]...`);
            await testItem.testItem((value: any) => {
                if (typeof value === 'object') value = JSON.parse(JSON.stringify(value));
                result.push(value);
            });
            resultList[i] = result;
            let answer = answerList[i];
            if (answer === undefined) {
                console.log(`No Answer Provided For This Test Item:`);
                console.log(result.map((r) => inspect(r, undefined, 4, true)).join('\n'));
                continue;
            } else {
                let failed = false;
                for (let j = 0; j++; j < result.length) {
                    if (!assertEqual(result[j], answer[j])) {
                        console.log(`AssertionError: ${inspect(result[j], false, 4, true)} == ${inspect(answer[j], false, 4, true)}`);
                        failed = true;
                    }
                }
                if (failed) continue;
            }
            passed++;
        } catch (error) {
            console.log(error);
        }
    }
    let time = Date.now() - t1;
    console.log(`[${passed}/${test.testItems.length}] Test Items Passed (${time.toFixed(1)} ms)`);
    return resultList;
}

export function assertEqual(obj: any, model: any) {
    // shallow type check
    if (typeof model != typeof obj) return false;
    if (typeof model == 'object') {
        for (let prop in model) {
            const objProp = obj[prop];
            const modelProp = model[prop];
            // object prop type check
            if (typeof objProp !== typeof modelProp || Array.isArray(objProp) !== Array.isArray(modelProp)) {
                return false;
            } else if (typeof modelProp === 'object' && !Array.isArray(modelProp)) {
                // deep type check
                if (!assertEqual(objProp, modelProp)) {
                    return false;
                }
            } else if (Array.isArray(modelProp)) {
                // array value assert check
                if (objProp.length != modelProp.length) return false;
                for (let i = 0; i < modelProp.length; i++) {
                    if (!assertEqual(objProp[i], modelProp[i])) return false;
                }
            } else if (!assertEqual(objProp, modelProp)) {
                // value assert check
                return false;
            }
        }
        // value assert check
    } else if (obj !== model) return false;
    return true;
}

async function loadTest(file: string) {
    let relativePath = path.relative(__dirname, path.resolve(file));
    let program = await import(relativePath.replace('\\', '/'));
    let test = program.test as Test;
    let parsed = path.parse(file);
    // TODO: maybe storing the answer file in other place?
    let answerJSONFile = path.join(parsed.dir, '/', parsed.name + '.json');
    if (fs.existsSync(answerJSONFile)) {
        try {
            let json = JSON.parse(fs.readFileSync(answerJSONFile).toString());
            test.answerList = json;
        } catch (error) {
            console.log(`Failed To Load Answer JSON:`);
            console.log(error);
        }
    }
    return { test, answerJSONFile };
}
