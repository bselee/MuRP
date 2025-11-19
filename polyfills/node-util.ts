export const types = {
  isUint8Array(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array;
  },
};

export function deprecate<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}

export function promisify<T extends (...args: any[]) => any>(fn: T) {
  return (...args: any[]) =>
    new Promise((resolve, reject) => {
      fn(...args, (error: unknown, result: unknown) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
}
