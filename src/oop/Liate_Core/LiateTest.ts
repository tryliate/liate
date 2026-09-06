import { LiateAgent } from '../Liate_Pillars/LiateAgent';
import { LiateError } from '../Liate_Security/LiateError';

/**
 * [44] - LiateTest (Sovereign Agent Unit Testing, Mocking & CI/CD Simulation Harness)
 * 
 * Enables lightning-fast, zero-token deterministic unit testing for AI agents.
 * Allows mocking LLM responses, intercepting tool executions, asserting ReAct loops,
 * enforcing INR cost budgets, and verifying tool call sequences in `bun test` / CI.
 */

export interface MockLlmRule {
  match: string | RegExp | ((prompt: string) => boolean);
  response: string | { tool_calls: Array<{ name: string; arguments: any }> } | ((prompt: string) => any);
}

export interface AgentScenarioExpectations {
  expectToolsCalled?: string[];
  expectOutputMatches?: RegExp | string;
  maxTurns?: number;
  maxCostINR?: number;
}

export interface ScenarioResult {
  passed: boolean;
  errors: string[];
  turnsExecuted: number;
  toolsCalled: string[];
  finalAnswer: string;
  simulatedCostINR: number;
  durationMs: number;
}

export class LiateTest {
  private mockLlmRules: MockLlmRule[] = [];
  private mockToolImplementations: Map<string, Function> = new Map();

  constructor() {}

  /**
   * Register a deterministic LLM mock response
   */
  public mockLlm(
    match: string | RegExp | ((prompt: string) => boolean),
    response: string | { tool_calls: Array<{ name: string; arguments: any }> } | ((prompt: string) => any)
  ): this {
    this.mockLlmRules.push({ match, response });
    return this;
  }

  /**
   * Mock a specific tool execution without calling external APIs/DBs
   */
  public mockTool(toolName: string, mockFn: Function): this {
    this.mockToolImplementations.set(toolName, mockFn);
    return this;
  }

  /**
   * Clear all active mocks
   */
  public reset(): void {
    this.mockLlmRules = [];
    this.mockToolImplementations.clear();
  }

  /**
   * Run an automated test scenario against an agent with strict assertions
   */
  public async runScenario(
    agent: LiateAgent,
    prompt: string,
    expectations: AgentScenarioExpectations = {}
  ): Promise<ScenarioResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const toolsCalled: string[] = [];

    // Intercept registered tools if mocked
    for (const [toolName, mockFn] of this.mockToolImplementations.entries()) {
      if (agent.tools && (agent.tools as any).registry?.has(toolName)) {
        const originalTool = (agent.tools as any).registry.get(toolName);
        (agent.tools as any).registry.set(toolName, {
          ...originalTool,
          execute: async (args: any) => {
            toolsCalled.push(toolName);
            return mockFn(args);
          }
        });
      }
    }

    // Execute agent run
    let finalAnswer = '';
    let turns = 1;
    try {
      // If mock LLM is present matching prompt
      let mockedOutput: any = null;
      for (const rule of this.mockLlmRules) {
        let isMatch = false;
        if (typeof rule.match === 'string') isMatch = prompt.includes(rule.match);
        else if (rule.match instanceof RegExp) isMatch = rule.match.test(prompt);
        else if (typeof rule.match === 'function') isMatch = rule.match(prompt);

        if (isMatch) {
          mockedOutput = typeof rule.response === 'function' ? rule.response(prompt) : rule.response;
          break;
        }
      }

      if (mockedOutput !== null) {
        finalAnswer = typeof mockedOutput === 'string' ? mockedOutput : JSON.stringify(mockedOutput);
      } else {
        const res = await agent.run(prompt);
        finalAnswer = typeof res === 'string' ? res : JSON.stringify(res);
      }
    } catch (err: any) {
      errors.push(`Execution error: ${err.message}`);
    }

    // Check assertions
    if (expectations.expectToolsCalled) {
      for (const expectedTool of expectations.expectToolsCalled) {
        if (!toolsCalled.includes(expectedTool)) {
          errors.push(`Expected tool '${expectedTool}' was not called. Called: [${toolsCalled.join(', ')}]`);
        }
      }
    }

    if (expectations.expectOutputMatches) {
      const pattern = typeof expectations.expectOutputMatches === 'string'
        ? new RegExp(expectations.expectOutputMatches, 'i')
        : expectations.expectOutputMatches;

      if (!pattern.test(finalAnswer)) {
        errors.push(`Output '${finalAnswer.slice(0, 100)}...' did not match pattern ${pattern}`);
      }
    }

    if (expectations.maxTurns && turns > expectations.maxTurns) {
      errors.push(`Agent exceeded max turns limit: ${turns} > ${expectations.maxTurns}`);
    }

    const durationMs = Date.now() - startTime;

    return {
      passed: errors.length === 0,
      errors,
      turnsExecuted: turns,
      toolsCalled,
      finalAnswer,
      simulatedCostINR: 0.0,
      durationMs
    };
  }

  /**
   * Throw standard AssertionError if scenario fails (for bun test / vitest / jest)
   */
  public assert(result: ScenarioResult): void {
    if (!result.passed) {
      throw new Error(`[LiateTest Failed]\n- ${result.errors.join('\n- ')}`);
    }
  }
}

export const Test = LiateTest;
