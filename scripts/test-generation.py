#!/usr/bin/env python3
"""
InstantBandAI E2E generation test.
Fires a Replicate prediction and polls until complete.
"""
import sys, time, json, urllib.request, urllib.error

import os
TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")
if not TOKEN:
    print("❌ Set REPLICATE_API_TOKEN env var first.")
    sys.exit(1)
MODEL = "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb"
TEST_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
HEADERS = {"Authorization": f"Token {TOKEN}", "Content-Type": "application/json"}

def api(method, path, body=None):
    url = f"https://api.replicate.com/v1{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

print("🎸 InstantBandAI Generation Test")
print("=" * 40)
print(f"Model: {MODEL[:16]}...")
print(f"Input: {TEST_URL}")
print()

# Start prediction
print("▶ Starting prediction...")
pred = api("POST", "/predictions", {
    "version": MODEL,
    "input": {
        "music_input": TEST_URL,
        "prompt": "worship band full arrangement with drums bass guitar and keys",
        "duration": 10,
    }
})

if pred.get("status") == 402 or "insufficient" in str(pred.get("detail", "")).lower():
    print("❌ Insufficient Replicate credits.")
    print("   Add credits at: https://replicate.com/account/billing#billing")
    sys.exit(1)

pred_id = pred.get("id")
if not pred_id:
    print("❌ Failed to start:", pred)
    sys.exit(1)

print(f"✅ Prediction started: {pred_id}")
print(f"   Status: {pred.get('status')}")
print()

# Poll until done
print("⏳ Polling for results (may take 1-3 min)...")
start = time.time()
while True:
    elapsed = int(time.time() - start)
    result = api("GET", f"/predictions/{pred_id}")
    status = result.get("status")
    print(f"   [{elapsed:3d}s] {status}", end="\r", flush=True)

    if status == "succeeded":
        print(f"\n✅ Done in {elapsed}s!")
        outputs = result.get("output", [])
        if isinstance(outputs, str):
            outputs = [outputs]
        print(f"\n🎵 Outputs ({len(outputs)} stems):")
        instruments = ["mix", "drums", "bass", "guitar", "keys"]
        for i, url in enumerate(outputs):
            name = instruments[i] if i < len(instruments) else f"stem-{i}"
            print(f"   {name}: {url}")
        print("\n🎉 E2E test PASSED — generation pipeline is live!")
        break
    elif status in ("failed", "canceled"):
        print(f"\n❌ Prediction {status}:")
        print(json.dumps(result.get("error") or result.get("logs"), indent=2))
        sys.exit(1)
    elif elapsed > 300:
        print(f"\n⚠️  Timeout after 5 min. Check manually:")
        print(f"   https://replicate.com/p/{pred_id}")
        sys.exit(1)

    time.sleep(5)
