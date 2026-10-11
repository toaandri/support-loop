"""Portable binary-safe PostgreSQL backup (including Windows PowerShell 5)."""
from datetime import datetime, timezone
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
folder = root / 'backups'
folder.mkdir(exist_ok=True)
filename = folder / f"supportloop-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.dump"
temporary = filename.with_suffix('.dump.part')
with temporary.open('wb') as output:
    result = subprocess.run(['docker', 'compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'supportloop', '-d', 'supportloop', '-Fc'],
                            cwd=root, stdout=output, stderr=subprocess.PIPE)
if result.returncode:
    temporary.unlink(missing_ok=True)
    raise SystemExit(result.stderr.decode('utf-8', errors='replace'))
temporary.replace(filename)
print(filename)
