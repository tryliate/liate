import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { AGENTS_DIR, AGENTS_FILE } from './paths';

// Standard agent discovery locations (workspace agents directory + ~/.liate/agents)
const WORKSPACE_AGENTS_DIRS = [
  path.join(process.cwd(), 'agents'),
  path.join(process.cwd(), '.liate', 'agents'),
  path.join(process.cwd(), 'om', 'agents'),
  path.join(process.cwd(), '..', 'agents'),
];

export async function getInstalledAgents(): Promise<any[]> {
  let legacyAgents: any[] = [];
  try {
    const data = await fs.readFile(AGENTS_FILE, 'utf-8');
    legacyAgents = JSON.parse(data);
  } catch (e) {}
  
  const packageAgents: any[] = [];
  const searchDirs = [AGENTS_DIR, ...WORKSPACE_AGENTS_DIRS];

  for (const dir of searchDirs) {
    try {
      const folders = await fs.readdir(dir, { withFileTypes: true });
      for (const folder of folders) {
        if (folder.isDirectory()) {
          try {
            let manifestPath = path.join(dir, folder.name, 'liate.json');
            try { await fs.access(manifestPath); } catch {
              manifestPath = path.join(dir, folder.name, 'agent.liate');
              try { await fs.access(manifestPath); } catch {
                manifestPath = path.join(dir, folder.name, `${folder.name}.liate`);
              }
            }

            const manifestData = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestData);
            
            const agentObj: any = {
              id: manifest.id || folder.name,
              name: manifest.name || manifest.A?.name || folder.name,
              created_at: manifest.created_at || 'Local Active',
              spec: manifest.spec ? JSON.parse(JSON.stringify(manifest.spec)) : (manifest.L ? JSON.parse(JSON.stringify(manifest)) : undefined)
            };

            if (manifest.L && !agentObj.L) {
              agentObj.L = manifest.L;
              agentObj.I = manifest.I;
              agentObj.A = manifest.A;
              agentObj.T = manifest.T;
              agentObj.E = manifest.E;
            }
            
            if (!packageAgents.some(a => a.id === agentObj.id || a.name === agentObj.name)) {
              packageAgents.push(agentObj);
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
  }
  
  const merged = [...packageAgents];
  for (const legacy of legacyAgents) {
    if (!merged.some(a => a.id === legacy.id || a.name === legacy.name)) {
      merged.push(legacy);
    }
  }
  
  return merged;
}

export async function installAgent(agent: any): Promise<void> {
  const agents = await getInstalledAgents();
  if (!agents.some((a: any) => a.id === agent.id)) {
    let legacyAgents: any[] = [];
    try {
      const data = await fs.readFile(AGENTS_FILE, 'utf-8');
      legacyAgents = JSON.parse(data);
    } catch(e) {}
    legacyAgents.push(agent);
    await fs.writeFile(AGENTS_FILE, JSON.stringify(legacyAgents, null, 2), 'utf-8');
  }
}

export async function uninstallAgent(id: string): Promise<void> {
  let legacyAgents: any[] = [];
  try {
    const data = await fs.readFile(AGENTS_FILE, 'utf-8');
    legacyAgents = JSON.parse(data);
  } catch(e) {}
  legacyAgents = legacyAgents.filter((a: any) => a.id !== id && a.name !== id);
  await fs.writeFile(AGENTS_FILE, JSON.stringify(legacyAgents, null, 2), 'utf-8');
  
  try {
    const folders = await fs.readdir(AGENTS_DIR, { withFileTypes: true });
    for (const folder of folders) {
      if (folder.isDirectory() && (folder.name === id || folder.name.toLowerCase() === id.toLowerCase())) {
        await fs.rm(path.join(AGENTS_DIR, folder.name), { recursive: true, force: true });
      }
    }
  } catch (e) {}
}

export async function exportAgent(id: string): Promise<Buffer> {
  const agents = await getInstalledAgents();
  const agent = agents.find((a: any) => a.id === id || a.name === id);
  if (!agent) throw new Error(`Agent ${id} not found`);

  const safeName = (agent.name || id).replace(/[^a-z0-9-]/gi, '_').toLowerCase();
  const agentFolderPath = path.join(AGENTS_DIR, safeName);
  
  let exists = false;
  try {
    const stats = await fs.stat(agentFolderPath);
    exists = stats.isDirectory();
  } catch(e) {}

  if (!exists) {
    await fs.mkdir(agentFolderPath, { recursive: true });
    const liateJson = agent.spec || agent;
    await fs.writeFile(path.join(agentFolderPath, 'liate.json'), JSON.stringify(liateJson, null, 2), 'utf-8');
    if (agent.prompt) {
      await fs.writeFile(path.join(agentFolderPath, 'skills.md'), agent.prompt, 'utf-8');
    }
  }

  const zip = new AdmZip();
  zip.addLocalFolder(agentFolderPath, safeName);
  return zip.toBuffer();
}

export async function importAgent(base64Data: string): Promise<void> {
  const buffer = Buffer.from(base64Data, 'base64');
  const zip = new AdmZip(buffer);
  
  const tempDir = path.join(os.tmpdir(), `om-import-${Date.now()}`);
  zip.extractAllTo(tempDir, true);
  
  let extractedPath = tempDir;
  const entries = await fs.readdir(tempDir, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    extractedPath = path.join(tempDir, entries[0].name);
  }
  
  try {
    let liateJsonPath = path.join(extractedPath, 'liate.json');
    try { await fs.access(liateJsonPath); } catch {
      let agentLiate = path.join(extractedPath, 'agent.liate');
      try { await fs.access(agentLiate); liateJsonPath = agentLiate; } catch {
        const files = await fs.readdir(extractedPath);
        const liateFile = files.find(f => f.endsWith('.liate') || f.endsWith('liate.json'));
        if (liateFile) {
          liateJsonPath = path.join(extractedPath, liateFile);
        }
      }
    }
    const liateData = await fs.readFile(liateJsonPath, 'utf-8');
    const manifest = JSON.parse(liateData);
    
    const safeName = (manifest.name || manifest.A?.name || 'imported-agent').replace(/[^a-z0-9-]/gi, '_').toLowerCase();
    const targetPath = path.join(AGENTS_DIR, safeName);
    
    await fs.cp(extractedPath, targetPath, { recursive: true });
  } catch (e: any) {
    throw new Error(`Invalid agent package: missing agent manifest. ${e.message}`);
  }
}

export async function saveAgent(name: string, graphPayload: any): Promise<void> {
  const safeName = name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const agentDir = path.join(AGENTS_DIR, safeName);
  const skillsDir = path.join(agentDir, 'skills');
  
  await fs.mkdir(agentDir, { recursive: true });

  const payloadToSave = JSON.parse(JSON.stringify(graphPayload));

  if (payloadToSave.nodes && Array.isArray(payloadToSave.nodes)) {
    for (const node of payloadToSave.nodes) {
      if (node.type === 'skill' && node.data) {
        await fs.mkdir(skillsDir, { recursive: true });
        
        const skillName = node.data.skillName || `skill_${node.id}`;
        const skillPath = path.join(skillsDir, `${skillName}.md`);
        
        await fs.writeFile(skillPath, node.data.instructions || '', 'utf-8');
        
        node.data.skillFile = `skills/${skillName}.md`;
        delete node.data.instructions;
      }
    }
  }

  const manifestPath = path.join(agentDir, 'liate.json');
  await fs.writeFile(manifestPath, JSON.stringify(payloadToSave, null, 2), 'utf-8');
}

export async function loadAgent(name: string): Promise<any> {
  const agents = await getInstalledAgents();
  const found = agents.find(a => a.name === name || a.id === name || a.name?.toLowerCase() === name.toLowerCase());
  if (found) return found;

  const safeName = name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const agentDir = path.join(AGENTS_DIR, safeName);
  let manifestPath = path.join(agentDir, 'liate.json');
  try { await fs.access(manifestPath); } catch {
    manifestPath = path.join(agentDir, 'agent.liate');
    try { await fs.access(manifestPath); } catch {
      manifestPath = path.join(agentDir, `${safeName}.liate`);
    }
  }
  
  try {
    const data = await fs.readFile(manifestPath, 'utf-8');
    const payload = JSON.parse(data);

    if (payload.nodes && Array.isArray(payload.nodes)) {
      for (const node of payload.nodes) {
        if (node.type === 'skill' && node.data && node.data.skillFile) {
          try {
            const skillPath = path.join(agentDir, node.data.skillFile);
            const instructions = await fs.readFile(skillPath, 'utf-8');
            node.data.instructions = instructions;
          } catch (e) {
            console.error(`Failed to load skill file for node ${node.id}:`, e);
          }
        }
      }
    }

    return payload;
  } catch {
    return null;
  }
}

export async function listAgents(): Promise<string[]> {
  const agents = await getInstalledAgents();
  return agents.map(a => a.name || a.id || a.A?.name);
}
