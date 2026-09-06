export interface LiateConfig {
  $schema?: string;
  L: string; // Model ID, e.g. "sarvam/sarvam-105b", "omniroute/auto"
  I?: {
    memory?: string;
    session?: string;
    database?: string;
    [key: string]: any;
  };
  A: {
    name: string;
    version?: string;
    intent?: string;
    skills?: string | string[];
    [key: string]: any;
  };
  T?: string[] | Record<string, {
    command?: string;
    url?: string;
    args?: string[];
    tools?: string[];
    description?: string;
    [key: string]: any;
  }> | Record<string, any>;
  E?: Record<string, any>;
}

export type AumStreamType = 'STATUS' | 'THOUGHT' | 'TOOL_CALL' | 'TOOL_RESULT' | 'CHUNK' | 'RESULT' | 'ERROR';
export type LiateStreamType = AumStreamType;

export type AumStreamCallback = (type: AumStreamType, content: string) => void;
export type LiateStreamCallback = AumStreamCallback;

export type AumApprovalCallback = (tool: string, args: any) => Promise<boolean>;
export type LiateApprovalCallback = AumApprovalCallback;
