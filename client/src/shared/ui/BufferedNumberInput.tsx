import { forwardRef, useState, type ComponentProps } from 'react';

type BufferedNumberInputProps = Omit<ComponentProps<'input'>, 'type' | 'value'> & {
  type?: 'number';
  value: number | string | undefined;
};

/** Keep an editable text draft while a controlled numeric setting is focused. */
export const BufferedNumberInput = forwardRef<HTMLInputElement, BufferedNumberInputProps>(function BufferedNumberInput(
  { value, onChange, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <input
      {...props}
      ref={ref}
      type="number"
      value={focused ? draft : String(value ?? '')}
      onFocus={(event) => {
        setDraft(event.currentTarget.value);
        setFocused(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setDraft(next);
        if (next.trim() !== '' && Number.isFinite(Number(next))) onChange?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
    />
  );
});
