// shared/middleware/security/security.context.ts

import { AsyncLocalStorage } from 'async_hooks';
import { SecurityUser } from './security.service';

export interface SecurityContext {
  user?: SecurityUser;
  sessionId?: string;
  traceId: string;
  requestId: string;
}

export class SecurityContextManager {
  private static instance: SecurityContextManager;
  private storage: AsyncLocalStorage<SecurityContext>;

  private constructor() {
    this.storage = new AsyncLocalStorage<SecurityContext>();
  }

  static getInstance(): SecurityContextManager {
    if (!SecurityContextManager.instance) {
      SecurityContextManager.instance = new SecurityContextManager();
    }
    return SecurityContextManager.instance;
  }

  getContext(): SecurityContext | undefined {
    return this.storage.getStore();
  }

  run(context: SecurityContext, callback: () => Promise<any>): Promise<any> {
    return this.storage.run(context, callback);
  }

  updateContext(partialContext: Partial<SecurityContext>): void {
    const currentContext = this.getContext();
    if (currentContext) {
      Object.assign(currentContext, partialContext);
    }
  }
}