#!/bin/bash
# Kill ALL node processes
pkill -9 node 2>/dev/null
sleep 2

# Check port is free
fuser -k 5000/tcp 2>/dev/null
sleep 1

# Start fresh
cd /home/ajv/Documents/projectX
echo "[start.sh] Starting server..."
node backend.js
