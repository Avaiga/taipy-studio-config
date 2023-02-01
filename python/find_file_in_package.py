from importlib import util, import_module
from pathlib import Path
import sys
import inspect
import os
import json

if len(sys.argv) < 3:
  print("Packages should be passed as arguments after the name of the searched file.", file=sys.stderr)
  exit(1)
else:
  errors = 0
  file_name = sys.argv[1]
  result = dict()
  for package in sys.argv[2:]:
    parts = package.split(".")
    error = False
    for idx in range(len(parts)):
      if not util.find_spec(".".join(parts[0: idx+1])):
        error = True
        break
    if error:
      print(f"Package {package} not found.", file=sys.stderr)
      errors += 1
    else:
      module = import_module(package)
      found = False
      for root, dirs, files in os.walk(Path(inspect.getfile(module)).parent.resolve()):
        root_path = Path(root)
        if file_name in files:
          result[package] = str((root_path / file_name).resolve())
          found = True
      if not found:
        print(f"File {file_name} not found in Package {package}.", file=sys.stderr)
        errors += 1
  if len(result):
    json.dump(result, sys.stdout)
  elif errors:
    exit(2)
