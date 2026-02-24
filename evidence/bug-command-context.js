// Bug #2: CommandContext.tsx:103 - extensionCommands is not iterable

console.log("=".repeat(80));
console.log("BUG #2: CommandContext.tsx:103");
console.log("Error: TypeError: extensionCommands is not iterable");
console.log("=" .repeat(80));
console.log();

// Simulate the buggy code from CommandContext.tsx:103
console.log("Reproduce: evoke() returns non-iterable value");
console.log("-".repeat(80));

const BuggyCode = () => {
  // This simulates what happens when evoke() API returns null/undefined
  const extensionCommands = null; 

  try {
    // This is line 103 - trying to iterate without checking if iterable
    for (const cmd of extensionCommands) {
      console.log(`- ${cmd.id}`);
    }
    console.log("✓ No error (unexpected)");
  } catch (err) {
    console.log("❌ ERROR CAUGHT:");
    console.log(`   ${err.message}`);
  }
};

BuggyCode();
console.log();
console.log("Fix: Add null/undefined guard before iteration");
console.log();
console.log("  if (!Array.isArray(extensionCommands)) {");
console.log("    console.debug('[Command] Extension commands unavailable');");
console.log("    return;");
console.log("  }");
console.log("  for (const cmd of extensionCommands) {");
console.log();
