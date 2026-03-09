#!/bin/bash
cd /home/kavia/workspace/code-generation/canvas-draw-pro-330370-330384/drawing_tool_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

