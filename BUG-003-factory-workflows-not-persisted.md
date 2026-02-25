# [BUG] [alpha] Agent Factory workflows do not persist across app sessions

## Project
ide

## Description
Agent Factory workflows created/updated during runtime are lost after restarting the app. The backend uses only in-memory `HashMap` storage for workflow CRUD, while a disk persistence layer exists in `persistence.rs` but is not wired into the command handlers or startup initialization. No call to `set_base_dir()` is made, so the persistence layer cannot determine storage location even if it were integrated.

## Screenshot
![Factory Persistence Bug](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-003-factory-persistence.png)

## Evidence

### mod.rs (Lines 23, 53, 102-110) — In-memory storage only
```rust
use std::collections::HashMap;

pub struct FactoryManager {
    workflows: HashMap<String, Workflow>,  // ← In-memory HashMap
    executions: HashMap<String, Arc<RwLock<ExecutionState>>>,
    agents: HashMap<String, AgentRuntimeState>,
    // ...
    pub fn new() -> Self {
        Self {
            workflows: HashMap::new(),      // ← No disk load
            executions: HashMap::new(),
            // ...
        }
    }

    pub fn create_workflow(&mut self, mut workflow: Workflow) -> String {
        workflow.id = Uuid::new_v4().to_string();
        workflow.created_at = chrono::Utc::now().to_rfc3339();
        workflow.updated_at = chrono::Utc::now().to_rfc3339();

        self.workflows.insert(id.clone(), workflow);  // ← Inserts to memory only
        id
    }
}
```

### commands.rs (Lines 101-119) — List returns in-memory data only
```rust
#[tauri::command]
pub async fn factory_list_workflows(
    state: State<'_, FactoryState>,
) -> Result<Vec<Workflow>, String> {
    let manager = state.0.lock().await;
    Ok(manager.list_workflows().into_iter().cloned().collect())  // ← From HashMap only
}
```

### persistence.rs (Lines 36-52, 69-95) — Persistence unfilled
```rust
pub struct PersistenceManager {
    base_dir: Option<PathBuf>,  // ← Never set!
    auto_save: bool,
}

pub fn set_base_dir(&mut self, path: PathBuf) -> Result<(), String> {
    // Creates .cortex/factory/ directories
    // BUT: Never called from anywhere!
}

pub fn save_workflow(&self, workflow: &Workflow) -> Result<(), String> {
    let factory_dir = self.factory_dir().ok_or("Base directory not set")?;  // ← Would fail
    let file_path = workflows_dir.join(format!("{}.json", workflow.id));
    // ... writes to disk
}
```

### mod.rs (Lines 42-52) — PersistenceManager never integrated
```rust
pub struct FactoryManager {
    workflows: HashMap<String, Workflow>,
    // ...
    persistence: PersistenceManager,  // ← Field exists but unused!
}

impl FactoryManager {
    pub fn set_config(&mut self, config: FactoryConfig) {
        // Updates config
        // BUT: No call to persistence.set_base_dir() or persistence.init()
    }
}
```

## Steps to Reproduce

1. Open Cortex IDE (Tauri desktop or browser)
2. Navigate to Agent Factory workflow designer
3. Create a new workflow with some steps/config
4. Save/update the workflow in the UI
5. Verify workflow appears in the workflow list
6. **Fully quit and relaunch the application**
7. Reopen Agent Factory and list workflows
8. **Expected**: Previously created workflows are restored
9. **Actual**: Workflow list is empty — all workflows are gone

## System Information
- Cortex IDE: alpha
- App: Cortex Desktop
- Components:
  - `src-tauri/src/factory/mod.rs` (lines 23, 53, 77-81, 102-110)
  - `src-tauri/src/factory/commands.rs` (lines 101-119)
  - `src-tauri/src/factory/persistence.rs` (lines 36-52, 69-95)

## Root Cause

**Three disjointed issues:**

1. **No disk persistence in CRUD:**
   - `create_workflow()` inserts to `HashMap` only (`mod.rs:110`)
   - `update_workflow()` updates `HashMap` only
   - `delete_workflow()` removes from `HashMap` only
   - `list_workflows()` returns `HashMap` only (`commands.rs:117`)

2. **Persistence layer not integrated:**
   - `PersistenceManager` field exists (`mod.rs:69`) but never used
   - `save_workflow()` and `load_workflow()` methods never called
   - No startup initialization to load saved workflows

3. **Base directory never configured:**
   - `set_base_dir()` never called (`persistence.rs:47`)
   - Without base dir, persistence can't determine storage location
   - `factory_dir()` returns `None`, so all save operations would fail: "Base directory not set"

## Expected Behavior

1. Workflows should be saved to `.cortex/factory/workflows/{id}.json` on create/update
2. On app startup, workflows should be loaded from disk into memory
3. Base directory should be configured (app data dir or workspace root)
4. `factory_list_workflows` returns all persisted workflows

## Actual Behavior

1. Workflows exist only in memory (`HashMap<String, Workflow>`)
2. All workflows are lost on app restart
3. `PersistenceManager` exists but is completely disconnected from CRUD
4. `set_base_dir()` never called, so persistence can't function

## Impact

**High** for users relying on Agent Factory:
- Workflows are session-only — data loss on every app quit
- Feature is effectively unusable for practical use
- Users must recreate workflows manually after each restart
- No way to backup or share workflows across workspaces

## Fix Suggestion

### Step 1: Initialize persistence on startup
In `main.rs` or equivalent entry point:

```rust
use tauri::Manager;

#[tauri::command]
async fn init_factory_persistence(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<FactoryState>();
    let mut manager = state.0.lock().await;

    // Set base directory to app data dir
    let app_data_dir = app.path_resolver().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    manager.persistence.set_base_dir(app_data_dir)
        .map_err(|e| format!("Failed to set factory base dir: {}", e))?;

    // Load saved workflows into memory
    match manager.persistence.list_workflows() {
        Ok(workflows) => {
            for workflow in workflows {
                manager.workflows.insert(workflow.id.clone(), workflow);
            }
            tracing::info!("Loaded {} workflows from disk", workflows.len());
        }
        Err(e) => {
            tracing::warn!("Failed to load workflows: {}", e);
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_context_menu::init())
        .invoke_handler(tauri::generate_handler![
            // ... existing commands ...
            init_factory_persistence,
        ])
        .setup(|app| {
            // ... existing setup ...
            app.listen("tauri://ready", move |app| {
                // Initialize persistence after UI ready
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = init_factory_persistence(app).await {
                        tracing::error!("Factory persistence init failed: {}", e);
                    }
                });
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Step 2: Wire persistence into CRUD operations
In `mod.rs`:

```rust
impl FactoryManager {
    pub fn create_workflow(&mut self, mut workflow: Workflow) -> String {
        workflow.id = Uuid::new_v4().to_string();
        workflow.created_at = chrono::Utc::now().to_rfc3339();
        workflow.updated_at = chrono::Utc::now().to_rfc3339();

        // Save to disk
        if let Err(e) = self.persistence.save_workflow(&workflow) {
            tracing::error!("Failed to save workflow: {}", e);
        }

        // Add to memory
        self.workflows.insert(id.clone(), workflow);
        id
    }

    pub fn update_workflow(&mut self, id: String, mut workflow: Workflow) -> Result<(), String> {
        workflow.id = id.clone();
        workflow.updated_at = chrono::Utc::now().to_rfc3339();

        // Save to disk
        self.persistence.save_workflow(&workflow)?;

        // Update memory
        self.workflows.insert(id, workflow);
        Ok(())
    }

    pub fn delete_workflow(&mut self, id: String) -> Option<Workflow> {
        // Remove from disk
        if let Err(e) = self.persistence.delete_workflow(&id) {
            tracing::error!("Failed to delete workflow from disk: {}", e);
        }

        // Remove from memory
        self.workflows.remove(&id)
    }
}
```

### Step 3: Ensure sync between disk and memory

Add method to reload from disk:

```rust
impl FactoryManager {
    pub fn reload_from_disk(&mut self) -> Result<(), String> {
        let workflows = self.persistence.list_workflows()?;
        self.workflows.clear();
        for workflow in workflows {
            self.workflows.insert(workflow.id.clone(), workflow);
        }
        Ok(())
    }
}
```

## Related Files
- `src-tauri/src/factory/mod.rs` — FactoryManager struct, CRUD methods
- `src-tauri/src/factory/commands.rs` — Tauri command handlers
- `src-tauri/src/factory/persistence.rs` — Disk persistence implementation (unwired)

## Additional Context

**Persistence architecture:**
- Target directory: `.cortex/factory/workflows/`
- Format: JSON files named `{workflow_id}.json`
- Circuit breaker: Persistence layer exists and is well-implemented, just not connected

**Affected data:**
- Workflows (primary impact)
- Agents (may have same issue)
- Interception rules (may have same issue)

**Backward compatibility:**
- Existing saved workflow files would work once wired
- No migration needed — format is stable JSON
