import { ChangeDetectionStrategy, Component, afterNextRender, signal } from '@angular/core';

const STORE_KEY = 'corvid-theme';

@Component({
    selector: 'app-theme-toggle',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <button
            type="button"
            class="corvid-theme-toggle"
            data-corvid-theme-toggle
            [attr.aria-pressed]="dark()"
            [attr.aria-label]="dark() ? 'Switch to light theme' : 'Switch to dark theme'"
            title="Switch theme"
            (click)="toggle()"
        >
            <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.6v2.4M12 19v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.6 12h2.4M19 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
            </svg>
            <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12.8A8.6 8.6 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8z" />
            </svg>
        </button>
    `,
    styles: `
        :host {
            display: inline-flex;
        }
    `,
})
export class ThemeToggle {
    protected readonly dark = signal(false);

    public constructor() {
        afterNextRender(() => this.dark.set(this.isDark()));
    }

    protected toggle(): void {
        const next = this.isDark() ? 'light' : 'dark';
        document.documentElement.dataset['theme'] = next;
        try {
            localStorage.setItem(STORE_KEY, next);
        } catch {
            /* storage may be unavailable */
        }
        this.dark.set(next === 'dark');
    }

    private isDark(): boolean {
        const theme = document.documentElement.dataset['theme'];
        if (theme === 'dark') {
            return true;
        }
        if (theme === 'light') {
            return false;
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
}
