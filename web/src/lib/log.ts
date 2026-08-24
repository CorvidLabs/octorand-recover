import { signal } from '@angular/core';

export const debugLogs = signal<string[]>([]);

function replace(_key: string, value: unknown): unknown {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value instanceof Uint8Array) {
        return `0x${[...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            ...(value as unknown as Record<string, unknown>),
        };
    }
    return value;
}

export function log(label: string, data?: unknown): void {
    const time = new Date().toISOString().slice(11, 23);
    let extra = '';
    if (data !== undefined) {
        try {
            extra = ` ${JSON.stringify(data, replace)}`;
        } catch {
            extra = ` ${String(data)}`;
        }
        if (extra.length > 4000) {
            extra = `${extra.slice(0, 4000)}…`;
        }
    }
    const line = `${time} ${label}${extra}`;
    console.log(`[octorand] ${label}`, data ?? '');
    debugLogs.update((rows) => [...rows.slice(-120), line]);
}

export function logError(label: string, error: unknown): void {
    const dump = dumpError(error);
    console.error(`[octorand] ${label}`, error, dump);
    log(`${label} ERROR`, dump);
}

export function dumpError(error: unknown): Record<string, unknown> {
    if (error === null || error === undefined) {
        return { error: String(error) };
    }
    if (typeof error !== 'object') {
        return { error: String(error) };
    }
    const record = error as Record<string, unknown>;
    const body = decodeBody(record['body']) ?? decodeBody((record['response'] as Record<string, unknown> | undefined)?.['body']);
    return {
        name: record['name'],
        message: record['message'],
        status: record['status'] ?? (record['response'] as Record<string, unknown> | undefined)?.['status'],
        body,
        keys: Object.keys(record),
        response: record['response'] instanceof Object
            ? {
                  status: (record['response'] as Record<string, unknown>)['status'],
                  text: (record['response'] as Record<string, unknown>)['text'],
                  message: (record['response'] as Record<string, unknown>)['message'],
                  body: decodeBody((record['response'] as Record<string, unknown>)['body']),
              }
            : record['response'],
    };
}

function decodeBody(body: unknown): unknown {
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return body.slice(0, 800);
        }
    }
    if (body instanceof Uint8Array) {
        const text = new TextDecoder().decode(body);
        try {
            return JSON.parse(text);
        } catch {
            return text.slice(0, 800);
        }
    }
    return body;
}
