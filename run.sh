#!/bin/bash

# Get the directory where this script is located
# cd "$(dirname "$0")"

# Change to the project directory (using current directory instead of hardcoded path)
cd "$(dirname "$0")"

# npm run build
# npm run start
node dist/index.js 