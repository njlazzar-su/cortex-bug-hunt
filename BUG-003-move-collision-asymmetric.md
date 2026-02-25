# [BUG] [v0.0.7] moveWithUndo lacks collision detection while copyWithUndo/duplicateWithUndo auto-rename

## Affected Component
File Operations Context (`src/context/FileOperationsContext.tsx`)

## Severity
Medium — Moves to existing paths silently fail or overwrite (confusing UX), while copy/duplicate handle collisions correctly

## Description
The `moveWithUndo` function does NOT check for path collisions before moving, but `copyWithUndo` and `duplicateWithUndo` both call `generateUniquePath` for collision detection and auto-renaming. This inconsistent behavior creates a silent failure mode for moves:

- Copy a file to an existing destination → Auto-renames to `file (1).txt` (correct)
- Duplicate a file → Auto-renames with ` copy` suffix (correct)
- Move a file to an existing destination → Silent failure or overwrite (incorrect)

## Files
- `src/context/FileOperationsContext.tsx` — Lines 336-345 (`moveWithUndo`)
- `src/context/FileOperationsContext.tsx` — Lines 371-389 (`copyWithUndo`)
- `src/context/FileOperationsContext.tsx` — Lines 391-415 (`duplicateWithUndo`)
- `src/utils/fileUtils.ts` — Lines 77-121 (`generateUniquePath`)

## Code Evidence

### Asymmetric Implementation

`moveWithUndo` (no collision handling):
```typescript
const moveWithUndo = async (sourcePath: string, destPath: string) => {
  recordOperation({
    type: "move",
    data: {
      originalPath: sourcePath,
      newPath: destPath,  // <--- No uniqueness check
    },
  });

  await fsMove(sourcePath, destPath);  // <--- Fails if destPath exists
};
```

`copyWithUndo` (with collision handling):
```typescript
const copyWithUndo = async (sourcePath: string, destPath: string): Promise<string> => {
  const uniquePath = await generateUniquePath(destPath);  // <--- Generates unique name

  recordOperation({
    type: "copy",
    data: {
      originalPath: sourcePath,
      newPath: uniquePath,
      isDirectory: false,
    },
  });

  await fsCopyFile(sourcePath, uniquePath);
  return uniquePath;
};
```

`duplicateWithUndo` (with collision handling):
```typescript
const duplicateWithUndo = async (sourcePath: string, isDirectory = false): Promise<string> => {
  const duplicatePath = await generateDuplicatePath(sourcePath, isDirectory);  // <--- Generates unique name

  recordOperation({
    type: "copy",
    data: {
      originalPath: sourcePath,
      newPath: duplicatePath,
      isDirectory,
    },
  });

  // ... copy operation
};
```

## Reproduction Steps

### Scenario 1: Move to existing file in File Explorer
1. Open the cortex-ide project
2. In File Explorer, navigate to a folder with at least one file (e.g., `src/context/`)
3. Right-click a file (e.g., `SnippetsContext.tsx`) → "Duplicate"
4. Result: Creates `SnippetsContext copy.tsx` (works correctly)
5. Now select the original `SnippetsContext.tsx` → Cut (Ctrl+X)
6. Paste in the same directory
7. Expected: Renames to `SnippetsContext (1).tscx` or similar
8. Actual: Silent failure or overwrite (move silently fails)

### Scenario 2: Move via drag-drop
1. Create two files in same directory: `a.txt`, `b.txt`
2. Edit `a.txt` with content "A"
3. Edit `b.txt` with content "B"
4. Drag `a.txt` onto `b.txt` (attempting to rename/overwrite via drag)
5. Expected: Either prompt for overwrite or auto-rename
6. Actual: Silent failure with no error shown

## Impact
- **Confusing UX**: Users expect consistent behavior across file operations
- **Data loss risk**: Silent overwrite potential without confirmation
- **Inconsistent API**: `copyWithUndo`, `duplicateWithUndo`, and `deleteFileWithUndo` all have safeguards, but `moveWithUndo` does not

## Environment
- Cortex IDE: v0.0.7
- OS: Linux (affects all platforms)
- Component: File Operations Context (file tree operations)

## Related
- Uses `generateUniquePath` from `src/utils/fileUtils.ts` (already implemented and used by copy/duplicate)
- Undo stack correctly records move operations, so retroactive fix preserve undo capability
