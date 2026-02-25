# [BUG] [alpha] vimEnabled setting in settings JSON is ignored — Vim mode uses separate localStorage state

## Project
ide

## Description
The `vimEnabled` setting in `CortexSettings` (settings JSON) is not used by editor. Vim mode is driven by `VimContext`, which reads and writes only to `localStorage["cortex-vim-enabled"]`. As a result:
1. Setting `"vimEnabled": true` in JSON settings has no effect
2. Settings UI toggle updates only localStorage, not settings JSON
3. Settings search cannot find "vim" — `vimEnabled` not in `SETTINGS_REGISTRY`
4. Two independent sources of truth exist and can diverge

## Screenshot
![Vim Setting Ignored](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-006-vim-setting-ignored.png)

## Evidence

### Settings Model — vimEnabled exists but is ignored

**SettingsContext.tsx (Line 581) — part of CortexSettings:**
```typescript
export interface CortexSettings {
  // ...
  vimEnabled: boolean;  // ← Defined in settings interface
  // ...
}
```

**SettingsContext.tsx (Line 923) — Default configured:**
```typescript
export const DEFAULT_SETTINGS: CortexSettings = {
  // ...
  vimEnabled: false,  // ← Default exists
  // ...
};
```

**SettingsContext.tsx (Lines 1497-1498) — Used by diff checking:**
```typescript
if (effectiveSettings().vimEnabled !== DEFAULT_SETTINGS.vimEnabled) {
  modified.push({
    section: "vimEnabled" as keyof CortexSettings,
    key: "vimEnabled",
    currentValue: effectiveSettings().vimEnabled,
    defaultValue: DEFAULT_SETTINGS.vimEnabled
  });
}
```

### VimContext — uses localStorage only, not vimEnabled

**VimContext.tsx (Line 126) — localStorage key defined:**
```typescript
const VIM_ENABLED_KEY = "cortex-vim-enabled";  // ← Separate from settings!
```

**VimContext.tsx (Lines 128-136) — Reads from localStorage, NOT settings:**
```typescript
export function VimProvider(props: ParentProps) {
  // Load initial enabled state from localStorage
  const storedEnabled = typeof localStorage !== "undefined"
    ? localStorage.getItem(VIM_ENABLED_KEY) === "true"  // ← localStorage only!
    : false;

  const [enabled, setEnabledState] = createSignal(storedEnabled);
  // ...
}
```

**VimContext.tsx (Lines 155-162) — Writes to localStorage, NOT settings:**
```typescript
createEffect(() => {
  const isEnabled = enabled();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(VIM_ENABLED_KEY, String(isEnabled));  // ← localStorage only!
  }
});
```

### Settings UI toggle — updates VimContext only

**SettingsDialog.tsx (Lines 1350-1352) — Toggle uses VimContext:**
```typescript
<OptionCard selected={vim.enabled()} onSelect={() => vim.setEnabled(!vim.enabled())}>
  Vim Mode
</OptionCard>
{/*   ↑ vim.setEnabled() updates localStorage, NOT settings JSON */}
```

### JSON Settings — vimEnabled in schema but no connection

**JsonSettingsEditor.tsx (Lines 561-565) — Schema includes vimEnabled:**
```typescript
vimEnabled: {
  type: "boolean",
  description: "Enable Vim mode for editor"
}
```

But `vim.setEnabled()` never calls `updateSettings("vimEnabled", value)`, so JSON is never updated.

### Settings Editor — vimEnabled not discoverable

**SettingsEditor.tsx:**
- No entry for vim in `SETTINGS_REGISTRY`
- Search "vim" returns no results
- Cannot configure via standard settings navigation

## Steps to Reproduce

### Scenario 1: JSON setting ignored
1. Open JSON Settings editor
2. Set `"vimEnabled": true`
3. Save settings
4. Reload the application
5. **Expected**: Vim mode is enabled
6. **Actual**: Vim mode stays off; `vimEnabled` in JSON is ignored

### Scenario 2: Toggle not persisted to JSON
1. Open Settings → Editor
2. Enable "Vim Mode" via toggle
3. Close settings
4. Check the settings JSON file
5. **Expected**: `"vimEnabled": true` in settings
6. **Actual**: Vim mode works (via localStorage), but settings JSON unchanged

### Scenario 3: Search not discoverable
1. Open Settings Ctrl+,
2. Search for "vim"
3. **Expected**: "Vim Mode" setting appears
4. **Actual**: No matches — vim not in searchable settings

### Scenario 4: Diverging state
1. Set `"vimEnabled": true` in JSON
2. Reload app (Vim stays off because localStorage not updated)
3. Go to Settings → Editor, enable Vim toggle (localStorage set to true)
4. Check JSON
5. **Expected**: JSON shows `"vimEnabled": true`
6. **Actual**: JSON still shows `"vimEnabled": false` from step 1 — two different states coexist

## System Information
- Cortex IDE: v2.22.0
- Platform: Windows 10 (likely affects all OSes)
- Components:
  - `src/context/SettingsContext.tsx` (Lines 581, 923, 1497-1498)
  - `src/context/VimContext.tsx` (Lines 126, 128-136, 155-162)
  - `src/components/SettingsDialog.tsx` (Lines 1350-1352)
  - `src/components/settings/JsonSettingsEditor.tsx` (Lines 561-565)
  - `src/components/settings/SettingsEditor.tsx` — Missing vim entry

## Root Cause

**Two independent sources of truth:**

| Truth Source | Storage Key | Runtime Behavior | Settings UI | JSON Editor |
|--------------|-------------|------------------|-------------|-------------|
| **VimContext** | `localStorage["cortex-vim-enabled"]` | ✅ Vim mode reads/writes here | ✅ Switch uses this | ❌ Unaware |
| **Settings JSON** | `settings.userSettings.vimEnabled` | ❌ Editor ignores this | ❌ No connection | ✅ In schema |

**Problems:**
1. `VimContext.enabled()` reads localStorage, never calls `effectiveSettings().vimEnabled`
2. `vim.setEnabled()` writes localStorage, never calls `updateSettings("vimEnabled", value)`
3. Settings toggle never syncs to JSON
4. JSON changes never sync to VimContext

## Expected Behavior
Vim state should be unified with settings system:
1. Settings JSON `vimEnabled` controls actual Vim mode
2. Settings UI toggle updates both VimContext and Settings JSON
3. Vim mode state persists to settings JSON
4. Search "vim" finds the setting

## Actual Behavior
- Settings JSON `vimEnabled` is ignored
- Vim state lives only in localStorage
- Settings UI doesn't update JSON
- Vim setting not searchable or discoverable
- JSON and localStorage can have conflicting values

## Impact

**High** for Vim users:
- JSON settings silently ignored — breaks expected behavior
- Workspace/user settings don't affect Vim mode
- Settings sync broken: JSON changes have no effect
- Discoverability gap: Can't find Vim setting via search
- Inconsistent state: JSON says off, editor says on (or vice versa)
- Support confusion: "I set vimEnabled:true but Vim is off"

## Fix Suggestion

### Step 1: Make VimContext read from effectiveSettings

**VimContext.tsx:**

```typescript
import { useSettings } from "@/context/SettingsContext";

export function VimProvider(props: ParentProps) {
  const { effectiveSettings, updateSettings } = useSettings();

  // Initial enabled state from settings, fallback to localStorage for migration
  const [enabled, setEnabledState] = createSignal(
    effectiveSettings().vimEnabled || (
      typeof localStorage !== "undefined"
        ? localStorage.getItem(VIM_ENABLED_KEY) === "true"
        : false
    )
  );

  // Sync enabled state to BOTH localStorage AND settings
  createEffect(() => {
    const isEnabled = enabled();

    // Persist to localStorage (existing behavior)
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(VIM_ENABLED_KEY, String(isEnabled));
    }

    // Sync to settings (NEW)
    updateSettings("vimEnabled", isEnabled);
  });

  // Listen for settings changes to update VimContext
  createEffect(() => {
    const settingEnabled = effectiveSettings().vimEnabled;
    // Update VimContext if settings changed from elsewhere
    if (settingEnabled !== undefined && settingEnabled !== enabled()) {
      setEnabledState(settingEnabled);
    }
  });

  // ...
}
```

### Step 2: Remove localStorage dependency (optional)

Once migration complete, remove localStorage references from `VimContext.tsx`:

```typescript
// Remove line 126:
// const VIM_ENABLED_KEY = "cortex-vim-enabled";

// Update persistence:
createEffect(() => {
  const isEnabled = enabled();
  // localStorage removed, only settings used
});

// Update initial load:
const [enabled, setEnabledState] = createSignal(
  effectiveSettings().vimEnabled
);
```

## Related Files
- `src/context/SettingsContext.tsx` — vimEnabled in CortexSettings (Lines 581, 923, 1497-1498)
- `src/context/VimContext.tsx` — localStorage-only persistence (Lines 126, 128-136, 155-162)
- `src/components/SettingsDialog.tsx` — Toggle uses VimContext only (Lines 1350-1352)
- `src/components/settings/JsonSettingsEditor.tsx` — Schema includes vimEnabled (Lines 561-565)
- `src/components/settings/SettingsEditor.tsx` — Missing vim in registry

## Additional Context

Similar to BUG-005 (screencastMode) but different root cause:
- screencastMode: GUI missing, but context connected
- vimEnabled: Context disconnected from settings system

This setting has partial implementation in both systems but they're not wired together.
