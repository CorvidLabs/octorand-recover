import { Injectable, inject, signal } from '@angular/core';
import algosdk from 'algosdk';
import {
    OCTO_ASA,
    SELECTORS,
    encodeIndexByte,
    encodeUint64,
    identityForeignAssets,
    routersFor,
    vaultWithdrawRefs,
    type PrimeGeneration,
} from '../lib/octorand';
import { scanAddressForPrimes, type PrimeRecord } from '../lib/indexer';
import { log, logError } from '../lib/log';
import { WalletService } from './wallet.service';

@Injectable({ providedIn: 'root' })
export class RecoverService {
    private readonly wallet = inject(WalletService);

    public readonly primes = signal<PrimeRecord[]>([]);
    public readonly selectedAppId = signal<number | null>(null);
    public readonly scannedAddress = signal<string | null>(null);
    public readonly scanning = signal(false);
    public readonly extracting = signal(false);
    public readonly progress = signal('');
    public readonly lastTxId = signal<string | null>(null);

    public get selected(): PrimeRecord | undefined {
        const appId = this.selectedAppId();
        return this.primes().find((prime) => prime.appId === appId);
    }

    public async scan(address: string): Promise<void> {
        this.scanning.set(true);
        this.lastTxId.set(null);
        this.progress.set('Scanning for Primes…');
        log('scan start', { address });
        try {
            const primes = await scanAddressForPrimes(address, (message) => {
                this.progress.set(message);
                log('scan progress', message);
            });
            this.scannedAddress.set(address);
            this.primes.set(primes);
            const keep = this.selectedAppId();
            this.selectedAppId.set(
                primes.some((prime) => prime.appId === keep) ? keep : (primes[0]?.appId ?? null),
            );
            this.progress.set(
                primes.length === 0
                    ? 'No Octorand Primes in that wallet.'
                    : `Found ${primes.length} Prime${primes.length === 1 ? '' : 's'}.`,
            );
            log(
                'scan done',
                primes.map((prime) => ({
                    appId: prime.appId,
                    unit: prime.unit,
                    remint: prime.state.remintAssetId,
                    holdings: prime.holdings.map((holding) => ({
                        assetId: holding.assetId,
                        unit: holding.unit,
                        amount: holding.amount,
                        locked: holding.locked,
                    })),
                })),
            );
        } catch (error) {
            logError('scan', error);
            this.progress.set(error instanceof Error ? error.message : 'Scan failed.');
            this.primes.set([]);
            this.selectedAppId.set(null);
        } finally {
            this.scanning.set(false);
        }
    }

    public select(appId: number): void {
        this.selectedAppId.set(appId);
    }

    public async extractAsset(prime: PrimeRecord, assetId: number): Promise<void> {
        const confirmed = await this.run(`Extracting asset ${assetId}…`, async () => {
            const sender = await this.requireSender(prime);
            const held = await this.wallet.heldAssetIds(sender);
            const txns = await this.buildVaultWithdraw(sender, prime, [assetId], held);
            return this.wallet.signAndSend(txns);
        });
        if (confirmed) {
            await this.refresh(prime);
        }
    }

    public async extractAll(prime: PrimeRecord): Promise<void> {
        const withdrawable = prime.holdings.filter((holding) => !holding.locked);
        if (withdrawable.length === 0) {
            this.progress.set('Nothing withdrawable in this vault.');
            return;
        }
        const sender = await this.requireSender(prime);
        const held = await this.wallet.heldAssetIds(sender);
        const assetIds = withdrawable.map((holding) => holding.assetId);
        const chunks: number[][] = [];
        for (let index = 0; index < assetIds.length; index += 8) {
            chunks.push(assetIds.slice(index, index + 8));
        }
        this.extracting.set(true);
        try {
            for (let index = 0; index < chunks.length; index += 1) {
                this.progress.set(`Approve group ${index + 1} of ${chunks.length} in your wallet…`);
                const txns = await this.buildVaultWithdraw(sender, prime, chunks[index] ?? [], held);
                const txId = await this.wallet.signAndSend(txns);
                this.lastTxId.set(txId);
                for (const assetId of chunks[index] ?? []) {
                    held.add(assetId);
                }
            }
            this.progress.set('Vault extract confirmed.');
            await this.refresh(prime);
        } catch (error) {
            logError('extractAll', error);
            this.progress.set(error instanceof Error ? error.message : 'Transaction failed.');
        } finally {
            this.extracting.set(false);
        }
    }

    public async extractOcto(prime: PrimeRecord): Promise<void> {
        if (prime.vaultOcto <= 0) {
            this.progress.set('No OCTO in this vault.');
            return;
        }
        const confirmed = await this.run(`Withdrawing OCTO…`, async () => {
            const sender = await this.requireSender(prime);
            const held = await this.wallet.heldAssetIds(sender);
            const params = await this.suggestedParams();
            const minFee = this.minFee(params);
            const txns: algosdk.Transaction[] = [];
            if (!held.has(OCTO_ASA)) {
                txns.push(this.optInTxn(sender, OCTO_ASA, params, minFee));
            }
            txns.push(
                this.appCall({
                    sender,
                    appIndex: routersFor(prime.generation).octoWithdraw,
                    appArgs: [SELECTORS.octoWithdraw, encodeUint64(prime.vaultOcto), encodeIndexByte(1)],
                    foreignApps: [prime.appId],
                    foreignAssets: identityForeignAssets(prime.state.remintAssetId),
                    fee: Math.max(3000, minFee * 3),
                    params,
                }),
            );
            return this.wallet.signAndSend(txns);
        });
        if (confirmed) {
            await this.refresh(prime);
        }
    }

    public async extractAlgo(prime: PrimeRecord): Promise<void> {
        const surplus = Math.max(0, prime.vaultAlgo - prime.vaultMinBalance);
        if (surplus <= 0) {
            this.progress.set('No free ALGO. Extract ASAs first to unlock minimum balance.');
            return;
        }
        const confirmed = await this.run(`Withdrawing ALGO…`, async () => {
            const sender = await this.requireSender(prime);
            const params = await this.suggestedParams();
            const minFee = this.minFee(params);
            const txn = this.appCall({
                sender,
                appIndex: routersFor(prime.generation).algoWithdraw,
                appArgs: [SELECTORS.algoWithdraw, encodeUint64(surplus), encodeIndexByte(1)],
                foreignApps: [prime.appId],
                foreignAssets: identityForeignAssets(prime.state.remintAssetId),
                fee: Math.max(3000, minFee * 3),
                params,
            });
            return this.wallet.signAndSend([txn]);
        });
        if (confirmed) {
            await this.refresh(prime);
        }
    }

    public generationLabel(generation: PrimeGeneration): string {
        return generation === 'gen1' ? 'Gen 1' : 'Gen 2';
    }

    private async refresh(prime: PrimeRecord): Promise<void> {
        const address = this.wallet.address();
        if (address !== null) {
            await this.scan(address);
            this.selectedAppId.set(prime.appId);
        }
    }

    private async run(message: string, work: () => Promise<string>): Promise<boolean> {
        this.extracting.set(true);
        this.progress.set(message);
        try {
            const txId = await work();
            this.lastTxId.set(txId);
            this.progress.set(`Confirmed ${txId.slice(0, 8)}…`);
            return true;
        } catch (error) {
            logError('extract', error);
            this.progress.set(error instanceof Error ? error.message : 'Transaction failed.');
            return false;
        } finally {
            this.extracting.set(false);
        }
    }

    private async requireSender(prime: PrimeRecord): Promise<string> {
        const sender = this.wallet.address();
        if (sender === null) {
            throw new Error('Connect the wallet that holds this Prime.');
        }
        const held = await this.wallet.heldAssetIds(sender);
        if (held.has(prime.state.remintAssetId) || (sender === this.scannedAddress() && prime.amount > 0)) {
            return sender;
        }
        throw new Error('The connected wallet must hold this Prime remint to open its vault.');
    }

    private async suggestedParams(): Promise<algosdk.SuggestedParams> {
        const params = await this.wallet.algod.getTransactionParams().do();
        log('suggested params', {
            genesisID: params.genesisID,
            minFee: Number(params.minFee),
            firstValid: Number(params.firstValid),
            lastValid: Number(params.lastValid),
            genesisHash: params.genesisHash === undefined ? undefined : params.genesisHash.byteLength,
        });
        return { ...params, flatFee: true, fee: params.minFee };
    }

    private minFee(params: algosdk.SuggestedParams): number {
        const fee = Number(params.minFee);
        return Number.isFinite(fee) && fee > 0 ? fee : 1000;
    }

    private optInTxn(
        sender: string,
        assetId: number,
        params: algosdk.SuggestedParams,
        minFee: number,
    ): algosdk.Transaction {
        return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            sender,
            receiver: sender,
            assetIndex: assetId,
            amount: 0,
            suggestedParams: { ...params, flatFee: true, fee: minFee },
        });
    }

    private appCall(input: {
        sender: string;
        appIndex: number;
        appArgs: Uint8Array[];
        foreignApps: number[];
        foreignAssets: number[];
        fee: number;
        params: algosdk.SuggestedParams;
    }): algosdk.Transaction {
        return algosdk.makeApplicationCallTxnFromObject({
            sender: input.sender,
            appIndex: input.appIndex,
            onComplete: algosdk.OnApplicationComplete.NoOpOC,
            appArgs: input.appArgs,
            foreignApps: input.foreignApps,
            foreignAssets: input.foreignAssets,
            suggestedParams: { ...input.params, flatFee: true, fee: input.fee },
        });
    }

    private async buildVaultWithdraw(
        sender: string,
        prime: PrimeRecord,
        assetIds: number[],
        held: Set<number>,
    ): Promise<algosdk.Transaction[]> {
        const params = await this.suggestedParams();
        const minFee = this.minFee(params);
        const router = routersFor(prime.generation).vaultWithdraw;
        const txns: algosdk.Transaction[] = [];
        for (const assetId of assetIds) {
            const refs = vaultWithdrawRefs(assetId, prime.state.remintAssetId);
            if (!held.has(assetId)) {
                txns.push(this.optInTxn(sender, assetId, params, minFee));
            }
            const fee = Math.max(3000, minFee * 3);
            log('build vault withdraw', {
                sender,
                router,
                primeApp: prime.appId,
                remint: prime.state.remintAssetId,
                withdrawAsset: assetId,
                foreignApps: [prime.appId],
                foreignAssets: refs.foreignAssets,
                withdrawIndex: refs.withdrawIndex,
                appIndexByte: 1,
                fee,
                alreadyOptedIn: held.has(assetId),
            });
            txns.push(
                this.appCall({
                    sender,
                    appIndex: router,
                    appArgs: [
                        SELECTORS.vaultWithdraw,
                        encodeIndexByte(refs.withdrawIndex),
                        encodeIndexByte(1),
                    ],
                    foreignApps: [prime.appId],
                    foreignAssets: refs.foreignAssets,
                    fee,
                    params,
                }),
            );
        }
        if (txns.length > 16) {
            throw new Error('Too many assets for one group. Extract a few at a time.');
        }
        return txns;
    }
}
