from pathlib import Path
import re
root = Path(__file__).resolve().parent.parent
changed_files = []

for path in sorted(root.rglob('*.html')):
    if path.parts and path.parts[0] == 'solutions':
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    if '<a href="/solutions">Solutions</a>' in text:
        continue

    lines = text.splitlines(True)
    new_lines = []
    inserted = False
    for line in lines:
        new_lines.append(line)
        if line.strip() == '<li><a href="/news">News</a></li>':
            indent = re.match(r'^(\s*)', line).group(1)
            new_lines.append(f"{indent}<li><a href=\"/solutions\">Solutions</a></li>\n")
            inserted = True
    if inserted:
        path.write_text(''.join(new_lines), encoding='utf-8')
        changed_files.append(str(path))

print(f"Updated {len(changed_files)} files")
for f in changed_files:
    print(f)
