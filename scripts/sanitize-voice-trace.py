#!/usr/bin/env python3
"""Remove ephemeral developer access code from Playwright evidence before sharing."""
import pathlib, sys, zipfile
secret=sys.stdin.buffer.read().strip()
if not secret:raise ValueError('An ephemeral code is required on stdin')
for filename in sys.argv[1:]:
 path=pathlib.Path(filename);temp=path.with_suffix('.redacted.zip')
 with zipfile.ZipFile(path) as source,zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as target:
  for entry in source.infolist():target.writestr(entry,source.read(entry.filename).replace(secret,b'[EXPIRED_LOCAL_DEVELOPMENT_CODE]'))
 temp.replace(path)
