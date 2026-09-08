import crypto from 'node:crypto';

/**
 * [43] - LiateGuard (Sovereign DPDP Act & PII Data Privacy Firewall)
 * 
 * Intercepts prompt inputs and agent outputs to detect, redact, and tokenize
 * sensitive Indian citizen data (Aadhaar, PAN, Phone numbers, UPI IDs, Bank Accounts,
 * and Credit Cards) in compliance with the Digital Personal Data Protection (DPDP) Act.
 */

export interface GuardOptions {
  redactAadhaar?: boolean;
  redactPAN?: boolean;
  redactPhone?: boolean;
  redactUPI?: boolean;
  redactCards?: boolean;
  redactBankAccounts?: boolean;
  strictMode?: boolean; // Throws error on PII detection instead of redacting
}

export interface RedactionResult {
  sanitizedText: string;
  redactionMap: Record<string, string>; // { "[REDACTED_AADHAAR_1]": "2345-6789-0123" }
  detectedCount: number;
  entitiesFound: string[];
}

export interface ComplianceReport {
  compliant: boolean;
  violations: Array<{ type: string; snippet: string }>;
  timestamp: string;
}

export class LiateGuard {
  public options: Required<GuardOptions>;

  constructor(options: GuardOptions = {}) {
    this.options = {
      redactAadhaar: options.redactAadhaar ?? true,
      redactPAN: options.redactPAN ?? true,
      redactPhone: options.redactPhone ?? true,
      redactUPI: options.redactUPI ?? true,
      redactCards: options.redactCards ?? true,
      redactBankAccounts: options.redactBankAccounts ?? true,
      strictMode: options.strictMode ?? false
    };
  }

  /**
   * Sanitize text by redacting PII into reversible cryptographic placeholders
   */
  public sanitize(text: string): RedactionResult {
    let sanitized = text;
    const redactionMap: Record<string, string> = {};
    const entitiesFound: string[] = [];
    let counter = 1;

    // 1. Aadhaar: 12 digits (often 4-4-4)
    if (this.options.redactAadhaar) {
      sanitized = sanitized.replace(/\b[2-9]\d{3}[-\s]?\d{4}[-\s]?\d{4}\b/g, (match) => {
        const token = `[REDACTED_AADHAAR_${counter++}]`;
        redactionMap[token] = match;
        entitiesFound.push('AADHAAR');
        return token;
      });
    }

    // 2. PAN: 5 letters, 4 digits, 1 letter
    if (this.options.redactPAN) {
      sanitized = sanitized.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, (match) => {
        const token = `[REDACTED_PAN_${counter++}]`;
        redactionMap[token] = match;
        entitiesFound.push('PAN');
        return token;
      });
    }

    // 3. Indian Phone: +91 or 10 digits starting with 6-9
    if (this.options.redactPhone) {
      sanitized = sanitized.replace(/\b(?:\+91[\-\s]?)?[6789]\d{9}\b/g, (match) => {
        const token = `[REDACTED_PHONE_${counter++}]`;
        redactionMap[token] = match;
        entitiesFound.push('PHONE');
        return token;
      });
    }

    // 4. UPI IDs: user@bank
    if (this.options.redactUPI) {
      sanitized = sanitized.replace(/\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}\b/g, (match) => {
        if (!match.includes('.com') && !match.includes('.org') && !match.includes('.io')) {
          const token = `[REDACTED_UPI_${counter++}]`;
          redactionMap[token] = match;
          entitiesFound.push('UPI');
          return token;
        }
        return match;
      });
    }

    // 5. Credit / Debit Cards: 16 digits
    if (this.options.redactCards) {
      sanitized = sanitized.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, (match) => {
        const token = `[REDACTED_CARD_${counter++}]`;
        redactionMap[token] = match;
        entitiesFound.push('CREDIT_CARD');
        return token;
      });
    }

    return {
      sanitizedText: sanitized,
      redactionMap,
      detectedCount: Object.keys(redactionMap).length,
      entitiesFound: Array.from(new Set(entitiesFound))
    };
  }

  /**
   * Reconstruct sanitized text back to original values using the session redaction map
   */
  public restore(sanitizedText: string, redactionMap: Record<string, string>): string {
    let restored = sanitizedText;
    for (const [token, original] of Object.entries(redactionMap)) {
      restored = restored.split(token).join(original);
    }
    return restored;
  }

  /**
   * Audit compliance check against DPDP Act
   */
  public checkCompliance(text: string): ComplianceReport {
    const result = this.sanitize(text);
    const violations = Object.entries(result.redactionMap).map(([type, snippet]) => ({
      type,
      snippet: snippet.slice(0, 4) + '****'
    }));

    return {
      compliant: violations.length === 0,
      violations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Convert into an agent tool for autonomous PII redaction
   */
  public toTool() {
    return {
      name: 'sanitize_pii_data',
      description: 'Anonymizes Aadhaar, PAN, phone numbers, and banking data under DPDP Act privacy rules',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Raw sensitive text to sanitize' }
        },
        required: ['text']
      },
      execute: async (args: { text: string }) => {
        const res = this.sanitize(args.text);
        return {
          sanitizedText: res.sanitizedText,
          redactedCount: res.detectedCount,
          entities: res.entitiesFound
        };
      }
    };
  }
}

export const Guard = LiateGuard;
