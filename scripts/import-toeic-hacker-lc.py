"""Build the private Hacker 3 Listening question pack and local media.

Run extract-toeic-hacker-lc.py first when the supplied source changes. This
importer consumes its source map and reviewed overrides, never guesses absent
Test 4 questions from the printed answer key.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources/toeic/hacker3/lc"
QUESTION_PDF = SOURCE / "Hacker 3 LC.pdf"
TRANSCRIPT_PDF = SOURCE / "Hacker 3 LC Transcript.pdf"
AUDIO_DIR = SOURCE / "Hacker 3 LC Audios"
CONTENT = ROOT / "content"
IMAGE_DIR = ROOT / "public/pdf-evidence"
CLIP_DIR = ROOT / "public/audio/toeic"
OUTPUT = CONTENT / "toeic-hacker-lc-generated.json"
MISSING_TEST_4 = {1, 2, *range(65, 83)}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def part(number: int) -> int:
    return 1 if number <= 6 else 2 if number <= 31 else 3 if number <= 70 else 4


def group_first(number: int) -> int:
    if number <= 31:
        return number
    return 32 + 3 * ((number - 32) // 3) if number <= 70 else 71 + 3 * ((number - 71) // 3)


def paragraph(text: str) -> dict:
    return {"kind": "paragraph", "text": text}


def transcript_blocks(transcript: str, section: int) -> list[dict]:
    blocks = [{"kind": "heading", "level": 4, "text": "Transcript"}]
    if section <= 2:
        choices = list(re.finditer(r"\(([ABCD])\)\s*", transcript))
        expected = "ABC" if section == 2 else "ABCD"
        if "".join(match.group(1) for match in choices) != expected:
            raise ValueError(f"Part {section} transcript has incomplete spoken choices")
        question = transcript[:choices[0].start()].strip()
        if question:
            blocks.append(paragraph(question))
        for index, match in enumerate(choices):
            end = choices[index + 1].start() if index + 1 < len(choices) else len(transcript)
            blocks.append(paragraph(f"({match.group(1)}) {transcript[match.end():end].strip()}"))
    elif section == 3:
        turns = re.split(r"(?=\b[MW]:\s)", transcript)
        blocks.extend(paragraph(turn.strip()) for turn in turns if turn.strip())
    else:
        blocks.append(paragraph(transcript))
    return blocks


def image_block(src: str, alt: str) -> dict:
    return {"kind": "image", "src": src, "alt": alt}


def photo_description(transcript: str, answer: str) -> str:
    statements = dict(re.findall(r"\(([ABCD])\)\s*(.*?)(?=\s*\([ABCD]\)|$)", transcript))
    if set(statements) != set("ABCD"):
        raise ValueError("Part 1 transcript must contain four spoken statements")
    return statements[answer]


def graphic_description(document: pdfplumber.PDF, crop: list[float], test: int, first: int) -> str:
    page_number, left, top, right, bottom = crop
    labels = document.pages[page_number - 1].crop((left, top, right, bottom)).extract_text() or ""
    labels = re.sub(r"\s+", " ", labels).strip()
    prefix = f"Graphic for Test {test}, questions {first}–{first + 2}"
    return f"{prefix}: {labels[:500]}" if labels else prefix


def audio_name(test: int, first: int) -> str:
    end = f"-{first + 2:03}" if first >= 32 else ""
    return f"hacker-3-test-{test:02}-q{first:03}{end}.mp3"


def image_name(test: int, number: int, suffix: str = "") -> str:
    return f"hacker-3-lc-test-{test:02}-q{number:03}{suffix}.webp"


def crop_image(document: pdfplumber.PDF, crop: list[float], output: Path, check: bool) -> None:
    page_number, left, top, right, bottom = crop
    page = document.pages[page_number - 1]
    if not (0 <= left < right <= page.width and 0 <= top < bottom <= page.height):
        raise ValueError(f"Invalid crop {output.name}: {crop}")
    if check:
        if not output.is_file() or output.stat().st_size < 1000:
            raise ValueError(f"Missing or empty image: {output}")
        return
    # Questions on a page are adjacent in source order; render that page once.
    if getattr(crop_image, "page_number", None) != page_number:
        crop_image.rendered = page.to_image(resolution=200).original
        crop_image.page_number = page_number
    rendered = crop_image.rendered
    scale = 200 / 72
    region = rendered.crop(tuple(round(value * scale) for value in (left, top, right, bottom)))
    region.save(output, "WEBP", quality=87)


def clip_audio(ffmpeg: str, ffprobe: str, source: Path, cue: list[int], output: Path, check: bool) -> None:
    start_ms, end_ms = cue
    if not (0 <= start_ms < end_ms):
        raise ValueError(f"Invalid audio cue: {output.name}")
    duration = (end_ms - start_ms) / 1000
    if not check:
        subprocess.run([
            ffmpeg, "-v", "error", "-y", "-ss", f"{start_ms / 1000:.3f}",
            "-i", str(source), "-t", f"{duration:.3f}", "-ac", "1", "-b:a", "96k",
            str(output),
        ], check=True)
    if not output.is_file() or output.stat().st_size < 1000:
        raise ValueError(f"Missing or empty audio clip: {output}")
    probe = subprocess.run([
        ffprobe, "-v", "error", "-select_streams", "a:0",
        "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1",
        str(output),
    ], check=True, capture_output=True, text=True)
    if abs(float(probe.stdout.strip()) - duration) > 0.2:
        raise ValueError(f"Audio clip duration mismatch: {output.name}")


def validate_sources(source: dict) -> None:
    paths = [(QUESTION_PDF, source["questionPdfSha256"]),
             (TRANSCRIPT_PDF, source["transcriptPdfSha256"])]
    paths.extend((AUDIO_DIR / f"TEST {test}.mp3", source["audioSha256"][str(test)])
                 for test in range(1, 11))
    for path, expected in paths:
        if sha256(path) != expected:
            raise ValueError(f"Source hash changed: {path.name}; rerun extractor and review")
    if source["missingQuestionPages"] != {"4": [64, 65, 72, 73]}:
        raise ValueError("Unexpected Test 4 source page inventory")


def build_pack(source: dict, items: dict, cues: dict, ffmpeg: str, ffprobe: str, check: bool) -> dict:
    questions = []
    solutions = []
    rendered_images: set[str] = set()
    created_audio: set[str] = set()
    with pdfplumber.open(QUESTION_PDF) as document:
        for test in range(1, 11):
            form = f"hacker-3-test-{test:02}"
            source_test = source["tests"][test - 1]
            authored = items["tests"][test - 1]
            if source_test["test"] != test or authored["test"] != test:
                raise ValueError(f"Test {test}: source map order mismatch")
            expected = set(range(1, 101)) - (MISSING_TEST_4 if test == 4 else set())
            if set(map(int, authored["questions"])) != expected:
                raise ValueError(f"Test {test}: question inventory mismatch")
            if source_test["omittedQuestions"] != (sorted(MISSING_TEST_4) if test == 4 else []):
                raise ValueError(f"Test {test}: omitted question inventory mismatch")
            if set(map(int, source_test["answers"])) != set(range(1, 101)):
                raise ValueError(f"Test {test}: printed key inventory mismatch")
            for number in sorted(expected):
                key = str(number)
                item = authored["questions"][key]
                section = part(number)
                first = group_first(number)
                answer = source_test["answers"][key]
                letters = "ABC" if section == 2 else "ABCD"
                if answer not in letters:
                    raise ValueError(f"Test {test} question {number}: invalid printed answer")
                question_id = f"{form}-q{number:03}"
                audio_file = audio_name(test, first)
                audio_src = f"/audio/toeic/{audio_file}"
                if audio_file not in created_audio:
                    cue = cues["tests"][str(test)][str(first)]
                    clip_audio(ffmpeg, ffprobe, AUDIO_DIR / f"TEST {test}.mp3", cue,
                               CLIP_DIR / audio_file, check)
                    created_audio.add(audio_file)
                stem = []
                stimulus = None
                if section == 1:
                    photo = image_name(test, number, "-photo")
                    crop = item["photoCrop"]
                    if photo not in rendered_images:
                        crop_image(document, crop, IMAGE_DIR / photo, check)
                        rendered_images.add(photo)
                    stem.append(image_block(
                        f"/pdf-evidence/{photo}",
                        photo_description(item["spokenTranscript"], answer)))
                    stem.append({"kind": "audio", "src": audio_src,
                                 "label": f"Test {test}, question {number}"})
                elif section == 2:
                    stem.append(paragraph("Listen to the question and three responses."))
                    stem.append({"kind": "audio", "src": audio_src,
                                 "label": f"Test {test}, question {number}"})
                else:
                    if not item["stem"] or any(not item["options"][letter] for letter in letters):
                        raise ValueError(f"Test {test} question {number}: incomplete printed text")
                    stem.append(paragraph(item["stem"]))
                    panel = image_name(test, number, "-panel")
                    if panel not in rendered_images:
                        crop_image(document, [item["page"], *item["box"]],
                                   IMAGE_DIR / panel, check)
                        rendered_images.add(panel)
                    stimulus_content = [{"kind": "audio", "src": audio_src,
                                         "label": f"Test {test}, questions {first}–{first + 2}"}]
                    graphic = authored["graphicCrops"].get(str(first))
                    if graphic:
                        graphic_file = image_name(test, first, "-graphic")
                        if graphic_file not in rendered_images:
                            crop_image(document, graphic, IMAGE_DIR / graphic_file, check)
                            rendered_images.add(graphic_file)
                        stimulus_content.append(image_block(
                            f"/pdf-evidence/{graphic_file}",
                            graphic_description(document, graphic, test, first)))
                    stimulus = {"id": f"{form}-{first:03}-{first + 2:03}",
                                "content": stimulus_content}
                options = [{"id": letter, "content": [paragraph(
                    item["options"][letter] if section >= 3 else letter)]} for letter in letters]
                question = {
                    "certificateId": "toeic", "formId": form, "order": number,
                    "id": question_id, "revision": 1, "language": "en",
                    "stem": stem, "options": options,
                    "interaction": {"kind": "singleChoice", "requiredSelections": 1},
                    "classification": {"section": f"part-{section}", "styleTags": []},
                    "shuffleOptions": False,
                    "provenance": {
                        "kind": "sourceExcerpt",
                        "authoringNote": (f"User-provided Hacker 3 Listening scan/audio, Test {test}. "
                                          "Transcript and printed text have targeted review; full transcription "
                                          "and audio alignment are not independently verified. Redistribution rights not established."),
                        "rightsStatus": "privateUserProvided",
                        "sourceDocument": "Hacker 3 LC.pdf",
                        "sourceQuestionNumber": number,
                    },
                    "verification": {
                        "answerStatus": "sourcePrinted",
                        "reviewedAgainst": f"Hacker 3 LC Transcript.pdf, Test {test}, question {number}",
                        "reviewedAt": "2026-10-02",
                    },
                }
                if section >= 3:
                    question["sourceQuestionImage"] = {
                        "src": f"/pdf-evidence/{panel}", "page": item["page"]}
                if stimulus:
                    question["stimulus"] = stimulus
                transcript = (item["spokenTranscript"] if section <= 2 else
                              authored["groupTranscripts"][str(first)])
                if not transcript or "1000 3" in transcript or "PART 2" in transcript:
                    raise ValueError(f"Test {test} question {number}: bad transcript")
                solution = {
                    "questionId": question_id, "correctOptionIds": [answer],
                    "explanation": transcript_blocks(transcript, section) + [
                        paragraph("The printed answer key marks " + answer + ". No rationale is provided.")
                    ],
                    "references": [{"title": "Hacker 3 LC Transcript",
                                    "version": "User-provided scan",
                                    "locator": f"Test {test}, question {number}"}],
                }
                questions.append(question)
                solutions.append(solution)
            print(f"Test {test}: {len(expected)} Listening questions", flush=True)
    if len(questions) != 980 or len(solutions) != 980 or len(created_audio) != 532:
        raise ValueError("Expected 980 questions, 980 solutions and 532 audio clips")
    return {"questions": questions, "solutions": solutions}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument("--ffprobe", default=shutil.which("ffprobe"))
    args = parser.parse_args()
    if not args.ffmpeg or not args.ffprobe:
        parser.error("ffmpeg and ffprobe are required; pass their installed paths")
    source = read_json(CONTENT / "toeic-hacker-lc-source.json")
    items = read_json(CONTENT / "toeic-hacker-lc-items.json")
    cues = read_json(CONTENT / "toeic-hacker-lc-audio-cues.json")
    validate_sources(source)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    CLIP_DIR.mkdir(parents=True, exist_ok=True)
    pack = build_pack(source, items, cues, args.ffmpeg, args.ffprobe, args.check)
    serialized = json.dumps(pack, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != serialized:
            raise ValueError("Listening question pack is stale; rerun importer")
    else:
        OUTPUT.write_text(serialized, encoding="utf-8", newline="\n")
    print("Hacker 3 LC: 980 questions, 532 clips; source hashes and media verified")


if __name__ == "__main__":
    main()
