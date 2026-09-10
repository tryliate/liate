import { handle } from 'hono/vercel';
import { createLiateApp } from '../packages/server/src/index';

export const config = {
  runtime: 'edge',
};

const app = createLiateApp();

export default handle(app);


