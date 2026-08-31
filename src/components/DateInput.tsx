import type { InputHTMLAttributes } from 'react';

// 네이티브 날짜 입력의 연도 6자리 요구(Chromium quirk) 방지용 기본 범위.
// max 의 연도가 4자리(2500)라 연도 칸이 4자리로 제한된다. min/max 는 호출부에서 override 가능.
const DEFAULT_MIN_DATE = '1901-01-01';
const DEFAULT_MAX_DATE = '2500-12-31';
const DEFAULT_MIN_DATETIME = '1901-01-01T00:00';
const DEFAULT_MAX_DATETIME = '2500-12-31T23:59';

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type?: 'date' | 'datetime-local';
};

// <input type="date" | "datetime-local"> 얇은 래퍼. 기본 min/max 만 주입하고
// value·onChange·style·className·required 등 나머지 prop 은 그대로 전달한다.
export function DateInput({ type = 'date', min, max, ...rest }: DateInputProps) {
  const isDateTime = type === 'datetime-local';
  return (
    <input
      {...rest}
      type={type}
      min={min ?? (isDateTime ? DEFAULT_MIN_DATETIME : DEFAULT_MIN_DATE)}
      max={max ?? (isDateTime ? DEFAULT_MAX_DATETIME : DEFAULT_MAX_DATE)}
    />
  );
}
