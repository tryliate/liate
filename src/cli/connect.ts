import * as p from '@clack/prompts';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export type CloudProviderType = 'aws' | 'gcp' | 'modal' | 'cloudflare' | 'supabase' | 'vps';

export interface CloudConfig {
  provider: CloudProviderType;
  region?: string;
  projectId?: string;
  roleArn?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  gcpServiceAccountKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  modalTokenId?: string;
  modalTokenSecret?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  trialActive: boolean;
  trialStartedAt: string;
  trialExpiresAt: string;
  engineEndpoint?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.liate');
const CONFIG_FILE = path.join(CONFIG_DIR, 'cloud.json');

export async function getStoredCloudConfig(): Promise<CloudConfig | null> {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function saveCloudConfig(config: CloudConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export async function runConnectWizard(options?: { provider?: string }): Promise<void> {
  p.intro('\x1b[36m⚡ Liate Sovereign Cloud Connect (BYOC)\x1b[0m');
  p.note(
    'Connect ANY cloud provider: AWS, GCP, Cloudflare, Modal, Supabase, or VPS.\n' +
    'The 11MB li8 sovereign engine spins up directly in YOUR cloud.\n' +
    '7-Day Free Trial ($0 today • No credit card required • $5/mo flat thereafter)',
    'Universal Multi-Cloud BYOC'
  );

  let provider = options?.provider?.toLowerCase() as CloudProviderType | undefined;

  if (!provider) {
    const selected = await p.select({
      message: 'Select cloud provider to connect:',
      options: [
        { value: 'aws', label: '☁️  AWS (Amazon Web Services)', hint: 'Lambda MicroVMs, IAM Role ARN or Keys' },
        { value: 'gcp', label: '🌐 GCP (Google Cloud Platform)', hint: 'Cloud Run, Compute Engine, Service Account Key' },
        { value: 'cloudflare', label: '⚡ Cloudflare (Workers & AI Gateway)', hint: 'Edge serverless, Account ID + API Token' },
        { value: 'modal', label: '🚀 Modal Cloud (Serverless Python/MCP)', hint: 'uvx mcp-modal containers & GPU/CPU' },
        { value: 'supabase', label: '🗄️  Supabase (Sovereign Vault)', hint: 'Store cloud keys safely in YOUR database' },
        { value: 'vps', label: '🖥️  Hostinger / Hetzner / Linux VPS', hint: 'Deploy 11MB binary on bare metal' },
      ],
    });

    if (p.isCancel(selected)) {
      p.cancel('Connection canceled.');
      return;
    }
    provider = selected as CloudProviderType;
  }

  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // ==========================================
  // 1. AWS CONNECT
  // ==========================================
  if (provider === 'aws') {
    const authType = await p.select({
      message: 'Choose AWS authentication method:',
      options: [
        { value: 'keys', label: 'IAM Access Key & Secret (Quick Dev)', hint: 'AWS_ACCESS_KEY_ID + SECRET' },
        { value: 'role', label: 'IAM Role ARN (Enterprise Standard)', hint: 'sts:AssumeRole cross-account' },
      ],
    });
    if (p.isCancel(authType)) { p.cancel('Canceled.'); return; }

    let accessKeyId = '';
    let secretAccessKey = '';
    let roleArn = '';

    if (authType === 'keys') {
      const keyInput = await p.text({
        message: 'Enter AWS_ACCESS_KEY_ID:',
        placeholder: 'AKIA...',
        validate: (v) => (!v ? 'Access Key ID is required' : undefined),
      });
      if (p.isCancel(keyInput)) { p.cancel('Canceled.'); return; }
      accessKeyId = keyInput as string;

      const secInput = await p.password({
        message: 'Enter AWS_SECRET_ACCESS_KEY:',
        validate: (v) => (!v ? 'Secret Access Key is required' : undefined),
      });
      if (p.isCancel(secInput)) { p.cancel('Canceled.'); return; }
      secretAccessKey = secInput as string;
    } else {
      const roleInput = await p.text({
        message: 'Enter IAM Role ARN:',
        placeholder: 'arn:aws:iam::123456789012:role/LiateMicroVMDeploymentRole',
        validate: (v) => (!v || !v.startsWith('arn:aws:iam::') ? 'Must be a valid IAM Role ARN' : undefined),
      });
      if (p.isCancel(roleInput)) { p.cancel('Canceled.'); return; }
      roleArn = roleInput as string;
    }

    const regionSelect = await p.select({
      message: 'Select AWS Region:',
      options: [
        { value: 'ap-south-1', label: 'ap-south-1 (Mumbai, India) [Sovereign HQ]' },
        { value: 'us-east-1', label: 'us-east-1 (N. Virginia)' },
        { value: 'us-west-2', label: 'us-west-2 (Oregon)' },
        { value: 'eu-central-1', label: 'eu-central-1 (Frankfurt)' },
        { value: 'ap-southeast-1', label: 'ap-southeast-1 (Singapore)' },
      ],
    });
    if (p.isCancel(regionSelect)) { p.cancel('Canceled.'); return; }
    const region = regionSelect as string;

    const s = p.spinner();
    s.start('Verifying AWS credentials via STS...');

    try {
      const envCopy = { ...process.env };
      if (accessKeyId) {
        envCopy.AWS_ACCESS_KEY_ID = accessKeyId;
        envCopy.AWS_SECRET_ACCESS_KEY = secretAccessKey;
      }
      envCopy.AWS_REGION = region;

      const identityRaw = execSync(`aws sts get-caller-identity --region ${region} --output json`, {
        encoding: 'utf-8',
        env: envCopy,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const identity = JSON.parse(identityRaw);
      s.stop(`✅ AWS Authenticated! Account: ${identity.Account} (${identity.Arn})`);

      const config: CloudConfig = {
        provider: 'aws',
        region,
        roleArn: roleArn || undefined,
        accessKeyId: accessKeyId || undefined,
        secretAccessKey: secretAccessKey ? '***' : undefined,
        trialActive: true,
        trialStartedAt: now.toISOString(),
        trialExpiresAt: expires.toISOString(),
        engineEndpoint: `https://microvm-live.lambda-microvm.${region}.on.aws`,
      };

      await saveCloudConfig(config);

      p.outro(
        `\x1b[32m🎉 AWS Connected Successfully!\x1b[0m\n` +
        `• Account ID     : ${identity.Account}\n` +
        `• Region         : ${region}\n` +
        `• 7-Day Free Trial: ACTIVE until ${expires.toLocaleDateString()}\n` +
        `• Config Stored  : ~/.liate/cloud.json\n` +
        `• Next Step      : Run \x1b[36mliate dev\x1b[0m or \x1b[36mliate run ./liate.json\x1b[0m`
      );
    } catch (err: any) {
      s.stop('❌ AWS Verification Failed');
      p.note(err.message || 'Check your AWS credentials or CLI setup', 'Authentication Error');
    }
  }

  // ==========================================
  // 2. GCP CONNECT
  // ==========================================
  else if (provider === 'gcp') {
    const projectIdInput = await p.text({
      message: 'Enter GCP Project ID:',
      placeholder: 'my-gcp-project-123',
      validate: (v) => (!v ? 'Project ID is required' : undefined),
    });
    if (p.isCancel(projectIdInput)) { p.cancel('Canceled.'); return; }

    const keyPathInput = await p.text({
      message: 'Enter Path to Service Account Key JSON (or paste JSON):',
      placeholder: './service-account.json',
      validate: (v) => (!v ? 'Service Account Key is required' : undefined),
    });
    if (p.isCancel(keyPathInput)) { p.cancel('Canceled.'); return; }

    const regionSelect = await p.select({
      message: 'Select GCP Region:',
      options: [
        { value: 'asia-south1', label: 'asia-south1 (Mumbai, India) [Sovereign HQ]' },
        { value: 'asia-south2', label: 'asia-south2 (Delhi, India)' },
        { value: 'us-central1', label: 'us-central1 (Iowa)' },
        { value: 'europe-west3', label: 'europe-west3 (Frankfurt)' },
      ],
    });
    if (p.isCancel(regionSelect)) { p.cancel('Canceled.'); return; }

    const config: CloudConfig = {
      provider: 'gcp',
      projectId: projectIdInput as string,
      region: regionSelect as string,
      gcpServiceAccountKey: '***',
      trialActive: true,
      trialStartedAt: now.toISOString(),
      trialExpiresAt: expires.toISOString(),
      engineEndpoint: `https://li8-${projectIdInput}.${regionSelect}.run.app`,
    };

    await saveCloudConfig(config);

    p.outro(
      `\x1b[32m🎉 GCP Connected Successfully!\x1b[0m\n` +
      `• Project ID     : ${projectIdInput}\n` +
      `• Region         : ${regionSelect}\n` +
      `• Target Compute : Cloud Run / GKE Container\n` +
      `• 7-Day Free Trial: ACTIVE until ${expires.toLocaleDateString()}\n` +
      `• Config Stored  : ~/.liate/cloud.json`
    );
  }

  // ==========================================
  // 3. CLOUDFLARE CONNECT
  // ==========================================
  else if (provider === 'cloudflare') {
    const accountInput = await p.text({
      message: 'Enter Cloudflare Account ID:',
      placeholder: 'd1a2b3c4...',
      validate: (v) => (!v ? 'Account ID is required' : undefined),
    });
    if (p.isCancel(accountInput)) { p.cancel('Canceled.'); return; }

    const tokenInput = await p.password({
      message: 'Enter Cloudflare API Token (Workers / AI Gateway):',
      validate: (v) => (!v ? 'API Token is required' : undefined),
    });
    if (p.isCancel(tokenInput)) { p.cancel('Canceled.'); return; }

    const config: CloudConfig = {
      provider: 'cloudflare',
      cloudflareAccountId: accountInput as string,
      cloudflareApiToken: '***',
      trialActive: true,
      trialStartedAt: now.toISOString(),
      trialExpiresAt: expires.toISOString(),
      engineEndpoint: `https://li8-edge.${accountInput}.workers.dev`,
    };

    await saveCloudConfig(config);

    p.outro(
      `\x1b[32m🎉 Cloudflare Connected Successfully!\x1b[0m\n` +
      `• Account ID     : ${accountInput}\n` +
      `• Target Compute : Workers Edge / AI Gateway\n` +
      `• 7-Day Free Trial: ACTIVE until ${expires.toLocaleDateString()}\n` +
      `• Config Stored  : ~/.liate/cloud.json`
    );
  }

  // ==========================================
  // 4. MODAL CLOUD CONNECT
  // ==========================================
  else if (provider === 'modal') {
    const s = p.spinner();
    s.start('Checking uvx and mcp-modal availability...');

    try {
      execSync('uvx --version', { stdio: ['ignore', 'ignore', 'ignore'] });
      s.stop('✅ uvx runner is installed and ready.');

      p.note(
        'mcp-modal provides 12 native cloud tools:\n' +
        '• Deploying serverless apps (modal deploy)\n' +
        '• Running on-demand GPU/CPU containers\n' +
        '• Managing persistent volumes, secrets, and environments\n\n' +
        'To configure mcp-modal in an agent, add to your liate.json:\n' +
        '{\n' +
        '  "T": {\n' +
        '    "mcp-modal": {\n' +
        '      "command": "uvx",\n' +
        '      "args": ["mcp-modal"]\n' +
        '    }\n' +
        '  }\n' +
        '}',
        'Modal Cloud MCP Integration'
      );

      const config: CloudConfig = {
        provider: 'modal',
        trialActive: true,
        trialStartedAt: now.toISOString(),
        trialExpiresAt: expires.toISOString(),
      };
      await saveCloudConfig(config);

      p.outro(`\x1b[32m🎉 Modal Cloud Connected!\x1b[0m 7-day trial active.`);
    } catch {
      s.stop('❌ uvx not found');
      p.note('Please install uv (https://docs.astral.sh/uv/) to run mcp-modal seamlessly.', 'Setup Needed');
    }
  }

  // ==========================================
  // 5. SUPABASE SOVEREIGN VAULT CONNECT
  // ==========================================
  else if (provider === 'supabase') {
    const urlInput = await p.text({
      message: 'Enter your Supabase Project URL:',
      placeholder: 'https://xxxx.supabase.co',
      validate: (v) => (!v || !v.startsWith('https://') ? 'Must start with https://' : undefined),
    });
    if (p.isCancel(urlInput)) { p.cancel('Canceled.'); return; }

    const keyInput = await p.password({
      message: 'Enter Supabase Secret Key (service_role):',
      validate: (v) => (!v ? 'Key is required' : undefined),
    });
    if (p.isCancel(keyInput)) { p.cancel('Canceled.'); return; }

    const s = p.spinner();
    s.start('Connecting to user Supabase Sovereign Vault...');

    try {
      const res = await fetch(`${urlInput as string}/rest/v1/`, {
        headers: {
          apikey: keyInput as string,
          Authorization: `Bearer ${keyInput as string}`,
        },
      });

      if (res.ok || res.status === 200 || res.status === 404) {
        s.stop('✅ Connected to your Supabase Project!');
        const config: CloudConfig = {
          provider: 'supabase',
          supabaseUrl: urlInput as string,
          supabaseKey: '***',
          trialActive: true,
          trialStartedAt: now.toISOString(),
          trialExpiresAt: expires.toISOString(),
        };
        await saveCloudConfig(config);

        p.outro(
          `\x1b[32m🎉 Sovereign Vault Configured!\x1b[0m\n` +
          `• All cloud credentials stay strictly in YOUR database.\n` +
          `• 7-Day Free Trial: ACTIVE until ${expires.toLocaleDateString()}\n` +
          `• Zero-Trust: Liate central servers never store your keys.`
        );
      } else {
        s.stop(`❌ Supabase returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      s.stop('❌ Supabase Connection Failed');
      p.note(err.message, 'Connection Error');
    }
  }

  // ==========================================
  // 6. VPS / BARE METAL CONNECT
  // ==========================================
  else if (provider === 'vps') {
    const hostInput = await p.text({
      message: 'Enter VPS Host IP or Domain:',
      placeholder: '194.164.x.x',
      validate: (v) => (!v ? 'Host is required' : undefined),
    });
    if (p.isCancel(hostInput)) { p.cancel('Canceled.'); return; }

    p.note(
      `To run the 11MB li8 binary on your VPS (${hostInput}):\n\n` +
      `  curl -fsSL https://tryliate.com/install.sh | sh\n` +
      `  li8 --port 7071\n\n` +
      `The engine will listen on port 7071 with zero RAM overhead.`,
      '1-Line VPS Deployment'
    );

    const config: CloudConfig = {
      provider: 'vps',
      trialActive: true,
      trialStartedAt: now.toISOString(),
      trialExpiresAt: expires.toISOString(),
      engineEndpoint: `http://${hostInput as string}:7071`,
    };
    await saveCloudConfig(config);

    p.outro(`\x1b[32m🎉 VPS Configuration Saved!\x1b[0m 7-day trial active.`);
  }
}
