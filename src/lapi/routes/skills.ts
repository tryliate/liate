import { Context } from 'hono';
import { getInstalledSkills, getSkillMarkdown, installSkill, uninstallSkill } from '../../store';

export async function listSkillsHandler(c: Context) {
  const skillName = c.req.query('skill');
  if (skillName) {
    const code = await getSkillMarkdown(skillName);
    return c.json({
      name: skillName,
      files: [
        { path: 'SKILL.md', contents: code || `# Skill: ${skillName}\n\nAutonomous agent skill.` }
      ]
    });
  }
  return c.json(await getInstalledSkills());
}

export async function saveSkillHandler(c: Context) {
  const body = await c.req.json();
  const name = body.name;
  if (!name) return c.json({ error: 'Missing skill name' }, 400);
  const mdContent = body.markdown || body.content || body.instructions || `# Skill: ${name}\n\n${body.description || ''}`;
  const saved = await installSkill(name, mdContent, body.description || '');
  return c.json({ success: true, markdown: saved });
}

export async function deleteSkillHandler(c: Context) {
  const name = c.req.param('name');
  if (!name) return c.json({ error: 'Missing skill name' }, 400);
  await uninstallSkill(name);
  return c.json({ success: true });
}
