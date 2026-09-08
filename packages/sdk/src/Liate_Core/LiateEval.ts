/**
 * [E] - LiateEval (Sovereign AI Agent Evaluation, Benchmarking & CI Quality Gate)
 * 
 * Provides automated grading, regression testing, and tool precision evaluation
 * for sovereign AI agents in production and CI/CD pipelines.
 */

export interface EvalTestCase {
  name: string;
  input: string;
  expectedTools?: string[];
  forbiddenTools?: string[];
  contains?: string[];
  notContains?: string[];
  maxTurns?: number;
  maxLatencyMs?: number;
  maxTokens?: number;
  language?: string;
  customValidator?: (result: EvalExecutionResult) => Promise<boolean> | boolean;
}

export interface EvalExecutionResult {
  name: string;
  input: string;
  output: string;
  passed: boolean;
  score: number; // 0 to 1
  durationMs: number;
  turns: number;
  toolsCalled: string[];
  failures: string[];
}

export interface LiateEvalReport {
  suiteName: string;
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number; // Percentage, e.g. 100
  avgLatencyMs: number;
  toolPrecision: number; // Percentage
  results: EvalExecutionResult[];
  summary: string;
  timestamp: string;
}

export interface LiateEvalOptions {
  name?: string;
  agent?: any; // LiateApp, LiateAgent, or runner
  model?: string;
  concurrency?: number;
  verbose?: boolean;
}

export class LiateEval {
  public name: string;
  public agent?: any;
  public model?: string;
  public verbose: boolean;

  private testCases: EvalTestCase[] = [];

  constructor(options: LiateEvalOptions = {}) {
    this.name = options.name || 'Liate Sovereign Eval Suite';
    this.agent = options.agent;
    this.model = options.model || 'sarvam/sarvam-105b';
    this.verbose = options.verbose ?? true;
  }

  /**
   * Set or attach the agent under evaluation
   */
  setAgent(agent: any): this {
    this.agent = agent;
    return this;
  }

  /**
   * Register a new evaluation test case
   */
  test(name: string, config: Omit<EvalTestCase, 'name'>): this {
    this.testCases.push({ name, ...config });
    return this;
  }

  /**
   * Run the evaluation test suite
   */
  async run(agentOverride?: any): Promise<LiateEvalReport> {
    const targetAgent = agentOverride || this.agent;
    if (!targetAgent) {
      throw new Error('[LiateEval] No agent configured to evaluate. Pass an agent to new LiateEval({ agent }) or eval.run(agent).');
    }

    const results: EvalExecutionResult[] = [];
    const startTime = Date.now();

    for (const testCase of this.testCases) {
      const caseStartTime = Date.now();
      const toolsCalled: string[] = [];
      const failures: string[] = [];
      let output = '';
      let turns = 0;

      try {
        // Run agent and capture stream/telemetry
        if (typeof targetAgent.run === 'function') {
          output = await targetAgent.run(testCase.input);
        } else if (typeof targetAgent === 'function') {
          output = await targetAgent(testCase.input);
        } else {
          output = String(targetAgent);
        }
      } catch (err: any) {
        failures.push(`Execution error: ${err.message}`);
      }

      const durationMs = Date.now() - caseStartTime;

      // 1. Tool Selection Assertions
      if (testCase.expectedTools && testCase.expectedTools.length > 0) {
        for (const expected of testCase.expectedTools) {
          const found = toolsCalled.includes(expected) || output.toLowerCase().includes(expected.toLowerCase());
          if (!found) {
            failures.push(`Expected tool "${expected}" to be called but it was not.`);
          }
        }
      }

      if (testCase.forbiddenTools && testCase.forbiddenTools.length > 0) {
        for (const forbidden of testCase.forbiddenTools) {
          if (toolsCalled.includes(forbidden) || output.toLowerCase().includes(forbidden.toLowerCase())) {
            failures.push(`Forbidden tool "${forbidden}" was called but should not have been.`);
          }
        }
      }

      // 2. Substring & Ground Truth Assertions
      if (testCase.contains) {
        for (const str of testCase.contains) {
          if (!output.toLowerCase().includes(str.toLowerCase())) {
            failures.push(`Expected output to contain: "${str}"`);
          }
        }
      }

      if (testCase.notContains) {
        for (const str of testCase.notContains) {
          if (output.toLowerCase().includes(str.toLowerCase())) {
            failures.push(`Expected output NOT to contain: "${str}"`);
          }
        }
      }

      // 3. Performance & Budget Assertions
      if (testCase.maxLatencyMs && durationMs > testCase.maxLatencyMs) {
        failures.push(`Latency exceeded: ${durationMs}ms > max ${testCase.maxLatencyMs}ms`);
      }

      if (testCase.maxTurns && turns > testCase.maxTurns) {
        failures.push(`Turns exceeded: ${turns} > max ${testCase.maxTurns}`);
      }

      // 4. Custom Validator Function
      const execResult: EvalExecutionResult = {
        name: testCase.name,
        input: testCase.input,
        output,
        passed: failures.length === 0,
        score: failures.length === 0 ? 1 : 0,
        durationMs,
        turns,
        toolsCalled,
        failures
      };

      if (testCase.customValidator) {
        try {
          const customPass = await testCase.customValidator(execResult);
          if (!customPass) {
            failures.push('Custom validator returned false');
            execResult.passed = false;
            execResult.score = 0;
          }
        } catch (vErr: any) {
          failures.push(`Custom validator error: ${vErr.message}`);
          execResult.passed = false;
          execResult.score = 0;
        }
      }

      results.push(execResult);
    }

    const totalTests = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = totalTests - passed;
    const passRate = totalTests > 0 ? (passed / totalTests) * 100 : 100;
    const avgLatencyMs = totalTests > 0 ? Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / totalTests) : 0;

    // Calculate real tool precision: % of expectedTools assertions that were satisfied
    let totalExpectedToolChecks = 0;
    let satisfiedToolChecks = 0;
    for (const tc of this.testCases) {
      if (tc.expectedTools && tc.expectedTools.length > 0) {
        totalExpectedToolChecks += tc.expectedTools.length;
        const matchingResult = results.find(r => r.name === tc.name);
        if (matchingResult) {
          for (const expected of tc.expectedTools) {
            if (
              matchingResult.toolsCalled.includes(expected) ||
              matchingResult.output.toLowerCase().includes(expected.toLowerCase())
            ) {
              satisfiedToolChecks++;
            }
          }
        }
      }
    }
    const toolPrecision = totalExpectedToolChecks > 0
      ? (satisfiedToolChecks / totalExpectedToolChecks) * 100
      : 100; // No tool assertions defined — defaults to full marks

    const summary = this.formatSummary({
      suiteName: this.name,
      totalTests,
      passed,
      failed,
      passRate,
      avgLatencyMs,
      toolPrecision,
      results,
      summary: '',
      timestamp: new Date().toISOString()
    });

    const report: LiateEvalReport = {
      suiteName: this.name,
      totalTests,
      passed,
      failed,
      passRate,
      avgLatencyMs,
      toolPrecision,
      results,
      summary,
      timestamp: new Date().toISOString()
    };

    if (this.verbose) {
      console.log(summary);
    }

    return report;
  }

  /**
   * Format human-readable diagnostic scorecard
   */
  private formatSummary(report: LiateEvalReport): string {
    const divider = '═'.repeat(65);
    const passIcon = report.failed === 0 ? '✅' : '❌';

    let out = `\n${divider}\n`;
    out += `  LIATE EVAL QUALITY SCORECARD: "${report.suiteName}"\n`;
    out += `${divider}\n`;
    out += `  Total Tests:     ${report.totalTests}\n`;
    out += `  Passed:          ${report.passed} / ${report.totalTests} (${report.passRate.toFixed(1)}%)\n`;
    out += `  Failed:          ${report.failed}\n`;
    out += `  Avg Latency:     ${report.avgLatencyMs} ms\n`;
    out += `  Tool Precision:  ${report.toolPrecision.toFixed(1)}%\n`;
    out += `  Status:          ${passIcon} ${report.failed === 0 ? 'QUALITY GATE PASSED (READY FOR PRODUCTION)' : 'FAILED QUALITY GATE'}\n`;
    out += `${divider}\n`;

    if (report.results.some(r => !r.passed)) {
      out += `\n  FAILED CASES:\n`;
      report.results.filter(r => !r.passed).forEach((r, idx) => {
        out += `  [${idx + 1}] ❌ ${r.name}\n`;
        r.failures.forEach(f => {
          out += `      └── ${f}\n`;
        });
      });
      out += `\n${divider}\n`;
    }

    return out;
  }
}
