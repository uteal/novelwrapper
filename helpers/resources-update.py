#!/usr/bin/python
# -*- coding: utf-8 -*-

import os
import json

# Finds all files with allowed extensions in the specified path
# and subfolders, writing their paths to the specified file.
def list_resources(start_from, output_file, allowed_ext):
  arr = []
  for root, dirs, files in os.walk(start_from):
    for name in files:
      if name.split('.')[-1] in allowed_ext:
        arr.append(root.replace('\\', '/')[2:] + '/' + name)

  res_file = open(output_file, 'w')
  res_file.write(json.dumps(arr))
  res_file.close()

list_resources(
  start_from = '.',
  output_file = 'resources.json',
  allowed_ext = ['jpg', 'png', 'gif']
)
