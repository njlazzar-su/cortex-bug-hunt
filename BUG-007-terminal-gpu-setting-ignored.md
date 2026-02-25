# [BUG] [alpha] terminal.integratedGpu setting has no effect on WebGL renderer — GPU selection ignored

## Project
ide

## Description
The `terminal.integratedGpu` setting is exposed in the Settings UI and JSON schema but is never used when creating the terminal WebGL addon. The WebGL renderer is always instantiated with default options (`new WebglAddon()` with no parameters), so the setting has no actual effect on GPU selection.

## Screenshot
![Terminal GPU Setting Ignored](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-007-terminal-gpu-setting-ignored.png)

## Evidence

### Settings Model — integratedGpu exists

**SettingsContext.tsx (Line 249) — Terminal settings interface:**
```typescript
export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  // ...
  integratedGpu: boolean;  // ← Setting defined
  // ...
}
```

**SettingsContext.tsx (Line 718) — Default configured:**
```typescript
export const DEFAULT_TERM: TerminalSettings = {
  // ...
  integratedGpu: true,  // ← Default exists
  // ...
};
```

### Settings UI — toggle reads/writes setting

**TerminalSettingsPanel.tsx (Lines 389-398) — Toggle component:**
```typescript
<SettingRowWithOverride
  label="Use Integrated GPU"
  settingKey="integratedGpu"
  hasOverride={hasOverride("integratedGpu")}
  onReset={() => resetOverride("integratedGpu")}
>
  <Toggle
    checked={terminal().integratedGpu}
    onChange={(checked) => updateSetting("integratedGpu", checked)}  // ← Updates settings
  />
</SettingRowWithOverride>
```

### WebGL addon created WITHOUT using setting

**TerminalPanel.tsx (Lines 1424-1428) — WebGL addon instantiated:**
```typescript
// Try to load WebGL addon for GPU-accelerated rendering
let webglAddon: unknown = null;
if (webglAddonModule) {
  try {
    webglAddon = new webglAddonModule.WebglAddon();  // ← NO OPTIONS PASSED!
    terminal.loadAddon(webglAddon as Parameters<typeof terminal.loadAddon>[0]);
    // ...
  }
}
```

**RemoteTerminal.tsx (Lines 181-183) — Same pattern:**
```typescript
if (props.enableWebGL !== false) {
  try {
    webglAddon = new WebglAddon();  // ← NO OPTIONS PASSED!
    webglAddon.onContextLoss(() => {
      webglAddon?.dispose();
      webglAddon = null;
    });
    terminal.loadAddon(webglAddon);
  }
}
```

### Additional locations with same issue

**Terminal.tsx (Line 405) — Also uses `new WebglAddon()`:**
```typescript
webglAddon = new webglAddonModule.WebglAddon();
```

### JSON Schema — setting is listed

**JsonSettingsEditor.tsx (Lines 357-361) — Schema definition:**
```typescript
integratedGpu: {
  type: "boolean",
  description: "Use GPU acceleration"  // ← Schema includes it
}
```

## Steps to Reproduce

1. Open Settings → Terminal (or JSON settings)
2. Enable "Use Integrated GPU" (`integratedGpu: true`)
3. Open a new terminal
4. Check which GPU is being used for rendering
5. **Expected**: Terminal uses the integrated GPU (e.g., Intel) for WebGL rendering
6. **Actual**: Setting is ignored; WebGL addon created with `new WebglAddon()` with no options

### Verification method
- On Windows laptops with dual GPUs: Check Task Manager or GPU usage monitoring
- Observe which GPU (Intel vs NVIDIA/AMD) handles terminal rendering
- Toggle setting and observe: No change in GPU selection

## System Information
- Cortex IDE: v2.22.0
- OS: Windows 10 (likely affects all OSes)
- Components:
  - `src/context/SettingsContext.tsx` (Lines 249, 718)
  - `src/components/settings/TerminalSettingsPanel.tsx` (Lines 389-398)
  - `src/components/TerminalPanel.tsx` (Lines 1424-1428)
  - `src/components/remote/RemoteTerminal.tsx` (Lines 181-183)
  - `src/components/terminal/Terminal.tsx` (Line 405)

## Root Cause
**File:** `src/components/TerminalPanel.tsx` (Line 1425)
**Pattern:** `new WebglAddon()` with no parameters

`terminal.integratedGpu` is never passed to the WebGL addon constructor. The addon is always created with default options:

```typescript
// Current code (SETTING IGNORED):
webglAddon = new webglAddonModule.WebglAddon();  // ← Hardcoded default behavior
```

Should be:
```typescript
// Expected code (SETTING USED):
const powerPreference = terminalSettings().integratedGpu ? 'low-power' : 'high-performance';
webglAddon = new webglAddonModule.WebglAddon({ powerPreference });
```

## Expected Behavior
- When `integratedGpu: true`: Terminal uses integrated GPU (`powerPreference: 'low-power'`)
- When `integratedGpu: false`: Terminal uses discrete GPU (`powerPreference: 'high-performance'`)
- Setting actually controls GPU selection
- User can force which GPU terminal uses

## Actual Behavior
- The setting exists in UI and updates settings JSON
- But WebGL addon always uses default GPU selection
- Setting has no effect on actual GPU used
- Toggle appears functional but does nothing

## Impact

**High** for users on dual-GPU laptops:
- Users cannot force terminal to use integrated GPU
- Discrete GPU used by default causes higher power use/battery drain
- Users facing driver issues with discrete GPU on terminals have no workaround
- Setting appears functional but is silently ignored
- Confusion: "Why does my integrated GPU setting do nothing?"

## Fix Suggestion

### Step 1: Check addon API

Verify the exact option name and values in `@xterm/addon-webgl`:

```typescript
// Check xterm addon documentation
// Likely option: powerPreference?
// Values: 'low-power' | 'high-performance' | 'default'
```

### Step 2: Pass integratedGpu to addon creation

**TerminalPanel.tsx:**

```typescript
let webglAddon: unknown = null;
if (webglAddonModule) {
  try {
    // Read terminal settings
    const terminalSettings = useSettings().effectiveSettings().terminal;

    // Use integratedGpu setting for GPU selection
    const powerPreference = terminalSettings?.integratedGpu
      ? 'low-power'
      : 'high-performance';

    webglAddon = new webglAddonModule.WebglAddon({ powerPreference });  // ← Use setting!
    terminal.loadAddon(webglAddon as Parameters<typeof terminal.loadAddon>[0]);

    if (import.meta.env.DEV) {
      console.log("[Terminal] WebGL renderer enabled for terminal:", terminalInfo.id, "GPU:", powerPreference);
    }
  } catch (e) {
    console.warn("[Terminal] Failed to enable WebGL renderer:", e);
    webglAddon = null;
  }
}
```

### Step 3: Apply to all WebGL addon creation sites

- `src/components/TerminalPanel.tsx` (Line 1425)
- `src/components/terminal/Terminal.tsx` (Line 405)
- `src/components/remote/RemoteTerminal.tsx` (Line 181)

### Step 4: Handle addon API assumptions

If the addon doesn't support powerPreference:
1. Open issue/PR on xterm.js to add option
2. Otherwise, document limitation and remove non-functional setting

## Related Files
- `src/context/SettingsContext.tsx` — integratedGpu in TerminalSettings (Lines 249, 718)
- `src/components/settings/TerminalSettingsPanel.tsx` — UI Toggle (Lines 389-398)
- `src/components/TerminalPanel.tsx` — WebGL addon creation ignores setting (Lines 1424-1428)
- `src/components/terminal/Terminal.tsx` — Same issue (Line 405)
- `src/components/remote/RemoteTerminal.tsx` — Same issue (Lines 181-183)
- `src/types/settings.ts` — Type definition (Line 286)
- `src/components/settings/JsonSettingsEditor.tsx` — Schema (Lines 357-361)

## Additional Context

**Not in Settings:**
`integratedGpu` is not in `SettingsEditor.SETTINGS_REGISTRY`, so it doesn't appear in settings search. Should add the setting to the registry for discoverability.

**Related to BREW/High Priority:**
This is similar to other "setting ignored" bugs (vimEnabled, screencastMode missing) — setting exists in model but not connected to runtime behavior.
