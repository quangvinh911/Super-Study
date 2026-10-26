import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { UiPreferencesRepository } from './core/persistence';
import { LoginDialogService } from './core/auth/login-dialog.service';

@Component({ template: '' })
class EmptyPage {}

describe('App', () => {
  it('opens login over the current page and closes with Escape without navigating', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const dialog = root.querySelector('dialog');
    if (!dialog) throw new Error('Login dialog is missing');
    // jsdom does not implement the browser top layer or native focus trapping.
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => dialog.removeAttribute('open');
    const button = Array.from(root.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Đăng nhập',
    );
    if (!button) throw new Error('Login button is missing');
    const router = TestBed.inject(Router);
    const originalUrl = router.url;
    button.click();
    await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(router.url).toBe(originalUrl);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
    expect(TestBed.inject(LoginDialogService).visible()).toBe(false);
    expect(router.url).toBe(originalUrl);
  });
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: EmptyPage },
          { path: 'certificates/ctfl', component: EmptyPage },
          { path: 'certificates/toeic', component: EmptyPage },
          { path: 'certificates/toeic/grammar', component: EmptyPage },
          { path: 'certificates/toeic/notes', component: EmptyPage },
          {
            path: 'certificates/ctfl/practice/session-1',
            component: EmptyPage,
            data: { layout: 'focus' },
          },
        ]),
        {
          provide: UiPreferencesRepository,
          useValue: { load: () => ({ theme: 'system', reducedMotion: false }), save: () => {} },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('opens the notebook with notes above saved vocabulary', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/certificates/toeic/notes');
    await fixture.whenStable();
    const group = fixture.nativeElement.querySelector(
      '.workspace-nav__notes',
    ) as HTMLDetailsElement;
    expect(group.open).toBe(true);
    expect(group.querySelector('summary')?.textContent).toBe('Sổ tay');
    expect(Array.from(group.querySelectorAll('a')).map((link) => link.textContent?.trim())).toEqual(
      ['Ghi chú', 'Từ vựng đã lưu'],
    );
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand__copy strong')?.textContent).toContain(
      'Certificate Practice',
    );
  });

  it('shows certificate navigation only inside a certificate', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#certificate-navigation')).toBeNull();

    await router.navigateByUrl('/certificates/toeic/grammar');
    await fixture.whenStable();
    const sidebar = fixture.nativeElement.querySelector('#certificate-navigation') as HTMLElement;
    expect(sidebar.textContent).toContain('Ngữ pháp');
    expect(sidebar.querySelector('details')?.open).toBe(true);
  });

  it('hides the sidebar and footer during a practice session', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/certificates/ctfl/practice/session-1');
    await fixture.whenStable();
    const rendered = fixture.nativeElement as HTMLElement;
    expect(rendered.querySelector('#certificate-navigation')).toBeNull();
    expect(rendered.querySelector('.site-footer')).toBeNull();
    expect(rendered.querySelector('.focus-exit')?.getAttribute('href')).toBe('/certificates/ctfl');
  });
});
