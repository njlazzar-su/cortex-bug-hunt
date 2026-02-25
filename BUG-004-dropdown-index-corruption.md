# [BUG] [alpha] Dropdown keyboard navigation index corruption due to mutable variable outside reactive scope

## Project
ide

## Description
`Dropdown.tsx` uses a mutable variable `selectableIdx` outside the reactive render scope to track keyboard navigation indices. This variable is declared inside the component function but outside SolidJS's reactive system. When the dropdown re-renders due to state changes (e.g., keyboard navigation changing `focusedIndex`), `selectableIdx` is reset to `-1` but item `currentIdx` values captured in `<For>` closures still reference the old mutable state. This causes the focused element to drift and keyboard navigation to target wrong items.

In SolidJS, reactive signals drive rendering. When `focusedIndex` changes (via keyboard navigation), the component re-renders. Since `selectableIdx` is not a reactive signal but a plain mutable variable, it resets to `-1` on each render. However, `currentIdx = selectableIdx` captures the *value at that moment*, and if the sequence of renders creates a mismatch between the focused index and the index captured during initial rendering, navigation will highlight/select the wrong menu item.

## Screenshot
![Dropdown Index Bug](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-004-dropdown-index-corruption.png)

## Evidence

### Dropdown.tsx (Lines 158-176)
```typescript
let selectableIdx = -1;  // ← Mutable variable OUTSIDE reactive scope!

// ... inside component return ...

<For each={local.items}>
  {(item) => {
    if (item.separator) {
      return <div style={separatorStyle} role="separator" />;
    }
    selectableIdx++;  // ← Increments mutable variable
    const currentIdx = selectableIdx;  // ← Captures value in closure
    return (
      <div
        role="menuitem"
        aria-disabled={item.disabled}
        style={itemStyle(item, currentIdx)}  // Uses captured currentIdx
        onClick={() => handleItemClick(item)}
        onMouseEnter={() => !item.disabled && setFocusedIndex(currentIdx)}  // Sets focusedIndex
      >
        {/* ... item content ... */}
      </div>
    );
  }}
</For>
```

### The Problem

**How keyboard navigation works:**
1. User presses ↓ (down arrow)
2. `handleKeyDown` calls `setFocusedIndex(prev => prev + 1)`
3. This triggers a SolidJS re-render
4. Component re-runs, `selectableIdx = -1` (resets!)
5. `<For>` re-iterates, incrementing `selectableIdx`
6. Items with `currentIdx === focusedIndex` get highlighted

**The corruption scenario:**

Due to the mutable variable being outside reactive scope, there's a race condition:

| Time | State | `selectableIdx` (mutable) | `focusedIndex` (signal) | Highlighted item |
|------|-------|--------------------------|------------------------|------------------|
| T1 | Initial render | 0, 1, 2, 3 (captured in closures) | -1 | None |
| T2 | Press ↓ twice | -1 (reset on re-render) → 0, 1, 2, 3 (recalculated) | 1 | Item at index 1 ✓ |
| T3 | Press ↓ once more | -1 → 0, 1, 2, 3 (re-render) | 2 | Item at index 2 ✓ |
| T4 | Press ↑ quickly (before T3 re-render completes) | -1 (reset mid-cascade) + increment | 1 | **WRONG item** (closure mismatch) |

Or in another scenario:
- If `local.items` array changes dynamically during navigation
- If separators are present and the count doesn't match
- If the component state triggers multiple re-renders in quick succession

The `currentIdx` captured in each item's closure refers to the mutable `selectableIdx` at the time of that specific render cycle. When focusedIndex changes and triggers re-renders, the mapping between item positions and their `currentIdx` can become inconsistent.

## Steps to Reproduce

### Scenario 1: Fast keyboard navigation
1. Open a dropdown with 5+ items (e.g., File Explorer context menu)
2. Press ↓ (down arrow) rapidly multiple times
3. Press ↑ (up arrow) to navigate back
4. Observe: the highlighted item shifts or doesn't match expected position
5. Press Enter to select
6. **Actual**: Wrong item is selected
7. **Expected**: Focused item is selected

### Scenario 2: Dropdown with separators
1. Open a dropdown with items and separators (e.g., Edit menu with multiple separator lines)
2. Navigate with keyboard through menu
3. Observe: highlighting skips positions or jumps incorrectly
4. The separator check `if (item.separator)` doesn't increment `selectableIdx`, creating a gap

### Scenario 3: Items array changes after open
1. Open dropdown with items A, B, C, D, E
2. While open, a signal change causes `local.items` to update (e.g., dynamic menu items)
3. Navigate with keyboard
4. **Actual**: Keyboard selection operates on old `currentIdx` values that no longer map to correct items
5. **Expected**: Keyboard navigation always matches currently visible items

## System Information
- Cortex IDE: v0.0.7
- OS: All platforms
- Component: `src/components/ui/Dropdown.tsx`
- Framework: SolidJS (uses `<For>` and reactive signals)

## Root Cause
**File:** `src/components/ui/Dropdown.tsx`
**Line:** 158

```typescript
let selectableIdx = -1;  // ← PROBLEM: Mutable variable outside reactive scope
```

In SolidJS, the component function runs on each reactive change. `let` variables reset to their initial value on each render. However, `<For>` closures capture `currentIdx = selectableIdx` by value, so if:
- The component re-renders multiple times rapidly
- State changes trigger cascading renders
- The items array changes dynamically

...the `currentIdx` in item closures can become desynchronized from the actual item positions.

The correct approach is to use a **derived signal** or **map indices within the loop** using index parameter from `<For>`.

## Expected Behavior
Keyboard navigation should always target the correct menu item:
- Arrow keys move focus through visible items sequentially
- Pressing Enter activates the focused item
- Separators don't count as selectable items (but don't break index counting)

## Actual Behavior
Keyboard navigation highlights and activates wrong items due to index corruption. Focus drifts and eventually points to non-existent or incorrect items.

## Fix Suggestion

### Option 1: Use `<For>` index parameter (SolidJS native)
```typescript
<For each={local.items} fallback={<div></div>}>
  {(item, index) => {
    if (item.separator) {
      return <div style={separatorStyle} role="separator" />;
    }
    return (
      <div
        role="menuitem"
        style={itemStyle(item, index())}  // Use SolidJS index signal
        onClick={() => handleItemClick(item)}
        onMouseEnter={() => !item.disabled && setFocusedIndex(index())}
      >
        {/* ... item content ... */}
      </div>
    );
  }}
</For>
```

### Option 2: Compute indices reactively
```typescript
const selectableItems = createMemo(() => {
  let idx = 0;
  return local.items.map((item) => {
    if (item.separator) {
      return { item, idx: -1 };  // Separators have no index
    }
    return { item, idx: idx++ };
  });
});

// Later:
<For each={selectableItems()}>
  {({ item, idx }) => {
    if (idx === -1) {
      return <div style={separatorStyle} role="separator" />;
    }
    return (
      <div
        role="menuitem"
        style={itemStyle(item, idx)}
        onClick={() => handleItemClick(item)}
        onMouseEnter={() => !item.disabled && setFocusedIndex(idx)}
      >
        {/* ... */}
      </div>
    );
  }}
</For>
```

### Option 3: Reset index reactive to open state
```typescript
const selectableIdx = createMemo(() => {
  return open() ? computeIndices(local.items) : -1;
});
```

**Option 1** is preferred — it uses SolidJS's built-in `<For>` index parameter which correctly handles reactivity and doesn't require manual index tracking.

## Related Files
- `src/components/ui/Dropdown.tsx` (lines 158-176)
