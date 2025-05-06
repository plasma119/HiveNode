export class CircularArray<T> {
    maxSize: number;

    _array: T[] = [];
    _pointer: number = 0;

    constructor(maxSize: number) {
        this.maxSize = maxSize
    }

    push(item: T) {
        this._array[this._pointer++] = item;
        if (this._pointer >= this.maxSize) this._pointer = 0;
    }

    slice(start?: number, end?: number) {
        if (this._array.length < this.maxSize) {
            return this._array.slice(start, end);
        } else {
            let segment1 = this._array.slice(this._pointer);
            let segment2 = this._array.slice(0, this._pointer);
            let result = segment1.concat(...segment2);
            return result.slice(start, end);
        }
    }

    clear() {
        this._array = [];
        this._pointer = 0;
    }

    size() {
        return this._array.length;
    }

    resize(size: number) {
        let currentArray = this.slice();
        this.maxSize = size;
        if (size < currentArray.length) {
            this._array = currentArray.slice(currentArray.length - size);
            this._pointer = 0;
        } else {
            this._array = currentArray;
            this._pointer = currentArray.length;
        }
        if (this._pointer >= this.maxSize) this._pointer = 0;
    }
}