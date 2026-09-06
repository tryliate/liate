import { getSkillMarkdown } from '../../store';
import { AumStreamType } from '../types';

export async function loadPillarSkills(
  skillsRef: string | string[] | undefined,
  agentName: string,
  cwd: string,
  log: (type: AumStreamType, msg: string) => void
): Promise<string> {
  let loadedSkillsContent = '';

  if (!skillsRef) return loadedSkillsContent;

  const rawSkills: string[] = Array.isArray(skillsRef)
    ? skillsRef
    : typeof skillsRef === 'string'
      ? skillsRef.split(',').map(s => s.trim()).filter(Boolean)
      : [];

  for (const skillRef of rawSkills) {
    try {
      const skillMd = await getSkillMarkdown(skillRef, agentName, cwd);

      if (skillMd) {
        loadedSkillsContent += `\n\n[PROCEDURAL SKILL: ${skillRef}]\n${skillMd}\n`;
        log('STATUS', `\x1b[1m[SKILL]\x1b[0m Loaded: \x1b[32m${skillRef}\x1b[0m (${skillMd.length} bytes)`);
      } else {
        log('STATUS', `\x1b[33m[SKILL]\x1b[0m Skill "${skillRef}" was not found in liate_skills.json or ~/.liate/skills.`);
      }
    } catch (err: any) {
      log('ERROR', `Failed loading skill "${skillRef}": ${err.message}`);
    }
  }

  return loadedSkillsContent;
}
