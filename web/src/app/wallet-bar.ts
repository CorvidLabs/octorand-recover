import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WalletService } from './wallet.service';

@Component({
    selector: 'app-wallet-bar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="bar" aria-label="Wallet connection">
            <div class="wallets">
                @for (wallet of service.wallets(); track wallet.id) {
                    <button
                        type="button"
                        class="wallet"
                        [class.active]="wallet.active"
                        [disabled]="service.busy()"
                        (click)="service.connect(wallet.id)"
                    >
                        {{ wallet.name }}
                    </button>
                }
            </div>
            @if (service.connected()) {
                <p class="account">
                    <span class="label">Connected</span>
                    <code>{{ service.shortAddress() }}</code>
                    <button type="button" class="text" (click)="service.disconnect()">Disconnect</button>
                </p>
            } @else {
                <p class="account muted">Pera, Defly, Lute, or Kibisis. Mainnet only.</p>
            }
        </section>
    `,
    styles: `
        .bar {
            display: grid;
            gap: 0.85rem;
        }
        .wallets {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        .wallet {
            appearance: none;
            border: 1px solid var(--hairline);
            background: var(--surface);
            color: var(--ink);
            font: inherit;
            padding: 0.45rem 0.8rem;
            cursor: pointer;
        }
        .wallet:hover,
        .wallet:focus-visible {
            border-color: var(--sheen);
            color: var(--sheen-strong);
        }
        .wallet.active {
            background: var(--sheen);
            border-color: var(--sheen);
            color: var(--paper);
        }
        .wallet:focus-visible {
            outline: 2px solid var(--sheen);
            outline-offset: 2px;
        }
        .account {
            margin: 0;
            display: flex;
            flex-wrap: wrap;
            gap: 0.6rem;
            align-items: center;
        }
        .label {
            color: var(--sheen-strong);
            font-family: var(--font-mono);
            font-size: 0.72rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            font-weight: 700;
        }
        .text {
            appearance: none;
            border: 0;
            background: transparent;
            color: var(--sheen);
            font: inherit;
            cursor: pointer;
            text-decoration: underline;
            text-underline-offset: 3px;
        }
        .text:focus-visible {
            outline: 2px solid var(--sheen);
            outline-offset: 2px;
        }
        .muted {
            color: var(--ink-70);
            margin: 0;
        }
        code {
            font-family: var(--font-mono);
            font-size: 0.92rem;
        }
    `,
})
export class WalletBar {
    protected readonly service = inject(WalletService);
}
