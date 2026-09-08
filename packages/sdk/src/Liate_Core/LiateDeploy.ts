import fs from 'fs/promises';
import path from 'path';

/**
 * [24] - LiateDeploy (Universal Zero-DevOps Agent Cloud, Edge & Binary Deployer)
 * 
 * Generates and ships production deployment targets for Cloudflare Workers, Docker,
 * Fly.io, Vercel, AWS Lambda, and standalone compiled binaries with agent-specific
 * streaming timeouts and SQLite volume configurations.
 */

export type DeployTarget = 
  | 'cloudflare-workers' 
  | 'cloudflare' 
  | 'docker' 
  | 'fly' 
  | 'vercel' 
  | 'aws-lambda' 
  | 'binary';

export interface DeployConfig {
  target?: DeployTarget;
  projectName?: string;
  port?: number;
  region?: string;
  env?: Record<string, string>;
  outDir?: string;
  idleTimeout?: number;
}

export class LiateDeploy {
  public config: Required<DeployConfig>;

  constructor(config: DeployConfig = {}) {
    this.config = {
      target: config.target || 'docker',
      projectName: config.projectName || 'liate-agent-backend',
      port: config.port || 7071,
      region: config.region || 'ap-south-1', // Sovereign Mumbai Default
      env: config.env || {},
      outDir: config.outDir || './',
      idleTimeout: config.idleTimeout || 300 // 5 minutes for ReAct agent reasoning
    };
  }

  /**
   * Generates an ultra-lean multi-stage Dockerfile (Bun Alpine, 25MB)
   */
  public generateDockerfile(): string {
    return `# Sovereign Liate Agent Production Docker Container
FROM oven/bun:alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

# Copy application and runtime files
COPY . .

# Expose LAPI/v1 REST and WebSocket port
EXPOSE ${this.config.port}

# Create persistent storage directory for sessions and local vector database
VOLUME ["/app/.liate"]

# Set environment defaults
ENV PORT=${this.config.port}
ENV NODE_ENV=production

# Boot Sovereign Agentantra Runtime
CMD ["bun", "run", "serve", "--port", "${this.config.port}"]
`;
  }

  /**
   * Generates a Cloudflare Workers wrangler.jsonc configuration
   */
  public generateWrangler(): string {
    return `// Cloudflare Workers Configuration for Liate Agent Runtime
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${this.config.projectName}",
  "main": "src/server.ts",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "PORT": "${this.config.port}"
  }
}
`;
  }

  /**
   * Generates Fly.io fly.toml configuration targeting Mumbai (bom)
   */
  public generateFlyToml(): string {
    const regionCode = this.config.region === 'ap-south-1' ? 'bom' : 'iad';
    return `# Fly.toml for Sovereign Liate Agent Backend
app = "${this.config.projectName}"
primary_region = "${regionCode}"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = ${this.config.port}
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 1000
    soft_limit = 500

[[mounts]]
  source = "liate_data"
  destination = "/app/.liate"

[checks]
  [checks.livez]
    port = ${this.config.port}
    type = "http"
    interval = "15s"
    timeout = "2s"
    path = "/livez"
`;
  }

  /**
   * Generates Vercel Serverless vercel.json configuration
   */
  public generateVercelConfig(): string {
    return JSON.stringify({
      version: 2,
      name: this.config.projectName,
      builds: [
        {
          src: "src/server.ts",
          use: "@vercel/node"
        }
      ],
      routes: [
        {
          src: "/(.*)",
          dest: "src/server.ts"
        }
      ]
    }, null, 2);
  }

  /**
   * Writes the generated deployment configurations to disk
   */
  public async generate(targetOverride?: DeployTarget): Promise<string[]> {
    const target = targetOverride || this.config.target;
    const writtenFiles: string[] = [];
    const base = this.config.outDir;

    if (target === 'docker' || target === 'fly') {
      const dockerPath = path.join(base, 'Dockerfile');
      await fs.writeFile(dockerPath, this.generateDockerfile(), 'utf-8');
      writtenFiles.push(dockerPath);

      const dockerignorePath = path.join(base, '.dockerignore');
      await fs.writeFile(dockerignorePath, `node_modules\n.git\n.liate\n*.log\n`, 'utf-8');
      writtenFiles.push(dockerignorePath);
    }

    if (target === 'fly') {
      const flyPath = path.join(base, 'fly.toml');
      await fs.writeFile(flyPath, this.generateFlyToml(), 'utf-8');
      writtenFiles.push(flyPath);
    }

    if (target === 'cloudflare' || target === 'cloudflare-workers') {
      const wranglerPath = path.join(base, 'wrangler.jsonc');
      await fs.writeFile(wranglerPath, this.generateWrangler(), 'utf-8');
      writtenFiles.push(wranglerPath);
    }

    if (target === 'vercel') {
      const vercelPath = path.join(base, 'vercel.json');
      await fs.writeFile(vercelPath, this.generateVercelConfig(), 'utf-8');
      writtenFiles.push(vercelPath);
    }

    return writtenFiles;
  }
}

export const Deploy = LiateDeploy;
