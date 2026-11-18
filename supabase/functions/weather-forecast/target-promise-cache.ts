/** Deduplicate concurrent work for an exact forecast target key. */
export const createTargetPromiseCache = <T>() => {
  const pending = new Map<string, Promise<T>>();
  return (key: string, loader: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = loader();
    pending.set(key, promise);
    const clear = () => {
      if (pending.get(key) === promise) pending.delete(key);
    };
    void promise.then(clear, clear);
    return promise;
  };
};
