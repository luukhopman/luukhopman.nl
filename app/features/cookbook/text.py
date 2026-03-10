import html
import re
import unicodedata
from typing import Any

RECIPE_TEXT_FIELDS = {
    "title",
    "course",
    "url",
    "ingredients",
    "instructions",
    "notes",
}

_CHAR_REPLACEMENTS = str.maketrans(
    {
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
    }
)

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ZERO_WIDTH_RE = re.compile(r"[\u200b\u200c\u200d\ufeff]")
_WHITESPACE_RE = re.compile(r"[^\S\n]+")
_QUANTITY_RE = r"(?:\d+(?:\.\d+)?(?:\s+\d+/\d+)?|\d+/\d+)"
_TEMP_RANGE_RE = re.compile(
    rf"(?i)\b(?P<q1>{_QUANTITY_RE})\s*(?P<sep>-|to)\s*(?P<q2>{_QUANTITY_RE})\s*(?:°\s*)?(?:f|fahrenheit)\b"
)
_TEMP_SINGLE_RE = re.compile(
    rf"(?i)\b(?P<q>{_QUANTITY_RE})\s*(?:°\s*)?(?:f|fahrenheit)\b"
)
_TEMP_DEGREES_RANGE_RE = re.compile(
    rf"(?i)\b(?P<q1>{_QUANTITY_RE})\s*(?P<sep>-|to)\s*(?P<q2>{_QUANTITY_RE})\s*(?:°\s*)?(?:degrees?)\b"
)
_TEMP_DEGREES_SINGLE_RE = re.compile(
    rf"(?i)\b(?P<q>{_QUANTITY_RE})\s*(?:°\s*)?(?:degrees?)\b"
)
_INCH_SYMBOL_RE = re.compile(rf"(?i)\b(?P<q>{_QUANTITY_RE})\s*(?:\"|”|″)")

_US_UNIT_CONVERSIONS: list[tuple[str, str, float]] = [
    (r"(?:cups?|cup)", "ml", 240.0),
    (r"(?:tablespoons?|tbsp|tbs)", "ml", 15.0),
    (r"(?:teaspoons?|tsp)", "ml", 5.0),
    (r"(?:fluid\s*ounces?|fl\.?\s*oz)", "ml", 29.5735),
    (r"(?:pints?|pt)", "ml", 473.176),
    (r"(?:quarts?|qt)", "ml", 946.353),
    (r"(?:gallons?|gal)", "ml", 3785.41),
    (r"(?:pounds?|lbs?|lb)", "g", 453.592),
    (r"(?:ounces?|oz)", "g", 28.3495),
    (r"(?:inches|inch|in\.)", "cm", 2.54),
]


def _mojibake_score(value: str) -> int:
    markers = ("Ã", "Â", "â", "œ", "€", "™", "�")
    return sum(value.count(marker) for marker in markers)


def _fix_mojibake(value: str) -> str:
    if not value or _mojibake_score(value) == 0:
        return value
    try:
        candidate = value.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return value
    return candidate if _mojibake_score(candidate) < _mojibake_score(value) else value


def normalize_recipe_text(value: Any) -> str:
    if value is None:
        return ""
    text = html.unescape(str(value))
    text = _fix_mojibake(text)
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_CHAR_REPLACEMENTS)
    text = _ZERO_WIDTH_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL_CHAR_RE.sub("", text)
    lines = [_WHITESPACE_RE.sub(" ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _parse_quantity(value: str) -> float | None:
    token = value.strip()
    if not token:
        return None
    try:
        if " " in token and "/" in token:
            whole, frac = token.split(" ", 1)
            num, den = frac.split("/", 1)
            return float(whole) + (float(num) / float(den))
        if "/" in token:
            num, den = token.split("/", 1)
            return float(num) / float(den)
        return float(token)
    except ValueError:
        return None


def _format_number(value: float) -> str:
    if abs(value - round(value)) < 0.05:
        return str(int(round(value)))
    if value >= 10:
        return f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _format_metric_parts(value: float, target_unit: str) -> tuple[str, str]:
    if target_unit == "ml" and value >= 1000:
        return _format_number(value / 1000), "L"
    if target_unit == "g" and value >= 1000:
        return _format_number(value / 1000), "kg"
    return _format_number(value), target_unit


def _format_metric_value(value: float, target_unit: str) -> str:
    number, unit = _format_metric_parts(value, target_unit)
    return f"{number} {unit}"


def _format_celsius_temp(fahrenheit_value: float) -> str:
    celsius = (fahrenheit_value - 32) * 5 / 9
    if celsius >= 80:
        return str(int(round(celsius / 5) * 5))
    return _format_number(celsius)


def convert_us_to_metric(text: str) -> str:
    converted = text

    def replace_temp_range(match: re.Match[str]) -> str:
        q1 = _parse_quantity(match.group("q1"))
        q2 = _parse_quantity(match.group("q2"))
        if q1 is None or q2 is None:
            return match.group(0)
        c1 = _format_celsius_temp(q1)
        c2 = _format_celsius_temp(q2)
        return f"{c1}-{c2} C" if match.group("sep") == "-" else f"{c1} to {c2} C"

    def replace_temp_single(match: re.Match[str]) -> str:
        q = _parse_quantity(match.group("q"))
        if q is None:
            return match.group(0)
        return f"{_format_celsius_temp(q)} C"

    def replace_inches_symbol(match: re.Match[str]) -> str:
        q = _parse_quantity(match.group("q"))
        if q is None:
            return match.group(0)
        return _format_metric_value(q * 2.54, "cm")

    converted = _TEMP_RANGE_RE.sub(replace_temp_range, converted)
    converted = _TEMP_SINGLE_RE.sub(replace_temp_single, converted)
    converted = _TEMP_DEGREES_RANGE_RE.sub(replace_temp_range, converted)
    converted = _TEMP_DEGREES_SINGLE_RE.sub(replace_temp_single, converted)
    converted = _INCH_SYMBOL_RE.sub(replace_inches_symbol, converted)

    for unit_pattern, target, factor in _US_UNIT_CONVERSIONS:
        range_re = re.compile(
            rf"(?i)\b(?P<q1>{_QUANTITY_RE})\s*(?P<sep>-|to)\s*(?P<q2>{_QUANTITY_RE})\s*(?P<unit>{unit_pattern})\b"
        )
        single_re = re.compile(
            rf"(?i)\b(?P<q>{_QUANTITY_RE})\s*(?P<unit>{unit_pattern})\b"
        )

        def replace_range(
            match: re.Match[str], *, _factor: float = factor, _target: str = target
        ) -> str:
            q1 = _parse_quantity(match.group("q1"))
            q2 = _parse_quantity(match.group("q2"))
            if q1 is None or q2 is None:
                return match.group(0)
            left_num, left_unit = _format_metric_parts(q1 * _factor, _target)
            right_num, right_unit = _format_metric_parts(q2 * _factor, _target)
            if left_unit == right_unit:
                return (
                    f"{left_num}-{right_num} {left_unit}"
                    if match.group("sep") == "-"
                    else f"{left_num} to {right_num} {left_unit}"
                )
            return (
                f"{left_num} {left_unit}-{right_num} {right_unit}"
                if match.group("sep") == "-"
                else f"{left_num} {left_unit} to {right_num} {right_unit}"
            )

        def replace_single(
            match: re.Match[str], *, _factor: float = factor, _target: str = target
        ) -> str:
            q = _parse_quantity(match.group("q"))
            if q is None:
                return match.group(0)
            return _format_metric_value(q * _factor, _target)

        converted = range_re.sub(replace_range, converted)
        converted = single_re.sub(replace_single, converted)

    return converted


def normalize_recipe_payload(
    payload: dict[str, Any], *, convert_units: bool = True
) -> dict[str, Any]:
    normalized = dict(payload)
    for key in RECIPE_TEXT_FIELDS:
        if key not in normalized or normalized[key] is None:
            continue
        cleaned = normalize_recipe_text(normalized[key])
        if convert_units and key in {
            "ingredients",
            "instructions",
            "notes",
        }:
            cleaned = convert_us_to_metric(cleaned)
        normalized[key] = cleaned
    return normalized
