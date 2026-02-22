# 🐛 Cortex IDE Bug Hunt - Evidence

**9 bugs found with screenshot evidence**

## Bugs Documented

1. **File Dialog Broken** - Clicking New File/Open File shows diagonal lines instead of file picker
2. **Menu Dropdowns Dead** - File/Edit/View/Git/etc. menu items show no响应
3. **Sidebar Toggle Fails** - Right edge click won't toggle sidebar
4. **Terminal Panel Won't Open** - Bottom terminal area unresponsive
5. **Inconsistent Button Styling** - Clone Repository missing green indicator
6. **Model Selector Broken** - "claude-opus-4.5" click - no settings/dropdown
7. **Edit Menu Broken** - Edit dropdown doesn't appear
8. **New File Button Dead** - Clicking does nothing, no editor opens
9. **Open Folder Button Dead** - Clicking does nothing, no file picker

## Testing Environment

- Xvfb virtual display (:99, 1920x1080)
- Cortex Desktop v0.0.6
- MCP Server on port 4000
- Test date: 2026-02-22

## Screenshots

All 27 screenshots in `/screenshots/` showing each bug
