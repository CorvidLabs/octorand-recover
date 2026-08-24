import algosdk from 'algosdk';
import {
    compareByExtractable,
    decodePrimeState,
    generationFromUnit,
    isLockedVaultAsset,
    isOctorandPrime,
    maybePrimeAssetId,
    type PrimeGeneration,
    type PrimeState,
    type VaultHolding,
} from './octorand';
import { log, logError } from './log';

export const INDEXER_URL = 'https://mainnet-idx.algonode.cloud';

export interface PrimeRecord {
    assetId: number;
    amount: number;
    name: string;
    unit: string;
    generation: PrimeGeneration;
    appId: number;
    vaultAddress: string;
    state: PrimeState;
    vaultAlgo: number;
    vaultMinBalance: number;
    vaultOcto: number;
    holdings: VaultHolding[];
}

interface IndexerAsset {
    index?: number;
    'asset-id'?: number;
    amount?: number;
    deleted?: boolean;
    'opted-out-at-round'?: number;
    params?: {
        name?: string;
        'unit-name'?: string;
        decimals?: number;
        total?: number;
        creator?: string;
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null) {
        return value as Record<string, unknown>;
    }
    return {};
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

async function getJson(path: string): Promise<Record<string, unknown>> {
    const url = path.startsWith('http') ? path : `${INDEXER_URL}${path}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.status === 429) {
                log('indexer 429, retrying', { url, attempt });
                await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
                continue;
            }
            if (response.status === 404) {
                log('indexer 404', url);
                throw new Error(`Indexer 404 for ${url}`);
            }
            if (!response.ok) {
                const detail = await response.text();
                log('indexer HTTP error', { url, status: response.status, detail: detail.slice(0, 500) });
                throw new Error(`Indexer ${response.status} for ${url}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
            }
            return asRecord(await response.json());
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : '';
            if (!message.includes('Indexer 404')) {
                logError('indexer', error);
            }
            if (message.includes('Indexer 404') || message.includes('Indexer 400')) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Indexer request failed');
}

async function paged(path: string, key: string): Promise<unknown[]> {
    const out: unknown[] = [];
    let next: string | undefined;
    while (true) {
        const joiner = path.includes('?') ? '&' : '?';
        const url = next ? `${path}${joiner}next=${encodeURIComponent(next)}` : path;
        const data = await getJson(url);
        out.push(...asArray(data[key]));
        next = typeof data['next-token'] === 'string' ? data['next-token'] : undefined;
        if (next === undefined) {
            break;
        }
    }
    return out;
}

function b64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

export async function lookupAsset(assetId: number): Promise<{
    name: string;
    unit: string;
    decimals: number;
    total: number;
    creator: string;
}> {
    const data = await getJson(`/v2/assets/${assetId}`);
    const asset = asRecord(data['asset']);
    const params = asRecord(asset['params']);
    return {
        name: typeof params['name'] === 'string' ? params['name'] : '',
        unit: typeof params['unit-name'] === 'string' ? params['unit-name'] : '',
        decimals: typeof params['decimals'] === 'number' ? params['decimals'] : 0,
        total: typeof params['total'] === 'number' ? params['total'] : 0,
        creator: typeof params['creator'] === 'string' ? params['creator'] : '',
    };
}

export async function accountAssetIds(address: string): Promise<Array<{ assetId: number; amount: number }>> {
    const rows = await paged(`/v2/accounts/${address}/assets?limit=1000`, 'assets');
    const held: Array<{ assetId: number; amount: number }> = [];
    for (const row of rows) {
        const asset = asRecord(row);
        const amount = typeof asset['amount'] === 'number' ? asset['amount'] : 0;
        const assetId = typeof asset['asset-id'] === 'number' ? asset['asset-id'] : 0;
        if (assetId > 0 && amount > 0 && asset['deleted'] !== true) {
            held.push({ assetId, amount });
        }
    }
    return held;
}

export async function accountHoldsAsset(address: string, assetId: number): Promise<boolean> {
    const held = await accountAssetIds(address);
    return held.some((item) => item.assetId === assetId && item.amount > 0);
}

async function applicationGlobal(appId: number): Promise<{ p1: Uint8Array; p2: Uint8Array } | undefined> {
    const data = await getJson(`/v2/applications/${appId}`);
    const application = asRecord(data['application']);
    const params = asRecord(application['params']);
    const state = asArray(params['global-state']);
    const decoded: Record<string, Uint8Array> = {};
    for (const entry of state) {
        const item = asRecord(entry);
        const key = typeof item['key'] === 'string' ? new TextDecoder().decode(b64ToBytes(item['key'])) : '';
        const value = asRecord(item['value']);
        if (typeof value['bytes'] === 'string') {
            decoded[key] = b64ToBytes(value['bytes']);
        }
    }
    if (decoded['P1'] !== undefined && decoded['P2'] !== undefined) {
        return { p1: decoded['P1'], p2: decoded['P2'] };
    }
    return undefined;
}

export async function findPrimeAppId(assetId: number): Promise<number | undefined> {
    let next: string | undefined;
    for (let page = 0; page < 6; page += 1) {
        const suffix = next === undefined ? '' : `&next=${encodeURIComponent(next)}`;
        const data = await getJson(`/v2/transactions?asset-id=${assetId}&limit=30${suffix}`);
        const transactions = asArray(data['transactions']);
        for (const row of transactions) {
            const tx = asRecord(row);
            if (tx['tx-type'] !== 'appl') {
                continue;
            }
            const appl = asRecord(tx['application-transaction']);
            const appId = typeof appl['application-id'] === 'number' ? appl['application-id'] : 0;
            const created = typeof tx['created-application-index'] === 'number' ? tx['created-application-index'] : 0;
            const candidates = [created, appId, ...asArray(appl['foreign-apps']).filter((id): id is number => typeof id === 'number')];
            for (const candidate of candidates) {
                if (candidate <= 0) {
                    continue;
                }
                const global = await applicationGlobal(candidate);
                if (global !== undefined) {
                    return candidate;
                }
            }
        }
        next = typeof data['next-token'] === 'string' ? data['next-token'] : undefined;
        if (next === undefined) {
            break;
        }
    }
    return undefined;
}

async function vaultHoldings(vaultAddress: string, prime: PrimeState): Promise<VaultHolding[]> {
    const data = await getJson(`/v2/accounts/${vaultAddress}`);
    const account = asRecord(data['account']);
    const assets = asArray(account['assets']);
    const live: Array<{ assetId: number; amount: number }> = [];
    for (const row of assets) {
        const asset = asRecord(row) as IndexerAsset;
        const assetId = asset['asset-id'] ?? 0;
        const amount = asset.amount ?? 0;
        if (
            assetId > 0 &&
            amount > 0 &&
            asset.deleted !== true &&
            asset['opted-out-at-round'] === undefined
        ) {
            live.push({ assetId, amount });
        }
    }
    const holdings: VaultHolding[] = [];
    for (const item of live) {
        const params = await lookupAsset(item.assetId);
        holdings.push({
            assetId: item.assetId,
            amount: item.amount,
            name: params.name,
            unit: params.unit,
            decimals: params.decimals,
            total: params.total,
            locked: isLockedVaultAsset(item.assetId, prime),
            nestedPrime: isOctorandPrime(params.name, params.unit),
        });
    }
    holdings.sort((left, right) => {
        if (left.locked !== right.locked) {
            return left.locked ? 1 : -1;
        }
        return left.name.localeCompare(right.name);
    });
    return holdings;
}

export async function loadPrime(assetId: number, heldAmount: number): Promise<PrimeRecord | undefined> {
    const params = await lookupAsset(assetId);
    if (!isOctorandPrime(params.name, params.unit)) {
        return undefined;
    }
    const appId = await findPrimeAppId(assetId);
    if (appId === undefined) {
        return undefined;
    }
    const global = await applicationGlobal(appId);
    if (global === undefined) {
        return undefined;
    }
    const state = decodePrimeState(global.p1);
    const vaultAddress = algosdk.getApplicationAddress(appId).toString();
    const vaultInfo = await getJson(`/v2/accounts/${vaultAddress}`);
    const vaultAccount = asRecord(vaultInfo['account']);
    const vaultAlgo = typeof vaultAccount['amount'] === 'number' ? vaultAccount['amount'] : 0;
    const vaultMinBalance = typeof vaultAccount['min-balance'] === 'number' ? vaultAccount['min-balance'] : 0;
    const holdings = await vaultHoldings(vaultAddress, state);
    const octoHolding = holdings.find((holding) => holding.assetId === state.octoAssetId);
    return {
        assetId,
        amount: heldAmount,
        name: params.name,
        unit: params.unit,
        generation: generationFromUnit(params.unit, params.name),
        appId,
        vaultAddress,
        state,
        vaultAlgo,
        vaultMinBalance,
        vaultOcto: octoHolding?.amount ?? 0,
        holdings,
    };
}

export async function scanAddressForPrimes(address: string, onProgress?: (message: string) => void): Promise<PrimeRecord[]> {
    onProgress?.('Reading wallet assets…');
    const held = await accountAssetIds(address);
    const candidates = held.filter((item) => maybePrimeAssetId(item.assetId));
    onProgress?.(`Checking ${candidates.length} possible Primes…`);
    const primes: PrimeRecord[] = [];
    for (const candidate of candidates) {
        try {
            const prime = await loadPrime(candidate.assetId, candidate.amount);
            if (prime !== undefined) {
                primes.push(prime);
            }
        } catch {
            // Skip assets that are not live Prime contracts.
        }
    }
    primes.sort(compareByExtractable);
    return primes;
}
