import { CertificateContext } from '../../certificates/certificate-context';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

@Component({
  selector: 'app-methodology-page',
  templateUrl: './methodology-page.html',
  styleUrl: './methodology-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MethodologyPage {
  protected readonly certificate = inject(CertificateContext);
}
