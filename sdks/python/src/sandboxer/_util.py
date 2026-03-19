from __future__ import annotations


def normalize_path(p: str) -> str:
    return p.strip()


def first_non_empty(*vals: str | None) -> str:
    for v in vals:
        if v:
            return v
    return ""


def shell_quote(p: str) -> str:
    return "'" + p.replace("'", "'\"'\"'") + "'"
