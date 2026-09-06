import { LiateGuard } from '../src';

/**
 * Example 06: DPDP Act Citizen PII Redaction & Compliance Firewall
 * 
 * Demonstrates redacting Indian citizen PII (Aadhaar, PAN, Phone, UPI)
 * and auditing compliance under the Digital Personal Data Protection (DPDP) Act.
 * 
 * Run with:
 *   bun run examples/06-dpdp-guard.ts
 */
async function main() {
  console.log('🛡️ Initializing DPDP Data Privacy Guard (LiateGuard)...\n');

  const guard = new LiateGuard({
    redactAadhaar: true,
    redactPAN: true,
    redactPhone: true,
    redactUPI: true
  });

  const sensitivePrompt = `
    Customer KYC Record:
    Name: Ramesh Kumar
    Aadhaar: 3456 7890 1234
    PAN Card: ABCDE1234F
    Phone: +91 9876543210
    UPI ID: ramesh.kumar@oksbi
    Requirement: Verify eligibility for sovereign MSME credit subsidy.
  `;

  console.log('--- Original Prompt (Raw PII) ---');
  console.log(sensitivePrompt.trim());

  // 1. Sanitize text before sending to LLM
  const sanitized = guard.sanitize(sensitivePrompt);
  console.log('\n--- Sanitized Prompt (Sent to LLM) ---');
  console.log(sanitized.sanitizedText.trim());
  console.log(`\nRedacted ${sanitized.detectedCount} sensitive entities:`, sanitized.entitiesFound);

  // 2. Audit compliance check
  const compliance = guard.checkCompliance(sensitivePrompt);
  console.log('\n--- Compliance Audit Report ---');
  console.log('Compliant:', compliance.compliant ? '✅ YES' : '❌ VIOLATIONS DETECTED');
  console.log('Violations:', compliance.violations);

  // 3. Restore back locally if needed
  const restored = guard.restore(sanitized.sanitizedText, sanitized.redactionMap);
  console.log('\n--- Locally Restored Text ---');
  console.log(restored.trim());
}

main().catch(console.error);
