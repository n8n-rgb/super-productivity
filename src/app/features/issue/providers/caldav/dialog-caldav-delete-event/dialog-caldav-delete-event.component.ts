import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { T } from '../../../../../t.const';

export type CaldavDeleteEventDialogResult = 'delete-both' | 'keep-event' | 'cancel';

@Component({
  selector: 'dialog-caldav-delete-event',
  templateUrl: './dialog-caldav-delete-event.component.html',
  styleUrls: ['./dialog-caldav-delete-event.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatIcon,
    MatButton,
    TranslatePipe,
  ],
})
export class DialogCaldavDeleteEventComponent {
  private _matDialogRef =
    inject<MatDialogRef<DialogCaldavDeleteEventComponent, CaldavDeleteEventDialogResult>>(
      MatDialogRef,
    );
  data = inject<{
    taskTitle: string;
  }>(MAT_DIALOG_DATA);

  T: typeof T = T;

  cancel(): void {
    this._matDialogRef.close('cancel');
  }

  deleteBoth(): void {
    this._matDialogRef.close('delete-both');
  }

  keepEvent(): void {
    this._matDialogRef.close('keep-event');
  }
}
