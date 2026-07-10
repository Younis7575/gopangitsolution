from pathlib import Path
root = Path(__file__).resolve().parent.parent
missing = []
for path in sorted(root.rglob('*.html')):
    if path.parts and path.parts[0] == 'solutions':
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    if '<li><a href="/news">News</a></li>' in text and '<a href="/solutions">Solutions</a>' not in text:
        missing.append(str(path))
print(len(missing))
for p in missing:
    print(p)
