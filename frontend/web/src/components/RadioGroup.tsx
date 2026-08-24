"use client";

import { useId, useRef } from 'react';

export type RadioOption = { value: string; label: string };

type RadioGroupProps = {
  /** Visible legend text; doubles as the group's accessible name. */
  legend: string;
  value: string;
  options: RadioOption[];
  onChange: (value: string) => void;
  /** Layout classes for the options container, e.g. "grid grid-cols-3 gap-3". */
  containerClassName?: string;
  /** Classes for each option button; visual state for checked/unchecked is applied automatically. */
  itemClassName?: (checked: boolean) => string;
};

/**
 * Accessible radio group per the WAI-ARIA Authoring Practices pattern:
 * - The group is named by its visible legend (aria-labelledby).
 * - Roving tabindex: the checked option (or the first when none matches) is
 *   the single tab stop.
 * - Arrow keys move selection with wrap-around; Home/End jump to the ends.
 * - Selection follows focus on arrow keys; Space/Enter activate natively.
 */
export function RadioGroup({
  legend,
  value,
  options,
  onChange,
  containerClassName = 'grid gap-2',
  itemClassName,
}: RadioGroupProps) {
  const legendId = useId();
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const defaultItemClass = (checked: boolean) =>
    `p-3 border rounded-lg text-center ${
      checked
        ? 'border-stone-900 bg-stone-100 text-stone-900 font-medium'
        : 'border-gray-300 text-gray-700 hover:border-gray-400'
    }`;

  const selectAndFocus = (optionValue: string) => {
    onChange(optionValue);
    // Focus after React re-renders the roving tabindex so the target stays
    // focusable even though every other item carries tabIndex=-1.
    requestAnimationFrame(() => {
      itemRefs.current[optionValue]?.focus();
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    let targetIndex: number | null = null;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        targetIndex = (currentIndex + 1) % options.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        targetIndex = (currentIndex - 1 + options.length) % options.length;
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = options.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const target = options[targetIndex];
    if (target && target.value !== value) {
      selectAndFocus(target.value);
    }
  };

  const activeValue = options.some((option) => option.value === value)
    ? value
    : options[0]?.value ?? '';

  return (
    <fieldset>
      <legend id={legendId} className="block text-sm font-medium text-gray-700 mb-2">
        {legend}
      </legend>
      <div role="radiogroup" aria-labelledby={legendId} className={containerClassName} onKeyDown={handleKeyDown}>
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                itemRefs.current[option.value] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={activeValue === option.value ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={itemClassName ? itemClassName(checked) : defaultItemClass(checked)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
