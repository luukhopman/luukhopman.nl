"use client";

import { useEffect, useState } from "react";

type LocalDateTimeProps = {
  value: string;
  className?: string;
};

function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
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
