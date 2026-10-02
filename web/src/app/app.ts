import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debugLogs } from '../lib/log';
import {
    canClaimRemint,
    extractableLabel,
    formatAlgo,
    formatOcto,
    hasExtractable,
    shortAddress,
} from '../lib/octorand';
import { RecoverService } from './recover.service';
import { ThemeToggle } from './theme-toggle';
import { WalletBar } from './wallet-bar';
import { WalletService } from './wallet.service';

@Component({
    selector: 'app-root',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, WalletBar, ThemeToggle],
    templateUrl: './app.html',
    styleUrl: './app.css',
})
export class App {
    protected readonly wallet = inject(WalletService);
    protected readonly recover = inject(RecoverService);
    protected readonly lookup = signal('');
    protected readonly formatAlgo = formatAlgo;
    protected readonly formatOcto = formatOcto;
    protected readonly shortAddress = shortAddress;
    protected readonly extractableLabel = extractableLabel;
    protected readonly hasExtractable = hasExtractable;
    protected readonly debugText = computed(() => debugLogs().join('\n'));

    protected readonly canSign = computed(() => {
        const connected = this.wallet.address();
        const scanned = this.recover.scannedAddress();
        const auth = this.recover.scannedAuthAddress();
        if (connected === null || scanned === null) {
            return false;
        }
        return connected === scanned || auth === connected;
    });

    protected readonly selected = computed(() => {
        const appId = this.recover.selectedAppId();
        return this.recover.primes().find((prime) => prime.appId === appId);
    });

    protected readonly canExtract = computed(() => {
        const prime = this.selected();
        return this.canSign() && prime !== undefined && prime.holdsRemint;
    });

    protected readonly canClaim = computed(() => {
        const prime = this.selected();
        if (prime === undefined || !this.canSign()) {
            return false;
        }
        return canClaimRemint(prime);
    });

    protected readonly withdrawable = computed(() => {
        const prime = this.selected();
        return prime?.holdings.filter((holding) => !holding.locked) ?? [];
    });

    protected readonly locked = computed(() => {
        const prime = this.selected();
        return prime?.holdings.filter((holding) => holding.locked) ?? [];
    });

    protected readonly algoSurplus = computed(() => {
        const prime = this.selected();
        if (prime === undefined) {
            return 0;
        }
        return Math.max(0, prime.vaultAlgo - prime.vaultMinBalance);
    });

    public constructor() {
        let lastAddress: string | null = null;
        effect(() => {
            const address = this.wallet.address();
            if (address !== null && address !== lastAddress) {
                lastAddress = address;
                this.lookup.set(address);
                void this.recover.scan(address);
            }
        });
    }

    protected scanLookup(): void {
        const address = this.lookup().trim();
        if (address.length === 0) {
            return;
        }
        void this.recover.scan(address);
    }

    protected explorerTx(txId: string): string {
        return `https://allo.info/tx/${txId}`;
    }

    protected explorerAsset(assetId: number): string {
        return `https://allo.info/asset/${assetId}`;
    }

    protected explorerApp(appId: number): string {
        return `https://allo.info/application/${appId}`;
    }

    protected explorerAccount(address: string): string {
        return `https://allo.info/account/${address}`;
    }
}
