import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import {
  DialogCaldavDeleteEventComponent,
  CaldavDeleteEventDialogResult,
} from './dialog-caldav-delete-event.component';

describe('DialogCaldavDeleteEventComponent', () => {
  let component: DialogCaldavDeleteEventComponent;
  let fixture: ComponentFixture<DialogCaldavDeleteEventComponent>;
  let dialogRefSpy: jasmine.SpyObj<
    MatDialogRef<DialogCaldavDeleteEventComponent, CaldavDeleteEventDialogResult>
  >;

  const mockDialogData = {
    taskTitle: 'Test Task Title',
  };

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [
        DialogCaldavDeleteEventComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogCaldavDeleteEventComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have access to dialog data', () => {
    expect(component.data.taskTitle).toBe('Test Task Title');
  });

  describe('cancel', () => {
    it('should close dialog with "cancel" result', () => {
      component.cancel();

      expect(dialogRefSpy.close).toHaveBeenCalledWith('cancel');
    });
  });

  describe('deleteBoth', () => {
    it('should close dialog with "delete-both" result', () => {
      component.deleteBoth();

      expect(dialogRefSpy.close).toHaveBeenCalledWith('delete-both');
    });
  });

  describe('keepEvent', () => {
    it('should close dialog with "keep-event" result', () => {
      component.keepEvent();

      expect(dialogRefSpy.close).toHaveBeenCalledWith('keep-event');
    });
  });

  describe('T constant', () => {
    it('should expose T constant for translations', () => {
      expect(component.T).toBeDefined();
      expect(component.T.F.CALDAV.DELETE_DIALOG).toBeDefined();
    });
  });

  describe('template rendering', () => {
    it('should display task title in dialog', () => {
      const compiled = fixture.nativeElement;
      const content = compiled.querySelector('mat-dialog-content');

      expect(content.textContent).toContain('Test Task Title');
    });

    it('should have cancel button', () => {
      const compiled = fixture.nativeElement;
      const buttons = compiled.querySelectorAll('button');
      // Button with type="button" is the cancel button
      const cancelButton = Array.from(buttons).find(
        (btn: any) => btn.getAttribute('type') === 'button',
      );

      expect(cancelButton).toBeTruthy();
    });
  });
});

describe('CaldavDeleteEventDialogResult type', () => {
  it('should accept valid result values', () => {
    const deleteBoth: CaldavDeleteEventDialogResult = 'delete-both';
    const keepEvent: CaldavDeleteEventDialogResult = 'keep-event';
    const cancel: CaldavDeleteEventDialogResult = 'cancel';

    expect(deleteBoth).toBe('delete-both');
    expect(keepEvent).toBe('keep-event');
    expect(cancel).toBe('cancel');
  });
});
