import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';

export function useDebounceSearch(initialValue: string = '', delay: number = 300) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);

  useEffect(() => {
    if (inputValue === '') {
      setDebouncedValue('');
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedValue(inputValue);
    }, delay);

    return () => clearTimeout(timer);
  }, [inputValue, delay]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const clear = () => {
    setInputValue('');
    setDebouncedValue('');
  };

  return {
    inputValue,
    setInputValue,
    debouncedValue,
    inputProps: {
      value: inputValue,
      onChange,
    },
    clear,
  };
}