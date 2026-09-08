import fs from 'fs/promises';
import path from 'path';
import * as p from '@clack/prompts';
import { getAuthSession } from '@liate/store';
import { runConnectWizard } from '../connect';

/**
 * Deploys agent spec to connected cloud engine
 */
export async function deployCommand(args: string[]): Promise<void> {
  const session = await getAuthSession();
  if (!session) {
    console.log(`\n\x1b[31m❌ Not authenticated.\x1b[0m Please run \x1b[1mliate login\x1b[0m first.\n`);
    return;
  }

  const targetPath = args[1];
  const projectDir = targetPath ? path.resolve(process.cwd(), targetPath) : process.cwd();
  const manifestPath = path.join(projectDir, 'liate.json');

  let manifest: any = null;
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    console.log(`\n\x1b[31m❌ No liate.json found in ${projectDir}\x1b[0m`);
    console.log(`💡 Run \x1b[1mliate init\x1b[0m to create an agent first.\n`);
    return;
  }

  const agentName = manifest.name || manifest.A?.name || path.basename(projectDir);
  const version = manifest.version || '1.0.0';

  p.intro(`\x1b[1mLiate Deploy\x1b[0m — Registering \x1b[36m"${agentName}"\x1b[0m with Sovereign Engine`);
  const spin = p.spinner();
  spin.start(`Syncing agent spec to @${session.userId} Sovereign Engine...`);

  const baseEndpoint = (session.endpoint || process.env.LIATE_ENDPOINT || 'https://www.tryliate.com').replace(/\/$/, '');

  try {
    const cleanUser = session.userId.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const isCloudflare = session.engineUrl?.includes('workers.dev');
    const providerName = isCloudflare ? 'Cloudflare Workers (V8 Isolates)' : 'Vercel Edge Runtime';

    const res = await fetch(`${baseEndpoint}/api/cli/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({
        name: agentName,
        version,
        spec: manifest,
        engineUrl: session.engineUrl,
        provider: isCloudflare ? 'cloudflare' : 'vercel'
      })
    });

    if (res.ok) {
      const data = await res.json();
      const defaultUrl = isCloudflare 
        ? `https://liate-engine-${cleanUser}.${cleanUser}.workers.dev`
        : `https://liate-${cleanUser}.vercel.app`;
      const engineUrl = session.engineUrl || data.engineUrl || defaultUrl;
      const liveEndpoint = `${engineUrl}/lapi/v1/${agentName}/run`;
      const liveWs = `${engineUrl.replace(/^http/, 'ws')}/ws`;

      spin.stop(`✔ Agent \x1b[32;1m"${agentName}"\x1b[0m is LIVE on Sovereign Engine (${providerName})!`);

      console.log(`\n\x1b[1m🚀 LIVE PRODUCTION AGENT ENDPOINT:\x1b[0m`);
      console.log(`   \x1b[32;1m${liveEndpoint}\x1b[0m\n`);

      console.log(`  🌐 Sovereign Engine : \x1b[35m${engineUrl}\x1b[0m`);
      console.log(`  ☁️  Cloud Provider  : \x1b[36m${isCloudflare ? '🟠 Cloudflare Workers' : '▲ Vercel Edge'}\x1b[0m`);
      console.log(`  📡 WebSocket Stream : \x1b[34m${liveWs}\x1b[0m`);
      console.log(`  ⚡ Cold Boot        : \x1b[35m0ms (Global Anycast Edge CDN)\x1b[0m`);
      console.log(`  🔒 Environment      : \x1b[90m${isCloudflare ? 'liate-engine-workers' : `liate-engine-${cleanUser}`}\x1b[0m\n`);
    } else {
      const err = await res.json();
      spin.stop(`❌ Deployment failed: ${err.error || 'Server error'}`);
    }
  } catch (err: any) {
    spin.stop(`❌ Connection failed: ${err.message}`);
  }

}

/**
 * Runs the Sovereign Cloud Engine Connect wizard (Vercel / Cloudflare)
 */
export async function connectCommand(args: string[] = []): Promise<void> {
  const hasCloudflare = args.includes('--cloudflare') || args.includes('cloudflare');
  const hasVercel = args.includes('--vercel') || args.includes('vercel');
  const provider = hasCloudflare ? 'cloudflare' : (hasVercel ? 'vercel' : (args[1] || 'vercel'));
  await runConnectWizard({ provider, args });
}

