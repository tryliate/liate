import { Context } from 'hono';
import { getKeys, saveKey, deleteKey } from '@liate/store';

export async function listKeysHandler(c: Context) {
  const revealKey = c.req.query('revealKey');
  const allKeys = await getKeys();
  if (revealKey) {
    return c.json({ [revealKey]: allKeys[revealKey] || allKeys[revealKey.toLowerCase()] || '' });
  }
  return c.json(allKeys);
}

export async function saveKeyHandler(c: Context) {
  const body = await c.req.json();
  const { provider, key } = body;
  if (!provider || !key) return c.json({ error: 'Missing provider or key' }, 400);
  await saveKey(provider, key);
  return c.json({ status: 'saved', success: true });
}

export async function deleteKeyHandler(c: Context) {
  const key = c.req.query('key') || (await c.req.json().catch(() => ({}))).key;
  if (!key) return c.json({ error: 'Missing key parameter' }, 400);
  await deleteKey(key);
  return c.json({ status: 'deleted', success: true });
}
