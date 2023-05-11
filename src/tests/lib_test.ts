import { parseArgsStringToArgv } from 'string-argv';

import { parseArgv, performanceTestAdvanced } from '../lib/lib.js';

let list = [
    'ytdl ytdl https://www.youtube.com/channel/UCxJ9SJLG7dA00M7VoEe4ltw/videos -pleiades -all',
    '   bad input    test',
    '"quote test" "123 45 \'6"',
    '"ds"ee "2 ""3"',
    `bad quote sad""das`,
    `bad quote2 '""`,
    `bad quote3 '""de faes''d as'a D""d 'asd"fs'"SAD A"Sd'A d'A'sd' SA"d"DAS"' dsa'A"DS 'ad'aS"D"A D"ASd' a'd s'D'a' as'`,
    `'more" quote test\\'  adsd ' endoftest`,
    `  very bad input    'test   "noooo`,
    `'alskfslag alksflas f;fa ;lvd ls'v a'dslca / ;acd s/ ;a\sdf \f; faew\f; a\'  """"""""" '''"""''"""''""`
];

// list.forEach((input) => {
//     console.log(input);
//     console.log(parseArgsStringToArgv(input));
//     console.log(parseArgv(input));
// });

let test1 = () => {
    list.forEach((input) => {
        parseArgsStringToArgv(input);
    });
}

let test2 = () => {
    list.forEach((input) => {
        parseArgv(input);
    });
}

(async () => {
    await performanceTestAdvanced([test2, test1], 10, 3, console.log);
})()