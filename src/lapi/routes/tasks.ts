import { Context } from 'hono';
import { LiateTask, LiateTaskManager } from '../../oop/Liate_Orchestration/LiateTask';
import { loadAgent } from '../../store';

export async function dispatchTaskHandler(c: Context) {
  const agentId = c.req.param('agent_id') || 'default';
  let body: any = {};
  try { body = await c.req.json(); } catch {}

  const prompt = body.prompt;
  if (!prompt) return c.json({ error: 'Missing prompt in request body' }, 400);

  const task = new LiateTask({
    agent: agentId,
    prompt,
    priority: body.priority,
    session: body.session || body.session_id
  });

  LiateTaskManager.register(task);
  // Launch in background asynchronously
  task.start().catch(() => {});

  return c.json({
    status: 'queued',
    taskId: task.id,
    task: task.record
  }, 202);
}

export async function listTasksHandler(c: Context) {
  const tasks = await LiateTaskManager.list();
  return c.json(tasks);
}

export async function getTaskHandler(c: Context) {
  const taskId = c.req.param('task_id');
  if (!taskId) return c.json({ error: 'Missing task_id' }, 400);

  const activeTask = LiateTaskManager.get(taskId);
  if (activeTask) {
    return c.json(activeTask.record);
  }

  const loaded = await LiateTaskManager.load(taskId);
  if (!loaded) return c.json({ error: `Task "${taskId}" not found` }, 404);
  return c.json(loaded);
}

export async function cancelTaskHandler(c: Context) {
  const taskId = c.req.param('task_id');
  if (!taskId) return c.json({ error: 'Missing task_id' }, 400);

  const activeTask = LiateTaskManager.get(taskId);
  if (activeTask) {
    activeTask.cancel();
    return c.json({ status: 'cancelled', taskId, success: true });
  }

  return c.json({ error: `Task "${taskId}" is not currently running` }, 404);
}
