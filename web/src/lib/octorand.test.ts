import { expect, test } from 'bun:test';
import {
    ROUTERS,
    SELECTORS,
    decodeLetters,
    decodePrimeState,
    encodeIndexByte,
    encodeUint64,
    generationFromUnit,
    identityForeignAssets,
    isLockedVaultAsset,
    isOctorandPrime,
    maybePrimeAssetId,
    canClaimRemint,
    compareByExtractable,
    extractableLabel,
    hasExtractable,
    mergeHeldPrimes,
    primeStateOwnsAsset,
    vaultWithdrawForeignAssets,
    vaultWithdrawRefs,
} from './octorand';

test('vault withdraw selector matches the live router', () => {
    expect(Buffer.from(SELECTORS.vaultWithdraw).toString('hex')).toBe('f79ff952');
});

test('identifies remint and original primes', () => {
    expect(isOctorandPrime('Octorand Gen1 #463', 'OG1-463')).toBe(true);
    expect(isOctorandPrime('Octorand #463', 'OCTO-463')).toBe(true);
    expect(isOctorandPrime('Octo Prime Gen2 #6874', 'OP2-6874')).toBe(true);
    expect(isOctorandPrime('Octorand', 'OCTO')).toBe(false);
    expect(isOctorandPrime('AOWL #949', 'AOWL949')).toBe(false);
});

test('generation from unit names', () => {
    expect(generationFromUnit('OG2-6874', 'Octorand Gen2 #6874')).toBe('gen2');
    expect(generationFromUnit('OG1-463', 'Octorand Gen1 #463')).toBe('gen1');
});

test('candidate asset id ranges', () => {
    expect(maybePrimeAssetId(2141541750)).toBe(true);
    expect(maybePrimeAssetId(559344022)).toBe(true);
    expect(maybePrimeAssetId(559219992)).toBe(false);
    expect(maybePrimeAssetId(410829725)).toBe(false);
});

test('decodes P1 letters and ids', () => {
    const p1 = Uint8Array.from(
        Buffer.from(
            '00000000000001cf0000000021550518000000007fa55576000000002156e99600000000000000000000000000080000000001010000000000000d30000000000000000000000000000000000000000000000000000000000000000000000000000000000002001b00320013464c414d494e474f0000000000000000',
            'hex',
        ),
    );
    const state = decodePrimeState(p1);
    expect(state.index).toBe(463);
    expect(state.octoAssetId).toBe(559219992);
    expect(state.remintAssetId).toBe(2141541750);
    expect(state.originalAssetId).toBe(559344022);
    expect(state.letters).toBe('FLAMINGO');
    expect(state.claimOpen).toBe(true);
    p1[47] = 1;
    expect(decodePrimeState(p1).claimOpen).toBe(false);
    expect(primeStateOwnsAsset(state, 2141541750)).toBe(true);
    expect(primeStateOwnsAsset(state, 559344022)).toBe(true);
    expect(primeStateOwnsAsset(state, 559219992)).toBe(false);
    expect(isLockedVaultAsset(559344022, state)).toBe(true);
    expect(isLockedVaultAsset(410829725, state)).toBe(false);
});

test('an unclaimed prime keeps the claim slot open', () => {
    const p1 = new Uint8Array(48);
    const view = new DataView(p1.buffer);
    view.setBigUint64(0, 5131n);
    view.setBigUint64(16, 2143376645n);
    view.setBigUint64(24, 626516065n);
    const state = decodePrimeState(p1);
    expect(state.index).toBe(5131);
    expect(state.claimOpen).toBe(true);
    expect(canClaimRemint({ holdsOriginal: true, holdsRemint: false, state })).toBe(true);
    expect(canClaimRemint({ holdsOriginal: true, holdsRemint: true, state })).toBe(false);
    expect(canClaimRemint({ holdsOriginal: false, holdsRemint: false, state })).toBe(false);
});

test('merges a prime found from both the original and the remint', () => {
    const original = { appId: 2147396881, holdsOriginal: true, holdsRemint: false, unit: 'OP2-5131' };
    const remint = { appId: 2147396881, holdsOriginal: false, holdsRemint: true, unit: 'OG2-5131' };
    expect(mergeHeldPrimes([original, remint])).toEqual([
        { appId: 2147396881, holdsOriginal: true, holdsRemint: true, unit: 'OG2-5131' },
    ]);
});

test('claim remint selector matches the live router', () => {
    expect(Buffer.from(SELECTORS.claimRemint).toString('hex')).toBe('a0cba8dd');
    expect(ROUTERS.gen1.claimRemint).toBe(2141434605);
    expect(ROUTERS.gen2.claimRemint).toBe(2141439838);
});

test('encodes app-call index bytes', () => {
    expect(encodeIndexByte(2)).toEqual(Uint8Array.of(2));
    expect(encodeUint64(36990000)[7]).toBe(0x30);
});

test('decodeLetters strips padding', () => {
    expect(decodeLetters(new TextEncoder().encode('2PPGAGHKAEAAGCNLL\0'))).toBe('PPGAGHKAEAAGCNLL');
});

test('vault withdraw foreign assets match the live UI: remint, OCTO, nft', () => {
    expect(vaultWithdrawForeignAssets(410829725, 2141541750)).toEqual([2141541750, 559219992, 410829725]);
    expect(vaultWithdrawRefs(410829725, 2141541750)).toEqual({
        foreignAssets: [2141541750, 559219992, 410829725],
        withdrawIndex: 2,
    });
    expect(identityForeignAssets(2141541750)).toEqual([2141541750, 559219992]);
});

test('sorts vaults with leftover NFTs, OCTO, or ALGO first', () => {
    const empty = {
        generation: 'gen1' as const,
        state: { index: 1 },
        vaultAlgo: 200_000,
        vaultMinBalance: 200_000,
        vaultOcto: 0,
        holdings: [{ locked: true }],
    };
    const octoOnly = {
        generation: 'gen2' as const,
        state: { index: 9 },
        vaultAlgo: 200_000,
        vaultMinBalance: 200_000,
        vaultOcto: 1_000_000,
        holdings: [{ locked: true }],
    };
    const nfts = {
        generation: 'gen1' as const,
        state: { index: 463 },
        vaultAlgo: 400_000,
        vaultMinBalance: 200_000,
        vaultOcto: 0,
        holdings: [{ locked: false }, { locked: false }, { locked: true }],
    };
    const ranked = [empty, octoOnly, nfts].sort(compareByExtractable);
    expect(ranked).toEqual([nfts, octoOnly, empty]);
    expect(hasExtractable(empty)).toBe(false);
    expect(extractableLabel(nfts)).toBe('2 NFTs · ALGO');
    expect(extractableLabel(octoOnly)).toBe('OCTO');
    expect(extractableLabel(empty)).toBe('empty');
});
