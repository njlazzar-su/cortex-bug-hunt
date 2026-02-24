# [BUG] [v0.1.0] BlameView crashes when gitBlame() returns undefined (src/components/git/BlameView.tsx:50)

## Project
ide

## Description
BlameView component crashes when `gitBlame()` or `gitBlameWithHeatmap()` returns `undefined`. The code attempts to call `.map()` on a potentially undefined value without null/undefined checking.

## Error Message
```
Failed to fetch blame: TypeError: Cannot read properties of undefined (reading 'map')
    at fetchBlame (.../cortex-ide/src/components/git/BlameView.tsx:50:44)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
```

## Evidence

### Terminal Output
```
stderr | src/components/git/__tests__/BlameView.test.tsx > BlameView > Rendering > should render without crashing
Failed to fetch blame: TypeError: Cannot read properties of undefined (reading 'map')
    at fetchBlame (.../cortex-ide/src/components/git/BlameView.tsx:50:44)
```

### Reproduction (bug-blame-view.js)
```javascript
const entries = undefined; // gitBlame() returns undefined

// Buggy code line 50
const lines = entries.map((entry) => ({ // ❌ CRASH
  lineNumber: entry.lineStart,
  content: entry.content,
}));
```

**Result**: `TypeError: Cannot read properties of undefined (reading 'map')`

### Screenshot
![BlameView Bug Screenshot](./bug-blame-screenshot.svg)

## Steps to Reproduce

### 1. Run vitest with git blame tests
```bash
npm run test -- src/components/git/__tests__/BlameView.test.tsx
```

### 2. Observe stderr output
TypeError appears even though tests pass (error is caught, logged, but component fails silently)

## System Information

Model: Cortex Runner v0.1.0
Node.js: v24.13.1
Vitest: v4.0.18

## Root Cause

**File**: `src/components/git/BlameView.tsx`
**Line**: 50

### Buggy Code
```typescript
const entries: BlameHeatmapEntry[] = await gitBlameWithHeatmap(projectPath, file);
const lines: BlameLine[] = entries.map((entry) => ({ // Line 50 ❌
  lineNumber: entry.lineStart,
  content: entry.content,
  // ...
}));
```

`gitBlame()` API can return `undefined` when:
- Git is not initialized in the project
- File doesn't exist
- Tauri plugin not available

The code assumes `entries` is always an array.

## Expected Behavior
When `gitBlame()` returns `undefined`, the component should handle it gracefully (show empty state or error message) without crashing.

## Actual Behavior
Component crashes when trying to map over undefined.

## Fix Suggestion

### Option 1: Optional chaining
```typescript
const lines: BlameLine[] = entries?.map((entry) => ({ // Line 50 ✓
  lineNumber: entry.lineStart,
  content: entry.content,
  // ...
})) ?? [];
```

### Option 2: Guard clause
```typescript
if (!entries) {
  setBlameData([]);
  return;
}
const lines: BlameLine[] = entries.map((entry) => ({ // Line 50 ✓
  // ...
}));
```

### Option 3 (Best): Both paths
Both `gitBlameWithHeatmap()` and `gitBlame()` calls need the same fix.

## Related Files
- `src/components/git/BlameView.tsx` (line 50 and line ~66)
- `src/components/git/__tests__/BlameView.test.tsx`
