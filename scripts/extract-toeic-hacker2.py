"""Map the private Hacker 2 sources to questions, printed keys and audio cues.

Source-specific layout: ten 30-page RC tests and ten 14-page LC tests.
Corrections are kept in content/toeic-hacker2-overrides.json, never in the scans.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources/toeic/hacker2"
OUTPUT = ROOT / "content/toeic-hacker2-items.json"
OVERRIDES = ROOT / "content/toeic-hacker2-overrides.json"
GROUP = re.compile(r"Questions?\s+(\d{3})\s*[-–—=°]\s*(\d{3})\s*refer", re.I)


def load_script(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    if spec is None or spec.loader is None:
        raise ValueError(f"Cannot load source helper {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def region_text(words: list[dict], box: list[float], blanks: bool = False, text_left: float | None = None) -> str:
    left, top, right, bottom = box
    selected = [w for w in words if left <= w["x0"] < right and top - 2 <= w["top"] < bottom]
    lines: list[list[dict]] = []
    for word in sorted(selected, key=lambda w: (w["top"], w["x0"])):
        line = next((line for line in lines if abs(line[0]["top"] - word["top"]) < 4), None)
        if line is None:
            lines.append([word])
        else:
            line.append(word)
    texts = []
    for line in lines:
        line.sort(key=lambda w: w["x0"])
        text = line[0]["text"]
        if blanks and text_left is not None and line[0]["x0"] - text_left > 15:
            text = "______ " + text
        for previous, current in zip(line, line[1:]):
            gap = current["x0"] - previous["x1"]
            text += (" ______ " if blanks and gap > 10 else " ") + current["text"]
        texts.append(text)
    text = normalize(" ".join(texts))
    if blanks:
        text = re.sub(r"(?<!\w)[_–—-]{2,}(?!\w)", "______", text)
        text = re.sub(r"(?:______\s*){2,}", "______ ", text)
    return text.strip()


def question_panels(page, listening: bool = False, corrected_anchors: list[dict] | None = None,
                    part6_first: int | None = None) -> dict[int, dict]:
    words = page.extract_words(x_tolerance=1, y_tolerance=3)
    for word in words:
        word["text"] = re.sub(r"^\(0\)", "(C)", word["text"])
    number_pattern = re.compile(r"^(\d{2,3})\.?$")
    anchors = [w for w in words if number_pattern.fullmatch(w["text"])]
    anchors = [w for w in anchors if (32 <= int(w["text"].rstrip(".")) <= 100 if listening
                                    else 101 <= int(w["text"].rstrip(".")) <= 200)
               and (w["x0"] < 105 or 240 < w["x0"] < 350)]
    if corrected_anchors:
        replaced = {number for a in corrected_anchors for number in a.get("replaces", [])}
        anchors = [a for a in anchors if a["text"].rstrip(".") not in replaced]
        anchors.extend(corrected_anchors)
    if part6_first is not None:
        # The four printed Part 6 panels occupy two columns on each page.
        # Some scanned number glyphs are entirely absent from the text layer.
        starts = [w for w in words if re.match(r"^\(A\)", w["text"]) and 250 < w["top"] < 740]
        starts.sort(key=lambda w: (w["x0"] > 240, w["top"]))
        if len(starts) == 4:
            anchors = [{"text": f"{part6_first + i}.", "x0": w["x0"] - 25,
                        "x1": w["x0"] - 7, "top": w["top"], "bottom": w["bottom"]}
                       for i, w in enumerate(starts)]
    result = {}
    for anchor in anchors:
        number = int(anchor["text"].rstrip("."))
        if not (32 <= number <= 100 if listening else 101 <= number <= 200):
            continue
        is_left = anchor["x0"] < 240
        left = max(8, anchor["x0"] - 3)
        # Alternating scanned pages have different margins; the right column's
        # number can sit left of the physical page midpoint.
        column_start = min((w["x0"] for w in anchors if 240 < w["x0"] < 360), default=page.width / 2)
        right = column_start - 4 if is_left else page.width - 42
        following = [w["top"] for w in anchors if w["top"] > anchor["top"] + 5
                     and abs(w["x0"] - anchor["x0"]) < 20]
        next_top = min(following, default=page.height - 30)
        markers = [w for w in words if re.match(r"^\([ABCD]\)", w["text"])
                   and left <= w["x0"] < min(right, anchor["x0"] + 65)
                   and anchor["top"] - 3 <= w["top"] < next_top]
        markers.sort(key=lambda w: w["top"])
        if "".join(w["text"][1] for w in markers) != "ABCD":
            continue
        if markers[0]["top"] - anchor["top"] > (170 if number >= 147 else 100):
            continue
        stem_words = [w for w in words if not (abs(w["top"] - anchor["top"]) < 4
                                              and left <= w["x0"] < anchor["x1"] + 2)]
        stem = region_text(stem_words, [left, anchor["top"], right, markers[0]["top"] - 2],
                           blanks=not listening and number <= 130, text_left=markers[0]["x0"])
        if not listening and 131 <= number <= 146:
            stem = f"Select the option that completes blank ({number}) in the passage."
        options = {}
        for index, marker in enumerate(markers):
            bottom = markers[index + 1]["top"] - 2 if index < 3 else min(next_top - 3, marker["top"] + 49)
            value = region_text(words, [marker["x0"] - 1, marker["top"], right, bottom])
            options["ABCD"[index]] = re.sub(r"^\([ABCD]\)\s*", "", value)
        result[number] = {"stem": stem, "options": options,
                          "box": [round(left - 2, 1), round(anchor["top"] - 4, 1),
                                  round(right, 1), round(min(next_top - 4, markers[-1]["bottom"] + 42), 1)]}
    return result


def reading_tests(document, overrides: dict) -> tuple[list[dict], list[str]]:
    tests, issues = [], []
    for test in range(1, 11):
        items, groups = {}, []
        for index in range((test - 1) * 30, test * 30):
            page = document.pages[index]
            relative_page = index % 30 + 1
            first = 131 + (relative_page - 5) * 4 if 5 <= relative_page <= 8 else None
            for number, item in question_panels(page, corrected_anchors=overrides.get("anchors", {}).get(str(index + 1)),
                                                 part6_first=first).items():
                key = str(number)
                if key in items:
                    issues.append(f"RC {test}-{number}: duplicate panel")
                items[key] = {**item, "page": index + 1}
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            for match in GROUP.finditer(text):
                first, last = map(int, match.groups())
                if not 131 <= first <= last <= 200:
                    continue
                header = next((w for w in page.extract_words() if w["text"].lower().startswith("question")), None)
                if header is None:
                    issues.append(f"RC {test}-{first}: header position missing")
                    continue
                groups.append({"id": f"hacker-2-test-{test:02}-{first}-{last}", "first": first,
                               "last": last, "startPage": index + 1, "headerTop": round(header["top"], 1)})
        for correction in overrides.get("groups", []):
            if correction["test"] == test:
                first, last = correction["first"], correction["last"]
                groups.append({"id": f"hacker-2-test-{test:02}-{first}-{last}",
                               "first": first, "last": last, "startPage": correction["page"],
                               "headerTop": correction["top"]})
        for key, correction in overrides.get("reading", {}).items():
            corrected_test, number = map(int, key.split("-"))
            if corrected_test == test:
                items[str(number)] = {**items.get(str(number), {}), **correction}
        missing = set(range(101, 201)) - set(map(int, items))
        if missing:
            issues.append(f"RC {test}: missing {sorted(missing)}")
        for key, item in items.items():
            number = int(key)
            if not item["stem"] or any(not value for value in item["options"].values()):
                issues.append(f"RC {test}-{number}: incomplete text")
            if number <= 130 and item["stem"].count("______") != 1:
                issues.append(f"RC {test}-{number}: expected one blank: {item['stem']}")
            matching = [g for g in groups if g["first"] <= number <= g["last"]]
            item["groupId"] = matching[0]["id"] if len(matching) == 1 else None
            if number > 130 and len(matching) != 1:
                issues.append(f"RC {test}-{number}: expected one passage group")
        for group in groups:
            members = [items[str(n)] for n in range(group["first"], group["last"] + 1) if str(n) in items]
            if not members:
                continue
            crops, texts = [], []
            for page_number in range(group["startPage"], min(i["page"] for i in members) + 1):
                page = document.pages[page_number - 1]
                top = group["headerTop"] - 3 if page_number == group["startPage"] else 25
                bottom = min((i["box"][1] - 5 for i in members if i["page"] == page_number), default=page.height - 60)
                crop = [page_number, 27, round(top, 1), page.width - 32, round(bottom, 1)]
                if bottom <= top + 20:
                    issues.append(f"RC {test}-{group['first']}: empty passage crop")
                    continue
                crops.append(crop)
                texts.append(page.crop(tuple(crop[1:])).extract_text() or "")
            group["passageCrops"] = crops
            group["passageText"] = "\n".join(texts)
        tests.append({"test": test, "items": items, "groups": groups})
        print(f"RC Test {test}: {len(items)} questions, {len(groups)} passages", flush=True)
    return tests, issues


def listening_tests(overrides: dict, ffmpeg: str, ffprobe: str) -> tuple[list[dict], dict, list[str]]:
    helper = load_script("extract-toeic-hacker-lc")
    helper.GROUP_HEADING = re.compile(r"Questions?\s+(\d{2})\s*[-–]\s*(\d{2,3})\s+refer", re.I)
    transcript_path = SOURCE / "lc/HACKER 2 LISTENING TRANSCRIPT.pdf"
    question_path = SOURCE / "lc/HACKER 2 LISTENING.pdf"
    transcript = PdfReader(transcript_path)
    tests, issues, audio_sources = [], [], {}
    with pdfplumber.open(question_path) as document:
        if len(document.pages) != 140 or len(transcript.pages) != 61:
            raise ValueError("Unexpected Hacker 2 Listening PDF inventory")
        for test in range(1, 11):
            first_page, key_text, text, transcript_pages = helper.transcript_pages(transcript, test)
            key_text = re.split(r"PART\s+1\b", key_text, maxsplit=1)[0]
            text = re.sub(r"1000\s*2\s*(?:Listening)?", "", text)
            text = re.sub(r"(?m)^\s*12345678910\s+TEST\s*$", "", text)
            text = re.sub(r"PART[ \t]+([1-4])\b", r"PART\t\1", text)
            answers = helper.extract_key(key_text, test)
            spoken = helper.spoken_items(text, test)
            scripts = helper.group_scripts(text, test)
            path = SOURCE / f"lc/Hacker 2 LC Audios/TEST {test}.mp3"
            cues = {}
            reason = None
            if not path.is_file():
                reason = "Full-test audio is absent."
            else:
                probe = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration",
                                        "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                                       capture_output=True, text=True, check=True)
                duration = float(probe.stdout.strip())
                audio_sources[str(test)] = {"sha256": sha256(path), "durationSeconds": duration}
                pauses = helper.audio_silences(ffmpeg, path)
                if test == 8:
                    reason = "213-second recording has no regular answer pauses; alignment is unresolved."
                elif test == 3:
                    if len(pauses) != 30 or not 800 < duration < 810:
                        raise ValueError("Test 3 partial recording changed; re-review its boundary")
                    reason = "Audio ends after question 28; questions 29-100 are omitted."
                elif len(pauses) != 105:
                    raise ValueError(f"LC Test {test}: expected 105 audio pauses, found {len(pauses)}")
                if test != 8:
                    early = pauses[:33]
                    numbered = dict(zip(range(1, 3), early[:2]))
                    numbered.update(zip(range(3, 7), early[3:7]))
                    numbered.update(zip(range(7, 32), early[8:33]))
                    if test != 3:
                        remaining = sorted(sorted(pauses[33:], key=lambda p: p[2], reverse=True)[:69])
                        if len(remaining) != 69 or min(p[2] for p in remaining) < 6:
                            raise ValueError(f"LC Test {test}: ambiguous Part 3/4 pauses")
                        numbered.update(zip(range(32, 101), remaining))
                    for number in numbered:
                        if number >= 32 and number != helper.group_first(number):
                            continue
                        last = number if number <= 31 else number + 2
                        if number == 1:
                            start = numbered[1][0] - 28
                        elif number == 3:
                            start = early[2][1] - 0.2
                        elif number == 7:
                            start = numbered[7][0] - 22
                        else:
                            start = numbered[number - 1][1] - 0.2
                        end = numbered[last][0] + 0.3
                        if not 0 <= start < end <= duration:
                            raise ValueError(f"LC Test {test} question {number}: invalid audio boundary")
                        cues[str(number)] = [round(start * 1000), round(end * 1000)]
            available = []
            if cues:
                available = list(range(1, 29)) if test == 3 else list(range(1, 101))
            printed = {}
            if len(available) == 100:
                for index in range((test - 1) * 14 + 6, test * 14):
                    page = document.pages[index]
                    for number, item in question_panels(page, listening=True,
                                                       corrected_anchors=overrides.get("lcAnchors", {}).get(str(index + 1))).items():
                        if str(number) in printed:
                            issues.append(f"LC {test}-{number}: duplicate panel")
                        printed[str(number)] = {**item, "page": index + 1}
                for key, value in overrides.get("listening", {}).items():
                    corrected_test, number = map(int, key.split("-"))
                    if corrected_test == test:
                        printed[str(number)] = {**printed.get(str(number), {}), **value}
                missing = set(range(32, 101)) - set(map(int, printed))
                if missing:
                    issues.append(f"LC {test}: missing panels {sorted(missing)}")
            items = {}
            for number in available:
                if number <= 31:
                    item = {"spokenTranscript": spoken[number]}
                    if number <= 6:
                        page = (test - 1) * 14 + 3 + (number - 1) // 2
                        item["photoCrop"] = [page, 100, 53 if number % 2 else 394,
                                             505, 370 if number % 2 else 715]
                else:
                    item = printed.get(str(number))
                    if item is None:
                        continue
                    if not item["stem"] or any(not v for v in item["options"].values()):
                        issues.append(f"LC {test}-{number}: incomplete text")
                items[str(number)] = item
            graphics = {}
            for key, item in items.items():
                number = int(key)
                if number < 32 or not re.search(r"look at the graphic", item["stem"], re.I):
                    continue
                first = helper.group_first(number)
                first_item = items.get(str(first))
                if first_item is None:
                    continue
                left = 25 if item["box"][0] < 240 else 290
                right = 289 if left == 25 else 553
                bottom = first_item["box"][1] - 5
                previous = [other["box"][3] for n, other in items.items() if int(n) >= 32 and int(n) < first
                            and other["page"] == item["page"] and (other["box"][0] < 240) == (left == 25)
                            and other["box"][3] < bottom]
                top = max(previous, default=40)
                crop = overrides.get("graphics", {}).get(f"{test}-{first}",
                        [item["page"], left, top, right, bottom])
                if crop[4] - crop[2] < 25:
                    issues.append(f"LC {test}-{first}: graphic needs a reviewed crop")
                graphics[str(first)] = crop
            tests.append({"test": test, "items": items, "answers": answers,
                          "transcriptPages": {str(n): p for n, p in transcript_pages.items()},
                          "groupTranscripts": {str(n): s for n, s in scripts.items()},
                          "cues": cues, "graphics": graphics,
                          "omittedQuestions": sorted(set(range(1, 101)) - set(available)),
                          "omissionReason": reason})
            print(f"LC Test {test}: {len(items)} questions, {len(cues)} clips", flush=True)
    return tests, audio_sources, issues


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument("--ffprobe", default=shutil.which("ffprobe"))
    args = parser.parse_args()
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    rc_path = SOURCE / "rc/question/HACKER 2 READING.pdf"
    with pdfplumber.open(rc_path) as document:
        if len(document.pages) != 300:
            raise ValueError("Expected ten 30-page Reading tests")
        reading, issues = reading_tests(document, overrides)
    if not args.ffmpeg or not args.ffprobe:
        parser.error("ffmpeg and ffprobe are required")
    listening, audio_sources, lc_issues = listening_tests(overrides, args.ffmpeg, args.ffprobe)
    source_paths = ["rc/question/HACKER 2 READING.pdf", "lc/HACKER 2 LISTENING.pdf",
                    "lc/HACKER 2 LISTENING TRANSCRIPT.pdf"]
    result = {"sources": {name: sha256(SOURCE / name) for name in source_paths},
              "audioSources": audio_sources, "reading": reading, "listening": listening,
              "issues": issues + lc_issues}
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != serialized:
            raise ValueError("Hacker 2 extraction is stale")
    else:
        OUTPUT.write_text(serialized, encoding="utf-8", newline="\n")
    print(f"{len(result['issues'])} extraction issues", flush=True)
    for issue in result["issues"]:
        print(issue, flush=True)
    if result["issues"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
