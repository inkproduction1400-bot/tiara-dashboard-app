#!/usr/bin/env python3
import os
import sys
import subprocess
from pathlib import Path

def run(cmd):
  p = subprocess.run(cmd, text=True, capture_output=True)
  if p.returncode != 0:
    sys.stderr.write(p.stdout)
    sys.stderr.write(p.stderr)
    sys.exit(p.returncode)
  return p

def main():
  patch_text = sys.stdin.read()
  if not patch_text.strip():
    print("No patch text on stdin. Paste diff and end with Ctrl-D.", file=sys.stderr)
    sys.exit(1)

  patch_path = Path("/tmp/tiara_patch.patch")
  patch_path.write_text(patch_text, encoding="utf-8")

  # dry-run check
  run(["git", "apply", "--check", str(patch_path)])
  # apply
  run(["git", "apply", str(patch_path)])

  print(f"Applied patch: {patch_path}")

if __name__ == "__main__":
  main()
