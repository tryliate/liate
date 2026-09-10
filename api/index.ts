import { handle } from 'hono/vercel';
import { createLiateApp } from '../packages/server/src/index';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const app = createLiateApp();

export default handle(app);


