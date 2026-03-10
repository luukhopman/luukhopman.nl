import json
import logging
from typing import Any

import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException

from app.config import GEMINI_API_KEY, GEMINI_API_URL, GEMINI_MODEL
from app.features.cookbook.text import normalize_recipe_payload, normalize_recipe_text

logger = logging.getLogger(__name__)

RECIPE_PARSE_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Short recipe title in English."},
        "course": {
            "type": "string",
            "description": "Short course label like Breakfast, Lunch, Dinner, Dessert, Snack, Drink, Side, Sauce, or Starter.",
        },
        "ingredients": {
            "type": "array",
            "description": "Ingredient lines in English, using EU-style metric units when possible.",
            "items": {"type": "string"},
        },
        "instructions": {
            "type": "array",
            "description": "Ordered cooking steps in English, using Celsius and metric units when possible.",
            "items": {"type": "string"},
        },
        "notes": {
            "type": "string",
            "description": "Optional concise notes about yields, pan sizes, resting times, or EU-standard clarifications.",
        },
        "parse_error": {
            "type": "string",
            "description": "Leave empty unless the page does not contain enough information to reconstruct a usable recipe.",
        },
    },
}


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _is_recipe_type(node_type: Any) -> bool:
    if node_type is None:
        return False
    if isinstance(node_type, list):
        return any(_is_recipe_type(item) for item in node_type)
    return str(node_type).strip().lower() == "recipe"


def _collect_jsonld_nodes(data: Any) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            nodes.append(value)
            for nested in value.values():
                walk(nested)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(data)
    return nodes


def _extract_ingredients(raw_ingredients: Any) -> list[str]:
    ingredients: list[str] = []
    for item in _as_list(raw_ingredients):
        if isinstance(item, str):
            text = normalize_recipe_text(item)
            if text:
                ingredients.append(text)
        elif isinstance(item, dict):
            candidate = normalize_recipe_text(
                item.get("text") or item.get("name") or ""
            )
            if candidate:
                ingredients.append(candidate)
    return ingredients


def _extract_instruction_steps(raw: Any) -> list[str]:
    steps: list[str] = []

    def walk(node: Any) -> None:
        if node is None:
            return
        if isinstance(node, str):
            text = normalize_recipe_text(node)
            if text:
                steps.append(text)
            return
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if isinstance(node, dict):
            text_value = node.get("text") or node.get("name")
            if isinstance(text_value, str):
                text = normalize_recipe_text(text_value)
                if text:
                    steps.append(text)
            for key in ("itemListElement", "steps", "recipeInstructions"):
                if key in node:
                    walk(node.get(key))

    walk(raw)
    return steps


def _select_best_recipe_node(nodes: list[dict[str, Any]]) -> dict[str, Any] | None:
    best_node: dict[str, Any] | None = None
    best_score = -1
    for node in nodes:
        if not _is_recipe_type(node.get("@type")):
            continue
        ingredients = _extract_ingredients(
            node.get("recipeIngredient") or node.get("ingredients")
        )
        instructions = _extract_instruction_steps(node.get("recipeInstructions"))
        score = (
            (4 if instructions else 0)
            + (3 if ingredients else 0)
            + (1 if normalize_recipe_text(node.get("name") or "") else 0)
        )
        if score > best_score:
            best_score = score
            best_node = node
    return best_node


def _recipe_seed_text(result: dict[str, Any]) -> str:
    sections = [
        ("Title", result.get("title") or ""),
        ("Course", result.get("course") or ""),
        ("Ingredients", result.get("ingredients") or ""),
        ("Instructions", result.get("instructions") or ""),
    ]
    return "\n\n".join(
        f"{label}:\n{normalize_recipe_text(value)}"
        for label, value in sections
        if normalize_recipe_text(value)
    )


def _extract_page_text_for_llm(soup: BeautifulSoup, *, limit: int = 18000) -> str:
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = normalize_recipe_text(soup.get_text("\n", strip=True))
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip() + "..."


def _format_gemini_recipe_result(
    payload: dict[str, Any], *, url: str
) -> dict[str, Any] | None:
    ingredients = [
        normalize_recipe_text(item)
        for item in payload.get("ingredients", [])
        if normalize_recipe_text(item)
    ]
    instructions = [
        normalize_recipe_text(item)
        for item in payload.get("instructions", [])
        if normalize_recipe_text(item)
    ]
    formatted = {
        "title": normalize_recipe_text(payload.get("title") or ""),
        "course": normalize_recipe_text(payload.get("course") or ""),
        "url": normalize_recipe_text(url),
        "ingredients": "\n".join(f"- {item}" for item in ingredients),
        "instructions": "\n".join(
            f"{idx + 1}. {step}" for idx, step in enumerate(instructions)
        ),
        "notes": normalize_recipe_text(payload.get("notes") or ""),
        "parse_error": normalize_recipe_text(payload.get("parse_error") or ""),
    }
    if (
        not (formatted["ingredients"] or formatted["instructions"])
        and not formatted["parse_error"]
    ):
        formatted["parse_error"] = "No structured recipe fields found on this page."
    if any(
        formatted[key] for key in ("title", "course", "ingredients", "instructions")
    ):
        return formatted
    return None


async def _parse_recipe_with_gemini(
    *,
    url: str,
    html_content: str,
    seed_result: dict[str, Any],
    convert_units: bool,
) -> dict[str, Any] | None:
    if not GEMINI_API_KEY or not html_content:
        return None

    page_text = _extract_page_text_for_llm(BeautifulSoup(html_content, "html.parser"))
    if not page_text:
        return None

    prompt = (
        "Extract the recipe from the provided webpage content.\n"
        "Return English output.\n"
        "If the source language is not English, translate it to English.\n"
        f"Convert measurements, oven temperatures, and kitchen conventions to EU standards: {'yes' if convert_units else 'no'}.\n"
        "Prefer grams, kilograms, millilitres, litres, centimetres, and Celsius when conversion is requested.\n"
        "Keep ingredient lines concise and practical for cooking.\n"
        "Use the seed extraction when helpful, but correct it if the page text shows better data.\n"
        "If the page is not a recipe or lacks enough content, leave arrays empty and set parse_error.\n\n"
        f"Source URL:\n{url}\n\n"
        f"Seed extraction:\n{_recipe_seed_text(seed_result) or 'None'}\n\n"
        f"Page text:\n{page_text}"
    )
    request_payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "responseJsonSchema": RECIPE_PARSE_JSON_SCHEMA,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent",
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": GEMINI_API_KEY,
                },
                json=request_payload,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as err:
        status_code = (
            err.response.status_code if err.response is not None else "unknown"
        )
        logger.warning(
            "Gemini request failed for recipe url=%s status=%s detail=%s",
            url,
            status_code,
            err,
        )
        return None
    except httpx.RequestError as err:
        logger.warning("Gemini request failed for recipe url=%s detail=%s", url, err)
        return None

    try:
        data = response.json()
        candidates = data.get("candidates") or []
        parts = ((candidates[0] or {}).get("content") or {}).get("parts") or []
        response_text = next(
            (
                part.get("text")
                for part in parts
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            ),
            "",
        )
        payload = json.loads(response_text) if response_text else None
    except (IndexError, KeyError, TypeError, json.JSONDecodeError):
        logger.exception("Gemini response parsing failed for recipe url=%s", url)
        return None

    if not payload:
        return None
    formatted = _format_gemini_recipe_result(payload, url=url)
    if not formatted:
        return None
    return normalize_recipe_payload(formatted, convert_units=convert_units)


def _fallback_recipe_payload(
    url: str, message: str, *, convert_units: bool
) -> dict[str, Any]:
    return normalize_recipe_payload(
        {
            "title": fallback_title(url),
            "course": "",
            "url": normalize_recipe_text(url),
            "ingredients": "",
            "instructions": "",
            "notes": "",
            "parse_error": normalize_recipe_text(message),
            "parse_source": "fallback",
        },
        convert_units=convert_units,
    )


def fallback_title(input_url: str) -> str:
    try:
        path = httpx.URL(input_url).path.strip("/")
        if not path:
            return "New Recipe"
        slug = path.split("/")[-1].replace("-", " ").strip()
        return slug.title() if slug else "New Recipe"
    except Exception:
        return "New Recipe"


async def parse_recipe_url(url: str, *, convert_units: bool = True) -> dict[str, Any]:
    browser_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
    }
    result = {
        "title": "",
        "course": "",
        "url": normalize_recipe_text(url),
        "ingredients": "",
        "instructions": "",
        "notes": "",
        "parse_error": "",
        "parse_source": "basic",
    }

    try:
        parsed_url = httpx.URL(url)
        if parsed_url.scheme not in {"http", "https"}:
            raise ValueError("URL must be http or https")
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Invalid URL: {err}") from err

    html_content = ""
    last_error = None
    try:
        async with httpx.AsyncClient(
            headers=browser_headers, follow_redirects=True, timeout=15.0
        ) as client:
            response = await client.get(url)
            if response.status_code < 400:
                html_content = response.text
            else:
                last_error = f"HTTP {response.status_code}"
    except Exception as err:
        last_error = str(err)

    if not html_content:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                proxy_resp = await client.get(f"https://r.jina.ai/{url}")
                if proxy_resp.status_code < 400:
                    html_content = proxy_resp.text
                else:
                    last_error = f"Proxy HTTP {proxy_resp.status_code}"
        except httpx.HTTPError as err:
            last_error = str(err)

    if not html_content:
        return _fallback_recipe_payload(
            url,
            f"Could not auto-parse this page ({last_error or 'unknown error'}).",
            convert_units=convert_units,
        )

    try:
        soup = BeautifulSoup(html_content, "html.parser")
        recipe_nodes: list[dict[str, Any]] = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                script_text = script.string or script.get_text(strip=True)
                if script_text:
                    recipe_nodes.extend(_collect_jsonld_nodes(json.loads(script_text)))
            except (json.JSONDecodeError, TypeError) as err:
                logger.debug("Skipping invalid JSON-LD block: %s", err)

        best_recipe_node = _select_best_recipe_node(recipe_nodes)
        if best_recipe_node:
            result["title"] = result["title"] or best_recipe_node.get("name") or ""
            ingredients = _extract_ingredients(
                best_recipe_node.get("recipeIngredient")
                or best_recipe_node.get("ingredients")
            )
            if ingredients and not result["ingredients"]:
                result["ingredients"] = "\n".join(f"- {item}" for item in ingredients)
            steps = _extract_instruction_steps(
                best_recipe_node.get("recipeInstructions")
            )
            if steps and not result["instructions"]:
                result["instructions"] = "\n".join(
                    f"{idx + 1}. {step}" for idx, step in enumerate(steps)
                )

        if not result["title"]:
            og_title = soup.find("meta", property="og:title")
            result["title"] = (
                og_title.get("content", "")
                if og_title
                else (soup.title.string if soup.title else "")
            )

        if not result["ingredients"]:
            ingredient_nodes = soup.select(
                '[itemprop="recipeIngredient"], .recipe-ingredients li, .ingredients li'
            )
            clean_ingredients = [
                text
                for text in (
                    normalize_recipe_text(node.get_text(" ", strip=True))
                    for node in ingredient_nodes
                )
                if text
            ]
            if clean_ingredients:
                result["ingredients"] = "\n".join(
                    f"- {item}" for item in clean_ingredients
                )

        if not result["instructions"]:
            instruction_nodes = soup.select(
                '[itemprop="recipeInstructions"] li, .recipe-instructions li, .instructions li'
            )
            clean_steps = [
                text
                for text in (
                    normalize_recipe_text(node.get_text(" ", strip=True))
                    for node in instruction_nodes
                )
                if text
            ]
            if clean_steps:
                result["instructions"] = "\n".join(
                    f"{idx + 1}. {step}" for idx, step in enumerate(clean_steps)
                )

        for key in (
            "title",
            "course",
            "ingredients",
            "instructions",
            "notes",
        ):
            result[key] = normalize_recipe_text(result[key]) if result[key] else ""

        gemini_result = await _parse_recipe_with_gemini(
            url=url,
            html_content=html_content,
            seed_result=result,
            convert_units=convert_units,
        )
        if gemini_result:
            for key, value in gemini_result.items():
                if key != "url" and normalize_recipe_text(value):
                    result[key] = value
            result["parse_source"] = "gemini"

        if not result["title"]:
            result["title"] = fallback_title(url)
        if not result["ingredients"] and not result["instructions"]:
            result["parse_error"] = "No structured recipe fields found on this page."
        return normalize_recipe_payload(result, convert_units=convert_units)
    except Exception as err:
        logger.exception("Recipe parsing failed for url=%s", url)
        return _fallback_recipe_payload(
            url,
            f"Could not fully parse this page ({err}).",
            convert_units=convert_units,
        )
