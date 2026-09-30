"""Read the ten printed Hacker RC answer grids into a checked local mapping."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image
from rapidocr_onnxruntime import RapidOCR


ROOT = Path(__file__).resolve().parents[1]
ANSWER_DIR = ROOT / "resources/toeic/hacker/rc/answer"
# These three tiny printed cells were read from the source image after OCR
# omitted their question number. Keep the corrections explicit for audit.
VISUALLY_CHECKED = {(6, 183): "B", (8, 198): "B", (9, 168): "C"}


def center(box: list[list[float]]) -> tuple[float, float]:
    return (
        sum(point[0] for point in box) / len(box),
        sum(point[1] for point in box) / len(box),
    )


def extract_grid(path: Path, engine: RapidOCR) -> tuple[dict[int, str], list[str]]:
    image = Image.open(path).convert("RGB")
    image = image.resize((image.width * 4, image.height * 4))
    detections, _ = engine(image)
    entries = [(text.strip(), center(box), confidence) for box, text, confidence in detections]
    mapping: dict[int, str] = {}
    issues: list[str] = []
    for text, (x, y), confidence in entries:
        number_match = re.fullmatch(r"(1\d\d|200)(?:\s*\(([ABCD])\))?", text)
        if not number_match:
            continue
        number = int(number_match.group(1))
        if not 101 <= number <= 200:
            continue
        answer = number_match.group(2)
        if answer is None:
            nearby = [
                (letter, score)
                for candidate, (letter_x, letter_y), score in entries
                if (letter := re.fullmatch(r"\(([ABCD])\)", candidate))
                and x < letter_x < x + 120
                and abs(y - letter_y) < 20
            ]
            if len(nearby) == 1:
                answer = nearby[0][0].group(1)
                confidence = min(confidence, nearby[0][1])
        if answer is None:
            issues.append(f"{path.name}: {number} has no unambiguous answer")
            continue
        if number in mapping and mapping[number] != answer:
            issues.append(f"{path.name}: {number} has conflicting answers")
        mapping[number] = answer
        if confidence < 0.75:
            issues.append(f"{path.name}: {number} OCR confidence {confidence:.2f}")
    missing = sorted(set(range(101, 201)) - set(mapping))
    if missing:
        issues.append(f"{path.name}: missing {missing}")
    return mapping, issues


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    engine = RapidOCR()
    tests: dict[str, dict[str, str]] = {}
    issues: list[str] = []
    for test in range(1, 11):
        path = ANSWER_DIR / f"{test}.PNG"
        mapping, test_issues = extract_grid(path, engine)
        for (corrected_test, number), answer in VISUALLY_CHECKED.items():
            if corrected_test != test:
                continue
            if number in mapping and mapping[number] != answer:
                test_issues.append(f"{path.name}: visual correction conflicts at {number}")
            mapping[number] = answer
        test_issues = [
            issue for issue in test_issues
            if not issue.startswith(f"{path.name}: missing ")
        ]
        missing = sorted(set(range(101, 201)) - set(mapping))
        if missing:
            test_issues.append(f"{path.name}: missing {missing}")
        tests[str(test)] = {str(number): letter for number, letter in sorted(mapping.items())}
        issues.extend(test_issues)
        print(f"Test {test:02}: {len(mapping)} answers, {len(test_issues)} issues", flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    hashes = {
        str(test): hashlib.sha256((ANSWER_DIR / f"{test}.PNG").read_bytes()).hexdigest()
        for test in range(1, 11)
    }
    result = {
        "tests": tests,
        "issues": issues,
        "visuallyChecked": [f"{test}.PNG:{number}={letter}" for (test, number), letter in VISUALLY_CHECKED.items()],
        "sourceSha256": hashes,
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    if issues:
        for issue in issues:
            print(issue)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
