# [BUG] [alpha] Auto-updater fails on every startup — checks non-existent GitHub endpoint

**Issue:** #19950
**Project:** ide
**Status:** open
**Severity:** Medium
**Area:** Auto-update system

## Description

The Cortex IDE auto-updater fires on every application startup and immediately fails because it checks a non-existent GitHub endpoint. This results in an error logged every time the IDE starts, and the update mechanism is completely non-functional.

## Error Evidence (from logs)

From IDE startup logs:
```
ERROR tauri_plugin_updater::updater: update endpoint did not respond with a successful status code
WARN cortex_gui_lib::auto_update: Failed to check for updates on startup: Could not fetch a valid release JSON from the remote
```

This error appears within the first second of every IDE launch.

## Root Cause: Wrong GitHub Organization

Two separate files use the incorrect GitHub organization `cortex-dev/cortex` which does not exist:

### 1. AutoUpdateContext.tsx:340
```typescript
// src/context/AutoUpdateContext.tsx:340
const response = await fetch(
  `https://api.github.com/repos/cortex-dev/cortex/releases/tags/v${version}`
);
```

✅ **Should be:** `CortexLM/cortex`
❌ **Actual:** `cortex-dev/cortex` (HTTP 404)

### 2. ReleaseNotes.tsx:267
```typescript
// src/components/ReleaseNotes.tsx:267
const releaseUrl = `https://github.com/cortex-dev/cortex/releases/tag/v${version}`;
```

✅ **Should be:** `https://github.com/CortexLM/cortex/releases/tag/${version}`
❌ **Actual:** `https://github.com/cortex-dev/cortex/releases/tag/${version}` (broken link)

## Verification

```bash
# The wrong endpoint (404)
$ curl -sI https://api.github.com/repos/cortex-dev/cortex/releases | head -1
HTTP/2 404

# The correct endpoint (works)
$ curl -sI https://api.github.com/repos/CortexLM/cortex/releases | head -1
HTTP/2 200
```

## Impact

1. **Startup latency** — Update check adds ~500ms+ to every IDE launch
2. **Error spam** — Logs ERROR/WARN on every startup
3. **Non-functional updates** — Users will never see update notifications
4. **Broken links** — "View on GitHub" button opens 404 page

## Expected Behavior

The auto-updater should:
- Use the correct GitHub organization (`CortexLM/cortex`)
- Successfully check for updates
- Display update notifications when available
- Have working "View on GitHub" links

## Actual Behavior

- Checks non-existent endpoint (`cortex-dev/cortex`)
- Receives HTTP 404 errors
- Logs failures on every startup
- Update notifications never appear
- "View on GitHub" links fail

## Code Locations

- `src/context/AutoUpdateContext.tsx:340`
- `src/components/ReleaseNotes.tsx:267`

## Fix Required

Replace `cortex-dev/cortex` with `CortexLM/cortex` in both files.

---

## Evidence Summary

| Evidence Type | Status |
|--------------|--------|
| ✅ Log evidence | ERROR/WARN on startup |
| ✅ Code evidence | Wrong org in 2 files |
| ✅ API verification | 404 on wrong endpoint, 200 on correct |
| ❌ Screenshot | Not applicable (code bug) |
