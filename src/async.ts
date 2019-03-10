export function isThenable<T>(obj: any): obj is Thenable<T> {
	return obj && typeof (<Promise<any>>obj).then === 'function';
}

export function asThenable<T>(t: T | Thenable<T>) : Thenable<T> {
    if (isThenable(t)) {
        return t;
    } else {
        return Promise.resolve(t);
    }
}