"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";

type AutocompleteInputProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  values: string[];
  showOnEmptyFocus?: boolean;
  type?: "text" | "url";
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
  id?: string;
  required?: boolean;
  autoComplete?: string;
};

export function AutocompleteInput({
  value,
  placeholder,
  onChange,
  values,
  showOnEmptyFocus = true,
  type = "text",
  className,
  inputClassName,
  iconClassName,
  id,
  required,
  autoComplete = "off",
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [currentFocus, setCurrentFocus] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const matches = value
    ? values.filter((entry) => entry.toLowerCase().includes(value.toLowerCase()))
    : values;

  const shouldHideExactMatch =
    !!value && values.some((entry) => entry.toLowerCase() === value.toLowerCase());

  const visibleMatches = shouldHideExactMatch ? [] : matches;

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setCurrentFocus(-1);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  function highlight(entry: string) {
    if (!value) return entry;

    const escaped = value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const parts = entry.split(new RegExp(`(${escaped})`, "gi"));

    return parts.map((part, index) =>
      part.toLowerCase() === value.toLowerCase() ? <strong key={index}>{part}</strong> : part,
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleMatches.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCurrentFocus((current) => (current + 1) % visibleMatches.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCurrentFocus((current) =>
        current <= 0 ? visibleMatches.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && currentFocus >= 0) {
      event.preventDefault();
      onChange(visibleMatches[currentFocus]);
      setOpen(false);
      setCurrentFocus(-1);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setCurrentFocus(-1);
    }
  }

  return (
    <div className={className} ref={rootRef}>
      {iconClassName ? <i className={iconClassName} /> : null}
      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className={inputClassName}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setCurrentFocus(-1);
        }}
        onFocus={() => {
          if (showOnEmptyFocus || value.trim() !== "") {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
      />
      <ul className={`autocomplete-dropdown ${open && visibleMatches.length ? "show" : ""}`}>
        {visibleMatches.map((entry, index) => (
          <li
            key={entry}
            className={`autocomplete-item ${index === currentFocus ? "active" : ""}`}
            onMouseDown={(event) => {
              event.preventDefault();
              onChange(entry);
              setOpen(false);
              setCurrentFocus(-1);
            }}
          >
            {highlight(entry)}
          </li>
        ))}
      </ul>
    </div>
  );
}
