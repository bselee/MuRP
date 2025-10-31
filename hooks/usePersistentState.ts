import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { loadState, saveState } from '../services/storageService';

const usePersistentState = <T,>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] => {
  const [state, setState] = useState<T>(() => loadState<T>(key, initialValue));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    saveState<T>(key, state);
  }, [key, state]);

  return [state, setState];
};

export default usePersistentState;
