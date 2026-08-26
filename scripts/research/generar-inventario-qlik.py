#!/usr/bin/env python3
"""Genera un inventario reproducible de la superficie Qlik Cloud relevante al compilador."""
from __future__ import annotations
import concurrent.futures, html, json, re, urllib.request
from collections import deque
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlparse, urlunparse

BASE = "https://help.qlik.com"
ROOT = BASE + "/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/"
UA = {"User-Agent": "qlik-reportes-compiler-research/1.0"}
OUT = Path("docs/research/qlik-language-inventory.json")


def canonical(url: str) -> str:
    url, _ = urldefrag(urljoin(BASE, url))
    p = urlparse(url)
    return urlunparse((p.scheme, p.netloc, p.path, "", "", ""))


def get(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "ignore")


def anchors(source: str):
    for href, body in re.findall(r'href="([^"]+)"[^>]*>(.*?)</a>', source, re.S | re.I):
        text = re.sub("<[^>]+>", "", body)
        text = html.unescape(re.sub(r"\s+", " ", text)).strip()
        if text:
            yield href, text


def plain_text(source: str) -> str:
    text = re.sub(r"<script\b.*?</script>|<style\b.*?</style>", " ", source, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(re.sub(r"\s+", " ", text)).strip()


def expandable_buttons(source: str):
    for body in re.findall(r'<button[^>]*class="[^"]*expandable-button[^"]*"[^>]*>(.*?)</button>', source, re.S | re.I):
        label = html.unescape(re.sub(r"\s+", " ", re.sub("<[^>]+>", "", body))).strip()
        if label:
            yield label


def expandable_sections(source: str):
    pattern = re.compile(
        r'<section[^>]*class="[^"]*expandable[^"]*"[^>]*>.*?'
        r'<button[^>]*class="[^"]*expandable-button[^"]*"[^>]*>(.*?)</button>'
        r'(.*?)</section>',
        re.S | re.I,
    )
    for button, body in pattern.findall(source):
        label = html.unescape(re.sub(r"\s+", " ", re.sub("<[^>]+>", "", button))).strip()
        text = plain_text(body)
        if label:
            yield label, text


def section_declares_script_capable(text: str) -> bool:
    low = text.casefold()
    phrases = (
        "script function",
        "can be used in both the data load script and in a chart expression",
        "can be used in both the data load script and chart expressions",
        "can be used in the data load script and in a chart expression",
        "can be used in the data load script and chart expressions",
        "can be used in the data load script",
    )
    return any(phrase in low for phrase in phrases)


def page_declares_all_functions_script_capable(source: str) -> bool:
    text = plain_text(source).casefold()
    patterns = (
        r"all functions can be used in both the data load script and in chart expressions",
        r"all functions can be used in both the load script and in chart expressions",
        r"all range functions can be used in both the data load script and in chart expressions",
        r"all range functions can be used in both the load script and in chart expressions",
    )
    return any(re.search(pattern, text) for pattern in patterns)


def current_english(url: str) -> bool:
    return "/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/" in canonical(url)


def scrape_processors():
    url = ROOT + "DataFlow/List-of-data-flow-processors.htm"
    result, seen = [], set()
    for href, label in anchors(get(url)):
        full = canonical(href)
        if "/DataFlow/data-flow-processor-" not in full or full in seen:
            continue
        seen.add(full)
        name = re.sub(r"\s+processor.*$", "", label, flags=re.I).strip()
        result.append({"name": name, "label": label, "url": full})
    return result


def scrape_function_catalog():
    root = ROOT + "Scripting/functions-in-scripts-chart-expressions.htm"
    source = get(root)
    roots = []
    for href, label in anchors(source):
        full = canonical(href)
        low = label.lower()
        if not current_english(full) or "functions" not in low or full == canonical(root):
            continue
        if any(x in low for x in ("next topic", "previous topic", "not supported", "not recommended")):
            continue
        if "/Scripting/" not in full and "/ChartFunctions/" not in full:
            continue
        roots.append((full, label))

    # Crawl category pages and nested aggregation/category indexes, but never the whole docs tree.
    category_pages: dict[str, str] = dict(roots)
    q = deque(roots)
    seen_pages = set()
    page_html: dict[str, str] = {}
    while q:
        url, category = q.popleft()
        if url in seen_pages:
            continue
        seen_pages.add(url)
        try:
            src = get(url)
        except Exception:
            continue
        page_html[url] = src
        for href, label in anchors(src):
            full = canonical(href)
            if not current_english(full) or full == url:
                continue
            low = label.lower()
            if "functions" not in low:
                continue
            if any(x in low for x in ("next topic", "previous topic", "not supported", "not recommended")):
                continue
            if "/Scripting/" not in full and "/ChartFunctions/" not in full:
                continue
            # Child category indexes are allowed even if they live in a sibling folder.
            if full not in category_pages:
                category_pages[full] = label
                q.append((full, label))

    functions: dict[tuple[str, str], dict] = {}
    for url, category in category_pages.items():
        src = page_html.get(url)
        if src is None:
            try:
                src = get(url)
            except Exception:
                continue
        base_no_fragment = canonical(url)
        for href, label in anchors(src):
            full_joined = urljoin(BASE, href)
            full = canonical(full_joined)
            if not current_english(full):
                continue
            low = label.lower()
            if any(x in low for x in ("next topic", "previous topic")):
                continue
            kind = next((k for k in ("Script and chart function", "Script function", "Chart function") if k.lower() in low), None)
            if kind:
                name = re.sub(r"\s*(?:-\s*)?(Script and chart function|Script function|Chart function).*", "", label, flags=re.I).strip()
                if name:
                    functions[(name.casefold(), full_joined)] = {
                        "name": name,
                        "kind": kind,
                        "category": category,
                        "url": full_joined,
                        "script_capable": "Script" in kind,
                        "discovery": "function-link",
                    }
                continue
            # Some official pages expose each function as an anchor on the same combined page.
            parsed = urlparse(full_joined)
            if canonical(full_joined) == base_no_fragment and parsed.fragment:
                if 0 < len(label) <= 60 and re.fullmatch(r"[A-Za-z][A-Za-z0-9_. -]*", label):
                    if not any(x in low for x in ("next topic", "previous topic", "functions", "example", "syntax")):
                        functions[(label.casefold(), full_joined)] = {
                            "name": label,
                            "kind": "Script and chart function",
                            "category": category,
                            "url": full_joined,
                            "script_capable": True,
                            "discovery": "same-page-anchor",
                        }

        # Some Qlik category pages document functions only as expandable buttons.
        # We only promote them when the page explicitly states every function on
        # that page is valid in both load script and chart expressions.
        known_in_category = {
            (item["name"].casefold(), item["category"])
            for item in functions.values()
        }
        if page_declares_all_functions_script_capable(src):
            for label in expandable_buttons(src):
                if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_#.-]*", label):
                    continue
                low = label.casefold()
                if low in {"learn more", "example", "examples"}:
                    continue
                key = (low, category)
                if key in known_in_category:
                    continue
                function_url = f"{base_no_fragment}#{label}"
                functions[(low, function_url)] = {
                    "name": label,
                    "kind": "Script and chart function",
                    "category": category,
                    "url": function_url,
                    "script_capable": True,
                    "discovery": "combined-page-expandable",
                }
                known_in_category.add(key)

        # Mixed pages can contain both script-capable and chart-only functions.
        # Promote only sections that explicitly declare script availability.
        for label, section_text in expandable_sections(src):
            if not section_declares_script_capable(section_text):
                continue
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_#.-]*\s*", label):
                continue
            label = label.strip()
            low = label.casefold()
            key = (low, category)
            if key in known_in_category:
                continue
            function_url = f"{base_no_fragment}#{label}"
            functions[(low, function_url)] = {
                "name": label,
                "kind": "Script and chart function",
                "category": category,
                "url": function_url,
                "script_capable": True,
                "discovery": "section-script-capable",
            }
            known_in_category.add(key)
    # Qlik currently labels a few function links as chart-only even though the
    # same current documentation explicitly defines their data-load-script use.
    # Keep these overrides narrow and source-backed rather than weakening the
    # general chart-vs-script classifier.
    for item in functions.values():
        if item["name"].casefold() == "chi2test_p" and item["category"] == "Chi2-test functions":
            item["kind"] = "Script and chart function"
            item["script_capable"] = True
            item["discovery"] = "documented-script-override"

    mutual_info_script_url = (
        ROOT + "Scripting/StatisticalAggregationFunctions/statistical-aggregation-functions.htm#MutualInfo"
    )
    if not any(
        item["name"].casefold() == "mutualinfo"
        and item["category"] == "Statistical aggregation functions"
        for item in functions.values()
    ):
        functions[("mutualinfo", mutual_info_script_url)] = {
            "name": "MutualInfo",
            "kind": "Script and chart function",
            "category": "Statistical aggregation functions",
            "url": mutual_info_script_url,
            "script_capable": True,
            "discovery": "documented-script-override",
        }

    documented_variants = {
        "CountRegEx": "CountRegExI",
        "ExtractRegEx": "ExtractRegExI",
        "ExtractRegExGroup": "ExtractRegExGroupI",
        "IndexRegEx": "IndexRegExI",
        "IndexRegExGroup": "IndexRegExGroupI",
        "IsRegEx": "IsRegExI",
        "MatchRegEx": "MatchRegExI",
        "ReplaceRegEx": "ReplaceRegExI",
        "ReplaceRegExGroup": "ReplaceRegExGroupI",
        "SubFieldRegEx": "SubFieldRegExI",
    }
    by_name = {item["name"].casefold(): item for item in functions.values()}
    for base_name, variant_name in documented_variants.items():
        base = by_name.get(base_name.casefold())
        if not base:
            continue
        variant = {
            **base,
            "name": variant_name,
            "discovery": "documented-case-insensitive-variant",
            "variant_of": base_name,
        }
        functions[(variant_name.casefold(), base["url"])] = variant

    return list(category_pages.items()), sorted(functions.values(), key=lambda x: (x["category"], x["name"].casefold()))


def scrape_statements():
    roots = {
        "control": ROOT + "Scripting/ScriptControlStatements/script-control-statements.htm",
        "prefix": ROOT + "Scripting/ScriptPrefixes/script-prefixes.htm",
        "regular": ROOT + "Scripting/ScriptRegularStatements/script-regular-statements.htm",
    }
    result = []
    for family, url in roots.items():
        folder = canonical(url).rsplit("/", 1)[0] + "/"
        seen = set()
        for href, label in anchors(get(url)):
            full = canonical(href)
            if not full.startswith(folder) or full == canonical(url) or full in seen:
                continue
            seen.add(full)
            if any(x in label.lower() for x in ("next topic", "previous topic")) or len(label) > 90:
                continue
            result.append({"family": family, "name": label, "url": full})
    return result


def scrape_operators():
    root = ROOT + "Scripting/Operators/operators.htm"
    groups = []
    for href, label in anchors(get(root)):
        full = canonical(href)
        if full == canonical(root) or "/Scripting/Operators/" not in full or not current_english(full):
            continue
        if label.lower().endswith("operators") and len(label) < 60:
            groups.append({"name": label, "url": full})
    # Operator symbols/keywords are more reliable as explicitly-versioned language contract.
    operators = [
        {"family": "numeric", "operator": x} for x in ["+", "-", "*", "/"]
    ] + [
        {"family": "bit", "operator": x} for x in ["bitnot", "bitand", "bitor", "bitxor", ">>", "<<"]
    ] + [
        {"family": "relational", "operator": x} for x in ["=", "<>", "<", ">", "<=", ">=", "precedes", "follows"]
    ] + [
        {"family": "logical", "operator": x} for x in ["and", "or", "not", "xor"]
    ] + [
        {"family": "string", "operator": x} for x in ["&", "like"]
    ]
    return groups, operators


def main():
    processors = scrape_processors()
    categories, functions = scrape_function_catalog()
    statements = scrape_statements()
    operator_groups, operators = scrape_operators()
    payload = {
        "generated_at": "2026-08-21",
        "source": "Qlik Cloud Help (official, current cloud-services tree)",
        "source_roots": {
            "dataflow_processors": ROOT + "DataFlow/List-of-data-flow-processors.htm",
            "functions": ROOT + "Scripting/functions-in-scripts-chart-expressions.htm",
            "operators": ROOT + "Scripting/Operators/operators.htm",
        },
        "dataflow_processors": processors,
        "script_function_categories": [{"name": label, "url": url} for url, label in categories],
        "script_functions": functions,
        "script_statements": statements,
        "operator_groups": operator_groups,
        "operators": operators,
        "counts": {
            "dataflow_processors": len(processors),
            "function_category_pages": len(categories),
            "functions_discovered": len(functions),
            "script_capable_functions": sum(bool(f["script_capable"]) for f in functions),
            "statements_and_prefixes": len(statements),
            "operators_tracked": len(operators),
        },
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["counts"], indent=2))

if __name__ == "__main__":
    main()
