import { LiateKey } from '../Liate_Data/LiateKey';

/**
 * [38] - LiateError (Sovereign AI Error & Self-Healing Diagnostics Engine)
 * 
 * Provides structured, typed AI error codes, HTTP status mapping, pre-failure
 * token/cost accounting, safe secret masking, and agent self-healing prompts.
 */

export type LiateErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'CONTEXT_OVERFLOW'
  | 'TOOL_FAILED'
  | 'GUARDRAIL_BLOCKED'
  | 'BUDGET_EXCEEDED'
  | 'LOOP_EXHAUSTED'
  | 'INVALID_JSON_OUTPUT'
  | 'AUTH_UNAUTHORIZED'
  | 'MODEL_UNAVAILABLE'
  | 'PARSE_ERROR'
  | 'UNKNOWN_ERROR';

export interface LiateErrorOptions {
  statusCode?: number;
  isRecoverable?: boolean;
  retryAfterMs?: number;
  provider?: string;
  toolName?: string;
  receivedArgs?: any;
  tokensBurned?: number;
  costInr?: number;
  details?: Record<string, any>;
  cause?: Error;
}

const DEFAULT_STATUS_CODES: Record<LiateErrorCode, number> = {
  RATE_LIMIT_EXCEEDED: 429,
  CONTEXT_OVERFLOW: 413,
  TOOL_FAILED: 502,
  GUARDRAIL_BLOCKED: 403,
  BUDGET_EXCEEDED: 402,
  LOOP_EXHAUSTED: 504,
  INVALID_JSON_OUTPUT: 422,
  AUTH_UNAUTHORIZED: 401,
  MODEL_UNAVAILABLE: 503,
  PARSE_ERROR: 400,
  UNKNOWN_ERROR: 500
};

export class LiateError extends Error {
  public code: LiateErrorCode;
  public statusCode: number;
  public isRecoverable: boolean;
  public retryAfterMs?: number;
  public provider?: string;
  public toolName?: string;
  public receivedArgs?: any;
  public tokensBurned: number;
  public costInr: number;
  public details?: Record<string, any>;
  public timestamp: number;

  constructor(
    code: LiateErrorCode,
    message: string,
    options: LiateErrorOptions = {}
  ) {
    // Automatically mask any secret keys in error messages
    const sanitizedMessage = LiateError.sanitizeMessage(message);
    super(sanitizedMessage);

    this.name = 'LiateError';
    this.code = code;
    this.statusCode = options.statusCode || DEFAULT_STATUS_CODES[code] || 500;
    this.isRecoverable = options.isRecoverable ?? (code === 'RATE_LIMIT_EXCEEDED' || code === 'TOOL_FAILED' || code === 'INVALID_JSON_OUTPUT');
    this.retryAfterMs = options.retryAfterMs;
    this.provider = options.provider;
    this.toolName = options.toolName;
    this.receivedArgs = options.receivedArgs;
    this.tokensBurned = options.tokensBurned || 0;
    this.costInr = options.costInr || 0;
    this.details = options.details;
    this.timestamp = Date.now();

    if (options.cause) {
      this.cause = options.cause;
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LiateError);
    }
  }

  /**
   * Generates a structured prompt feedback for agent self-healing in ReAct loops
   */
  public toAgentPrompt(): string {
    if (this.code === 'TOOL_FAILED') {
      return `[ERROR in tool '${this.toolName || 'unknown'}']: ${this.message}. Please check your arguments and try alternative reasoning.`;
    }
    if (this.code === 'INVALID_JSON_OUTPUT') {
      return `[ERROR]: Your output was not valid JSON or violated schema: ${this.message}. Please output strictly valid JSON matching the requested schema.`;
    }
    if (this.code === 'CONTEXT_OVERFLOW') {
      return `[ERROR]: Context window limit exceeded. Please summarize previous reasoning concisely.`;
    }
    return `[ERROR (${this.code})]: ${this.message}. Please adjust your execution path.`;
  }

  /**
   * Serializes the error cleanly for LAPI JSON endpoints & frontend consumers
   */
  public toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        isRecoverable: this.isRecoverable,
        retryAfterMs: this.retryAfterMs,
        provider: this.provider,
        toolName: this.toolName,
        tokensBurned: this.tokensBurned,
        costInr: this.costInr,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }

  /**
   * Sanitize error strings to ensure no raw API keys are leaked in logs
   */
  public static sanitizeMessage(msg: string): string {
    if (!msg || typeof msg !== 'string') return '';
    return msg.replace(/(sk_[a-zA-Z0-9_-]{8,})/g, (match) => LiateKey.mask(match));
  }

  /**
   * Static Factory: Rate limit error (429)
   */
  public static rateLimited(provider: string = 'sarvam', retryAfterMs: number = 5000): LiateError {
    return new LiateError('RATE_LIMIT_EXCEEDED', `${provider.toUpperCase()} API rate limit exceeded. Auto-cooling for ${retryAfterMs}ms.`, {
      provider,
      retryAfterMs,
      statusCode: 429,
      isRecoverable: true
    });
  }

  /**
   * Static Factory: Tool execution error (502)
   */
  public static toolFailed(toolName: string, reason: string, args?: any): LiateError {
    return new LiateError('TOOL_FAILED', reason, {
      toolName,
      receivedArgs: args,
      statusCode: 502,
      isRecoverable: true
    });
  }

  /**
   * Static Factory: Budget exceeded (402)
   */
  public static budgetExceeded(balanceInr: number, requiredInr: number): LiateError {
    return new LiateError('BUDGET_EXCEEDED', `Account balance exhausted (Current: ₹${balanceInr.toFixed(2)}, Required: ₹${requiredInr.toFixed(2)}).`, {
      statusCode: 402,
      isRecoverable: false,
      details: { balanceInr, requiredInr }
    });
  }

  /**
   * Static Factory: Guardrail violation (403)
   */
  public static guardrailBlocked(reason: string): LiateError {
    return new LiateError('GUARDRAIL_BLOCKED', `Execution blocked by safety policy: ${reason}`, {
      statusCode: 403,
      isRecoverable: false
    });
  }

  /**
   * Static Helper: Wrap any unknown error safely into a LiateError
   */
  public static from(err: any): LiateError {
    if (err instanceof LiateError) return err;
    const msg = err instanceof Error ? err.message : String(err);
    return new LiateError('UNKNOWN_ERROR', msg, {
      cause: err instanceof Error ? err : undefined
    });
  }
}

export const AIError = LiateError;
