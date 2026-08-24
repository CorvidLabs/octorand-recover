import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { RecoverService } from './recover.service';
import { WalletService } from './wallet.service';

describe('App', () => {
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [App],
            providers: [
                {
                    provide: WalletService,
                    useValue: {
                        wallets: signal([]),
                        busy: signal(false),
                        connected: signal(false),
                        shortAddress: signal(''),
                        status: signal('Connect a wallet that holds the Prime.'),
                        address: signal(null),
                        connect: async () => undefined,
                        disconnect: async () => undefined,
                    },
                },
                {
                    provide: RecoverService,
                    useValue: {
                        primes: signal([]),
                        selectedAppId: signal(null),
                        scannedAddress: signal(null),
                        scanning: signal(false),
                        extracting: signal(false),
                        progress: signal(''),
                        lastTxId: signal(null),
                        generationLabel: (generation: string) => generation,
                        scan: async () => undefined,
                        select: () => undefined,
                        extractAll: async () => undefined,
                        extractAsset: async () => undefined,
                        extractOcto: async () => undefined,
                        extractAlgo: async () => undefined,
                    },
                },
            ],
        }).compileComponents();
    });

    it('renders the recover heading', () => {
        const fixture = TestBed.createComponent(App);
        fixture.detectChanges();
        const compiled = fixture.nativeElement as HTMLElement;
        expect(compiled.querySelector('h1')?.textContent).toContain('Open the Prime');
    });
});
