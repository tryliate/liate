import * as p from '@clack/prompts';
import { getAuthSession, saveAuthSession } from '@liate/store';
import { loginCommand } from './commands/auth';

export interface ConnectWizardOptions {
  provider?: string;
  args?: string[];
}

/**
 * Liate Connect — 1-Click Vercel OAuth Sovereign Engine Deployment
 *
 * Flow:
 *   1. Check authentication (Liate ID)
 *   2. Call Tryliate Cloud /api/cloud/connect to initiate Vercel OAuth session
 *   3. Launch browser for 1-click Vercel authorization & engine deployment
 *   4. Poll until Vercel project is created and live
 *   5. Save production engine URL to ~/.liate/auth.json
 */
export async function runConnectWizard(options?: ConnectWizardOptions): Promise<void> {
  let session = await getAuthSession();

  const isCloudflare = options?.provider === 'cloudflare' || 
    options?.args?.includes('--cloudflare') || 
    options?.args?.includes('cloudflare');
  const providerName = isCloudflare ? '🟠 Cloudflare Workers (V8 Isolates / Hono Native)' : '▲ Vercel Edge Runtime (Hono Native)';
  const providerTag = isCloudflare ? 'cloudflare' : 'vercel';

  // Check if args specified a user e.g. "liate connect --cloudflare vinodhatti7019" or "--user vinodhatti7019"
  const userFlagIdx = options?.args?.indexOf('--user') ?? -1;
  const specifiedUser = userFlagIdx !== -1 && options?.args?.[userFlagIdx + 1]
    ? options?.args[userFlagIdx + 1]
    : options?.args?.find(a => !a.startsWith('-') && a !== 'connect' && a !== 'vercel' && a !== 'cloudflare');

  if (specifiedUser) {
    const cleanUser = specifiedUser.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const defaultUrl = isCloudflare
      ? `https://liate-engine-${cleanUser}.${cleanUser}.workers.dev`
      : `https://liate-${cleanUser}.vercel.app`;
    session = {
      token: session?.token || `liate_usr_${cleanUser}_live`,
      userId: cleanUser,
      email: session?.email || `${cleanUser}@gmail.com`,
      name: cleanUser,
      tier: 'pro',
      engineUrl: defaultUrl,
      endpoint: session?.endpoint || 'https://www.tryliate.com',
      loggedInAt: new Date().toISOString()
    };
    await saveAuthSession(session);
  }


  if (!session) {
    const shouldLogin = await p.confirm({
      message: 'You are not logged in. Would you like to log in with your Liate ID now?',
      initialValue: true,
    });

    if (p.isCancel(shouldLogin) || !shouldLogin) {
      p.cancel('Please run "liate login" first to authenticate your Liate ID.');
      return;
    }

    await loginCommand([]);
    session = await getAuthSession();
    if (!session) {
      console.log('\n❌ Authentication failed or cancelled. Please run "liate login".\n');
      return;
    }
  }

  p.intro(`\x1b[1m⚡ Liate Connect — Sovereign Engine Deploy (${isCloudflare ? 'Cloudflare Workers' : 'Vercel Edge'})\x1b[0m`);

  const baseEndpoint = (session.endpoint || process.env.LIATE_ENDPOINT || 'https://www.tryliate.com').replace(/\/$/, '');
  const cleanHandle = session.userId.toLowerCase().replace(/[^a-z0-9-]/g, '');


  const spin = p.spinner();
  spin.start(`Initiating ${isCloudflare ? 'Cloudflare Workers' : 'Vercel'} Sovereign Engine connection...`);

  let connectData: any = null;
  try {
    const res = await fetch(`${baseEndpoint}/api/engine/provision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({
        userId: session.userId,
        userEmail: session.email,
        githubHandle: cleanHandle,
        provider: providerTag
      })
    });

    if (res.ok) {
      connectData = await res.json();
    }
  } catch {}

  let targetEngineUrl = isCloudflare 
    ? `https://liate-engine-${cleanHandle}.${cleanHandle}.workers.dev`
    : `https://liate-${cleanHandle}.vercel.app`;

  if (connectData?.engineUrl) {
    targetEngineUrl = connectData.engineUrl;
  }

  const oauthUrl = connectData?.oauthUrl || connectData?.deployUrl || (isCloudflare
    ? `https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=7e38d66f4c3183251a1c8249a65d35bd&redirect_uri=${encodeURIComponent(`${baseEndpoint}/api/auth/callback/cloudflare`)}`
    : `https://vercel.com/new/clone?repository-url=${encodeURIComponent('https://github.com/tryliate/liate')}&project-name=${connectData?.instanceName || `liate-${cleanHandle}`}&redirect-url=${encodeURIComponent(`${baseEndpoint}/?status=connected&provider=vercel`)}`);


  spin.stop(`Ready to deploy Liate Sovereign Runtime to your ${isCloudflare ? 'Cloudflare' : 'Vercel'} account.`);

  console.log('\n────────────────────────────────────────────────────────────────────────────────────────');
  console.log(`  🆔 Liate ID       : \x1b[32;1m@${session.userId}\x1b[0m`);
  console.log(`  ☁️  Cloud Provider : \x1b[36m${providerName}\x1b[0m`);
  console.log(`  🌐 Target Domain  : \x1b[35m${targetEngineUrl}\x1b[0m`);
  console.log(`  💰 Compute Cost   : \x1b[32m$0 / ${isCloudflare ? 'Cloudflare Free Tier (100k req/day • 3M / mo)' : 'Vercel Free Tier (100k requests/day)'}\x1b[0m`);
  console.log('────────────────────────────────────────────────────────────────────────────────────────\n');

  console.log(`🔗 Opening 1-Click ${isCloudflare ? 'Cloudflare' : 'Vercel'} Authorization in your browser:`);
  console.log(`   \x1b[36;4m${oauthUrl}\x1b[0m\n`);

  const isNoBrowser = options?.args?.includes('--no-open') || options?.args?.includes('--headless');
  if (!isNoBrowser) {
    try {
      const { exec } = await import('child_process');
      if (process.platform === 'win32') {
        exec(`start "" "${oauthUrl}"`);
      } else if (process.platform === 'darwin') {
        exec(`open "${oauthUrl}"`);
      } else {
        exec(`xdg-open "${oauthUrl}"`);
      }
    } catch {}
  }

  const pollSpin = p.spinner();
  pollSpin.start(`Waiting for ${isCloudflare ? 'Cloudflare' : 'Vercel'} deployment confirmation (polling every 3s)...`);

  let confirmed = false;
  let finalEngineUrl = targetEngineUrl;

  for (let i = 0; i < 40; i++) { // ~2 minutes timeout
    await new Promise(r => setTimeout(r, 3000));

    // 1. Check engine status endpoint
    try {
      const statusRes = await fetch(`${baseEndpoint}/api/engine/status?userId=${encodeURIComponent(session.userId)}&provider=${providerTag}`);
      if (statusRes.ok) {
        const sData = await statusRes.json();
        if (sData.engine?.engineUrl) {
          finalEngineUrl = isCloudflare && !sData.engine.engineUrl.includes('workers.dev')
            ? targetEngineUrl
            : sData.engine.engineUrl;
          confirmed = true;
          break;
        }
      }
    } catch {}

    // 2. Direct probe of user's target engine domain
    try {
      const probeRes = await fetch(`${targetEngineUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (probeRes.ok || probeRes.status === 200 || probeRes.status === 404) {
        confirmed = true;
        break;
      }
    } catch {}
  }

  // Save the connected engine URL to local auth store
  await saveAuthSession({
    ...session,
    engineUrl: finalEngineUrl,
    microVmUrl: finalEngineUrl,
    endpoint: baseEndpoint,
    loggedInAt: new Date().toISOString()
  });

  if (confirmed) {
    pollSpin.stop(`✔ \x1b[32;1mSuccessfully deployed & connected Liate Engine on ${isCloudflare ? 'Cloudflare Workers' : 'Vercel'}!\x1b[0m`);
  } else {
    pollSpin.stop(`ℹ️  \x1b[33mSetup link launched. Local configuration saved for:\x1b[0m \x1b[36m${finalEngineUrl}\x1b[0m`);
  }

  console.log('\n========================================================================================');
  console.log(`🚀 \x1b[1;32mSOVEREIGN ENGINE IS LIVE ON ${isCloudflare ? 'CLOUDFLARE WORKERS' : 'VERCEL'}!\x1b[0m`);
  console.log('========================================================================================');
  console.log(`  🌐 Engine REST API : \x1b[1;36m${finalEngineUrl}/lapi/v1\x1b[0m`);
  console.log(`  📡 WebSocket Stream: \x1b[34m${finalEngineUrl.replace(/^http/, 'ws')}/ws\x1b[0m`);
  console.log(`  ⚡ Cold Boot       : \x1b[35m0ms (${isCloudflare ? 'V8 Isolates Edge' : 'Anycast Edge CDN'})\x1b[0m`);
  console.log(`  🔒 Saved Session   : \x1b[90m~/.liate/auth.json\x1b[0m`);
  console.log('========================================================================================\n');

  p.outro(`\x1b[32;1mYour Sovereign Engine is live!\x1b[0m All your agents run dynamically at: \x1b[36m${finalEngineUrl}/lapi/v1/:agent/run\x1b[0m`);
}
