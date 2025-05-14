// TODO: proper testing

export class CircularArray<T> {
    maxSize: number;

    _array: T[] = [];
    _pointer: number = 0;
    _size: number = 0;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    push(item: T) {
        this._array[this._pointer++] = item;
        if (this._pointer >= this.maxSize) this._pointer = 0;
        this._size++;
        if (this._size > this.maxSize) this._size = this.maxSize;
    }

    pop() {
        if (this._size == 0) return undefined;
        this._pointer--;
        if (this._pointer < 0) this._pointer = this.maxSize - 1;
        const item = this._array[this._pointer];
        delete this._array[this._pointer];
        this._size--;
        return item;
    }

    get(index: number) {
        if (index < 0 || index >= this.maxSize || index >= this._size) return undefined;
        let j = this._pointer - this._size + index;
        if (j < 0) j += this.maxSize;
        return this._array[j];
    }

    slice(start?: number, end?: number) {
        let segment1 = this._array.slice(this._pointer); // after pointer
        let segment2 = this._array.slice(0, this._pointer); // before pointer
        let arr = segment1.concat(...segment2); // full array
        let result = arr.slice(-this._size); // remove empty spaces
        return result.slice(start, end);
    }

    clear() {
        this._array = [];
        this._pointer = 0;
        this._size = 0;
    }

    size() {
        return this._size;
    }

    resize(size: number) {
        let currentArray = this.slice();
        this.maxSize = size;
        if (size < this._size) {
            // chop off items in front
            this._array = currentArray.slice(this._size - size);
            this._pointer = 0;
            this._size = size;
        } else {
            this._array = currentArray;
            this._pointer = this._size;
        }
        if (this._pointer >= this.maxSize) this._pointer = 0;
    }
}
