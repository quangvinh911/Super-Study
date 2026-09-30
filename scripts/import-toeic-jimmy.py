"""Build the Jimmy Reading bank from transcribed items and printed answer mappings.

Questions and choices are separate text fields. Each question has its own source crop.
Part 7 passages have separate shared crops.
Requires pdfplumber and Pillow (also used by extract-pdf-bank.py).
Run from any directory; source PDFs are never copied into public output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_HASHES = {
    "sourceDocument": "54a0321b1ccb37854ae9cbb960ec7a9a1b2c46fb64058eb174507e3f127e6648",
    "answerDocument": "791e179c74bf87e6363c3947aeba4fe072bf4b21ca788cf7271d59cbe1998c90",
}


def paragraph(text: str) -> dict:
    return {"kind": "paragraph", "text": text}


def expand_groups(test: dict) -> list:
    start = test["part5StartPage"]
    groups = [
        [101, 106, [start]],
        [107, 116, [start + 1]],
        [117, 126, [start + 2]],
        [127, 136, [start + 3]],
        [137, 140, [start + 4]],
        *test["groups"],
    ]
    expected_last = 177 if test["test"] == 10 else 200
    numbers = []
    for first, last, pages in groups:
        if first > last or not pages or len(pages) != len(set(pages)):
            raise ValueError(f"Test {test['test']}: invalid question group {first}-{last}")
        if any(not isinstance(page, int) or not 3 <= page <= 300 for page in pages):
            raise ValueError(f"Test {test['test']}: invalid source page or answer-sheet leak")
        if any(first <= boundary < last for boundary in (140, 152)):
            raise ValueError(f"Test {test['test']}: group crosses Part boundary")
        numbers.extend(range(first, last + 1))
    if numbers != list(range(101, expected_last + 1)):
        raise ValueError(f"Test {test['test']}: duplicated, missing or out-of-order questions")
    return groups


def validate_items(authored: dict) -> None:
    """Reject missing text, option placeholders and broken passage associations."""
    if not isinstance(authored.get("items"), dict) or not isinstance(authored.get("stimuli"), dict):
        raise ValueError("Authored items and stimuli must be objects")
    for question_id, item in authored["items"].items():
        if not isinstance(item.get("stem"), str) or len(item["stem"].strip()) < 12:
            raise ValueError(f"{question_id}: missing question text")
        if not isinstance(item.get("options"), dict) or set(item["options"]) != set("ABCD"):
            raise ValueError(f"{question_id}: expected separate A-D choices")
        for letter, value in item["options"].items():
            if (
                not isinstance(value, str)
                or not value.strip()
                or value.startswith(".")
                or "printed choice" in value
            ):
                raise ValueError(f"{question_id}/{letter}: missing choice text")
        number = int(question_id.rsplit("q", 1)[1])
        if number <= 140 and len(re.findall(r"_{4,}", item["stem"])) != 1:
            raise ValueError(f"{question_id}: Part 5 requires exactly one blank")
        if number <= 140 and re.search(r"-\s*_{4,}|_{4,}\s*-", item["stem"]):
            raise ValueError(f"{question_id}: stray dash beside the Part 5 blank")
        if number <= 140 and "stimulusId" in item:
            raise ValueError(f"{question_id}: Part 5 must not display a shared question page")
        if number > 140 and item.get("stimulusId") not in authored["stimuli"]:
            raise ValueError(f"{question_id}: missing reading passage")
    for name, crop in authored["imageSources"].items():
        if not re.fullmatch(r"toeic-jimmy-reading-\d{2}-\d{3}-\d{3}-passage-\d+\.webp", name):
            raise ValueError(f"Invalid passage asset name: {name}")
        box = crop.get("box")
        if (
            not isinstance(box, list) or len(box) != 4
            or any(not isinstance(value, (int, float)) for value in box)
            or not 0 <= box[0] < box[2] or not 0 <= box[1] < box[3]
            or not 3 <= crop.get("page", 0) <= 300 or crop.get("resolution") != 160
        ):
            raise ValueError(f"{name}: invalid passage crop")


def validate_question_crops(source: dict, crops: dict) -> None:
    expected = {}
    for test in source["tests"]:
        for first, last, pages in expand_groups(test):
            for number in range(first, last + 1):
                expected[f"jimmy-reading-{test['test']:02d}-q{number}"] = pages
    if set(crops) != set(expected):
        raise ValueError("Question crops must match every imported question exactly")
    for question_id, crop in crops.items():
        if not isinstance(crop, list) or len(crop) != 5:
            raise ValueError(f"{question_id}: expected [page, left, top, right, bottom]")
        page, left, top, right, bottom = crop
        if (
            not all(isinstance(value, int) for value in crop)
            or page not in expected[question_id]
            or not 0 <= left < right <= 1400
            or not 0 <= top < bottom <= 1900
        ):
            raise ValueError(f"{question_id}: invalid question crop or source page")


def build_bank(source: dict, authored: dict, question_crops: dict) -> dict:
    validate_items(authored)
    validate_question_crops(source, question_crops)
    questions = []
    solutions = []
    if [test["test"] for test in source["tests"]] != list(range(1, 11)):
        raise ValueError("Expected exactly Tests 1-10 in source order")
    for test in source["tests"]:
        test_number = test["test"]
        rows = test["answerRows"]
        if len(rows) != 10 or any(not re.fullmatch(r"[ABCD]{10}", row) for row in rows):
            raise ValueError(f"Test {test_number}: expected ten rows of ten printed answer keys")
        keys = "".join(rows)
        form_id = f"jimmy-reading-{test_number:02d}"
        for first, last, pages in expand_groups(test):
            stimulus_id = f"{form_id}-{first}-{last}"
            for number in range(first, last + 1):
                question_id = f"{form_id}-q{number}"
                if question_id not in authored["items"]:
                    raise ValueError(f"{question_id}: transcription is missing")
                item = authored["items"][question_id]
                part = 5 if number <= 140 else 6 if number <= 152 else 7
                question = {
                    "id": question_id,
                    "certificateId": "toeic",
                    "revision": 3,
                    "language": "en",
                    # The legacy, reading-only form can never satisfy current mock quotas.
                    "formId": form_id,
                    "order": number,
                    "stem": [paragraph(item["stem"])],
                    "options": [
                        {"id": letter, "content": [paragraph(item["options"][letter])]}
                        for letter in "ABCD"
                    ],
                    "interaction": {"kind": "singleChoice", "requiredSelections": 1},
                    "classification": {"section": f"part-{part}", "styleTags": []},
                    "shuffleOptions": False,
                    "sourceQuestionImage": {
                        "src": f"/pdf-evidence/{question_id}.webp",
                        "page": question_crops[question_id][0],
                    },
                    "provenance": {
                        "kind": "sourceExcerpt",
                        "rightsStatus": source["rightsStatus"],
                        "sourceDocument": source["sourceDocument"],
                        "sourceQuestionNumber": number,
                        "authoringNote": (
                            f"User-provided Jim's TOEIC scan, Test {test_number}, PDF pages "
                            f"{', '.join(map(str, pages))}. Question and A-D choices transcribed "
                            "separately; shared passages retain their question-group association. "
                            "Private practice material; redistribution rights not established."
                        ),
                    },
                    "verification": {
                        "answerStatus": source["answerStatus"],
                        "reviewedAgainst": f"{source['answerDocument']}, Test {test_number}, question {number}",
                        "reviewedAt": source["reviewedAt"],
                    },
                }
                if part > 5:
                    if item["stimulusId"] != stimulus_id:
                        raise ValueError(f"{question_id}: passage belongs to a different question group")
                    passage = authored["stimuli"][stimulus_id]
                    if part == 6:
                        text = " ".join(block.get("text", "") for block in passage)
                        blanks = re.findall(r"____ \((\d{3})\)", text)
                        if blanks != [str(value) for value in range(first, last + 1)]:
                            raise ValueError(f"{stimulus_id}: missing or misnumbered Part 6 blanks")
                    question["stimulus"] = {"id": stimulus_id, "content": passage}
                questions.append(question)
                answer = keys[number - 101]
                solutions.append({
                    "questionId": question_id,
                    "correctOptionIds": [answer],
                    "explanation": [paragraph(
                        f"The printed answer key for Test {test_number}, question {number}, "
                        f"gives ({answer}). The source provides no explanation. "
                        "This answer has not been independently verified."
                    )],
                    "references": [
                        {
                            "title": source["answerDocument"],
                            "version": "User-provided scan",
                            "locator": f"PDF page {test['answerPage']}; Test {test_number}; question {number}",
                        },
                        {
                            "title": source["sourceDocument"],
                            "version": "User-provided scan",
                            "locator": f"PDF pages {', '.join(map(str, pages))}; Test {test_number}; question {number}",
                        },
                    ],
                })
    inventory = dict(Counter(q["classification"]["section"] for q in questions))
    if inventory != {"part-5": 400, "part-6": 120, "part-7": 457}:
        raise ValueError(f"Unexpected Jimmy Reading inventory: {inventory}")
    if set(authored["items"]) != {question["id"] for question in questions}:
        raise ValueError("The transcription contains unmatched question IDs")
    envelope = {"schemaVersion": "1.0.0", "bankVersion": source["bankVersion"]}
    manifest = {
        **envelope,
        "certificateId": "toeic",
        "publishedAt": source["reviewedAt"],
        "syllabusVersion": "TOEIC Listening & Reading",
        "language": "en",
        "questionCount": len(questions),
        "solutionCount": len(solutions),
        "blueprint": [],
        "files": {"questions": "questions.json", "solutions": "solutions.json"},
    }
    return {
        "manifest": manifest,
        "questions": {**envelope, "questions": questions},
        "solutions": {**envelope, "solutions": solutions},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / "resources/toeic/jimmy")
    parser.add_argument("--check", action="store_true", help="Check reproducibility and media without rewriting")
    args = parser.parse_args()
    source = json.loads((ROOT / "content/toeic-jimmy-source.json").read_text(encoding="utf-8"))
    authored = json.loads((ROOT / "content/toeic-jimmy-items.json").read_text(encoding="utf-8"))
    question_crops = json.loads(
        (ROOT / "content/toeic-jimmy-question-crops.json").read_text(encoding="utf-8")
    )
    for field, expected in SOURCE_HASHES.items():
        path = args.source_dir / source[field]
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"{path.name}: source changed; review page and answer mappings before importing")
    artifacts = build_bank(source, authored, question_crops)
    output = ROOT / "content/toeic-jimmy-generated.json"
    source_pack = {
        "questions": artifacts["questions"]["questions"],
        "solutions": artifacts["solutions"]["solutions"],
    }
    if not args.check:
        import pdfplumber

        (ROOT / "public/pdf-evidence").mkdir(parents=True, exist_ok=True)
        with pdfplumber.open(args.source_dir / source["sourceDocument"]) as document:
            current_page_number = None
            current_page = None

            def render_page(page_number: int):
                nonlocal current_page_number, current_page
                if page_number != current_page_number:
                    current_page = document.pages[page_number - 1].to_image(resolution=160).original
                    current_page_number = page_number
                return current_page

            for question_id, (page_number, left, top, right, bottom) in question_crops.items():
                page = render_page(page_number)
                if right > page.width or bottom > page.height:
                    raise ValueError(f"{question_id}: question crop extends beyond the source page")
                destination = ROOT / "public/pdf-evidence" / f"{question_id}.webp"
                page.crop((left, top, right, bottom)).save(
                    destination, "WEBP", quality=88, method=4
                )
            for name, crop in authored["imageSources"].items():
                destination = ROOT / "public/pdf-evidence" / name
                page_number = crop["page"]
                page = render_page(page_number)
                left, top, right, bottom = crop["box"]
                if right > page.width or bottom > page.height:
                    raise ValueError(f"{name}: passage crop extends beyond the source page")
                page.crop((left, top, right, bottom)).save(destination, "WEBP", quality=88, method=4)
        output.write_text(json.dumps(source_pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        if json.loads(output.read_text(encoding="utf-8")) != source_pack:
            raise ValueError("Jimmy source pack is stale; rerun the Jimmy importer")
        for name in authored["imageSources"]:
            asset = ROOT / "public/pdf-evidence" / name
            if not asset.is_file() or asset.stat().st_size == 0:
                raise ValueError(f"Missing or empty source image: {asset.name}")
        for question_id in question_crops:
            asset = ROOT / "public/pdf-evidence" / f"{question_id}.webp"
            if not asset.is_file() or asset.stat().st_size == 0:
                raise ValueError(f"Missing or empty question image: {asset.name}")
    print(f"{'Checked' if args.check else 'Imported'} 977 questions, 3,908 separate choices, 977 question crops and 125 reading passages.")


if __name__ == "__main__":
    main()
