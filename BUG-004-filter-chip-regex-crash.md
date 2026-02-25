# [BUG] [alpha] Settings filter chip removal crashes on regex metacharacters in filter values

## Project
ide

## Description
`handleRemoveFilter()` in `SettingsEditor.tsx:2149-2160` builds `new RegExp()` from unescaped user-derived filter values. Input containing regex metacharacters like `[`, `]`, `(`, `)`, `{`, `}`, `|`, `*`, `+`, `?`, etc. causes `SyntaxError` at runtime when removing the filter chip.

## Screenshot
![Filter Chip Crash](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-004-filter-chip-regex-crash.png)

## Evidence

### SettingsEditor.tsx (Lines 2140-2161)
```typescript
const handleRemoveFilter = (index: number) => {
  const { filters } = parsedQuery();
  const filterToRemove = filters[index];
  let query = searchQuery();

  switch (filterToRemove.type) {
    case "modified":
      query = query.replace(/@modified/g, "");
      break;
    case "extension":
      query = query.replace(new RegExp(`@ext:${filterToRemove.value}\s*`, "g"), "");  // ← CRASH
      break;
    case "language":
      query = query.replace(new RegExp(`@lang:${filterToRemove.value}\s*`, "g"), "");  // ← CRASH
      break;
    case "tag":
      query = query.replace(new RegExp(`@tag:${filterToRemove.value}\s*`, "g"), "");  // ← CRASH
      break;
    case "id":
      query = query.replace(new RegExp(`@id:${filterToRemove.value}\s*`, "g"), "");  // ← CRASH
      break;
  }

  setSearchQuery(query.trim());
};
```

### The Problem

`filterToRemove.value` contains user input from filter chips. It is **not escaped** before being injected into regex:

| User Input | Generated Regex | Result |
|-------------|-----------------|--------|
| `@id:[` | `new RegExp("@id:[\\s*", "g")` | **Crash**: Unterminated character class |
| `@ext:a(` | `new RegExp("@ext:a(\\s*", "g")` | **Crash**: Unterminated group |
| `@lang:*` | `new RegExp("@lang:*\\s*", "g")` | **Crash**: Nothing to repeat |
| `@tag:+` | `new RegExp("@tag:+\\s*", "g")` | **Crash**: Invalid repeat |
| `@id:text|other` | `new RegExp("@id:text|other\\s*", "g")` | **Correct** but wrong behavior (matches `text` or `other`) |

### Example Crash Scenarios

```javascript
// User types: @id:test[1]
// Parser recognizes: type="id", value="test[1]"
// User clicks "x" to remove chip
// Runtime: new RegExp("@id:test[1]\\s*", "g")
// Error: SyntaxError: Invalid regular expression: Unterminated character class

// User types: @ext:.ts(
// Parser recognizes: type="extension", value=".ts("
// Result: new RegExp("@ext:.ts(\\s*", "g")
// Error: SyntaxError: Invalid regular expression: Unterminated group
```

## Steps to Reproduce

### Scenario 1: Character class bracket crash
1. Open Settings in Cortex IDE
2. In search query, type: `@id:test[1]`
3. The parser creates a filter chip with `type="id"`, `value="test[1]"`
4. Click the "×" button on the filter chip to remove it
5. **Expected**: Filter chip removed cleanly
6. **Actual**: `SyntaxError` thrown — `Invalid regular expression: Unterminated character class`

### Scenario 2: Parentheses crash
1. In search query, type: `@ext:model.rs(`
2. Parser creates filter chip with `type="extension"`, `value="model.rs("`
3. Click the "×" button to remove the chip
4. **Expected**: Chip removed
5. **Actual**: `SyntaxError` thrown — `Invalid regular expression: Unterminated group`

### Scenario 3: Quantifier crash
1. In search query, type: `@tag:+important`
2. Parser creates filter chip with `type="tag"`, `value="+important"`
3. Click the "×" button to remove
4. **Expected**: Chip removed
5. **Actual**: `SyntaxError` thrown — `Invalid regular expression: Nothing to repeat`

## System Information
- Cortex IDE: alpha
- Component: `src/components/settings/SettingsEditor.tsx`
- Lines: 2149-2160
- Framework: SolidJS

## Root Cause
**File:** `src/components/settings/SettingsEditor.tsx`
**Lines:** 2149-2160

```typescript
// CODING ERROR: Unescaped user input in regex
case "extension":
  query = query.replace(new RegExp(`@ext:${filterToRemove.value}\s*`, "g"), "");
  break;
```

`filterToRemove.value` comes from user input via filter chip parsing but is passed directly to `new RegExp()` without escaping special regex characters.

## Expected Behavior
Removing any filter chip should not crash, regardless of the filter value. Special regex metacharacters in filter values should be treated as literal text, not regex syntax.

## Actual Behavior
Filter chips containing `[`, `]`, `(`, `)`, `*`, `+`, `?`, `|`, `{`, `}`, `.` in their values cause `SyntaxError` when the "×" remove button is clicked, crashing the settings UI.

## Fix Suggestion

### Option 1: Escape regex metacharacters
```typescript
const handleRemoveFilter = (index: number) => {
  const { filters } = parsedQuery();
  const filterToRemove = filters[index];
  let query = searchQuery();

  // Escape regex special characters in value
  const escapeRegex = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  switch (filterToRemove.type) {
    case "modified":
      query = query.replace(/@modified/g, "");
      break;
    case "extension":
      query = query.replace(new RegExp(`@ext:${escapeRegex(filterToRemove.value)}\\s*`, "g"), "");
      break;
    case "language":
      query = query.replace(new RegExp(`@lang:${escapeRegex(filterToRemove.value)}\\s*`, "g"), "");
      break;
    case "tag":
      query = query.replace(new RegExp(`@tag:${escapeRegex(filterToRemove.value)}\\s*`, "g"), "");
      break;
    case "id":
      query = query.replace(new RegExp(`@id:${escapeRegex(filterToRemove.value)}\\s*`, "g"), "");
      break;
  }

  setSearchQuery(query.trim());
};
```

### Option 2: Use string replace instead of regex
```typescript
const handleRemoveFilter = (index: number) => {
  const { filters } = parsedQuery();
  const filterToRemove = filters[index];
  let query = searchQuery();

  const prefix = `@${filterToRemove.type}:`;
  const searchTarget = `${prefix}${filterToRemove.value}`;

  // Use string indexOf/replaceAll instead of regex
  query = query.replaceAll(searchTarget, "");
  query = query.replaceAll(searchTarget + " ", "");
  query = query.replaceAll(searchTarget + ",", "");
  query = query.replaceAll(prefix, "");

  setSearchQuery(query.trim());
};
```

**Option 1** is preferred — maintains exact matching with regex syntax (including whitespace) while safely escaping special characters.

## Related Files
- `src/components/settings/SettingsEditor.tsx` (Lines 2140-2161)
- Related but different issue: #21431 — Mixed-case filter chip removal (case sensitivity bug, not crash bug)

## Additional Context

This is distinct from #21431 (mixed-case filter values):
- #21431: Mixed-case tokens fail to remove due to case sensitivity
- This bug: **Filter chip removal crashes** due to unescaped regex metacharacters

Users who use workflow IDs (`ID1[2]`), tags with brackets (`[urgent]`), or other special characters in filter values will experience crashes when trying to remove those chips.
