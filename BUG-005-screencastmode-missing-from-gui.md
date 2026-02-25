# [BUG] [alpha] screencastMode exists in settings model but is missing from GUI Settings and JSON Settings schema

## Project
ide

## Description
`screencastMode` is fully implemented in the runtime settings model and actively used by `ScreencastMode.tsx`, but it is not exposed in the Settings GUI nor included in the JSON Settings editor/schema. Users cannot discover or configure Screencast Mode through normal settings UX, creating a mismatch between actual capabilities and exposed configuration surface.

## Screenshot
![Screencast Mode Missing](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-005-screencastmode-missing-gui.png)

## Evidence

### Runtime Settings Model — screencastMode is Implemented

**SettingsContext.tsx (Lines 486-493) — Interface definition:**
```typescript
/** Screencast Mode settings */
export interface ScreencastModeSettings {
  enabled: boolean;
  showKeys: boolean;
  showMouse: boolean;
  showCommands: boolean;
  fontSize: number;
  duration: number;
}
```

**SettingsContext.tsx (Line 579) — Included in CortexSettings:**
```typescript
export interface CortexSettings {
  security: SecuritySettings;
  // ...
  screencastMode: ScreencastModeSettings;  // ← Present in model
  // ...
}
```

**SettingsContext.tsx (Lines 883-889) — Default values defined:**
```typescript
const DEFAULT_SCREENCAST_MODE: ScreencastModeSettings = {
  enabled: false,
  showKeys: true,
  showMouse: true,
  showCommands: true,
  fontSize: 24,
  duration: 2000,
};
```

**SettingsContext.tsx (Line 921) — Included in default settings:**
```typescript
export const DEFAULT_SETTINGS: CortexSettings = {
  // ...
  screencastMode: DEFAULT_SCREENCAST_MODE,  // ← Default exists
  // ...
};
```

**SettingsContext.tsx (Lines 1982-1991) — Complete context API:**
```typescript
export function useScreencastModeSettings() {
  return {
    settings: () => effectiveSettings().screencastMode ?? DEFAULT_SCREENCAST_MODE,
    update: async (changes: Partial<ScreencastModeSettings>) => await updateSettings("screencastMode", changes),
    reset: () => resetSection("screencastMode"),
    getSource: (key: keyof ScreencastModeSettings) => getSettingSource("screencastMode", key),
    hasOverride: (key: keyof ScreencastModeSettings) => hasWorkspaceOverride("screencastMode", key),
    setWorkspace: <K extends keyof ScreencastModeSettings>(key: K, value: ScreencastModeSettings[K]) => setWorkspaceSetting("screencastMode", key, value),
    resetWorkspace: (key: keyof ScreencastModeSettings) => resetWorkspaceSetting("screencastMode", key),
  };
}
```

**SettingsContext.tsx (Lines 1325-1326) — Update function implemented:**
```typescript
const updateScreencastModeSetting = async <K extends keyof ScreencastModeSettings>(key: K, value: ScreencastModeSettings[K]) => {
  await updateSettings("screencastMode", { ...wsState.userSettings.screencastMode, [key]: value });
};
```

### Feature Actively Uses screencastMode at Runtime

**ScreencastMode.tsx (Lines 36-40) — Reads settings:**
```typescript
const screencastSettings = () => effectiveSettings().screencastMode;
const fontSize = () => screencastSettings()?.fontSize ?? 24;
const duration = () => screencastSettings()?.duration ?? 2000;
const showKeys = () => screencastSettings()?.showKeys ?? true;
const showMouse = () => screencastSettings()?.showMouse ?? true;
```

**ScreencastMode.tsx (Lines 40-58) — Updates settings on toggle:**
```typescript
const handleToggle = () => {
  const newState = !isEnabled();
  setIsEnabled(newState);
  const current = effectiveSettings().screencastMode || {
    enabled: false,
    showKeys: true,
    showMouse: true,
    showCommands: true,
    fontSize: 24,
    duration: 2000,
  };
  updateSettings("screencastMode", { ...current, enabled: newState });  // ← Used at runtime!
};
```

### Missing from Settings Surfaces

**SettingsDialog.tsx / SettingsEditor.tsx:**
- No search result for "screencast" when searching settings
- No dedicated settings section for Screencast Mode
- No entries in any settings grouping (Editor, Workbench, Appearance, etc.)

**JsonSettingsEditor.tsx:**
- Schema suggestions do not include `screencastMode`
- Autocomplete doesn't suggest Screencast mode properties
- Only way to edit is manual JSON entry without validation

## Steps to Reproduce

1. Open Cortex IDE
2. Open Settings dialog (Ctrl+, or via menu)
3. Search for "screencast" in the settings search box
4. **Expected**: Screencast Mode settings appear
5. **Actual**: No results

6. Open JSON Settings editor
7. Type "screencast" in the JSON input
8. Wait for schema autocomplete suggestions
9. **Expected**: `screencastMode` appears in suggestions with properties
10. **Actual**: No `screencastMode` suggestion

11. Try to find Screencast Mode in any settings panel
12. **Expected**: A section like "Editor → Screencast Mode" with:
    - Enable Screencast Mode (toggle)
    - Show keys (toggle)
    - Show mouse (toggle)
    - Show commands (toggle)
    - Font size (slider/input)
    - Duration (slider/input)
13. **Actual**: No such section exists in GUI

## System Information
- Cortex IDE: alpha
- Components:
  - `src/context/SettingsContext.tsx` (Lines 486-493, 579, 883-889, 921, 1982-1991)
  - `src/components/ScreencastMode.tsx` (Lines 36-58)
  - `src/components/settings/SettingsEditor.tsx` — Missing screencast entries
  - `src/components/settings/JsonSettingsEditor.tsx` — Missing schema

## Root Cause
**Two disconnected surfaces:**

1. **Runtime:** Complete implementation of `ScreencastModeSettings`
   - Interface defined (6 properties)
   - Defaults configured
   - Context API fully implemented (`useScreencastModeSettings()`)
   - Component reads/updates settings at runtime

2. **GUI/Editor:** No connection to screencastMode
   - Not included in settings panel sections
   - Not in schema/autocomplete for JSON editor
   - No UI controls for the 6 screencast properties

**Files that need screencastMode added:**
- `SettingsEditor.tsx` — Add screencast section
- `JsonSettingsEditor.tsx` — Add to schema for autocomplete
- Typescript schema definitions (if present)

## Expected Behavior
`screencastMode` should be fully discoverable and configurable:

**GUI Settings:**
- Search "screencast" → finds Screencast Mode
- Dedicated section (Editor → Screen Recording or similar)
- Controls for all 6 properties: enabled, showKeys, showMouse, showCommands, fontSize, duration

**JSON Settings:**
- Autocomplete suggests `screencastMode`
- Shows all 6 properties with types
- Validation for values

## Actual Behavior
- Cannot find screencast settings via search or navigation
- No GUI controls available
- JSON editor doesn't autocomplete screencastMode
- Feature exists in runtime but is invisible to users

## Impact
- **Medium** — Feature discoverability/configuration gap
- Users cannot configure Screencast Mode without:
  - Manually editing JSON files
  - Using the command palette (if connected)
  - Knowing the exact property names from source code
- Creates mismatch: Settings model says screencast exists, UI says it doesn't
- Support burden: "Where do I enable Screencast Mode?"
- Confusion: "Setting exists in code but can't find it anywhere"

## Fix Suggestion

### Add to SettingsEditor.tsx

Import the hook and create a settings section:

```typescript
import { useScreencastModeSettings } from "@/context/SettingsContext";

// In SettingsEditor component function:
const screencastSettings = useScreencastModeSettings();

// Add to settings sections data structure:
{
  id: "screencast",
  label: "Screencast Mode",
  icon: "aperture",
  category: "appearance",
  description: "Display pressed keys and mouse clicks during presentations",
  children: [
    {
      type: "toggle",
      key: "enabled",
      label: "Enable Screencast Mode",
      description: "Show keyboard and mouse events on screen"
    },
    {
      type: "toggle",
      key: "showKeys",
      label: "Show keys",
      description: "Display pressed keyboard shortcuts"
    },
    {
      type: "toggle",
      key: "showMouse",
      label: "Show mouse",
      description: "Display mouse clicks"
    },
    {
      type: "toggle",
      key: "showCommands",
      label: "Show commands",
      description: "Display executed command names"
    },
    {
      type: "slider",
      key: "fontSize",
      label: "Font size",
      min: 12,
      max: 48,
      unit: "px"
    },
    {
      type: "slider",
      key: "duration",
      label: "Display duration",
      min: 500,
      max: 5000,
      step: 100,
      unit: "ms"
    }
  ]
}
```

### Add to JsonSettingsEditor.tsx schema

Add `screencastMode` to the schema suggestions:

```typescript
const SCHEMA_SUGGESTIONS = [
  // ... existing suggestions ...
  {
    key: "screencastMode",
    label: "Screencast Mode",
    description: "Settings for keyboard/mouse display during presentations",
    type: "object",
    properties: {
      enabled: { type: "boolean", description: "Show screencast overlay" },
      showKeys: { type: "boolean", description: "Display keyboard shortcuts" },
      showMouse: { type: "boolean", description: "Display mouse clicks" },
      showCommands: { type: "boolean", description: "Display command names" },
      fontSize: { type: "number", description: "Overlay font size (12-48px)" },
      duration: { type: "number", description: "Display duration in milliseconds (500-5000)" }
    }
  }
];
```

## Related Files
- `src/context/SettingsContext.tsx` — Interface, defaults, context API (Lines 486-493, 579, 883-889, 921, 1982-1991)
- `src/components/ScreencastMode.tsx` — Runtime component using settings (Lines 36-58)
- `src/components/settings/SettingsEditor.tsx` — Missing screencast section
- `src/components/settings/JsonSettingsEditor.tsx` — Missing schema

## Additional Context
This is different from #21484 which mentions JSON schema listing screencastMode — that issue confirms the GUI gap but this report provides exact code instances and complete evidence.
