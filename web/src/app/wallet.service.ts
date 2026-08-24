import { Injectable, computed, signal } from '@angular/core';
import algosdk from 'algosdk';
import { WalletManager } from '@txnlab/use-wallet';
import { defly } from '@txnlab/use-wallet-defly';
import { kibisis } from '@txnlab/use-wallet-kibisis';
import { lute } from '@txnlab/use-wallet-lute';
import { pera } from '@txnlab/use-wallet-pera';
import { dumpError, log, logError } from '../lib/log';

export interface WalletOption {
    id: string;
    name: string;
    connected: boolean;
    active: boolean;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
    private readonly manager = new WalletManager({
        wallets: [
            pera({ shouldShowSignTxnToast: false }),
            defly({ shouldShowSignTxnToast: false }),
            lute({ siteName: 'Octorand Recover' }),
            kibisis(),
        ],
        defaultNetwork: 'mainnet',
        options: { persistNetwork: false },
    });

    public readonly ready = signal(false);
    public readonly address = signal<string | null>(null);
    public readonly activeWalletId = signal<string | null>(null);
    public readonly status = signal('Connect a wallet that holds the Prime.');
    public readonly busy = signal(false);

    public readonly wallets = signal<WalletOption[]>([]);
    public readonly connected = computed(() => this.address() !== null);
    public readonly shortAddress = computed(() => {
        const value = this.address();
        if (value === null) {
            return '';
        }
        return `${value.slice(0, 6)}…${value.slice(-6)}`;
    });

    public constructor() {
        this.manager.subscribe(() => this.sync());
        this.manager.on('ready', () => {
            this.ready.set(true);
            this.sync();
            log('wallet ready', {
                network: this.manager.activeNetwork,
                address: this.manager.activeAddress,
                wallets: this.snapshotWallets(),
            });
        });
        this.manager.on('error', ({ error }) => {
            logError('wallet manager', error);
            this.status.set(error instanceof Error ? error.message : 'Wallet error');
        });
        void this.manager.resumeSessions();
        this.sync();
        log('wallet service constructed', { network: this.manager.activeNetwork });
    }

    public get algod(): algosdk.Algodv2 {
        return this.manager.algodClient;
    }

    public async connect(walletId: string): Promise<void> {
        const wallet = this.manager.getWallet(walletId);
        if (wallet === undefined) {
            this.status.set('That wallet is not available in this browser.');
            log('connect missing wallet', walletId);
            return;
        }
        this.busy.set(true);
        this.status.set(`Opening ${wallet.metadata.name}…`);
        log('connect start', { walletId, name: wallet.metadata.name });
        try {
            await wallet.connect();
            this.sync();
            this.status.set(this.address() === null ? 'No account selected.' : `Connected ${this.shortAddress()}`);
            log('connect done', { address: this.address(), walletId: this.activeWalletId() });
        } catch (error) {
            logError('connect', error);
            this.status.set(error instanceof Error ? error.message : 'Wallet connection was cancelled.');
        } finally {
            this.busy.set(false);
        }
    }

    public async disconnect(): Promise<void> {
        this.busy.set(true);
        try {
            await this.manager.disconnect();
            this.status.set('Disconnected.');
            this.sync();
            log('disconnected');
        } finally {
            this.busy.set(false);
        }
    }

    public async heldAssetIds(address: string): Promise<Set<number>> {
        const info = await this.algod.accountInformation(address).do();
        const held = new Set<number>();
        for (const holding of info.assets ?? []) {
            if (holding.amount > 0n) {
                held.add(Number(holding.assetId));
            }
        }
        log('held assets', { address, count: held.size, ids: [...held] });
        return held;
    }

    public async signAndSend(txns: algosdk.Transaction[]): Promise<string> {
        if (this.address() === null) {
            throw new Error('Connect a wallet first.');
        }
        const grouped = algosdk.assignGroupID(txns);
        log('signAndSend group', grouped.map((txn) => summarizeTxn(txn)));
        try {
            await this.simulate(grouped);
        } catch (error) {
            logError('simulate before sign', error);
            throw error instanceof Error ? error : new Error('Simulate failed.');
        }
        try {
            log('requesting wallet signatures', { count: grouped.length, wallet: this.activeWalletId() });
            const signed = await this.manager.signTransactions(grouped);
            const blobs = signed.filter((blob): blob is Uint8Array => blob !== null);
            log('signed blobs', {
                returned: signed.length,
                nonNull: blobs.length,
                sizes: blobs.map((blob) => blob.length),
            });
            if (blobs.length === 0) {
                throw new Error('Wallet returned no signed transactions.');
            }
            log('POST /v2/transactions', { blobCount: blobs.length, bytes: blobs.reduce((sum, blob) => sum + blob.length, 0) });
            const { txid } = await this.algod.sendRawTransaction(blobs).do();
            log('submitted', { txid });
            await algosdk.waitForConfirmation(this.algod, txid, 8);
            log('confirmed', { txid });
            return txid;
        } catch (error) {
            logError('signAndSend', error);
            throw new Error(formatWalletError(error));
        }
    }

    private async simulate(txns: algosdk.Transaction[]): Promise<void> {
        const encoded = txns.map((txn) => algosdk.encodeUnsignedSimulateTransaction(txn));
        const decoded = encoded.map((bytes) => algosdk.decodeSignedTransaction(bytes));
        const request = new algosdk.modelsv2.SimulateRequest({
            txnGroups: [new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns: decoded })],
            allowEmptySignatures: true,
            allowUnnamedResources: false,
        });
        log('simulate start', { count: txns.length });
        const strict = await this.algod.simulateTransactions(request).do();
        const group = strict.txnGroups[0];
        log('simulate strict', {
            lastRound: String(strict.lastRound),
            failureMessage: group?.failureMessage,
            failedAt: group?.failedAt,
            unnamed: serialize(group?.unnamedResourcesAccessed),
            appBudgetConsumed: group?.appBudgetConsumed,
        });
        if (group?.failureMessage) {
            const unnamedRequest = new algosdk.modelsv2.SimulateRequest({
                txnGroups: [new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns: decoded })],
                allowEmptySignatures: true,
                allowUnnamedResources: true,
            });
            const loose = await this.algod.simulateTransactions(unnamedRequest).do();
            const looseGroup = loose.txnGroups[0];
            log('simulate with unnamed resources', {
                failureMessage: looseGroup?.failureMessage,
                unnamed: serialize(looseGroup?.unnamedResourcesAccessed),
            });
            throw new Error(
                `Algod simulate rejected the group: ${group.failureMessage}${
                    looseGroup?.unnamedResourcesAccessed
                        ? ` | unnamed resources: ${JSON.stringify(serialize(looseGroup.unnamedResourcesAccessed))}`
                        : ''
                }`,
            );
        }
    }

    private snapshotWallets(): WalletOption[] {
        return this.manager.availableWallets.map((wallet) => ({
            id: wallet.id,
            name: wallet.metadata.name,
            connected: wallet.isConnected,
            active: this.manager.activeWallet?.id === wallet.id,
        }));
    }

    private sync(): void {
        this.address.set(this.manager.activeAddress);
        this.activeWalletId.set(this.manager.activeWallet?.id ?? null);
        this.wallets.set(this.snapshotWallets());
    }
}

function summarizeTxn(txn: algosdk.Transaction): Record<string, unknown> {
    const appl = txn.applicationCall;
    const axfer = txn.assetTransfer;
    return {
        type: txn.type,
        sender: txn.sender.toString(),
        fee: Number(txn.fee),
        appIndex: appl === undefined ? undefined : Number(appl.appIndex),
        appArgs: appl === undefined ? undefined : appl.appArgs.map((arg) => bytesToHex(arg)),
        foreignApps: appl === undefined ? undefined : appl.foreignApps.map((id) => Number(id)),
        foreignAssets: appl === undefined ? undefined : appl.foreignAssets.map((id) => Number(id)),
        accounts: appl === undefined ? undefined : appl.accounts.map((account) => account.toString()),
        assetIndex: axfer === undefined ? undefined : Number(axfer.assetIndex),
        amount: axfer === undefined ? undefined : Number(axfer.amount),
        group: txn.group === undefined ? undefined : bytesToHex(txn.group),
    };
}

function bytesToHex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function serialize(value: unknown): unknown {
    try {
        return JSON.parse(JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner)));
    } catch {
        return String(value);
    }
}

function formatWalletError(error: unknown): string {
    const dump = dumpError(error);
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('user rejected') || lower.includes('rejected by user') || lower.includes('cancelled')) {
        return 'Cancelled in the wallet.';
    }
    const body = dump['body'];
    if (typeof body === 'object' && body !== null && 'message' in body) {
        return String((body as { message: unknown })['message']).slice(0, 400);
    }
    if (typeof body === 'string' && body.length > 0) {
        return body.slice(0, 400);
    }
    return message;
}
