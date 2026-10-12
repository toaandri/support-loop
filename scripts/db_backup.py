"""Portable binary-safe PostgreSQL backup (including Windows PowerShell 5)."""
from datetime import datetime, timezone
import argparse
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit, unquote

root = Path(__file__).resolve().parents[1]
settings = {}
if (root / '.env').exists():
    for line in (root / '.env').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            settings[key.strip()] = value.strip().strip('"').strip("'")
url = os.environ.get('DATABASE_URL') or settings.get('DATABASE_URL', '')
parser = argparse.ArgumentParser(description='Back up a database hosted by the project PostgreSQL container.')
parser.add_argument('--database', default=unquote(urlsplit(url).path.lstrip('/')) or 'supportloop')
parser.add_argument('--project', help='Optional Docker Compose project name.')
args = parser.parse_args()
if not args.database or args.database.startswith('-'):
    raise SystemExit('Invalid database name.')
folder = root / 'backups'
folder.mkdir(exist_ok=True)
filename = folder / f"supportloop-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.dump"
temporary = filename.with_suffix('.dump.part')
with temporary.open('wb') as output:
    command = ['docker', 'compose'] + (['-p', args.project] if args.project else [])
    result = subprocess.run(command + ['exec', '-T', 'postgres', 'pg_dump', '-U', 'supportloop', '-d', args.database, '-Fc'],
                            cwd=root, stdout=output, stderr=subprocess.PIPE)
if result.returncode:
    temporary.unlink(missing_ok=True)
    raise SystemExit(result.stderr.decode('utf-8', errors='replace'))
temporary.replace(filename)
print(filename)
