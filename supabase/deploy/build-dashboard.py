"""Build the single-file Dashboard deployment from the canonical function sources."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'functions' / 'send-email'
imports, sections = [], []
for name in ['templates.js', 'receipt-logo.js', 'receipt-model.js', 'receipt-pdf.js', 'index.ts']:
    body = []
    for line in (root / name).read_text(encoding='utf-8').splitlines():
        if line.startswith('import '):
            if "from 'npm:" in line and line not in imports:
                imports.append(line)
        else:
            body.append(line.removeprefix('export '))
    sections.append('// Source: ' + name + '\n' + '\n'.join(body))
output = Path(__file__).with_name('send-email-dashboard.ts')
output.write_text(
    '// Generated from supabase/functions/send-email. Paste this entire file into the Dashboard index.ts.\n'
    '// The website and this deployment use the same receipt-model source.\n'
    + '\n'.join(imports) + '\n\n' + '\n\n'.join(sections) + '\n', encoding='utf-8')
print(output)
