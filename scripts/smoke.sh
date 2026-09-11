#!/usr/bin/env sh
# Headless runtime check. Needs the dev server on :5173 and google-chrome-stable.
# Usage: scripts/smoke.sh [hops|train|occupied|night|skies|battle]
google-chrome-stable --headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --remote-debugging-port=9333 --window-size=1280,800 about:blank >/dev/null 2>&1 &
CHROME=$!
sleep 2
node "$(dirname "$0")/smoke.mjs" "${1:-hops}"
STATUS=$?
kill $CHROME 2>/dev/null
exit $STATUS
