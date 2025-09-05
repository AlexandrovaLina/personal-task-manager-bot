import { reduce } from 'lodash';

export interface PromiseHandler<T, R> {
  (item: T, index: number): Promise<T | R | void | null | undefined>;
}

export function forEachPromise<T, R>(
  arr: undefined | T[],
  handler: PromiseHandler<T, R>,
) {
  return reduce(
    arr,
    (current: Promise<any>, item: T, index: number) =>
      current.then(() => handler(item, index)),
    Promise.resolve(),
  );
}
