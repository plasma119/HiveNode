export class CancelToken {
    aborted: boolean = false;
    finished: boolean = false;

    callback: (() => void) | undefined;

    abort() {
        this.aborted = true;
    }

    onFinished(callback: () => void) {
        this.callback = callback;
        if (this.finished) return this.finish();
    }

    finish() {
        this.finished = true;
        if (this.callback) this.callback();
        this.callback = undefined;
    }
}

export function cancelablePromise(
    generator: ((...args: any) => Generator<any, any, any>) | ((...args: any) => AsyncGenerator<any, any, any>),
    cancelToken: CancelToken,
) {
    return async (...args: any[]) => {
        const iter = generator(...args);

        let resumeValue: any;
        let result = await iter.next(resumeValue);

        // run the generator
        while (!cancelToken.aborted) {
            result = await iter.next(resumeValue);
            if (result.done) {
                return cancelToken.finish();
            }
            resumeValue = await result.value;
        }

        // try to stop the generator
        result = await iter.return('');

        // run the clean up routine inside the catch...final block
        while (!result.done) {
            result = await iter.next(resumeValue);
            if (result.done) {
                return cancelToken.finish();
            }
        }

        return cancelToken.finish();
    };
}

// (async () => {
//     let gen = function* gen() {
//         let x: string = yield 'test';
//         yield console.log(x);
//         yield;
//     };

//     let token = new CancelToken();

//     let cgen = cancelablePromise(gen, token);
//     token.abort();
//     await cgen();
// })();
