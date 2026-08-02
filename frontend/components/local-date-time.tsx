"use client";

import { useEffect, useState } from "react";

type LocalDateTimeProps = {
  value: string;
  className?: string;
};

function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function LocalDateTime({ value, className }: LocalDateTimeProps) {
  const [label, setLabel] = useState(() => formatLocalDateTime(value));

  useEffect(() => {
    setLabel(formatLocalDateTime(value));
  }, [value]);

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}
