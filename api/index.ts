import { handle } from 'hono/vercel';
import { createLapiApp } from '../src/lapi';

const app = createLapiApp();

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
export const OPTIONS = handle(app);
