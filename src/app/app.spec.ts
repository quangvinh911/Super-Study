import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { UiPreferencesRepository } from './core/persistence';

@Component({ template: '' })
class EmptyPage {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: EmptyPage },
          { path: 'certificates/ctfl', component: EmptyPage },
          { path: 'certificates/toeic', component: EmptyPage },
          { path: 'certificates/toeic/grammar', component: EmptyPage },
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
