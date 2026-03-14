#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import mlx_whisper


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Transcribe audio with mlx-whisper and emit normalized JSON."
    )
    parser.add_argument("--audio-path", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--model")
    parser.add_argument("--language")
    args = parser.parse_args()

    kwargs = {}
    if args.model:
        kwargs["path_or_hf_repo"] = args.model
    if args.language:
        kwargs["language"] = args.language

    result = mlx_whisper.transcribe(args.audio_path, **kwargs)
    if not isinstance(result, dict):
        raise RuntimeError("mlx_whisper.transcribe returned a non-dict result")

    payload = {
        "text": result.get("text", ""),
        "language": result.get("language"),
        "segments": [
            {
                "start": segment.get("start"),
                "end": segment.get("end"),
                "text": segment.get("text", ""),
            }
            for segment in result.get("segments", [])
            if isinstance(segment, dict)
        ],
    }

    Path(args.output_json).write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
