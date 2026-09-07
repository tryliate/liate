import { handle } from 'hono/vercel';
// @ts-ignore
import { createLapiApp, WSHub } from '../dist/index.js';

const wsHub = new WSHub();
const app = createLapiApp(wsHub);
const handler = handle(app as any);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export default handler;

