import { decode } from "html-entities";

const textFields = new Set([
  "title",
  "course",
  "url",
  "ingredients",
  "instructions",
  "notes",
  "parse_error",
  "parse_warning",
]);

const charReplacements: Record<string, string> = {
  "\u00a0": " ",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00bc": "1/4",
  "\u00bd": "1/2",
  "\u00be": "3/4",
  "\u215b": "1/8",
  "\u215c": "3/8",
  "\u215d": "5/8",
  "\u215e": "7/8",
};

const whitespaceRegex = /[^\S\n]+/g;
const controlCharRegex = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const zeroWidthRegex = /[\u200b\u200c\u200d\ufeff]/g;
const quantity = String.raw`(?:\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)`;
const tempRangeRegex = new RegExp(
  String.raw`\b(?<q1>${quantity})\s*(?<sep>-|to)\s*(?<q2>${quantity})\s*(?:°\s*)?(?:f|fahrenheit)\b`,
  "gi",
);
const tempSingleRegex = new RegExp(
  String.raw`\b(?<q>${quantity})\s*(?:°\s*)?(?:f|fahrenheit)\b`,
  "gi",
);
const tempDegreesRangeRegex = new RegExp(
  String.raw`\b(?<q1>${quantity})\s*(?<sep>-|to)\s*(?<q2>${quantity})\s*(?:°\s*)?(?:degrees?)\b`,
  "gi",
);
const tempDegreesSingleRegex = new RegExp(
  String.raw`\b(?<q>${quantity})\s*(?:°\s*)?(?:degrees?)\b`,
  "gi",
);
const inchSymbolRegex = new RegExp(String.raw`\b(?<q>${quantity})\s*(?:"|”|″)`, "gi");

const usUnitConversions: Array<[string, string, number]> = [
  [String.raw`(?:cups?|cup)`, "ml", 240],
  [String.raw`(?:tablespoons?|tbsp|tbs)`, "ml", 15],
  [String.raw`(?:teaspoons?|tsp)`, "ml", 5],
  [String.raw`(?:fluid\s*ounces?|fl\.?\s*oz)`, "ml", 29.5735],
  [String.raw`(?:pints?|pt)`, "ml", 473.176],
  [String.raw`(?:quarts?|qt)`, "ml", 946.353],
  [String.raw`(?:gallons?|gal)`, "ml", 3785.41],
  [String.raw`(?:pounds?|lbs?|lb)`, "g", 453.592],
  [String.raw`(?:ounces?|oz)`, "g", 28.3495],
  [String.raw`(?:inches|inch|in\.)`, "cm", 2.54],
];

function fixMojibake(value: string) {
  if (!/[ÃÂâœ€™]/.test(value)) {
    return value;
  }

  try {
    const candidate = Buffer.from(value, "latin1").toString("utf8");
    return candidate;
  } catch {
    return value;
  }
}

export function normalizeRecipeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let text = decode(String(value));
  text = fixMojibake(text);
  text = Object.entries(charReplacements).reduce(
    (current, [source, target]) => current.split(source).join(target),
    text,
  );
  text = text.replace(zeroWidthRegex, "");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(controlCharRegex, "");

  return text
    .split("\n")
    .map((line) => line.replace(whitespaceRegex, " ").trim())
    .join("\n")
    .trim();
}

function parseQuantity(value: string) {
  const token = value.trim();
  if (!token) return null;

  try {
    if (token.includes(" ") && token.includes("/")) {
      const [whole, fraction] = token.split(" ", 2);
      const [numerator, denominator] = fraction.split("/", 2);
      return Number(whole) + Number(numerator) / Number(denominator);
    }
    if (token.includes("/")) {
      const [numerator, denominator] = token.split("/", 2);
      return Number(numerator) / Number(denominator);
    }
    return Number(token);
  } catch {
    return null;
  }
}

function formatNumber(value: number) {
  if (Math.abs(value - Math.round(value)) < 0.05) {
    return `${Math.round(value)}`;
  }
  if (value >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatMetricParts(value: number, unit: string): [string, string] {
  if (unit === "ml" && value >= 1000) {
    return [formatNumber(value / 1000), "L"];
  }
  if (unit === "g" && value >= 1000) {
    return [formatNumber(value / 1000), "kg"];
  }
  return [formatNumber(value), unit];
}

function formatMetricValue(value: number, unit: string) {
  const [number, targetUnit] = formatMetricParts(value, unit);
  return `${number} ${targetUnit}`;
}

function formatCelsiusTemp(fahrenheitValue: number) {
  const celsius = ((fahrenheitValue - 32) * 5) / 9;
  if (celsius >= 80) {
    return `${Math.round(celsius / 5) * 5}`;
  }
  return formatNumber(celsius);
}

export function convertUsToMetric(text: string) {
  let converted = text;

  const replaceTempRange = (
    _match: string,
    q1: string,
    sep: string,
    q2: string,
    _offset: number,
    _input: string,
    groups?: Record<string, string>,
  ) => {
    const left = parseQuantity(groups?.q1 ?? q1);
    const right = parseQuantity(groups?.q2 ?? q2);
    const separator = groups?.sep ?? sep;
    if (left === null || right === null) return _match;
    const formatted = `${formatCelsiusTemp(left)}${separator === "-" ? "-" : " to "}${formatCelsiusTemp(right)} C`;
    return formatted;
  };

  converted = converted.replace(tempRangeRegex, replaceTempRange);
  converted = converted.replace(tempSingleRegex, (match, _q, _offset, _input, groups) => {
    const value = parseQuantity(groups?.q ?? "");
    if (value === null) return match;
    return `${formatCelsiusTemp(value)} C`;
  });
  converted = converted.replace(tempDegreesRangeRegex, replaceTempRange);
  converted = converted.replace(tempDegreesSingleRegex, (match, _q, _offset, _input, groups) => {
    const value = parseQuantity(groups?.q ?? "");
    if (value === null) return match;
    return `${formatCelsiusTemp(value)} C`;
  });
  converted = converted.replace(inchSymbolRegex, (match, _q, _offset, _input, groups) => {
    const value = parseQuantity(groups?.q ?? "");
    if (value === null) return match;
    return formatMetricValue(value * 2.54, "cm");
  });

  for (const [unitPattern, targetUnit, factor] of usUnitConversions) {
    const rangeRegex = new RegExp(
      String.raw`\b(?<q1>${quantity})\s*(?<sep>-|to)\s*(?<q2>${quantity})\s*(?<unit>${unitPattern})\b`,
      "gi",
    );
    const singleRegex = new RegExp(
      String.raw`\b(?<q>${quantity})\s*(?<unit>${unitPattern})\b`,
      "gi",
    );

    converted = converted.replace(rangeRegex, (match, _q1, _sep, _q2, _unit, _offset, _input, groups) => {
      const left = parseQuantity(groups?.q1 ?? "");
      const right = parseQuantity(groups?.q2 ?? "");
      const separator = groups?.sep ?? "-";
      if (left === null || right === null) return match;
      const [leftNumber, leftUnit] = formatMetricParts(left * factor, targetUnit);
      const [rightNumber, rightUnit] = formatMetricParts(right * factor, targetUnit);
      if (leftUnit === rightUnit) {
        return separator === "-"
          ? `${leftNumber}-${rightNumber} ${leftUnit}`
          : `${leftNumber} to ${rightNumber} ${leftUnit}`;
      }
      return separator === "-"
        ? `${leftNumber} ${leftUnit}-${rightNumber} ${rightUnit}`
        : `${leftNumber} ${leftUnit} to ${rightNumber} ${rightUnit}`;
    });

    converted = converted.replace(singleRegex, (match, _q, _unit, _offset, _input, groups) => {
      const value = parseQuantity(groups?.q ?? "");
      if (value === null) return match;
      return formatMetricValue(value * factor, targetUnit);
    });
  }

  return converted;
}

export function normalizeRecipePayload(
  payload: Record<string, unknown>,
  options: { convertUnits?: boolean } = {},
) {
  const normalized = { ...payload };
  const convertUnits = options.convertUnits ?? true;

  for (const key of Object.keys(normalized)) {
    if (!textFields.has(key) || normalized[key] === null || normalized[key] === undefined) {
      continue;
    }

    let cleaned = normalizeRecipeText(normalized[key]);
    if (convertUnits && ["ingredients", "instructions", "notes"].includes(key)) {
      cleaned = convertUsToMetric(cleaned);
    }
    normalized[key] = cleaned;
  }

  return normalized;
}
