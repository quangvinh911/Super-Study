"""Build the private PDF-derived CTFL bank and visual evidence assets.

The input PDF remains outside the repository. Generated text and evidence are
intended for an owner-only ChatGPT Site unless redistribution rights are cleared.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageOps


QUESTION_RE = re.compile(r"(?m)^Question:\s*(\d+)\b")
ANSWER_RE = re.compile(r"(?m)^Answer:\s*([A-EU]{1,2})\s*$")
OPTION_RE = re.compile(r"(?m)^([A-E])\.\s+(?=\S)")
INVALID_KEYS = {38: "A", 39: "A", 47: "A"}


@dataclass(frozen=True)
class Marker:
    number: int
    page_index: int
    top: float
    bottom: float


@dataclass(frozen=True)
class AnswerMarker:
    raw_key: str
    page_index: int
    top: float
    bottom: float


def compact(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def content(text: str) -> list[dict[str, str]]:
    cleaned = compact(text)
    return [{"kind": "paragraph", "text": cleaned}]


def explanation_content(text: str) -> list[dict[str, object]]:
    """Preserve the answer-sheet hierarchy without allowing arbitrary HTML."""
    cleaned_lines = [
        compact(line)
        for line in text.replace("\f", "\n").splitlines()
        if compact(line) and compact(line).lower() != "certyiq"
    ]
    blocks: list[dict[str, object]] = []
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        if not paragraph_lines:
            return
        paragraph = compact(" ".join(paragraph_lines))
        paragraph_lines.clear()
        # Option-by-option rationales in the source become separate paragraphs.
        parts = re.split(
            r"\s+(?=(?:Option\s+[A-E]|[A-E][.)])\s*[–—-]?\s+)",
            paragraph,
        )
        blocks.extend(
            {"kind": "paragraph", "text": part.strip()}
            for part in parts
            if part.strip()
        )

    for line in cleaned_lines:
        normalized = line.rstrip(":").strip()
        labeled_section = re.match(
            r"^(Justification|Conclusion|References|Calculations?)"
            r"(?:\s*[:–—-]\s*(.*)|\s*)$",
            line,
            flags=re.IGNORECASE,
        )
        if labeled_section:
            flush_paragraph()
            label = labeled_section.group(1)
            blocks.append(
                {
                    "kind": "heading",
                    "text": label[0].upper() + label[1:].lower(),
                    "level": 4,
                }
            )
            remainder = (labeled_section.group(2) or "").strip()
            if remainder:
                paragraph_lines.append(remainder)
            continue
        is_heading = (
            (
                len(normalized) <= 150
                and re.match(
                    r"^Why (?:option|the other option|the other options)\b",
                    normalized,
                    flags=re.IGNORECASE,
                )
                is not None
            )
        )
        if is_heading:
            flush_paragraph()
            blocks.append({"kind": "heading", "text": normalized, "level": 4})
        else:
            paragraph_lines.append(line)

    flush_paragraph()
    return blocks or [
        {
            "kind": "paragraph",
            "text": "No explanation was provided in the source PDF.",
        }
    ]


def remove_source_brand(image: Image.Image) -> None:
    """Mask the source-provider mark in the question header crop."""
    draw = ImageDraw.Draw(image)
    draw.rectangle(
        (int(image.width * 0.82), 0, image.width, min(50, image.height)),
        fill="#ffffff",
    )


def lines_for_page(page: pdfplumber.page.Page) -> list[tuple[float, float, str]]:
    words = page.extract_words(x_tolerance=2, y_tolerance=3, use_text_flow=True)
    groups: list[list[dict[str, object]]] = []
    for word in sorted(words, key=lambda item: (float(item["top"]), float(item["x0"]))):
        top = float(word["top"])
        if not groups or abs(top - float(groups[-1][0]["top"])) > 2.25:
            groups.append([word])
        else:
            groups[-1].append(word)

    lines: list[tuple[float, float, str]] = []
    for group in groups:
        ordered = sorted(group, key=lambda item: float(item["x0"]))
        text = " ".join(str(item["text"]) for item in ordered)
        lines.append(
            (
                min(float(item["top"]) for item in ordered),
                max(float(item["bottom"]) for item in ordered),
                text,
            )
        )
    return lines


def find_visual_markers(
    pages: list[pdfplumber.page.Page],
) -> tuple[dict[int, Marker], dict[int, AnswerMarker]]:
    questions: dict[int, Marker] = {}
    answers: dict[int, AnswerMarker] = {}
    active_question: int | None = None

    for page_index, page in enumerate(pages):
        for top, bottom, line in lines_for_page(page):
            question_match = re.search(r"\bQuestion:\s*(\d+)\b", line)
            if question_match:
                active_question = int(question_match.group(1))
                questions[active_question] = Marker(
                    active_question, page_index, top, bottom
                )
                continue
            answer_match = re.search(r"\bAnswer:\s*([A-EU]{1,2})\b", line)
            if answer_match and active_question is not None and active_question not in answers:
                answers[active_question] = AnswerMarker(
                    answer_match.group(1), page_index, top, bottom
                )

    return questions, answers


def crop_page(
    document: pdfium.PdfDocument,
    page_index: int,
    top: float,
    bottom: float,
    scale: float = 1.8,
) -> Image.Image:
    rendered = document[page_index].render(scale=scale).to_pil().convert("RGB")
    page_height_points = document[page_index].get_height()
    factor = rendered.height / page_height_points
    upper = max(0, int(top * factor))
    lower = min(rendered.height, max(upper + 1, int(bottom * factor)))
    return rendered.crop((0, upper, rendered.width, lower))


def stack(images: list[Image.Image]) -> Image.Image:
    if len(images) == 1:
        return images[0]
    width = max(image.width for image in images)
    height = sum(image.height for image in images) + (len(images) - 1) * 6
    result = Image.new("RGB", (width, height), "#d7dfdb")
    offset = 0
    for image in images:
        result.paste(image, (0, offset))
        offset += image.height + 6
    return result


def save_evidence(
    document: pdfium.PdfDocument,
    pdf_pages: list[pdfplumber.page.Page],
    questions: dict[int, Marker],
    answers: dict[int, AnswerMarker],
    number: int,
    evidence_dir: Path,
) -> tuple[str, str, list[int], list[int]]:
    question = questions[number]
    answer = answers[number]
    question_parts: list[Image.Image] = []
    for page_index in range(question.page_index, answer.page_index + 1):
        page_height = float(pdf_pages[page_index].height)
        top = max(0.0, question.top - 5.0) if page_index == question.page_index else 0.0
        bottom = min(page_height, answer.top - 4.0) if page_index == answer.page_index else page_height
        if bottom > top + 2:
            question_parts.append(crop_page(document, page_index, top, bottom))

    if question_parts:
        remove_source_brand(question_parts[0])
    question_image = ImageOps.expand(stack(question_parts), border=2, fill="#c6d1cc")
    question_path = evidence_dir / f"q-{number:03d}.webp"
    question_image.save(question_path, "WEBP", quality=78, method=6)

    next_question = questions.get(number + 1)
    answer_page_height = float(pdf_pages[answer.page_index].height)
    answer_bottom = min(answer_page_height, answer.bottom + 118.0)
    if next_question and next_question.page_index == answer.page_index:
        answer_bottom = min(answer_bottom, next_question.top - 5.0)
    answer_image = crop_page(
        document,
        answer.page_index,
        max(0.0, answer.top - 5.0),
        max(answer.bottom + 4.0, answer_bottom),
    )
    answer_image = ImageOps.expand(answer_image, border=2, fill="#c6d1cc")
    answer_path = evidence_dir / f"a-{number:03d}.webp"
    answer_image.save(answer_path, "WEBP", quality=80, method=6)

    question_pages = list(range(question.page_index + 1, answer.page_index + 2))
    return (
        f"/pdf-evidence/{question_path.name}",
        f"/pdf-evidence/{answer_path.name}",
        question_pages,
        [answer.page_index + 1],
    )


def infer_style_tags(stem: str) -> list[str]:
    lower = stem.lower()
    tags: list[str] = []
    if any(token in lower for token in ("following table", "diagram", "figure", "graph")):
        tags.append("tableOrDiagram")
    if any(token in lower for token in ("calculate", "calculation", "coverage", "estimate")):
        tags.append("calculation")
    if any(token in lower for token in ("scenario", "you are", "you have", "your team")):
        tags.append("scenario")
    if "statement" in lower or re.search(r"\b(?:i|ii|iii|iv)\.", lower):
        tags.append("statementEvaluation")
    for flag in ("TRUE", "FALSE", "BEST", "MOST", "NOT", "MINIMAL"):
        if re.search(rf"\b{flag}\b", stem):
            tags.append(flag)
    if not tags:
        tags.append("directKnowledge")
    return list(dict.fromkeys(tags))


def parse_question_block(number: int, block: str) -> tuple[str, dict[str, str], str, str]:
    answer_match = ANSWER_RE.search(block)
    if not answer_match:
        raise ValueError(f"Question {number}: answer marker not found")
    question_part = block[: answer_match.start()].strip()
    raw_key = answer_match.group(1)
    after_answer = block[answer_match.end() :].strip()
    explanation = re.sub(r"^Explanation:\s*", "", after_answer, count=1).strip()

    option_matches = list(OPTION_RE.finditer(question_part))
    if len(option_matches) not in (4, 5):
        raise ValueError(
            f"Question {number}: expected 4 or 5 options, found {len(option_matches)}"
        )
    option_ids = [match.group(1) for match in option_matches]
    expected_ids = list("ABCDE"[: len(option_ids)])
    if option_ids != expected_ids:
        raise ValueError(f"Question {number}: invalid option sequence {option_ids}")

    stem = question_part[: option_matches[0].start()].strip()
    stem = re.sub(r"^\s*CertyIQ(?:\s+|$)", "", stem, count=1)
    options: dict[str, str] = {}
    for index, match in enumerate(option_matches):
        end = option_matches[index + 1].start() if index + 1 < len(option_matches) else len(question_part)
        options[match.group(1)] = compact(question_part[match.end() : end])
    return compact(stem), options, raw_key, explanation


def write_json(path: Path, payload: object) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def build(input_pdf: Path, output_dir: Path, evidence_dir: Path, render: bool) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    with pdfplumber.open(input_pdf) as opened:
        pages = list(opened.pages)
        page_texts = [
            page.extract_text(x_tolerance=2, y_tolerance=3) or "" for page in pages
        ]
        combined = "\n\f\n".join(page_texts)
        matches = list(QUESTION_RE.finditer(combined))
        numbers = [int(match.group(1)) for match in matches]
        if numbers != list(range(1, 279)):
            raise ValueError(f"Expected questions 1..278, found {numbers[:5]}...{numbers[-5:]}")

        visual_questions, visual_answers = find_visual_markers(pages)
        missing_visual = set(numbers) - set(visual_questions) | set(numbers) - set(visual_answers)
        if missing_visual:
            raise ValueError(f"Missing visual markers for questions: {sorted(missing_visual)}")

        pdf_document = pdfium.PdfDocument(str(input_pdf)) if render else None
        questions_payload: list[dict[str, object]] = []
        solutions_payload: list[dict[str, object]] = []
        answer_counts: dict[str, int] = {}
        total_evidence_bytes = 0

        for index, match in enumerate(matches):
            number = int(match.group(1))
            end = matches[index + 1].start() if index + 1 < len(matches) else len(combined)
            block = combined[match.end() : end]
            stem, option_texts, raw_key, explanation = parse_question_block(number, block)
            answer_counts[raw_key] = answer_counts.get(raw_key, 0) + 1
            corrected_key = INVALID_KEYS.get(number, raw_key)
            correct_ids = list(corrected_key)
            if any(option_id not in option_texts for option_id in correct_ids):
                raise ValueError(
                    f"Question {number}: answer {corrected_key} does not exist in options"
                )

            visual_question = visual_questions[number]
            visual_answer = visual_answers[number]
            question_pages = list(
                range(visual_question.page_index + 1, visual_answer.page_index + 2)
            )
            answer_pages = [visual_answer.page_index + 1]
            question_image = f"/pdf-evidence/q-{number:03d}.webp"
            answer_image = f"/pdf-evidence/a-{number:03d}.webp"
            if render and pdf_document is not None:
                question_image, answer_image, question_pages, answer_pages = save_evidence(
                    pdf_document,
                    pages,
                    visual_questions,
                    visual_answers,
                    number,
                    evidence_dir,
                )
                total_evidence_bytes += (evidence_dir / f"q-{number:03d}.webp").stat().st_size
                total_evidence_bytes += (evidence_dir / f"a-{number:03d}.webp").stat().st_size

            question_id = f"PDF-Q-{number:03d}"
            questions_payload.append(
                {
                    "id": question_id,
                    "revision": 1,
                    "language": "en",
                    "stem": content(stem),
                    "options": [
                        {"id": option_id, "content": content(option_text)}
                        for option_id, option_text in option_texts.items()
                    ],
                    "interaction": {
                        "kind": "multiSelect" if len(correct_ids) > 1 else "singleChoice",
                        "requiredSelections": len(correct_ids),
                    },
                    "classification": {
                        "chapter": 1,
                        "section": "Source PDF - unclassified",
                        "learningObjective": "SOURCE-PDF",
                        "blueprintBucket": question_id,
                        "kLevel": "K1",
                        "styleTags": infer_style_tags(stem),
                    },
                    "shuffleOptions": False,
                    "provenance": {
                        "kind": "sourceExcerpt",
                        "authoringNote": "Extracted from the user-provided PDF for private study.",
                        "rightsStatus": "privateUserProvided",
                        "sourceDocument": input_pdf.name,
                        "sourceQuestionNumber": number,
                    },
                    "verification": {
                        "answerStatus": "sourceAnomalyCorrected" if number in INVALID_KEYS else "sourcePrinted",
                        "reviewedAgainst": input_pdf.name,
                        "reviewedAt": "2026-08-30",
                    },
                    "sourceEvidence": {
                        "questionImage": question_image,
                        "answerImage": answer_image,
                        "questionPages": question_pages,
                        "answerPages": answer_pages,
                        "rawAnswer": raw_key,
                        "answerNote": (
                            "The printed key is U; the explanation identifies option A. The practice answer is normalized to A."
                            if number in INVALID_KEYS
                            else None
                        ),
                    },
                }
            )
            solutions_payload.append(
                {
                    "questionId": question_id,
                    "correctOptionIds": correct_ids,
                    "explanation": explanation_content(explanation),
                    "references": [
                        {
                            "title": input_pdf.name,
                            "version": "source copy",
                            "locator": f"Question {number}; pages {', '.join(map(str, question_pages))}",
                        }
                    ],
                }
            )

    bank_version = "pdf-ctfl-v4-0-2026.08.30"
    manifest = {
        "schemaVersion": "1.0.0",
        "bankVersion": bank_version,
        "publishedAt": "2026-08-30",
        "syllabusVersion": "Source PDF; syllabus labels unavailable",
        "language": "en",
        "sourceKind": "privatePdf",
        "questionCount": len(questions_payload),
        "solutionCount": len(solutions_payload),
        "blueprint": [],
        "files": {
            "questions": "pdf-questions.json",
            "solutions": "pdf-solutions.json",
        },
    }
    write_json(output_dir / "pdf-manifest.json", manifest)
    write_json(
        output_dir / "pdf-questions.json",
        {"schemaVersion": "1.0.0", "bankVersion": bank_version, "questions": questions_payload},
    )
    write_json(
        output_dir / "pdf-solutions.json",
        {"schemaVersion": "1.0.0", "bankVersion": bank_version, "solutions": solutions_payload},
    )
    print(
        json.dumps(
            {
                "questions": len(questions_payload),
                "answers": answer_counts,
                "evidenceFiles": len(list(evidence_dir.glob("*.webp"))) if render else 0,
                "evidenceBytes": total_evidence_bytes,
            },
            ensure_ascii=False,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("public/data"))
    parser.add_argument("--evidence-dir", type=Path, default=Path("public/pdf-evidence"))
    parser.add_argument("--skip-evidence", action="store_true")
    args = parser.parse_args()
    build(args.input_pdf, args.output_dir, args.evidence_dir, not args.skip_evidence)


if __name__ == "__main__":
    main()
