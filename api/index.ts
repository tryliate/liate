import { handle } from 'hono/vercel';
import { createLapiApp, WSHub } from '../src/lapi';

const wsHub = new WSHub();
const app = createLapiApp(wsHub);

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
export const OPTIONS = handle(app);
