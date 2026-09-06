/**
 * Programmatic Deno Deploy Deployment Script for Liate
 * 
 * Usage:
 *   bun run scripts/deploy-deno.ts
 *   or
 *   deno run -A scripts/deploy-deno.ts [--token=<YOUR_TOKEN>] [--project=liate]
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_URL = 'https://github.com/tryliate/liate';
const PROJECT_NAME = process.env.DENO_PROJECT || 'liate';
const TOKEN = process.env.DENO_DEPLOY_TOKEN || process.env.DENO_TOKEN;

async function deploy() {
  console.log('\n================================================================================');
  console.log('🚀 LIATE SOVEREIGN EDGE — PROGRAMMATIC DENO DEPLOY PIPELINE');
  console.log('================================================================================');
  console.log(`📦 Target Repository : ${REPO_URL}`);
  console.log(`🌐 Project Name      : ${PROJECT_NAME}`);
  console.log(`⚡ Edge Entrypoint   : main.ts (Dual-native Hono + Deno.serve)`);
  console.log('================================================================================\n');

  if (TOKEN) {
    console.log('🔑 Deploy token detected in environment. Deploying directly via DeployCTL CLI...');
    try {
      execSync(
        `deno run -A jsr:@deno/deployctl deploy --project=${PROJECT_NAME} --token=${TOKEN} --prod main.ts`,
        { stdio: 'inherit' }
      );
      console.log(`\n✅ Production Edge Deployment SUCCESS!`);
      console.log(`🔗 Live URL: https://${PROJECT_NAME}.deno.dev`);
      console.log(`🩺 Health check: curl https://${PROJECT_NAME}.deno.dev/health\n`);
      return;
    } catch (err: any) {
      console.error(`❌ CLI deployment failed: ${err.message}`);
    }
  }

  // Fallback: Automated GitHub OAuth 1-Click flow URL
  const instantUrl = `https://dash.deno.com/new?url=${encodeURIComponent(REPO_URL)}`;
  console.log('ℹ️  No DENO_DEPLOY_TOKEN found in environment.');
  console.log('⚡ Automatic GitHub OAuth 1-Click URL:');
  console.log(`\n👉 \x1b[36m${instantUrl}\x1b[0m\n`);
  console.log('This automatically connects your GitHub repo and pre-configures main.ts.\n');
}

deploy().catch(console.error);
