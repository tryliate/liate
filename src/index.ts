/**
 * liate — Sovereign AI Agent Runtime & LAPI/v1 Engine
 */

export * from './oop';
export { runLiateAgent, type LiateConfig } from './aum';
export { createLiateApp, createLapiApp, WSHub } from './lapi';
export { 
  generateLiateLock, 
  verifyLiateLock, 
  type LiateLockFile, 
  minifyToolSchemas, 
  sanitizeToolOutput, 
  pruneTrajectoryMessages, 
  createStreamDispatcher, 
  type StreamFn 
} from './om';
export * from './store';

import {
  LiateAgent,
  LiateApp,
  LiateModel,
  LiateIntegration,
  LiateTools,
  LiateEnv,
  LiateLoop,
  LiateServer,
  LiateClient,
  LiateView,
  LiateBuild,
  LiateDeploy,
  LiateRun,
  LiateEval,
  LiateTest,
  LiateToken,
  LiateVoice,
  LiateDoc,
  LiateCode,
  LiateChat,
  LiatePrompt,
  LiateStream,
  LiateProvider,
  LiateMcp,
  LiateWorkflow,
  LiateGraph,
  LiateQueue,
  LiateTask,
  LiateEvent,
  LiateRoute,
  LiateCron,
  LiateDB,
  LiateCrud,
  LiateSync,
  LiateIO,
  LiateKey,
  LiateAuth,
  LiateGuard,
  LiateSandbox,
  LiateError,
  LiatePlugin,
  LiatePlan,
  type LiateAgentParams
} from './oop';

export interface LiatePillarsConfig extends LiateAgentParams {
  Token?: LiateToken | Record<string, any>;
  Eval?: LiateEval | Record<string, any>;
  Scratch?: Record<string, any>;
  Skills?: string | string[] | Record<string, any>;
  Route?: LiateRoute | Record<string, any>;
  Chat?: LiateChat | Record<string, any>;
  Context?: any;
  Prompt?: LiatePrompt | string | Record<string, any>;
  Sync?: LiateSync | Record<string, any>;
  DB?: LiateDB | Record<string, any>;
  Auth?: LiateAuth | Record<string, any>;
  Build?: LiateBuild | Record<string, any>;
  Run?: LiateRun | Record<string, any>;
  Workflow?: LiateWorkflow | Record<string, any>;
  Plan?: LiatePlan | Record<string, any>;
  Graph?: LiateGraph | Record<string, any>;
  Key?: LiateKey | Record<string, any>;
  Plugin?: LiatePlugin | LiatePlugin[] | Record<string, any>;
  Error?: LiateError | Record<string, any>;
  Sandbox?: LiateSandbox | Record<string, any>;
  Crud?: LiateCrud | Record<string, any>;
  Voice?: LiateVoice | Record<string, any>;
  Doc?: LiateDoc | Record<string, any>;
  Guard?: LiateGuard | Record<string, any>;
  Test?: LiateTest | Record<string, any>;
  Queue?: LiateQueue | Record<string, any>;
  Event?: LiateEvent | Record<string, any>;
  IO?: LiateIO | Record<string, any>;
  View?: LiateView | Record<string, any>;
  Code?: LiateCode | Record<string, any>;
  [key: string]: any;
}

export function liate(config: LiatePillarsConfig = {}) {
  return new LiateAgent(config);
}

// Ergonomic Aliases
export const Agent = LiateAgent;
export const App = LiateApp;
export const Model = LiateModel;
export const Integration = LiateIntegration;
export const Tools = LiateTools;
export const Env = LiateEnv;
export const Loop = LiateLoop;
export const Server = LiateServer;
export const Client = LiateClient;
export const View = LiateView;
export const Build = LiateBuild;
export const Deploy = LiateDeploy;
export const Run = LiateRun;
export const Eval = LiateEval;
export const Test = LiateTest;
export const Token = LiateToken;
export const Voice = LiateVoice;
export const Doc = LiateDoc;
export const Code = LiateCode;
export const Chat = LiateChat;
export const Prompt = LiatePrompt;
export const Stream = LiateStream;
export const Provider = LiateProvider;
export const Mcp = LiateMcp;
export const Workflow = LiateWorkflow;
export const Plan = LiatePlan;
export const Graph = LiateGraph;
export const Queue = LiateQueue;
export const Task = LiateTask;
export const Event = LiateEvent;
export const Route = LiateRoute;
export const Cron = LiateCron;
export const DB = LiateDB;
export const Crud = LiateCrud;
export const Sync = LiateSync;
export const IO = LiateIO;
export const Key = LiateKey;
export const Auth = LiateAuth;
export const Guard = LiateGuard;
export const Sandbox = LiateSandbox;
export const AIError = LiateError;
export const Plugin = LiatePlugin;

// Default CLI bootstrap when executed directly
if (import.meta.main) {
  const server = new LiateServer();
  server.start().catch(console.error);
}
