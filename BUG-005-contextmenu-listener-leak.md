# [BUG] [alpha] EditorContextMenu event listener leak due to setTimeout/onCleanup race condition

## Project
ide

## Description
The editor context menu registers global `click` and `keydown` event listeners inside a `setTimeout(..., 0)` callback, but the cleanup logic in `onCleanup` runs synchronously. When the menu is opened and closed rapidly, `onCleanup` executes before the deferred `setTimeout` callback fires. The `removeEventListener` calls then target listeners that haven't been added yet, and the subsequent `setTimeout` callback registers orphaned event listeners that are never removed.

This is the same pattern as QuickFix (#21334) but affects the EditorContextMenu component instead.

## Screenshot
![Context Menu Leak](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-005-contextmenu-listener-leak.png)

## Evidence

### EditorContextMenu.tsx (Lines 230-239)
```typescript
// Section inside createEffect or onMount:
handleKeyDown = (e: KeyboardEvent) => {
  // ... keyboard navigation logic ...
};

// Delay attaching listeners to avoid immediate close
setTimeout(() => {
  document.addEventListener("click", handleClickOutside);  // Deferred
  document.addEventListener("keydown", handleKeyDown);     // Deferred
}, 0);

onCleanup(() => {
  document.removeEventListener("click", handleClickOutside);  // Runs BEFORE setTimeout
  document.removeEventListener("keydown", handleKeyDown);     // Runs BEFORE setTimeout
});
```

### The Race Condition

| Sequence | Action | State |
|----------|--------|-------|
| 1 | User right-clicks in editor → context menu opens | `createEffect` runs |
| 2 | `setTimeout(..., 0)` scheduled | Timer pending |
| 3 | User immediately clicks elsewhere | `onCleanup` runs synchronously |
| 4 | `removeEventListener` calls execute | Listeners don't exist yet (timer hasn't fired) |
| 5 | Component unmounts | *Cleanup done* |
| 6 | Timer fires (delay 0ms but in next event loop tick) | **Orphaned listeners added to document** |
| 7 | User clicks anywhere or presses keys | **Stale handlers fire with closed component references** |

### Why It Happens

**`setTimeout(..., 0)` doesn't run immediately:**
- It schedules execution for the **next event loop tick**
- `onCleanup` runs synchronously in the same tick
- If the menu closes in the same tick, cleanup happens first
- The timer fires later in a **different tick** after component is gone

**Result:** 2 event listeners (`click` and `keydown`) leak permanently per rapid open/close cycle.

## Steps to Reproduce

### Scenario 1: Rapid open/close
1. Open a file in the editor
2. Right-click multiple times rapidly (5+ times) in the text area
3. After each right-click, press Escape or click away before menu fully renders
4. Try to navigate the document or click anywhere
5. **Actual:** Unexpected closing of windows, keyboard shortcuts intercepted, console errors
6. **Expected:** Normal document navigation without ghost handlers

### Scenario 2: Accumulated leaks
1. Open context menu 10 times rapidly
2. Each cycle leaks 2 listeners (click + keydown)
3. Total leaked: 20 event listeners on `document`
4. Click anywhere in the document
5. **Actual:** All 20 stale `handleClickOutside`handlers fire
6. **Expected:** Only one handler fires (if menu was open)

## System Information
- Cortex IDE: v0.0.7
- OS: All platforms (Linux, macOS, Windows)
- Component: `src/components/editor/EditorContextMenu.tsx`
- Framework: SolidJS (createEffect + onCleanup pattern)

## Root Cause
**File:** `src/components/editor/EditorContextMenu.tsx`
**Lines:** 230-239

```typescript
setTimeout(() => {
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("keydown", handleKeyDown);
}, 0);

onCleanup(() => {
  document.removeEventListener("click", handleClickOutside);
  document.removeEventListener("keydown", handleKeyDown);
  // PROBLEM: No clearTimeout(timer) before cleanup!
});
```

The timer ID is **not stored**, so cleanup cannot cancel the pending `setTimeout`. When the timer fires after cleanup, it registers zombie listeners.

## Expected Behavior
Opening and closing context menus rapidly should not leak event listeners. All listeners should be removed when the menu closes, even if the menu closed before listeners were fully attached.

## Actual Behavior
Rapid open/close cycles accumulate orphaned `click` and `keydown` event listeners on `document`. These stale handlers:
- Reference closed component state (can cause "Cannot read property of undefined" errors)
- Intercept keyboard shortcuts intended for other components
- Trigger context menu close actions on unrelated clicks

## Fix Suggestion

### Option 1: Store timer ID and cancel during cleanup
```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  // ... existing logic ...
};

// Store timer ID
const listenerTimer = setTimeout(() => {
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("keydown", handleKeyDown);
}, 0);

onCleanup(() => {
  // Cancel pending timer before removing listeners
  clearTimeout(listenerTimer);
  document.removeEventListener("click", handleClickOutside);
  document.removeEventListener("keydown", handleKeyDown);
});
```

### Option 2: Remove setTimeout entirely (use immediate registration)
```typescript
// If the "immediate close" issue can be solved differently:
onMount(() => {
  // Attach immediately without setTimeout
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("keydown", handleKeyDown);

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });
});
```

### Option 3: Track listener state and only remove if added
```typescript
let listenersAdded = false;

const addListeners = () => {
  if (!listenersAdded) {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    listenersAdded = true;
  }
};

const removeListeners = () => {
  if (listenersAdded) {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
    listenersAdded = false;
  }
};

setTimeout(() => addListeners(), 0);
onCleanup(() => removeListeners());
```

**Option 1** is preferred — it maintains the existing behavior (deferred registration) while properly cleaning up the timer.

## Related Files
- `src/components/editor/EditorContextMenu.tsx` (lines 230-239)
- Related to #21334 (QuickFix listener leak) — **same bug pattern, different file**
- Similar issues may exist in: `TabBar.tsx`, `MinimapSettings.tsx` (same pattern)

## Additional Context

**Why setTimeout(..., 0) was used:**
Delayed registration likely prevents the context menu from closing immediately when opened (the initial click event might be treated as an "outside click").

**Impact on user experience:**
- Users who frequently use context menus (right-clicking for code actions) will accumulate leaks
- After extended use, the app becomes sluggish due to many event handlers firing on every interaction
- Keyboard shortcuts stop working correctly because stale handlers intercept keydown events

**Verification:**
Open DevTools → Event Listeners on `document` and observe duplicate `click`/`keydown` handlers after rapid right-click cycling.
