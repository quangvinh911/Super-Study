"""Extract the user-provided Hacker 3 Listening PDFs and audio cue map.

The source map and item transcription are generated from the two PDFs. Reviewed
corrections live in a separate override file so rerunning this script retains
them. Audio cuts use the recording's regular five/eight-second answer pauses;
the importer validates the resulting clips separately.
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
SOURCE_DIR = ROOT / "resources/toeic/hacker3/lc"
QUESTION_PDF = SOURCE_DIR / "Hacker 3 LC.pdf"
TRANSCRIPT_PDF = SOURCE_DIR / "Hacker 3 LC Transcript.pdf"
AUDIO_DIR = SOURCE_DIR / "Hacker 3 LC Audios"
SOURCE_OUTPUT = ROOT / "content/toeic-hacker-lc-source.json"
ITEMS_OUTPUT = ROOT / "content/toeic-hacker-lc-items.json"
CUES_OUTPUT = ROOT / "content/toeic-hacker-lc-audio-cues.json"
OVERRIDES = ROOT / "content/toeic-hacker-lc-overrides.json"

TEST_PAGES = [(1, 13), (14, 26), (27, 39), (40, 48), (49, 60),
              (61, 73), (74, 86), (87, 99), (100, 112), (113, 125)]
PHOTO_PAGES = [
    [3, 4, 5], [16, 17, 18], [29, 30, 31], [None, 41, 42],
    [50, 51, 52], [63, 64, 65], [76, 77, 78], [89, 90, 91],
    [102, 103, 104], [115, 116, 117],
]
MISSING_TEST_4 = {1, 2, *range(65, 83)}
GROUP_HEADING = re.compile(r"Questions\s+(\d{2})\s*[-–]\s*(\d{2,3})\s+refer", re.I)
SPOKEN_NUMBER = re.compile(r"(?m)^[ \t]*(\d{1,2})\t[^\n]*$")
ANSWER = re.compile(r"(?<!\d)(\d{1,3})\s*\(([ABCD])\)")
SILENCE_START = re.compile(r"silence_start: ([\d.]+)")
SILENCE_END = re.compile(r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace("�", "").replace("’", "'")


def clean_transcript_page(text: str) -> str:
    text = re.sub(r"[\uac00-\ud7a3]+|[→↔]", " ", text)
    text = re.sub(r"(?m)^\s*TEST01020304050607080910\s*$", "", text)
    text = re.sub(r"(?m)^\s*TEST\s+\d{2}\s*$", "", text)
    text = re.sub(r"(?m)^\s*\d{1,2}\s*$", "", text, count=1)
    text = re.sub(r"\b1000\s*3\s*(?:Listening|[.])?", "", text)
    return text


def source_numbers(test: int) -> list[int]:
    return [
        number for number in range(1, 101)
        if test != 4 or number not in MISSING_TEST_4
    ]


def part(number: int) -> int:
    return 1 if number <= 6 else 2 if number <= 31 else 3 if number <= 70 else 4


def group_first(number: int) -> int:
    if number <= 31:
        return number
    return 32 + 3 * ((number - 32) // 3) if number <= 70 else 71 + 3 * ((number - 71) // 3)


def transcript_pages(reader: PdfReader, test: int) -> tuple[int, str, str, dict[int, int]]:
    first_page = 2 + (test - 1) * 6
    pages = [
        clean_transcript_page(reader.pages[first_page - 1 + index].extract_text() or "")
        for index in range(6)
    ]
    key_text = pages[0].split("PART\t1", maxsplit=1)[0]
    joined = "\n".join(pages)
    number_pages = {}
    for offset, text in enumerate(pages):
        for match in SPOKEN_NUMBER.finditer(text):
            number = int(match.group(1))
            if 1 <= number <= 31:
                number_pages[number] = first_page + offset
        for match in GROUP_HEADING.finditer(text):
            first, last = map(int, match.groups())
            for number in range(first, last + 1):
                number_pages[number] = first_page + offset
    if set(number_pages) != set(range(1, 101)):
        raise ValueError(f"Test {test}: incomplete transcript page map")
    return first_page, key_text, joined, number_pages


def extract_key(text: str, test: int) -> dict[str, str]:
    pairs = ANSWER.findall(text)
    answers = {number: letter for number, letter in pairs}
    if len(pairs) != 100 or set(map(int, answers)) != set(range(1, 101)):
        raise ValueError(f"Test {test}: expected exactly 100 unique printed answers")
    return answers


def spoken_items(text: str, test: int) -> dict[int, str]:
    try:
        portion = text.split("PART\t1", maxsplit=1)[1].split("PART\t3", maxsplit=1)[0]
    except IndexError as exc:
        raise ValueError(f"Test {test}: missing transcript Part 1/3 boundary") from exc
    matches = [match for match in SPOKEN_NUMBER.finditer(portion) if 1 <= int(match.group(1)) <= 31]
    items = {}
    for index, match in enumerate(matches):
        content = portion[match.end():matches[index + 1].start() if index + 1 < len(matches) else None]
        items[int(match.group(1))] = normalized(re.sub(r"\bPART\s*2\b", "", content))
    if len(matches) != 31 or set(items) != set(range(1, 32)):
        raise ValueError(f"Test {test}: transcript must contain questions 1-31 once")
    return items


def group_scripts(text: str, test: int) -> dict[int, str]:
    portion = text.split("PART\t3", maxsplit=1)[1]
    matches = list(GROUP_HEADING.finditer(portion))
    groups = {}
    for index, match in enumerate(matches):
        first, last = map(int, match.groups())
        if last != first + 2 or first != group_first(first):
            raise ValueError(f"Test {test}: invalid transcript group {first}-{last}")
        content = portion[match.end():matches[index + 1].start() if index + 1 < len(matches) else None]
        content = re.sub(r"^\s*to\s+the\s+following[^.]*\.\s*", "", content, flags=re.I)
        content = re.sub(r"\bPART\s*4\b", "", content)
        groups[first] = normalized(content)
    expected = set(range(32, 71, 3)) | set(range(71, 101, 3))
    if set(groups) != expected:
        raise ValueError(f"Test {test}: transcript groups missing {sorted(expected - set(groups))}")
    return groups


def rc_question_parser():
    """Reuse the established coordinate parser without changing RC behavior."""
    path = ROOT / "scripts/extract-toeic-hacker.py"
    spec = importlib.util.spec_from_file_location("hacker_rc_extract", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.QUESTION = re.compile(r"([3-9][0-9]|100)[.]")
    return module.questions_on_page


def photo_box(number: int) -> list[float]:
    # Source photographs are two per A4 page. Keep the two halves separate.
    return [112, 62, 515, 380] if number % 2 else [112, 388, 515, 724]


def question_items(document: pdfplumber.PDF, overrides: dict, test: int) -> tuple[dict[str, dict], dict[str, dict]]:
    start, end = TEST_PAGES[test - 1]
    parse_page = rc_question_parser()
    items: dict[str, dict] = {}
    for index in range(start - 1, end):
        for number, value in parse_page(document.pages[index]).items():
            if number < 32 or number > 100 or number not in source_numbers(test):
                continue
            key = str(number)
            if key in items:
                raise ValueError(f"Test {test} question {number}: duplicate source panel")
            stem = re.sub(r"^______\s+", "", value["stem"])
            stem = re.sub(r"\s+[\^|#&][^\s]{0,3}\s+", " ", stem)
            stem = re.sub(r"\s+[lI][|lIHjP6]{1,4}\s+", " ", stem)
            items[key] = {
                "stem": normalized(stem),
                "options": {letter: normalized(value["options"][letter]) for letter in "ABCD"},
                "page": index + 1,
                "box": value["box"],
            }
    for key, value in overrides.get("questions", {}).items():
        override_test, number = map(int, key.split("-"))
        if override_test != test:
            continue
        items[str(number)] = {**items.get(str(number), {}), **value}
    expected = set(range(32, 101)) - (MISSING_TEST_4 if test == 4 else set())
    if set(map(int, items)) != expected:
        raise ValueError(f"Test {test}: missing printed questions {sorted(expected - set(map(int, items)))}")
    graphics = {}
    for number in expected:
        item = items[str(number)]
        if "Look at the graphic." in item["stem"]:
            first = group_first(number)
            graphic_key = f"{test}-{first}"
            if graphic_key in overrides.get("graphics", {}):
                graphics[str(first)] = overrides["graphics"][graphic_key]
            else:
                left = 28 if item["box"][0] < 250 else 290
                right = 306 if left == 28 else 568
                first_item = items[str(first)]
                if first_item["page"] != item["page"]:
                    raise ValueError(f"Test {test} group {first}: graphic crosses a source page")
                bottom = first_item["box"][1] - 8
                previous = [
                    other["box"][3] for key, other in items.items()
                    if int(key) < first and other["page"] == item["page"]
                    and (other["box"][0] < 250) == (left == 28)
                    and other["box"][3] < bottom
                ]
                top = max(28, max(previous, default=60) - 32)
                if bottom - top < 30:
                    raise ValueError(f"Test {test} group {first}: no space for graphic crop")
                graphics[str(first)] = [item["page"], left, round(top, 1), right, round(bottom, 1)]
    return items, graphics


def audio_silences(ffmpeg: str, path: Path) -> list[tuple[float, float, float]]:
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-nostats", "-i", str(path),
         "-af", "silencedetect=noise=-40dB:d=4.4", "-f", "null", "NUL"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=True,
    )
    starts = [float(value) for value in SILENCE_START.findall(result.stderr)]
    ends = [(float(end), float(duration)) for end, duration in SILENCE_END.findall(result.stderr)]
    if len(starts) != len(ends):
        raise ValueError(f"{path.name}: incomplete silence report")
    return [(start, end, duration) for start, (end, duration) in zip(starts, ends)]


def audio_cues(ffmpeg: str, test: int) -> dict[str, list[int]]:
    silences = audio_silences(ffmpeg, AUDIO_DIR / f"TEST {test}.mp3")
    if len(silences) != 105:
        raise ValueError(f"Test {test}: expected 105 source audio pauses, found {len(silences)}")
    first_long = next(index for index, silence in enumerate(silences) if silence[2] > 6.5)
    if first_long != 33:
        raise ValueError(f"Test {test}: expected 33 Part 1/2 pauses, found {first_long}")
    first = silences[:33]
    remaining = silences[33:]
    # Three five-second transitions occur among the 69 eight-second answer
    # pauses. The top 69 by length are stable even where two exceed 8.8 s.
    chosen = sorted(sorted(remaining, key=lambda silence: silence[2], reverse=True)[:69])
    if len(chosen) != 69 or min(s[2] for s in chosen) < 6.0:
        raise ValueError(f"Test {test}: could not identify all Part 3/4 answer pauses")
    question_pauses = {
        **dict(zip(range(1, 3), first[:2])),
        **dict(zip(range(3, 7), first[3:7])),
        **dict(zip(range(7, 32), first[8:33])),
        **dict(zip(range(32, 101), chosen)),
    }
    if set(question_pauses) != set(range(1, 101)):
        raise ValueError(f"Test {test}: incomplete audio question map")
    cues = {}
    for number in range(1, 101):
        if number > 31 and number != group_first(number):
            continue
        last = number if number <= 31 else number + 2
        end = question_pauses[last][0] + 0.3
        if number == 1:
            start = first[0][0] - 28
        elif number == 3:
            start = first[2][1] - 0.2
        elif number == 7:
            start = first[8][0] - 22
        else:
            start = question_pauses[number - 1][1] - 0.2
        if not (0 <= start < end):
            raise ValueError(f"Test {test} audio {number}-{last}: invalid cue")
        cues[str(number)] = [round(start * 1000), round(end * 1000)]
    if len(cues) != 54:
        raise ValueError(f"Test {test}: expected 54 audio cues")
    return cues


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    args = parser.parse_args()
    if not args.ffmpeg:
        raise SystemExit("ffmpeg is required to map the full-test audio pauses")
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    transcript = PdfReader(TRANSCRIPT_PDF)
    source = {
        "questionPdfSha256": sha256(QUESTION_PDF),
        "transcriptPdfSha256": sha256(TRANSCRIPT_PDF),
        "audioSha256": {str(test): sha256(AUDIO_DIR / f"TEST {test}.mp3") for test in range(1, 11)},
        "missingQuestionPages": {"4": [64, 65, 72, 73]},
        "tests": [],
    }
    items = {"tests": []}
    cues = {"tests": {}}
    with pdfplumber.open(QUESTION_PDF) as document:
        if len(document.pages) != 125 or len(transcript.pages) != 61:
            raise ValueError("Hacker 3 LC source PDF page counts changed")
        for test in range(1, 11):
            transcript_page, key_text, transcript_text, transcript_number_pages = transcript_pages(transcript, test)
            key = extract_key(key_text, test)
            spoken = spoken_items(transcript_text, test)
            scripts = group_scripts(transcript_text, test)
            printed, graphics = question_items(document, overrides, test)
            photos = {}
            for number in range(1, 7):
                if number not in source_numbers(test):
                    continue
                page = PHOTO_PAGES[test - 1][(number - 1) // 2]
                if page is None:
                    raise ValueError(f"Test {test} question {number}: photo page missing")
                photos[str(number)] = [page, *photo_box(number)]
            test_items = {}
            for number in source_numbers(test):
                if number <= 31:
                    test_items[str(number)] = {
                        "spokenTranscript": spoken[number],
                        **({"photoCrop": photos[str(number)]} if number <= 6 else {}),
                    }
                else:
                    test_items[str(number)] = {
                        **printed[str(number)],
                        "groupFirst": group_first(number),
                    }
            source["tests"].append({
                "test": test,
                "questionPdfPages": list(TEST_PAGES[test - 1]),
                "transcriptPdfPages": [transcript_page, transcript_page + 5],
                "questionPages": {str(number): (
                    photos[str(number)][0] if number <= 6 else
                    None if number <= 31 else
                    printed[str(number)]["page"]
                ) for number in source_numbers(test)},
                "transcriptQuestionPages": {str(number): transcript_number_pages[number]
                                            for number in source_numbers(test)},
                "answers": key,
                "omittedQuestions": sorted(MISSING_TEST_4) if test == 4 else [],
            })
            items["tests"].append({
                "test": test, "questions": test_items,
                "groupTranscripts": {str(first): text for first, text in scripts.items()
                                     if test != 4 or first not in MISSING_TEST_4},
                "graphicCrops": graphics,
            })
            cues["tests"][str(test)] = audio_cues(args.ffmpeg, test)
            print(f"Test {test}: {len(test_items)} questions, {len(graphics)} graphics, 54 source audio cues", flush=True)
    outputs = [(SOURCE_OUTPUT, source), (ITEMS_OUTPUT, items), (CUES_OUTPUT, cues)]
    for path, value in outputs:
        serialized = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
        if args.check:
            if path.read_text(encoding="utf-8") != serialized:
                raise ValueError(f"{path.name} is stale; rerun the LC extractor")
        else:
            path.write_text(serialized, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
