"""Recipient CSV parsing.

Comma or tab delimited, with or without a header row. Column names are matched
loosely (email/e-mail/address, name/full name, org/company, role/title) so the
usual exports work without the user renaming anything first.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalise(value: str) -> str:
    """Lowercase, and reduce punctuation to spaces, so "E-mail" == "e mail"."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z]+", " ", (value or "").lower())).strip()


# Written in readable form, then normalised so header matching and alias
# lookups agree on spelling ("E-mail", "e_mail" and "E Mail" all match).
ALIASES = {
    field: {_normalise(name) for name in names}
    for field, names in {
        "email": {"email", "e-mail", "email address", "address", "mail", "work email"},
        "name": {"name", "full name", "fullname", "contact", "contact name", "person"},
        "org": {"org", "organisation", "organization", "company", "employer", "account"},
        "role": {"role", "title", "job title", "position", "job"},
    }.items()
}


@dataclass
class ImportResult:
    rows: list[dict]
    skipped: list[str]
    detected_headers: bool
    fields_seen: list[str]


def _map_headers(header_row: list[str]) -> dict[int, str]:
    mapping: dict[int, str] = {}
    for index, raw in enumerate(header_row):
        cleaned = _normalise(raw)
        for field, names in ALIASES.items():
            if cleaned in names and field not in mapping.values():
                mapping[index] = field
                break
    return mapping


def _looks_like_header(row: list[str]) -> bool:
    """A header row names columns; a data row contains an address."""
    if any(EMAIL_RE.match((cell or "").strip()) for cell in row):
        return False
    return bool(_map_headers(row))


def parse_recipients(text: str) -> ImportResult:
    """Parses CSV/TSV text into recipient dicts."""
    text = (text or "").lstrip("﻿")
    if not text.strip():
        return ImportResult(rows=[], skipped=[], detected_headers=False, fields_seen=[])

    sample = "\n".join(text.splitlines()[:5])
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = "\t" if "\t" in sample else ","

    reader = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    reader = [row for row in reader if any((cell or "").strip() for cell in row)]
    if not reader:
        return ImportResult(rows=[], skipped=[], detected_headers=False, fields_seen=[])

    has_header = _looks_like_header(reader[0])
    if has_header:
        mapping = _map_headers(reader[0])
        body = reader[1:]
    else:
        # No header: infer the email column from the data, name is the next
        # non-empty cell, and anything after that is org then role.
        mapping = {}
        first = reader[0]
        for index, cell in enumerate(first):
            if EMAIL_RE.match((cell or "").strip()):
                mapping[index] = "email"
                break
        remaining = [i for i in range(len(first)) if i not in mapping]
        for field, index in zip(("name", "org", "role"), remaining):
            mapping[index] = field
        body = reader

    rows: list[dict] = []
    skipped: list[str] = []
    seen: set[str] = set()

    for raw_row in body:
        record = {"email": "", "name": "", "org": "", "role": ""}
        for index, field in mapping.items():
            if index < len(raw_row):
                record[field] = (raw_row[index] or "").strip()

        email = record["email"].lower()
        if not EMAIL_RE.match(email):
            skipped.append(delimiter.join(raw_row)[:120])
            continue
        if email in seen:
            skipped.append(f"{email} (duplicate)")
            continue
        seen.add(email)

        record["email"] = email
        if not record["name"]:
            record["name"] = email.split("@")[0].replace(".", " ").title()
        if not record["org"]:
            record["org"] = email.split("@")[-1].split(".")[0].title()
        rows.append(record)

    return ImportResult(
        rows=rows,
        skipped=skipped,
        detected_headers=has_header,
        fields_seen=sorted(set(mapping.values())),
    )
