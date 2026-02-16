from __future__ import annotations

import io
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import hcl2

from app.schemas import ResourceRecord


def _load_hcl(content: str) -> dict[str, Any]:
    return hcl2.load(io.StringIO(content))


def _extract_resources(parsed: dict[str, Any], file_path: str) -> list[ResourceRecord]:
    records: list[ResourceRecord] = []

    for resource_group in parsed.get("resource", []):
        for resource_type, named_resources in resource_group.items():
            for resource_name, config in named_resources.items():
                records.append(
                    ResourceRecord(
                        file=file_path,
                        resource_type=resource_type,
                        resource_name=resource_name,
                        config=config,
                    )
                )

    return records


def parse_tf_content(content: str, virtual_file_path: str = "uploaded.tf") -> list[ResourceRecord]:
    parsed = _load_hcl(content)
    return _extract_resources(parsed, virtual_file_path)


def parse_tf_file(path: Path) -> list[ResourceRecord]:
    content = path.read_text(encoding="utf-8")
    return parse_tf_content(content, str(path))


def parse_tf_directory(directory: Path) -> list[ResourceRecord]:
    records: list[ResourceRecord] = []
    for tf_file in directory.rglob("*.tf"):
        records.extend(parse_tf_file(tf_file))
    return records


def parse_tf_from_zip(data: bytes) -> list[ResourceRecord]:
    records: list[ResourceRecord] = []

    with ZipFile(io.BytesIO(data), "r") as archive:
        for name in archive.namelist():
            if not name.endswith(".tf"):
                continue

            content = archive.read(name).decode("utf-8")
            records.extend(parse_tf_content(content, name))

    return records
