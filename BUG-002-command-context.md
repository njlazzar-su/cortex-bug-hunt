# [BUG] [v0.1.0] CommandContext crashes when extensionCommands is not iterable (src/context/CommandContext.tsx:103)

## Project
ide

## Description
CommandContext crashes when `evoke()` API returns a non-iterable value (null/undefined). The code attempts to iterate using `for...of` without checking if the result is iterable.

## Error Message
```
[Command] Extension commands unavailable: TypeError: extensionCommands is not iterable
    at loadExtensionCommands (.../src/context/CommandContext.tsx:103:25)
    at processTicksAndRejections (node:internal/process/task_queues:115:5)
```

## Evidence

### Terminal Output
```
stdout | src/components/__tests__/KeyboardShortcutsEditor.test.tsx > KeyboardShortcutsEditor
[Command] Extension commands unavailable: TypeError: extensionCommands is not iterable
    at loadExtensionCommands (.../src/context/CommandContext.tsx:103:25)
```

### Reproduction (bug-command-context.js)
```javascript
const extensionCommands = null; // evoke() returns non-iterable

// Buggy code line 103
for (const cmd of extensionCommands) { // ❌ CRASH
  const command: Command = {
    id: cmd.id,
    label: cmd.label,
    // ...
  };
}
```

**Result**: `TypeError: extensionCommands is not iterable`

### Screenshot
![CommandContext Bug Screenshot](./vitest-command-output.png)

## Steps to Reproduce

### 1. Run vitest with command palette tests
```bash
npm run test -- src/components/__tests__/KeyboardShortcutsEditor.test.tsx
```

### 2. Observe stdout/stderr output
TypeError appears in multiple tests even though tests pass (error is caught but component crashes)

## System Information

Model: Cortex Runner v0.1.0
Node.js: v24.13.1
Vitest: v4.0.18

## Root Cause

**File**: `src/context/CommandContext.tsx`
**Line**: 103

### Buggy Code
```typescript
const extensionCommands = await invoke("vscode_get_command_palette_items");

// Line 103: Assumes invoke() always returns iterable
for (const cmd of extensionCommands) { // ❌
  const command: Command = {
    id: cmd.id,
    label: cmd.label,
    category: cmd.category || "Extension",
    isExtension: true,
    action: async () => { /* ... */ },
  };
  registerCommand(command);
}
```

The `evoke()`/`invoke()` API can return:
- `null` or `undefined` when plugin not available
- Empty array when no commands
- Array of commands when available

The code assumes result is always iterable.

## Expected Behavior
When `invoke()` returns non-iterable, the function should handle it gracefully (log warning and exit early) without crashing.

## Actual Behavior
Function crashes when trying to iterate over non-iterable value.

## Fix Suggestion

### Add array guard before iteration
```typescript
const extensionCommands = await invoke("vscode_get_command_palette_items");

// Fix: Check if result is iterable before iteration
if (!Array.isArray(extensionCommands)) { // ✓
  console.debug('[Command] Extension commands unavailable:', extensionCommands);
  return;
}

for (const cmd of extensionCommands) { // ✓
  const command: Command = {
    id: cmd.id,
    label: cmd.label,
    category: cmd.category || "Extension",
    isExtension: true,
    action: async () => { /* ... */ },
  };
  registerCommand(command);
}
```

The debug log is already present in the catch block, but the error should be prevented at the source.

## Related Files
- `src/context/CommandContext.tsx` (line 103, `loadExtensionCommands` function)
- `src/components/__tests__/KeyboardShortcutsEditor.test.tsx`
