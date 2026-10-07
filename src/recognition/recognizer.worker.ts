// Entry point of the recognition Web Worker. Keep it tiny: all logic lives in workerHost.ts.
import { attachHost } from './workerHost';
import type { HostScope } from './workerHost';
import { registry } from './workerRegistry';

attachHost(self as unknown as HostScope, registry);