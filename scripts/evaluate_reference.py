"""Compare generated speech with an Otter export as a weak, private reference.

Run with STELLIS_DATA_DIR set to the local app data directory. Prints aggregates only.
The export is not a ground truth and never enters a committed test fixture.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

from stellis import storage

HEADER = re.compile(r"^(Speaker \d+)\s+(\d+):(\d{2})(?::(\d{2}))?\s*$")
WORD = re.compile(r"[a-z0-9]+(?:'[a-z0-9]+)?")


def reference_turns(path: Path) -> list[dict[str, object]]:
    turns: list[dict[str, object]] = []
    for line in path.read_text().splitlines():
        match = HEADER.match(line)
        if match:
            parts = [int(value) for value in match.groups()[1:] if value is not None]
            seconds = parts[0] * 60 + parts[1] if len(parts) == 2 else parts[0] * 3600 + parts[1] * 60 + parts[2]
            turns.append({"speaker": match.group(1), "start_ms": seconds * 1000, "text": ""})
        elif turns:
            turns[-1]["text"] += " " + line.strip()
    return turns


def tokenize(text: str) -> list[str]:
    return WORD.findall(text.lower())


def edit_distance(left: list[str], right: list[str]) -> int:
    previous = list(range(len(right) + 1))
    for index, word in enumerate(left, 1):
        current = [index]
        for position, other in enumerate(right, 1):
            current.append(min(current[-1] + 1, previous[position] + 1,
                               previous[position - 1] + (word != other)))
        previous = current
    return previous[-1]


def summarize(reference: list[dict[str, object]], transcript: dict[str, object], duration_ms: int) -> dict[str, object]:
    segments = json.loads(str(transcript["segments_json"]))
    acoustic = json.loads(str(transcript["turns_json"]))
    reference_words = tokenize(" ".join(str(turn["text"]) for turn in reference))
    generated_words = tokenize(" ".join(str(segment["text"]) for segment in segments))
    # Long repeated speech makes whole-recording edit distance expensive; the
    # first 150 seconds is a reproducible sample, with a boundary caveat.
    sample_reference = tokenize(" ".join(str(turn["text"]) for turn in reference if int(turn["start_ms"]) < 150000))
    sample_generated = tokenize(" ".join(str(segment["text"]) for segment in segments if int(segment["start_ms"]) < 150000))
    sample_wer = edit_distance(sample_reference, sample_generated) / max(1, len(sample_reference))
    matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for index, turn in enumerate(reference):
        start = int(turn["start_ms"])
        end = int(reference[index + 1]["start_ms"]) if index + 1 < len(reference) else duration_ms
        for inferred in acoustic:
            shared = max(0, min(end, int(inferred["end_ms"])) - max(start, int(inferred["start_ms"])))
            if shared:
                matrix[str(inferred["speaker_cluster_id"])][str(turn["speaker"])] += shared
    assigned = sum(max(labels.values()) for labels in matrix.values() if labels)
    total = sum(sum(labels.values()) for labels in matrix.values())
    return {
        "reference_speakers": len({turn["speaker"] for turn in reference}),
        "acoustic_clusters": len(matrix),
        "reference_turns": len(reference),
        "acoustic_turns": len(acoustic),
        "reference_words": len(reference_words),
        "generated_words": len(generated_words),
        "first_150s_reference_words": len(sample_reference),
        "first_150s_generated_words": len(sample_generated),
        "first_150s_wer_approx": round(sample_wer, 3),
        "cluster_majority_time_fraction": round(assigned / total, 3) if total else 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("conversation_id")
    parser.add_argument("reference", type=Path)
    args = parser.parse_args()
    record = storage.get_conversation(args.conversation_id)
    transcript = storage.get_transcript(args.conversation_id)
    if not record or not transcript:
        parser.error("Conversation or generated transcript is missing")
    print(json.dumps(summarize(reference_turns(args.reference), transcript, int(record["duration_ms"])), indent=2))


if __name__ == "__main__":
    main()
