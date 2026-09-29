"""Extract Hacker 3 Reading questions, source crops, and review findings.

The PDF has ten 29-page tests with a mixed text/scan layer. This script keeps
the original page coordinates and never guesses a missing question or answer.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources/toeic/hacker/rc/question/Hacker 3 RC.pdf"
ANSWERS = ROOT / "content/toeic-hacker-answers.json"
OUTPUT = ROOT / "content/toeic-hacker-items.json"
OVERRIDES = ROOT / "content/toeic-hacker-overrides.json"
GROUP = re.compile(r"Questions?\s+(\d{3})\s*[-–]\s*(\d{3})\s+refer", re.I)
QUESTION = re.compile(r"(10[1-9]|1[1-9]\d|200)\.")
OPTION = re.compile(r"\(([ABCD])\)")


def normalize(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace("�", "-").replace("(cid:3)", "")


def line_text(words: list[dict]) -> str:
    """Keep real gaps; these can represent missing blanks in the PDF layer."""
    words = sorted(words, key=lambda word: word["x0"])
    if not words:
        return ""
    result = words[0]["text"]
    for previous, current in zip(words, words[1:]):
        gap = current["x0"] - previous["x1"]
        separator = " ______ " if gap > 27 else " " if gap > 1 else ""
        result += separator + current["text"]
    return normalize(result)


def text_in_region(words: list[dict], left: float, top: float, right: float, bottom: float) -> str:
    selected = [
        word for word in words
        if left <= word["x0"] < right and top - 1 <= word["top"] < bottom
    ]
    lines: list[list[dict]] = []
    for word in sorted(selected, key=lambda item: (item["top"], item["x0"])):
        if lines and abs(lines[-1][0]["top"] - word["top"]) < 4:
            lines[-1].append(word)
        else:
            lines.append([word])
    return normalize(" ".join(line_text(line) for line in lines))


def option_markers(words: list[dict], anchor: dict) -> list[dict] | None:
    selected = [
        word for word in words
        if OPTION.match(word["text"])
        and -5 <= word["x0"] - anchor["x0"] <= 65
        and anchor["top"] - 3 <= word["top"] <= anchor["top"] + 205
    ]
    selected.sort(key=lambda word: word["top"])
    for start, item in enumerate(selected):
        if not item["text"].startswith("(A)"):
            continue
        markers = [item]
        for letter in "BCD":
            following = next(
                (
                    word for word in selected[start + 1:]
                    if word["text"].startswith(f"({letter})")
                    and word["top"] > markers[-1]["top"] + 2
                ),
                None,
            )
            if following is None or following["top"] - markers[-1]["top"] > 130:
                break
            markers.append(following)
        if len(markers) == 4:
            return markers
    return None


def questions_on_page(page: pdfplumber.page.Page) -> dict[int, dict]:
    words = page.extract_words(x_tolerance=1, y_tolerance=3)
    candidates: dict[int, dict] = {}
    question_words = [word for word in words if QUESTION.match(word["text"])]
    for anchor in words:
        match = QUESTION.match(anchor["text"])
        if not match:
            continue
        number = int(match.group(1))
        markers = option_markers(words, anchor)
        if markers is None:
            continue
        left = max(0, anchor["x0"] - 3)
        right = page.width / 2 - 12 if anchor["x0"] < page.width / 2 - 10 else page.width - 60
        right = max(right, markers[0]["x0"] + 95)
        crop_right = right + 4
        if anchor["x0"] < page.width / 2 - 10:
            other_column = min(
                (word["x0"] for word in question_words if word["x0"] > page.width / 2 - 10),
                default=page.width / 2 + 22,
            )
            crop_right = max(crop_right, min(page.width / 2 + 18, other_column - 4))
        stem = text_in_region(words, left, anchor["top"], right, markers[0]["top"] - 1)
        stem = re.sub(rf"^{number}\.\s*", "", stem)
        options = {}
        next_question_top = min(
            (
                word["top"] for word in question_words
                if word["top"] > anchor["top"] + 5
                and abs(word["x0"] - anchor["x0"]) < 30),
            default=page.height,
        )
        for index, marker in enumerate(markers):
            next_top = (
                markers[index + 1]["top"] - 1 if index < 3
                else min(marker["top"] + 46, next_question_top - 2)
            )
            value = text_in_region(words, marker["x0"], marker["top"], right, next_top)
            value = re.sub(rf"^\([ABCD]\)\s*", "", value)
            value = re.split(r"\s1\d\d\.\s+[A-Z]", value, maxsplit=1)[0]
            value = re.split(r"\s______\s|\sGO ON TO THE NEXT PAGE|\sTEST\s+\d", value, maxsplit=1)[0]
            options["ABCD"[index]] = value
        candidate = {
            "stem": stem,
            "options": options,
            "box": [
                round(left - 4, 1), round(anchor["top"] - 5, 1),
                round(min(page.width, crop_right), 1),
                round(min(page.height - 24, markers[-1]["bottom"] + 38, next_question_top - 3), 1),
            ],
            "anchorTop": anchor["top"],
            "lastOptionTop": markers[-1]["top"],
        }
        # Part 6's blank number appears in the passage too. The answer panel
        # has four A-D markers and appears below that occurrence.
        if number not in candidates or candidate["anchorTop"] > candidates[number]["anchorTop"]:
            candidates[number] = candidate
    return candidates


def find_groups(pages: list[pdfplumber.page.Page], test: int) -> list[dict]:
    groups = []
    for index, page in enumerate(pages):
        text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
        for match in GROUP.finditer(text):
            first, last = map(int, match.groups())
            if not (131 <= first <= last <= 200):
                continue
            first_word = next(
                (word for word in page.extract_words() if word["text"] == str(first)), None
            )
            # Header position is checked again against question positions below.
            groups.append({
                "id": f"hacker-3-test-{test:02d}-{first}-{last}",
                "first": first,
                "last": last,
                "startPage": (test - 1) * 29 + index + 1,
                "headerTop": first_word["top"] if first_word else 30,
            })
    return groups


def extract(only_test: int | None = None) -> dict:
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    answer_file = json.loads(ANSWERS.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    if answer_file.get("issues"):
        raise ValueError("Printed answer extraction has unresolved issues")
    tests = []
    issues = []
    with pdfplumber.open(SOURCE) as document:
        if len(document.pages) != 290:
            raise ValueError(f"Expected 290 pages, found {len(document.pages)}")
        for test in ([only_test] if only_test else range(1, 11)):
            offset = (test - 1) * 29
            pages = document.pages[offset:offset + 29]
            groups = find_groups(pages, test)
            for corrected_test, first, last, start_page in overrides["missingGroups"]:
                if corrected_test == test:
                    groups.append({
                        "id": f"hacker-3-test-{test:02d}-{first}-{last}",
                        "first": first,
                        "last": last,
                        "startPage": start_page,
                        "headerTop": 35,
                    })
            groups.sort(key=lambda group: group["first"])
            by_number = defaultdict(list)
            for index, page in enumerate(pages):
                number = offset + index + 1
                for question_number, item in questions_on_page(page).items():
                    item["page"] = number
                    by_number[question_number].append(item)
            items = {}
            for number in range(101, 201):
                candidates = by_number[number]
                if len(candidates) != 1:
                    issues.append(f"Test {test:02} question {number}: {len(candidates)} panels")
                    continue
                candidate = candidates[0]
                stem = candidate["stem"]
                needs_image = number <= 130 and "_" not in stem
                if number <= 146 and number > 130:
                    stem = f"Select the option that completes blank ({number}) in the passage."
                if len(stem) < 8 or any(len(option) < 1 for option in candidate["options"].values()):
                    issues.append(f"Test {test:02} question {number}: missing text or option")
                group = next(
                    (group for group in groups if group["first"] <= number <= group["last"]), None
                )
                if number > 130 and group is None:
                    issues.append(f"Test {test:02} question {number}: no passage group")
                items[str(number)] = {
                    "stem": stem,
                    "options": candidate["options"],
                    "page": candidate["page"],
                    "box": candidate["box"],
                    "groupId": group["id"] if group else None,
                    "needsImage": needs_image,
                }
            for key, corrected in overrides["items"].items():
                corrected_test, corrected_number = map(int, key.split("-"))
                if corrected_test != test:
                    continue
                group = next(
                    (group for group in groups if group["first"] <= corrected_number <= group["last"]),
                    None,
                )
                if corrected_number > 130 and group is None:
                    issues.append(f"Test {test:02} question {corrected_number}: override has no group")
                existing = items.get(str(corrected_number), {})
                items[str(corrected_number)] = {
                    **existing,
                    **corrected,
                    "stem": corrected.get("stem", existing.get("stem", f"Select the option that completes blank ({corrected_number}) in the passage.")),
                    "groupId": group["id"] if group else None,
                    "needsImage": False,
                }
            for key, corrections in overrides["optionCorrections"].items():
                corrected_test, corrected_number = map(int, key.split("-"))
                if corrected_test != test:
                    continue
                item = items.get(str(corrected_number))
                if item is None:
                    issues.append(f"Test {test:02} question {corrected_number}: option correction has no question")
                else:
                    item["options"].update(corrections)
            for key, corrected_stem in overrides["stemCorrections"].items():
                corrected_test, corrected_number = map(int, key.split("-"))
                if corrected_test != test:
                    continue
                item = items.get(str(corrected_number))
                if item is None:
                    issues.append(f"Test {test:02} question {corrected_number}: stem correction has no question")
                else:
                    item["stem"] = corrected_stem
            if len(answer_file["tests"].get(str(test), {})) != 100:
                issues.append(f"Test {test:02}: answer grid incomplete")
            for group in groups:
                group_items = [items.get(str(n)) for n in range(group["first"], group["last"] + 1)]
                if any(item is None for item in group_items):
                    continue
                group["questionPages"] = sorted({item["page"] for item in group_items})
                first_question_page = min(group["questionPages"])
                crops = []
                passages = []
                for page_number in range(group["startPage"], first_question_page + 1):
                    page = document.pages[page_number - 1]
                    first_question_top = min(
                        (item["box"][1] for item in group_items if item["page"] == page_number),
                        default=page.height - 25,
                    )
                    top = (
                        max(18, group["headerTop"] - 7)
                        if page_number == group["startPage"] and group["headerTop"] < first_question_top
                        else 22
                    )
                    following_header_top = min(
                        (other["headerTop"] for other in groups
                         if other["first"] > group["last"] and other["startPage"] == page_number),
                        default=page.height - 25,
                    )
                    bottom = min(first_question_top - 8, following_header_top - 7, page.height - 25)
                    if bottom <= top + 28:
                        continue
                    box = [page_number, 25, round(top, 1), round(page.width - 25, 1), round(bottom, 1)]
                    crops.append(box)
                    passages.append(normalize(page.crop(tuple(box[1:])).extract_text() or ""))
                group["passageCrops"] = crops
                group["passageText"] = " ".join(passages)
                if not crops:
                    issues.append(f"Test {test:02} group {group['first']}-{group['last']}: no passage crop")
            issues = [
                issue for issue in issues
                if not (
                    issue.startswith(f"Test {test:02} question ")
                    and int(issue.split()[3].rstrip(":")) in {
                        int(key.split("-")[1]) for key in overrides["items"]
                        if int(key.split("-")[0]) == test
                    }
                )
            ]
            tests.append({"test": test, "groups": groups, "items": items})
            print(f"Test {test:02}: {len(items)} questions, {len(groups)} groups", flush=True)
    return {"sourceSha256": source_hash, "tests": tests, "issues": issues}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--test", type=int, choices=range(1, 11))
    args = parser.parse_args()
    result = extract(args.test)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(result['issues'])} extraction issues", flush=True)
    if result["issues"]:
        for issue in result["issues"][:50]:
            print(issue)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
