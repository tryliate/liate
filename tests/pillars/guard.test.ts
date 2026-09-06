/**
 * Tests for LiateGuard — DPDP Act & PII Data Privacy Firewall
 * Run with: bun test tests/pillars/guard.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { LiateGuard } from '../../src/oop/Liate_Security/LiateGuard';

describe('LiateGuard — PII Sanitize and Redaction', () => {
  const guard = new LiateGuard();

  it('redacts Aadhaar numbers', () => {
    const raw = 'My Aadhaar number is 3456-7890-1234 for KYC verification.';
    const res = guard.sanitize(raw);
    expect(res.detectedCount).toBe(1);
    expect(res.entitiesFound).toContain('AADHAAR');
    expect(res.sanitizedText).toContain('[REDACTED_AADHAAR_');
    expect(res.sanitizedText).not.toContain('3456-7890-1234');
  });

  it('redacts PAN numbers', () => {
    const raw = 'Please update records for PAN ABCDE1234F.';
    const res = guard.sanitize(raw);
    expect(res.detectedCount).toBe(1);
    expect(res.entitiesFound).toContain('PAN');
    expect(res.sanitizedText).toContain('[REDACTED_PAN_');
  });

  it('redacts Indian phone numbers', () => {
    const raw = 'Contact me at +91 9876543210 or 8765432109 immediately.';
    const res = guard.sanitize(raw);
    expect(res.detectedCount).toBeGreaterThanOrEqual(1);
    expect(res.entitiesFound).toContain('PHONE');
  });

  it('redacts UPI IDs', () => {
    const raw = 'Send ₹500 to rahul.sharma@okaxis or priya@okhdfcbank.';
    const res = guard.sanitize(raw);
    expect(res.detectedCount).toBe(2);
    expect(res.entitiesFound).toContain('UPI');
  });

  it('restores sanitized text back using redactionMap', () => {
    const raw = 'User ABCDE1234F with phone 9876543210 completed payment.';
    const sanitized = guard.sanitize(raw);
    const restored = guard.restore(sanitized.sanitizedText, sanitized.redactionMap);
    expect(restored).toBe(raw);
  });

  it('generates accurate DPDP compliance audits', () => {
    const cleanText = 'The weather in Bengaluru is 24 degrees Celsius.';
    const report1 = guard.checkCompliance(cleanText);
    expect(report1.compliant).toBe(true);
    expect(report1.violations.length).toBe(0);

    const sensitiveText = 'Customer PAN is ABCDE1234F.';
    const report2 = guard.checkCompliance(sensitiveText);
    expect(report2.compliant).toBe(false);
    expect(report2.violations.length).toBe(1);
  });
});
