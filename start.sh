#!/bin/bash
# Start backend on port 3000 in background
NODE_ENV=development node src/server.js &
BACKEND_PID=$!

# Start frontend on port 5000
cd dashboard && HOST=0.0.0.0 PORT=5000 BROWSER=none DANGEROUSLY_DISABLE_HOST_CHECK=true npm start

# Cleanup on exit
kill $BACKEND_PID 2>/dev/null
