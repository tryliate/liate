import { createLiateApp } from '../packages/server/src/index.ts';

const app = createLiateApp();

export default {
  fetch(request: Request, env: any, ctx: any) {
    return app.fetch(request, env, ctx);
  }
};
