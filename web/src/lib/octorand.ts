export const OCTO_ASA = 559219992;
export const OCTO_DECIMALS = 6;

export const ROUTER_CREATOR = 'NXZLEEQ35KIZ3V3MHFXOOQNEINVLYAU7JCAOZZTQRCDREO4O34I27KLIXU';
export const GEN1_FACTORY = 'WLBZZ2XAUWBFUNSRL4GMU7FDIBY3WAT5VFXNLRJJX2G5RRT6JQMRKYNHFU';
export const GEN2_FACTORY = 'RFBPCQV6JFPUSBADUQBRF7575W2ZM4U5GIS37ZBKT5BZPEW22QR7WEZ53U';

export const ROUTERS = {
    gen1: {
        vaultWithdraw: 2141433934,
        vaultOptIn: 2141433859,
        octoWithdraw: 2141433746,
        algoWithdraw: 2141435280,
    },
    gen2: {
        vaultWithdraw: 2141438961,
        vaultOptIn: 2141437760,
        octoWithdraw: 2141437705,
        algoWithdraw: 2141439903,
    },
} as const;

export const SELECTORS = {
    vaultWithdraw: Uint8Array.of(0xf7, 0x9f, 0xf9, 0x52),
    vaultOptIn: Uint8Array.of(0x46, 0x37, 0x56, 0xe8),
    octoWithdraw: Uint8Array.of(0xa1, 0x53, 0xff, 0x0d),
    algoWithdraw: Uint8Array.of(0x32, 0x50, 0x6c, 0x70),
} as const;

export type PrimeGeneration = 'gen1' | 'gen2';

export interface PrimeState {
    index: number;
    octoAssetId: number;
    remintAssetId: number;
    originalAssetId: number;
    letters: string;
}

export interface VaultHolding {
    assetId: number;
    amount: number;
    name: string;
    unit: string;
    decimals: number;
    total: number;
    locked: boolean;
    nestedPrime: boolean;
}

export function readUint64(bytes: Uint8Array, offset: number): number {
    if (offset + 8 > bytes.length) {
        return 0;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    return Number(view.getBigUint64(0));
}

export function decodeLetters(bytes: Uint8Array): string {
    const text = new TextDecoder().decode(bytes);
    const matches = text.match(/[A-Z]{4,16}/g);
    return matches?.at(-1) ?? '';
}

export function decodePrimeState(p1: Uint8Array): PrimeState {
    return {
        index: readUint64(p1, 0),
        octoAssetId: readUint64(p1, 8),
        remintAssetId: readUint64(p1, 16),
        originalAssetId: readUint64(p1, 24),
        letters: decodeLetters(p1),
    };
}

export function isOctorandPrime(name: string, unit: string): boolean {
    const lowerName = name.toLowerCase();
    if (lowerName === 'octorand' && unit === 'OCTO') {
        return false;
    }
    if (lowerName.includes('octorand') || lowerName.includes('octo prime')) {
        return true;
    }
    return unit.startsWith('OG1-') || unit.startsWith('OG2-') || unit.startsWith('OCTO-') || unit.startsWith('OP2-');
}

export function generationFromUnit(unit: string, name: string): PrimeGeneration {
    if (unit.startsWith('OG2-') || unit.startsWith('OP2-') || name.toLowerCase().includes('gen2')) {
        return 'gen2';
    }
    return 'gen1';
}

export function maybePrimeAssetId(assetId: number): boolean {
    if (assetId === OCTO_ASA) {
        return false;
    }
    if (assetId >= 559229000 && assetId <= 559500000) {
        return true;
    }
    if (assetId >= 626000000 && assetId <= 628000000) {
        return true;
    }
    if (assetId >= 2140000000 && assetId <= 2150000000) {
        return true;
    }
    return false;
}

export function isLockedVaultAsset(assetId: number, prime: PrimeState): boolean {
    return assetId === prime.octoAssetId || assetId === prime.remintAssetId || assetId === prime.originalAssetId;
}

export function encodeIndexByte(index: number): Uint8Array {
    if (index < 0 || index > 255) {
        throw new Error(`Index ${index} does not fit in one byte`);
    }
    return Uint8Array.of(index);
}

export function encodeUint64(value: number): Uint8Array {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
    return bytes;
}

export function routersFor(generation: PrimeGeneration): (typeof ROUTERS)[PrimeGeneration] {
    return ROUTERS[generation];
}

export interface ExtractableVault {
    generation: PrimeGeneration;
    state: { index: number };
    vaultAlgo: number;
    vaultMinBalance: number;
    vaultOcto: number;
    holdings: Array<{ locked: boolean }>;
}

export function freeAlgo(vault: Pick<ExtractableVault, 'vaultAlgo' | 'vaultMinBalance'>): number {
    return Math.max(0, vault.vaultAlgo - vault.vaultMinBalance);
}

export function withdrawableCount(vault: Pick<ExtractableVault, 'holdings'>): number {
    return vault.holdings.filter((holding) => !holding.locked).length;
}

export function hasExtractable(vault: ExtractableVault): boolean {
    return withdrawableCount(vault) > 0 || vault.vaultOcto > 0 || freeAlgo(vault) > 0;
}

export function extractableLabel(vault: ExtractableVault): string {
    const nfts = withdrawableCount(vault);
    const parts: string[] = [];
    if (nfts > 0) {
        parts.push(`${nfts} NFT${nfts === 1 ? '' : 's'}`);
    }
    if (vault.vaultOcto > 0) {
        parts.push('OCTO');
    }
    if (freeAlgo(vault) > 0) {
        parts.push('ALGO');
    }
    return parts.length === 0 ? 'empty' : parts.join(' · ');
}

export function compareByExtractable(left: ExtractableVault, right: ExtractableVault): number {
    const leftOpen = hasExtractable(left) ? 1 : 0;
    const rightOpen = hasExtractable(right) ? 1 : 0;
    if (leftOpen !== rightOpen) {
        return rightOpen - leftOpen;
    }
    const nfts = withdrawableCount(right) - withdrawableCount(left);
    if (nfts !== 0) {
        return nfts;
    }
    if (right.vaultOcto !== left.vaultOcto) {
        return right.vaultOcto - left.vaultOcto;
    }
    const algo = freeAlgo(right) - freeAlgo(left);
    if (algo !== 0) {
        return algo;
    }
    const generation = left.generation.localeCompare(right.generation);
    if (generation !== 0) {
        return generation;
    }
    return left.state.index - right.state.index;
}

export function uniqueAssetIds(...ids: number[]): number[] {
    const seen = new Set<number>();
    const unique: number[] = [];
    for (const id of ids) {
        if (id > 0 && !seen.has(id)) {
            seen.add(id);
            unique.push(id);
        }
    }
    return unique;
}

/**
 * Live Octorand UI always sent foreign-assets as:
 *   [remint, OCTO, nft-being-withdrawn]
 * and ApplicationArgs[1] as the 1-byte index of the nft (2 when all three are distinct).
 * Matching that shape is required — `asset_holding_get` on remint/OCTO 400s otherwise.
 */
export function vaultWithdrawForeignAssets(withdrawAssetId: number, remintAssetId: number): number[] {
    return uniqueAssetIds(remintAssetId, OCTO_ASA, withdrawAssetId);
}

export function vaultWithdrawRefs(
    withdrawAssetId: number,
    remintAssetId: number,
): { foreignAssets: number[]; withdrawIndex: number } {
    const foreignAssets = vaultWithdrawForeignAssets(withdrawAssetId, remintAssetId);
    const withdrawIndex = foreignAssets.indexOf(withdrawAssetId);
    if (withdrawIndex < 0) {
        throw new Error(`Withdraw asset ${withdrawAssetId} missing from foreign assets`);
    }
    return { foreignAssets, withdrawIndex };
}

export function identityForeignAssets(remintAssetId: number): number[] {
    return uniqueAssetIds(remintAssetId, OCTO_ASA);
}

export function microOcto(amount: number): number {
    return Math.floor(amount * 10 ** OCTO_DECIMALS);
}

export function formatOcto(micro: number): string {
    return (micro / 10 ** OCTO_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function formatAlgo(micro: number): string {
    return (micro / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function shortAddress(address: string): string {
    if (address.length < 12) {
        return address;
    }
    return `${address.slice(0, 6)}…${address.slice(-6)}`;
}
