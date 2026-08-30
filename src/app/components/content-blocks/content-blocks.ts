import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ContentBlock } from '../../core/models';

@Component({
  selector: 'app-content-blocks',
  templateUrl: './content-blocks.html',
  styleUrl: './content-blocks.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentBlocks {
  readonly blocks = input.required<readonly ContentBlock[]>();
}
