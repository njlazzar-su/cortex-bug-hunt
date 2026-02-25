# [BUG] [alpha] Regex callback replacement bypasses $1, $&, and other JS substitution tokens

## Project
ide

## Description
Both `SearchSidebar.tsx` and `BufferSearch.tsx` use `.replace(regex, callback)` which returns the **literal replacement string**, bypassing JavaScript's native template substitution tokens (`$1`, `$&`, `$``, `$'`, etc.). This makes regex backreferences and substitution syntax unusable.

When users attempt to use capture group references or substitution tokens:
- **Expected**: `$1` expands to the first capture group, `$&` expands to the full match
- **Actual**: Returns the literal string `$1` or `$&` without expansion

## Screenshot
![Replacement Bug](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-003-callback-replacement.png)

## Evidence

### SearchSidebar.tsx (Line 811)
```typescript
const replacement = replaceText();
const newContent = content.replace(regex, (match) => {
  return preserveCase() ? applyPreserveCase(match, replacement) : replacement;
});
```

### BufferSearch.tsx (Line 501)
```typescript
const replacement = replaceText();
const newContent = file.content.replace(regex, (match) => {
  return preserveCase() ? applyPreserveCase(match, replacement) : replacement;
});
```

### The Problem

When using `.replace(regex, callback)`, the `callback` function receives the match and returns a **literal string**. JavaScript's substitution tokens are only expanded when using the **string form** of `.replace()`:

**Working (string form):**
```typescript
content.replace(regex, '$1$2')  // $1 and $2 expand to capture groups
```

**Buggy (callback form — current code):**
```typescript
content.replace(regex, (match) => {
  return '$1$2';  // Returns literal "$1$2", no expansion!
});
```

The callback pattern is normally used for **dynamic replacement logic**, but the current code only uses it for conditional `preserveCase()` logic. This unnecessarily breaks substitution tokens.

## Steps to Reproduce

### Scenario 1: Using capture group backreferences
1. Open a file with content `hello world`
2. Open SearchSidebar (Ctrl+Shift+F) or BufferSearch (Ctrl+F)
3. **Find regex**: `(hello) (world)`
4. **Replace with**: `$2 $1` (expected to swap: "world hello")
5. **Actual result**: File contains literal `$2 $1`
6. **Expected result**: File contains `world hello`

### Scenario 2: Using $& for full match
1. Open a file with content `test`
2. Search for `test`
3. Replace with `[$&]` (expected to wrap in brackets: `[test]`)
4. **Actual result**: File contains `[$&]`
5. **Expected result**: File contains `[test]`

### Scenario 3: Using $` and $' for context
1. Open a file with content `start middle end`
2. Search for `middle`
3. Replace with `<$`**middle**`$'>` (expected to show surrounding context)
4. **Actual result**: Literal `$` and `$'` in output
5. **Expected result**: `<start**middle**end>`

## System Information
- Cortex IDE: v0.0.7
- OS: All platforms
- Component: Search and Buffer Search (find/replace functionality)

## Root Cause
**Files:**
- `src/components/SearchSidebar.tsx` — Line 811
- `src/components/BufferSearch.tsx` — Line 501

The `.replace(regex, callback)` pattern blocks JavaScript's native substitution expansion. The callback is only used to optionally apply `preserveCase()` transformation, but it prevents users from using standard regex substitution syntax.

## Expected Behavior
Users should be able to use JavaScript's standard regex substitution tokens:
- `$1`, `$2`, `$n` — Capture groups
- `$&` — Full match
- `$`` — Text before match
- `$'` — Text after match
- `$$` — Literal dollar sign

When `preserveCase()` is `false`, replacements should expand tokens natively.

## Actual Behavior
Substitution tokens are returned as literal strings. Regex backreferences don't work at all.

## Fix Suggestion

### Option 1: Expand tokens before callback
```typescript
const replacement = replaceText();
const newContent = content.replace(regex, (match, ...groups) => {
  // Expand $1, $2, etc. with capture groups
  let expanded = replacement;
  groups.forEach((group, i) => {
    expanded = expanded.replace(new RegExp(`\\$${i + 1}`, 'g'), group || '');
  });
  expanded = expanded.replace(/\$&/g, match);  // Full match
  // Add $`, $', $$ if needed

  return preserveCase() ? applyPreserveCase(match, expanded) : expanded;
});
```

### Option 2: Match callback behavior to string replace when preserveCase is false
```typescript
const replacement = replaceText();
let newContent;

if (preserveCase()) {
  newContent = content.replace(regex, (match) => {
    return applyPreserveCase(match, replacement);
  });
} else {
  // Use string form for token expansion
  newContent = content.replace(regex, replacement);
}
```

### Option 3: Use third-party regex replace library with template support
Use a library like `replace-regex-tokens` or similar to template-aware replacement with `preserveCase()`.

## Related Files
- `src/components/SearchSidebar.tsx` (line 811)
- `src/components/BufferSearch.tsx` (line 501)
