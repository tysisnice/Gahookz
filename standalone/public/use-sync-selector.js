import React from "react";

export function useSyncExternalStoreWithSelector(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
  const instRef = React.useRef(null);
  let inst = instRef.current;
  if (inst === null) {
    inst = { hasValue: false, value: null };
    instRef.current = inst;
  }

  const [getSelection, getServerSelection] = React.useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot;
    let memoizedSelection;
    const memoizedSelector = (nextSnapshot) => {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection = selector(nextSnapshot);
        if (isEqual && inst.hasValue && isEqual(inst.value, nextSelection)) {
          memoizedSelection = inst.value;
          return inst.value;
        }
        memoizedSelection = nextSelection;
        return nextSelection;
      }
      if (Object.is(memoizedSnapshot, nextSnapshot)) return memoizedSelection;
      const nextSelection = selector(nextSnapshot);
      if (isEqual && isEqual(memoizedSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot;
        return memoizedSelection;
      }
      memoizedSnapshot = nextSnapshot;
      memoizedSelection = nextSelection;
      return nextSelection;
    };
    return [
      () => memoizedSelector(getSnapshot()),
      getServerSnapshot ? () => memoizedSelector(getServerSnapshot()) : undefined
    ];
  }, [getSnapshot, getServerSnapshot, selector, isEqual]);

  const value = React.useSyncExternalStore(subscribe, getSelection, getServerSelection);
  React.useEffect(() => {
    inst.hasValue = true;
    inst.value = value;
  }, [value]);
  React.useDebugValue(value);
  return value;
}
