export interface UniversalWebSocket {
  readyState: number;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close?(code?: number, reason?: string): void;
}

export interface PendingApproval {
  id: string;
  tool: string;
  arguments: any;
  resolve: (allowed: boolean) => void;
  timer: any;
}

export class WSHub {
  private clients: Set<UniversalWebSocket> = new Set();
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private alwaysAllowedTools: Set<string> = new Set();

  public addClient(ws: UniversalWebSocket) {
    this.clients.add(ws);
  }

  public removeClient(ws: UniversalWebSocket) {
    this.clients.delete(ws);
  }

  public broadcast(message: any) {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    for (const client of this.clients) {
      try {
        if (client.readyState === 1) { // 1 = OPEN
          client.send(data);
        }
      } catch (err) {
        console.error('WebSocket send error:', err);
        this.clients.delete(client);
      }
    }
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Request human-in-the-loop inline tool execution approval
   */
  public async requestApproval(toolName: string, args: any, timeoutMs: number = 60000): Promise<boolean> {
    if (this.alwaysAllowedTools.has(toolName)) {
      return true;
    }

    const id = `approval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingApprovals.has(id)) {
          this.pendingApprovals.delete(id);
          console.log(`[APPROVAL TIMEOUT] Tool [${toolName}] timed out after ${timeoutMs}ms. Auto-denying.`);
          resolve(false);
        }
      }, timeoutMs);

      this.pendingApprovals.set(id, {
        id,
        tool: toolName,
        arguments: args,
        resolve: (allowed: boolean) => {
          clearTimeout(timer);
          resolve(allowed);
        },
        timer
      });

      // Broadcast tool_approval_request to connected UI clients
      this.broadcast({
        type: 'tool_approval_request',
        id,
        tool: toolName,
        name: toolName,
        arguments: args,
        input: args
      });
    });
  }

  /**
   * Resolve a pending tool approval from UI response
   */
  public resolveApproval(id: string, allowed: boolean, alwaysAllow: boolean = false, toolName?: string) {
    const pending = this.pendingApprovals.get(id);
    if (alwaysAllow && (toolName || pending?.tool)) {
      this.alwaysAllowedTools.add(toolName || pending!.tool);
    }

    if (pending) {
      this.pendingApprovals.delete(id);
      pending.resolve(allowed);
      return true;
    }
    return false;
  }

  public getPendingApprovals(): Array<{ id: string; tool: string; arguments: any }> {
    return Array.from(this.pendingApprovals.values()).map(p => ({
      id: p.id,
      tool: p.tool,
      arguments: p.arguments
    }));
  }
}
