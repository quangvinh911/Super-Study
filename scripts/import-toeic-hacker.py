"""Compile extracted Hacker 3 Reading items and render local PDF evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources/toeic/hacker3/rc/question/Hacker 3 RC.pdf"
ANSWERS = ROOT / "content/toeic-hacker-answers.json"
ITEMS = ROOT / "content/toeic-hacker-items.json"
OUTPUT = ROOT / "content/toeic-hacker-generated.json"
MEDIA = ROOT / "public/pdf-evidence"
RESOLUTION = 200


def paragraph(text: str) -> dict:
    return {"kind": "paragraph", "text": text}


def image(src: str, alt: str) -> dict:
    return {"kind": "image", "src": src, "alt": alt}


def verify_sources(authored: dict, answers: dict) -> None:
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != authored["sourceSha256"]:
        raise ValueError("Hacker RC PDF changed; extract and review source mapping again")
    if authored["issues"] or answers["issues"]:
        raise ValueError("Source extraction has unresolved issues")
    for test in range(1, 11):
        path = ROOT / f"resources/toeic/hacker3/rc/answer/{test}.PNG"
        if hashlib.sha256(path.read_bytes()).hexdigest() != answers["sourceSha256"][str(test)]:
            raise ValueError(f"{path.name} changed; recheck printed answer mapping")


def compile_bank(authored: dict, answers: dict) -> tuple[dict, list[tuple[str, list]]]:
    questions = []
    solutions = []
    crops: list[tuple[str, list]] = []
    for test in authored["tests"]:
        test_number = test["test"]
        form_id = f"hacker-3-test-{test_number:02d}"
        groups = {group["id"]: group for group in test["groups"]}
        if set(map(int, test["items"])) != set(range(101, 201)):
            raise ValueError(f"Test {test_number}: expected exactly questions 101-200")
        if set(map(int, answers["tests"][str(test_number)])) != set(range(101, 201)):
            raise ValueError(f"Test {test_number}: answer grid must cover questions 101-200")
        group_content = {}
        for group in test["groups"]:
            passage_blocks = []
            if group["passageText"].strip():
                passage_blocks.append(paragraph(group["passageText"].strip()))
            if not group["passageCrops"]:
                raise ValueError(f"{group['id']}: passage image missing")
            for index, crop in enumerate(group["passageCrops"], start=1):
                name = f"{group['id']}-passage-{index}.webp"
                src = f"/pdf-evidence/{name}"
                passage_blocks.append(image(
                    src,
                    f"Trang gốc đoạn đọc Test {test_number}, câu {group['first']}-{group['last']}, phần {index}",
                ))
                crops.append((name, crop))
            group_content[group["id"]] = passage_blocks
        for number in range(101, 201):
            item = test["items"][str(number)]
            part = 5 if number <= 130 else 6 if number <= 146 else 7
            question_id = f"{form_id}-q{number}"
            option_values = item["options"]
            if set(option_values) != set("ABCD") or any(not option_values[x].strip() for x in "ABCD"):
                raise ValueError(f"{question_id}: missing separate A-D choices")
            if not item["stem"].strip():
                raise ValueError(f"{question_id}: missing question text")
            if part == 5 and item["stem"].count("______") != 1:
                raise ValueError(f"{question_id}: Part 5 requires exactly one text blank")
            if any(marker in item["stem"] for marker in ("�", "Hackers.co.kr")):
                raise ValueError(f"{question_id}: question text contains an OCR artifact")
            if any(
                marker in option_values[letter]
                for letter in "ABCD"
                for marker in ("�", "Hackers.co.kr")
            ):
                raise ValueError(f"{question_id}: option text contains an OCR artifact")
            if part > 5 and item["groupId"] not in groups:
                raise ValueError(f"{question_id}: passage group missing")
            source_src = f"/pdf-evidence/{question_id}.webp"
            stem = [paragraph(item["stem"])]
            if item["needsImage"]:
                stem.append(image(source_src, f"Câu {number} và vị trí chỗ trống trong ảnh gốc Test {test_number}"))
            question = {
                "certificateId": "toeic",
                "formId": form_id,
                "order": number,
                "id": question_id,
                "revision": 2 if part == 5 else 1,
                "language": "en",
                "stem": stem,
                "options": [
                    {"id": letter, "content": [paragraph(option_values[letter].strip())]}
                    for letter in "ABCD"
                ],
                "interaction": {"kind": "singleChoice", "requiredSelections": 1},
                "classification": {"section": f"part-{part}", "styleTags": []},
                "shuffleOptions": False,
                "sourceQuestionImage": {"src": source_src, "page": item["page"]},
                "provenance": {
                    "kind": "sourceExcerpt",
                    "authoringNote": (
                        f"User-provided Hacker 3 Reading scan, Test {test_number}, "
                        f"PDF page {item['page']}. Source text and A-D choices extracted "
                        "with targeted visual corrections; the full transcription has not "
                        "been manually reviewed. Redistribution rights not established."
                    ),
                    "rightsStatus": "privateUserProvided",
                    "sourceDocument": "Hacker 3 RC.pdf",
                    "sourceQuestionNumber": number,
                },
                "verification": {
                    "answerStatus": "sourcePrinted",
                    "reviewedAgainst": f"{test_number}.PNG, Test {test_number}, question {number}",
                    "reviewedAt": "2026-09-28",
                },
            }
            if part > 5:
                question["stimulus"] = {
                    "id": item["groupId"],
                    "content": group_content[item["groupId"]],
                }
            questions.append(question)
            answer = answers["tests"][str(test_number)][str(number)]
            if answer not in "ABCD":
                raise ValueError(f"{question_id}: invalid printed answer {answer}")
            solutions.append({
                "questionId": question_id,
                "correctOptionIds": [answer],
                "explanation": [paragraph(
                    f"The printed answer key for Test {test_number}, question {number}, "
                    f"gives ({answer}). The source provides no explanation. "
                    "This answer has not been independently verified."
                )],
                "references": [
                    {"title": "Hacker 3 RC printed answer key", "version": "User-provided image", "locator": f"Test {test_number}, question {number}"},
                    {"title": "Hacker 3 RC", "version": "User-provided scan", "locator": f"PDF page {item['page']}; Test {test_number}; question {number}"},
                ],
            })
            crops.append((f"{question_id}.webp", [item["page"], *item["box"]]))
    inventory = Counter(question["classification"]["section"] for question in questions)
    if inventory != {"part-5": 300, "part-6": 160, "part-7": 540}:
        raise ValueError(f"Unexpected Hacker inventory: {inventory}")
    return {"questions": questions, "solutions": solutions}, crops


def render_crops(crops: list[tuple[str, list]]) -> None:
    import pdfplumber

    MEDIA.mkdir(parents=True, exist_ok=True)
    by_page = {}
    for name, crop in crops:
        by_page.setdefault(crop[0], []).append((name, crop[1:]))
    with pdfplumber.open(SOURCE) as document:
        for page_number, entries in sorted(by_page.items()):
            page = document.pages[page_number - 1]
            rendered = page.to_image(resolution=RESOLUTION).original
            scale = RESOLUTION / 72
            for name, box in entries:
                left, top, right, bottom = box
                if not (0 <= left < right <= page.width and 0 <= top < bottom <= page.height):
                    raise ValueError(f"{name}: crop outside PDF page {page_number}")
                pixel_box = tuple(round(value * scale) for value in box)
                rendered.crop(pixel_box).save(MEDIA / name, "WEBP", quality=88, method=4)
            print(f"Rendered PDF page {page_number}: {len(entries)} crops", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    authored = json.loads(ITEMS.read_text(encoding="utf-8"))
    answers = json.loads(ANSWERS.read_text(encoding="utf-8"))
    verify_sources(authored, answers)
    bank, crops = compile_bank(authored, answers)
    if args.check:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != bank:
            raise ValueError("Hacker source pack is stale; rerun importer")
        for name, _ in crops:
            asset = MEDIA / name
            if not asset.is_file() or asset.stat().st_size == 0:
                raise ValueError(f"Missing or empty media: {name}")
    else:
        render_crops(crops)
        OUTPUT.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{'Checked' if args.check else 'Imported'} {len(bank['questions'])} Hacker questions, {len(crops)} images.")


if __name__ == "__main__":
    main()
