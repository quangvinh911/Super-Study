"""Extract Hacker 2 RC printed keys; fail on missing or conflicting cells."""

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image
from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    engine = RapidOCR()
    overrides = json.loads((ROOT / "content/toeic-hacker2-overrides.json").read_text(encoding="utf-8"))
    result = {"tests": {}, "sourceSha256": {}, "issues": []}
    for test in range(1, 11):
        path = ROOT / f"resources/toeic/hacker2/rc/answer/TEST {test}.png"
        image = Image.open(path).convert("RGB")
        scale = 1600 / image.width
        detections, _ = engine(image.resize((1600, round(image.height * scale))))
        entries = [(text.strip().upper(), sum(p[0] for p in box) / 4,
                    sum(p[1] for p in box) / 4, confidence) for box, text, confidence in detections]
        answers = {}
        for text, x, y, score in entries:
            match = re.fullmatch(r"(1\d\d|200)(?:\s*\(([ABCD])\))?", text)
            if match is None:
                continue
            number = int(match.group(1))
            if number < 101:
                continue
            letter = match.group(2)
            if letter is None:
                nearby = [(candidate, confidence) for candidate, cx, cy, confidence in entries
                          if re.fullmatch(r"\([ABCD]\)", candidate)
                          and 0 < cx - x < 240 and abs(cy - y) < 24]
                if len(nearby) != 1:
                    continue
                letter = nearby[0][0][1]
                score = min(score, nearby[0][1])
            if str(number) in answers and answers[str(number)] != letter:
                raise ValueError(f"Test {test} question {number}: conflicting printed answers")
            answers[str(number)] = letter
            if score < 0.75 and f"{test}-{number}" not in overrides["answers"]:
                result["issues"].append(f"Test {test} question {number}: OCR confidence {score:.3f}")
        for key, letter in overrides["answers"].items():
            corrected_test, number = map(int, key.split("-"))
            if corrected_test == test:
                if letter not in "ABCD" or len(letter) != 1:
                    raise ValueError(f"Invalid reviewed printed key {key}")
                answers[str(number)] = letter
        missing = sorted(set(range(101, 201)) - set(map(int, answers)))
        if missing:
            result["issues"].append(f"Test {test}: missing printed keys {missing}")
        result["tests"][str(test)] = dict(sorted(answers.items()))
        result["sourceSha256"][str(test)] = hashlib.sha256(path.read_bytes()).hexdigest()
        print(f"Test {test}: {len(answers)} printed answers", flush=True)
    path = ROOT / "content/toeic-hacker2-answers.json"
    serialized = json.dumps(result, indent=2) + "\n"
    if args.check:
        if path.read_text(encoding="utf-8") != serialized:
            raise ValueError("Printed keys changed; review and re-extract")
    else:
        path.write_text(serialized, encoding="utf-8", newline="\n")
    if result["issues"]:
        print("\n".join(result["issues"]), flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
