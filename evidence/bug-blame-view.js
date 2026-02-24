// Bug #1: BlameView.tsx:50 - Cannot read properties of undefined (reading 'map')

console.log("=".repeat(80));
console.log("BUG #1: BlameView.tsx:50");
console.log("Error: Cannot read properties of undefined (reading 'map')");
console.log("=" .repeat(80));
console.log();

// Simulate the buggy code from BlameView.tsx:50
console.log("Reproduce: gitBlame() returns undefined");
console.log("-".repeat(80));

const BuggyCode = () => {
  const entries = undefined; // Simulate gitBlame() returning undefined

  // This is the actual buggy code line 50
  try {
    const lines = entries.map((entry) => ({
      lineNumber: entry.lineStart,
      content: entry.content,
    }));
    console.log("✓ No error (unexpected)");
  } catch (err) {
    console.log("❌ ERROR CAUGHT:");
    console.log(`   ${err.message}`);
    console.log(`   ${err.stack.split('\n')[1].trim()}`);
  }
};

BuggyCode();
console.log();
console.log("Fix: Add null/undefined check before calling .map()");
console.log();
console.log("  const lines = entries?.map((entry) => ({...");
console.log();
