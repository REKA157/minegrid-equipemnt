from pathlib import Path
import sys

REQUIRED = [
    "Résumé",
    "Fichiers modifiés",
    "Tests",
    "Risques",
]

def main():
    # Simple validation helper. It can be adapted to scan PR bodies through GitHub API.
    candidates = [
        Path("AGENTS.md"),
        Path(".github/pull_request_template.md"),
    ]
    missing_global = []
    for path in candidates:
        if not path.exists():
            missing_global.append(str(path))
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        missing = [item for item in REQUIRED if item.lower() not in text.lower()]
        if missing:
            print(f"[WARN] {path}: sections manquantes possibles: {missing}")
        else:
            print(f"[OK] {path}: sections principales présentes")
    if missing_global:
        print(f"[WARN] Fichiers non trouvés: {missing_global}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
