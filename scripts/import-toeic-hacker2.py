"""Build the private Hacker 2 practice pack and bounded image/audio assets."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources/toeic/hacker2"
OUTPUT = ROOT / "content/toeic-hacker2-generated.json"
IMAGES = ROOT / "public/pdf-evidence"
AUDIO = ROOT / "public/audio/toeic"
REVIEW_DATE = "2026-10-29"


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    if spec is None or spec.loader is None:
        raise ValueError(f"Cannot load {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def paragraph(text):
    return {"kind": "paragraph", "text": text}


def image(src, alt):
    return {"kind": "image", "src": src, "alt": alt}


def graphic_crop(document, crop):
    page, left, top, right, bottom = crop
    # Panel boxes include padding after the preceding answer. Recover the
    # graphic title above that padding, and keep labels beside its border.
    top = max(40, top - 20) if top > 40 else top
    return [page, max(0, left - 12), top,
            min(document.pages[page - 1].width - 30, right + 12), bottom]


def passage_has_content(document, crop):
    page_number, *box = crop
    region = document.pages[page_number - 1].crop(tuple(box))
    if (region.extract_text() or "").strip():
        return True
    # A question-only continuation page contributes blank top margin, not a
    # second passage. Check pixels too so a genuine text-free graphic survives.
    pixels = region.to_image(resolution=72).original.convert("L")
    dark_pixels = sum(pixels.histogram()[:180])
    return dark_pixels / (pixels.width * pixels.height) > 0.001


def question(test, number, section, stem, options, document):
    form = f"hacker-2-test-{test:02}"
    return {
        "certificateId": "toeic", "formId": form, "order": number,
        "id": f"{form}-q{number:03}", "revision": 1, "language": "en",
        "stem": stem,
        "options": [{"id": letter, "content": [paragraph(text)]} for letter, text in options.items()],
        "interaction": {"kind": "singleChoice", "requiredSelections": 1},
        "classification": {"section": f"part-{section}", "styleTags": []},
        "shuffleOptions": False,
        "provenance": {
            "kind": "sourceExcerpt", "rightsStatus": "privateUserProvided",
            "sourceDocument": document, "sourceQuestionNumber": number,
            "authoringNote": "User-provided Hacker 2 scan/audio. Positional extraction with targeted visual corrections; full transcription and audio alignment are not independently verified. Redistribution rights not established.",
        },
        "verification": {
            "answerStatus": "sourcePrinted", "reviewedAt": REVIEW_DATE,
            "reviewedAgainst": f"Hacker 2 printed key, Test {test}, question {number}",
        },
    }


def solution(question_id, answer, test, number, reference, explanation=None):
    return {
        "questionId": question_id, "correctOptionIds": [answer],
        "explanation": (explanation or []) + [paragraph(
            f"The printed key for Test {test}, question {number} marks ({answer}). "
            "No rationale is provided; the answer has not been independently verified.")],
        "references": [{"title": reference, "version": "User-provided source",
                        "locator": f"Test {test}, question {number}"}],
    }


def build_pack(authored, keys, helper, ffmpeg, ffprobe, check):
    if authored["issues"] or keys["issues"]:
        raise ValueError("Resolve extraction and printed-key issues before importing")
    for name, expected in authored["sources"].items():
        if helper.sha256(SOURCE / name) != expected:
            raise ValueError(f"Source changed: {name}")
    for test, expected in keys["sourceSha256"].items():
        if helper.sha256(SOURCE / f"rc/answer/TEST {test}.png") != expected:
            raise ValueError(f"Printed key changed: Test {test}")
    for test, source in authored["audioSources"].items():
        if helper.sha256(SOURCE / f"lc/Hacker 2 LC Audios/TEST {test}.mp3") != source["sha256"]:
            raise ValueError(f"Audio changed: Test {test}")
    questions, solutions = [], []
    with pdfplumber.open(SOURCE / "rc/question/HACKER 2 READING.pdf") as document:
        for test_data in authored["reading"]:
            test = test_data["test"]
            crops = []
            if set(map(int, test_data["items"])) != set(range(101, 201)):
                raise ValueError(f"RC Test {test}: expected questions 101-200")
            if set(map(int, keys["tests"][str(test)])) != set(range(101, 201)):
                raise ValueError(f"RC Test {test}: incomplete printed key")
            stimuli = {}
            for group in test_data["groups"]:
                if not group["passageCrops"]:
                    raise ValueError(f"{group['id']}: passage crops missing")
                blocks = []
                # The scan's text layer drops blanks, currency symbols and table
                # cells. Keep layout-sensitive passages as the bounded source
                # images rather than displaying a damaged duplicate transcript.
                for index, crop in enumerate(group["passageCrops"], 1):
                    if not passage_has_content(document, crop):
                        continue
                    name = f"{group['id']}-passage-{index}.webp"
                    # Include the header's leftmost glyph on scans with a
                    # narrower binding margin than the passage body.
                    padded_crop = [crop[0], max(0, crop[1] - 15), *crop[2:]]
                    crops.append((padded_crop, IMAGES / name))
                    blocks.append(image(f"/pdf-evidence/{name}",
                                        f"Hacker 2 Test {test}, reading passage {group['first']}-{group['last']}, page {index}"))
                if not blocks:
                    raise ValueError(f"{group['id']}: no visible passage content")
                stimuli[group["id"]] = {"id": group["id"], "content": blocks}
            for number in range(101, 201):
                item = test_data["items"][str(number)]
                section = 5 if number <= 130 else 6 if number <= 146 else 7
                if section == 5 and item["stem"].count("______") != 1:
                    raise ValueError(f"RC {test}-{number}: expected exactly one blank")
                if set(item["options"]) != set("ABCD") or any(not s.strip() for s in item["options"].values()):
                    raise ValueError(f"RC {test}-{number}: incomplete A-D options")
                q = question(test, number, section, [paragraph(item["stem"])],
                             item["options"], "HACKER 2 READING.pdf")
                name = f"{q['id']}.webp"
                crops.append(([item["page"], *item["box"]], IMAGES / name))
                q["sourceQuestionImage"] = {"src": f"/pdf-evidence/{name}", "page": item["page"]}
                if section > 5:
                    q["stimulus"] = stimuli[item["groupId"]]
                answer = keys["tests"][str(test)][str(number)]
                if len(answer) != 1 or answer not in "ABCD":
                    raise ValueError(f"RC {test}-{number}: invalid answer")
                questions.append(q)
                solutions.append(solution(q["id"], answer, test, number, "Hacker 2 RC printed answer key"))
            # Rendering in page order avoids decoding the same scanned page
            # repeatedly when passage crops precede their question panels.
            for crop, output in sorted(crops, key=lambda entry: entry[0][0]):
                helper.crop_image(document, crop, output, check)
            print(f"Imported RC Test {test}: 100 questions", flush=True)
    # Reset the reusable renderer cache before opening a different PDF.
    helper.crop_image.page_number = None
    with pdfplumber.open(SOURCE / "lc/HACKER 2 LISTENING.pdf") as document:
        for test_data in authored["listening"]:
            test = test_data["test"]
            crops = []
            available = sorted(map(int, test_data["items"]))
            if sorted(set(range(1, 101)) - set(available)) != test_data["omittedQuestions"]:
                raise ValueError(f"LC Test {test}: omission/source inventory mismatch")
            clips, stimuli = set(), {}
            for number in available:
                item = test_data["items"][str(number)]
                section = helper.part(number)
                first = helper.group_first(number)
                suffix = f"-{first + 2:03}" if first >= 32 else ""
                audio_name = f"hacker-2-test-{test:02}-q{first:03}{suffix}.mp3"
                if audio_name not in clips:
                    helper.clip_audio(ffmpeg, ffprobe, SOURCE / f"lc/Hacker 2 LC Audios/TEST {test}.mp3",
                                      test_data["cues"][str(first)], AUDIO / audio_name, check)
                    clips.add(audio_name)
                audio = {"kind": "audio", "src": f"/audio/toeic/{audio_name}",
                         "label": f"Hacker 2 Test {test}, questions {first}-{first + 2}" if first >= 32
                                  else f"Hacker 2 Test {test}, question {number}"}
                stem = []
                if section == 1:
                    name = f"hacker-2-lc-test-{test:02}-q{number:03}-photo.webp"
                    crops.append((item["photoCrop"], IMAGES / name))
                    # Alt text must not expose the correct spoken statement.
                    stem.extend([image(f"/pdf-evidence/{name}", f"Photograph for Hacker 2 Test {test}, question {number}"), audio])
                elif section == 2:
                    stem.extend([paragraph("Listen to the question and three responses."), audio])
                else:
                    stem.append(paragraph(item["stem"]))
                    if first not in stimuli:
                        blocks = [audio]
                        graphic = test_data["graphics"].get(str(first))
                        if graphic:
                            name = f"hacker-2-lc-test-{test:02}-q{first:03}-graphic.webp"
                            crops.append((graphic_crop(document, graphic), IMAGES / name))
                            blocks.append(image(f"/pdf-evidence/{name}",
                                                f"Graphic for Hacker 2 Test {test}, questions {first}-{first + 2}"))
                        stimuli[first] = {"id": f"hacker-2-test-{test:02}-{first:03}-{first + 2:03}", "content": blocks}
                letters = "ABC" if section == 2 else "ABCD"
                options = {letter: item["options"][letter] if section >= 3 else letter for letter in letters}
                q = question(test, number, section, stem, options, "HACKER 2 LISTENING.pdf")
                if section >= 3:
                    q["stimulus"] = stimuli[first]
                    name = f"{q['id']}-panel.webp"
                    crops.append(([item["page"], *item["box"]], IMAGES / name))
                    q["sourceQuestionImage"] = {"src": f"/pdf-evidence/{name}", "page": item["page"]}
                transcript = item["spokenTranscript"] if section <= 2 else test_data["groupTranscripts"][str(first)]
                answer = test_data["answers"][str(number)]
                if answer not in letters:
                    raise ValueError(f"LC {test}-{number}: invalid printed key")
                questions.append(q)
                solutions.append(solution(q["id"], answer, test, number, "Hacker 2 LC transcript printed key",
                                          helper.transcript_blocks(transcript, section)))
            for crop, output in sorted(crops, key=lambda entry: entry[0][0]):
                helper.crop_image(document, crop, output, check)
            print(f"Imported LC Test {test}: {len(available)} questions, {len(clips)} clips", flush=True)
    questions.sort(key=lambda q: (q["formId"], q["order"]))
    solutions.sort(key=lambda s: s["questionId"])
    return {"questions": questions, "solutions": solutions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument("--ffprobe", default=shutil.which("ffprobe"))
    args = parser.parse_args()
    if not args.ffmpeg or not args.ffprobe:
        parser.error("ffmpeg and ffprobe are required")
    authored = json.loads((ROOT / "content/toeic-hacker2-items.json").read_text(encoding="utf-8"))
    keys = json.loads((ROOT / "content/toeic-hacker2-answers.json").read_text(encoding="utf-8"))
    helper = load_script("import-toeic-hacker-lc")
    IMAGES.mkdir(parents=True, exist_ok=True)
    AUDIO.mkdir(parents=True, exist_ok=True)
    pack = build_pack(authored, keys, helper, args.ffmpeg, args.ffprobe, args.check)
    serialized = json.dumps(pack, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != serialized:
            raise ValueError("Hacker 2 pack is stale; rerun importer")
    else:
        OUTPUT.write_text(serialized, encoding="utf-8", newline="\n")
    print(f"Hacker 2: {len(pack['questions'])} questions and solutions", flush=True)


if __name__ == "__main__":
    main()
