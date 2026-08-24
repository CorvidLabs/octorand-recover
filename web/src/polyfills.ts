import { Buffer } from 'buffer';

const globals = globalThis as typeof globalThis & {
    Buffer: typeof Buffer;
    global: typeof globalThis;
    process?: { env: Record<string, string | undefined> };
};

globals.Buffer = Buffer;
globals.global = globalThis;
if (globals.process === undefined) {
    globals.process = { env: {} };
}
