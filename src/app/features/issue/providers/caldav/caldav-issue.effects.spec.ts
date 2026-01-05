import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { of, ReplaySubject } from 'rxjs';
import { CaldavIssueEffects } from './caldav-issue.effects';
import { CaldavClientService } from './caldav-client.service';
import { IssueService } from '../../issue.service';
import { IssueProviderService } from '../../issue-provider.service';
import { TaskService } from '../../../tasks/task.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { SnackService } from '../../../../core/snack/snack.service';
import { TaskSharedActions } from '../../../../root-store/meta/task-shared.actions';
import { Task, TaskWithSubTasks } from '../../../tasks/task.model';
import { IssueProviderCaldav } from '../../issue.model';
import { CaldavDeleteEventDialogResult } from './dialog-caldav-delete-event/dialog-caldav-delete-event.component';

describe('CaldavIssueEffects', () => {
  let effects: CaldavIssueEffects;
  let actions$: ReplaySubject<any>;
  let caldavClientServiceSpy: jasmine.SpyObj<CaldavClientService>;
  let issueServiceSpy: jasmine.SpyObj<IssueService>;
  let issueProviderServiceSpy: jasmine.SpyObj<IssueProviderService>;
  let taskServiceSpy: jasmine.SpyObj<TaskService>;
  let matDialogSpy: jasmine.SpyObj<MatDialog>;
  let snackServiceSpy: jasmine.SpyObj<SnackService>;

  const createVTODOConfig = (): IssueProviderCaldav =>
    ({
      id: 'provider-vtodo',
      isEnabled: true,
      caldavUrl: 'https://caldav.example.com',
      resourceName: 'tasks',
      username: 'user',
      password: 'pass',
      componentType: 'VTODO',
      authType: 'basic',
      bearerToken: null,
      enableWriteBack: false,
      isTransitionIssuesEnabled: true,
      categoryFilter: '',
    }) as IssueProviderCaldav;

  const createVEVENTConfig = (): IssueProviderCaldav =>
    ({
      id: 'provider-vevent',
      isEnabled: true,
      caldavUrl: 'https://caldav.example.com',
      resourceName: 'calendar',
      username: '',
      password: '',
      componentType: 'VEVENT',
      authType: 'bearer',
      bearerToken: 'test-token',
      enableWriteBack: true,
      isTransitionIssuesEnabled: false,
      categoryFilter: '',
    }) as IssueProviderCaldav;

  const createTask = (overrides: Partial<Task> = {}): Task =>
    ({
      id: 'task-1',
      title: 'Test Task',
      issueId: 'event-123',
      issueProviderId: 'provider-vevent',
      issueType: 'CALDAV',
      isDone: false,
      notes: '',
      ...overrides,
    }) as Task;

  const createTaskWithSubTasks = (
    overrides: Partial<TaskWithSubTasks> = {},
  ): TaskWithSubTasks =>
    ({
      id: 'task-1',
      title: 'Test Task',
      issueId: 'event-123',
      issueProviderId: 'provider-vevent',
      issueType: 'CALDAV',
      isDone: false,
      notes: '',
      subTasks: [],
      ...overrides,
    }) as TaskWithSubTasks;

  beforeEach(() => {
    actions$ = new ReplaySubject(1);

    caldavClientServiceSpy = jasmine.createSpyObj('CaldavClientService', [
      'updateState$',
      'updateEvent$',
      'deleteEvent$',
    ]);
    issueServiceSpy = jasmine.createSpyObj('IssueService', ['refreshIssueTask']);
    issueProviderServiceSpy = jasmine.createSpyObj('IssueProviderService', [
      'getCfgOnce$',
    ]);
    taskServiceSpy = jasmine.createSpyObj('TaskService', ['getByIdOnce$']);
    matDialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    snackServiceSpy = jasmine.createSpyObj('SnackService', ['open']);

    TestBed.configureTestingModule({
      providers: [
        CaldavIssueEffects,
        provideMockActions(() => actions$),
        { provide: CaldavClientService, useValue: caldavClientServiceSpy },
        { provide: IssueService, useValue: issueServiceSpy },
        { provide: IssueProviderService, useValue: issueProviderServiceSpy },
        { provide: TaskService, useValue: taskServiceSpy },
        { provide: MatDialog, useValue: matDialogSpy },
        { provide: SnackService, useValue: snackServiceSpy },
      ],
    });

    effects = TestBed.inject(CaldavIssueEffects);
  });

  it('should be created', () => {
    expect(effects).toBeTruthy();
  });

  describe('checkForDoneTransition$ (VTODO)', () => {
    it('should update CalDAV task when isDone changes for VTODO', (done) => {
      const vtodoConfig = createVTODOConfig();
      const task = createTask({
        issueProviderId: 'provider-vtodo',
        isDone: true,
        title: 'Completed Task',
      });

      taskServiceSpy.getByIdOnce$.and.returnValue(of(task));
      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(vtodoConfig));
      caldavClientServiceSpy.updateState$.and.returnValue(of(void 0));
      issueServiceSpy.refreshIssueTask.and.returnValue(Promise.resolve());

      effects.checkForDoneTransition$.subscribe(() => {
        expect(caldavClientServiceSpy.updateState$).toHaveBeenCalledWith(
          vtodoConfig,
          'event-123',
          true,
          'Completed Task',
        );
        done();
      });

      actions$.next(
        TaskSharedActions.updateTask({
          task: { id: 'task-1', changes: { isDone: true } },
        }),
      );
    });

    it('should NOT update CalDAV for VEVENT when isDone changes', (done) => {
      const veventConfig = createVEVENTConfig();
      const task = createTask({ isDone: true });

      taskServiceSpy.getByIdOnce$.and.returnValue(of(task));
      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));

      // Subscribe and wait a bit to ensure nothing happens
      const subscription = effects.checkForDoneTransition$.subscribe();

      actions$.next(
        TaskSharedActions.updateTask({
          task: { id: 'task-1', changes: { isDone: true } },
        }),
      );

      // Give it time to process
      setTimeout(() => {
        // updateState$ should NOT be called for VEVENT
        expect(caldavClientServiceSpy.updateState$).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });

    it('should skip non-CalDAV tasks', (done) => {
      const task = createTask({ issueType: 'JIRA' });

      taskServiceSpy.getByIdOnce$.and.returnValue(of(task));

      const subscription = effects.checkForDoneTransition$.subscribe();

      actions$.next(
        TaskSharedActions.updateTask({
          task: { id: 'task-1', changes: { isDone: true } },
        }),
      );

      setTimeout(() => {
        expect(issueProviderServiceSpy.getCfgOnce$).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });
  });

  describe('checkForEventUpdates$ (VEVENT)', () => {
    it('should update CalDAV event when title changes for VEVENT with writeBack enabled', (done) => {
      const veventConfig = createVEVENTConfig();
      const task = createTask({ title: 'Updated Title' });

      taskServiceSpy.getByIdOnce$.and.returnValue(of(task));
      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.updateEvent$.and.returnValue(of(void 0));
      issueServiceSpy.refreshIssueTask.and.returnValue(Promise.resolve());

      effects.checkForEventUpdates$.subscribe(() => {
        expect(caldavClientServiceSpy.updateEvent$).toHaveBeenCalledWith(
          veventConfig,
          'event-123',
          jasmine.objectContaining({ summary: 'Updated Title' }),
        );
        done();
      });

      actions$.next(
        TaskSharedActions.updateTask({
          task: { id: 'task-1', changes: { title: 'Updated Title' } },
        }),
      );
    });

    it('should update CalDAV event when dueWithTime changes', (done) => {
      const veventConfig = createVEVENTConfig();
      const newTime = Date.now() + 3600000;
      const task = createTask({ dueWithTime: newTime, timeEstimate: 1800000 });

      taskServiceSpy.getByIdOnce$.and.returnValue(of(task));
      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.updateEvent$.and.returnValue(of(void 0));
      issueServiceSpy.refreshIssueTask.and.returnValue(Promise.resolve());

      effects.checkForEventUpdates$.subscribe(() => {
        expect(caldavClientServiceSpy.updateEvent$).toHaveBeenCalledWith(
          veventConfig,
          'event-123',
          jasmine.objectContaining({
            dtstart: newTime,
            dtend: newTime + 1800000,
          }),
        );
        done();
      });

      actions$.next(
        TaskSharedActions.updateTask({
          task: { id: 'task-1', changes: { dueWithTime: newTime } },
        }),
      );
    });

    it('should update CalDAV event when notes changes', (done) => {
      const veventConfig = createVEVENTConfig();
      const task = createTask({ notes: 'Updated notes' });

      taskServiceSpy.getByIdOnce$.and.returnValue(of(task));
      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.updateEvent$.and.returnValue(of(void 0));
      issueServiceSpy.refreshIssueTask.and.returnValue(Promise.resolve());

      effects.checkForEventUpdates$.subscribe(() => {
        expect(caldavClientServiceSpy.updateEvent$).toHaveBeenCalledWith(
          veventConfig,
          'event-123',
          jasmine.objectContaining({ description: 'Updated notes' }),
        );
        done();
      });

      actions$.next(
        TaskSharedActions.updateTask({
          task: { id: 'task-1', changes: { notes: 'Updated notes' } },
        }),
      );
    });

    it('should NOT update CalDAV event when writeBack is disabled', (done) => {
      const veventConfig = createVEVENTConfig();
      veventConfig.enableWriteBack = false;
      const task = createTask({ title: 'New Title' });

      taskServiceSpy.getByIdOnce$.and.returnValue(of(task));
      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));

      const subscription = effects.checkForEventUpdates$.subscribe();

      actions$.next(
        TaskSharedActions.updateTask({
          task: { id: 'task-1', changes: { title: 'New Title' } },
        }),
      );

      setTimeout(() => {
        expect(caldavClientServiceSpy.updateEvent$).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });

    it('should NOT update CalDAV for VTODO tasks', (done) => {
      const vtodoConfig = createVTODOConfig();
      const task = createTask({
        issueProviderId: 'provider-vtodo',
        title: 'Updated',
      });

      taskServiceSpy.getByIdOnce$.and.returnValue(of(task));
      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(vtodoConfig));

      const subscription = effects.checkForEventUpdates$.subscribe();

      actions$.next(
        TaskSharedActions.updateTask({
          task: { id: 'task-1', changes: { title: 'Updated' } },
        }),
      );

      setTimeout(() => {
        expect(caldavClientServiceSpy.updateEvent$).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });
  });

  describe('handleEventTaskDeletion$', () => {
    it('should show dialog and delete event when user chooses "delete-both"', (done) => {
      const veventConfig = createVEVENTConfig();
      const task = createTaskWithSubTasks();
      const dialogRefMock = {
        afterClosed: () => of('delete-both' as CaldavDeleteEventDialogResult),
      } as MatDialogRef<any, CaldavDeleteEventDialogResult>;

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      matDialogSpy.open.and.returnValue(dialogRefMock);
      caldavClientServiceSpy.deleteEvent$.and.returnValue(of(void 0));

      effects.handleEventTaskDeletion$.subscribe(() => {
        expect(matDialogSpy.open).toHaveBeenCalled();
        expect(caldavClientServiceSpy.deleteEvent$).toHaveBeenCalledWith(
          veventConfig,
          'event-123',
        );
        expect(snackServiceSpy.open).toHaveBeenCalled();
        done();
      });

      actions$.next(TaskSharedActions.deleteTask({ task }));
    });

    it('should show dialog but NOT delete event when user chooses "keep-event"', (done) => {
      const veventConfig = createVEVENTConfig();
      const task = createTaskWithSubTasks();
      const dialogRefMock = {
        afterClosed: () => of('keep-event' as CaldavDeleteEventDialogResult),
      } as MatDialogRef<any, CaldavDeleteEventDialogResult>;

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      matDialogSpy.open.and.returnValue(dialogRefMock);

      const subscription = effects.handleEventTaskDeletion$.subscribe();

      actions$.next(TaskSharedActions.deleteTask({ task }));

      setTimeout(() => {
        expect(matDialogSpy.open).toHaveBeenCalled();
        expect(caldavClientServiceSpy.deleteEvent$).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });

    it('should NOT show dialog when writeBack is disabled', (done) => {
      const veventConfig = createVEVENTConfig();
      veventConfig.enableWriteBack = false;
      const task = createTaskWithSubTasks();

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));

      const subscription = effects.handleEventTaskDeletion$.subscribe();

      actions$.next(TaskSharedActions.deleteTask({ task }));

      setTimeout(() => {
        expect(matDialogSpy.open).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });

    it('should NOT show dialog for VTODO tasks', (done) => {
      const vtodoConfig = createVTODOConfig();
      const task = createTaskWithSubTasks({ issueProviderId: 'provider-vtodo' });

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(vtodoConfig));

      const subscription = effects.handleEventTaskDeletion$.subscribe();

      actions$.next(TaskSharedActions.deleteTask({ task }));

      setTimeout(() => {
        expect(matDialogSpy.open).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });

    it('should NOT show dialog for non-CalDAV tasks', (done) => {
      const task = createTaskWithSubTasks({ issueType: 'JIRA' });

      const subscription = effects.handleEventTaskDeletion$.subscribe();

      actions$.next(TaskSharedActions.deleteTask({ task }));

      setTimeout(() => {
        expect(issueProviderServiceSpy.getCfgOnce$).not.toHaveBeenCalled();
        expect(matDialogSpy.open).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });

    it('should NOT show dialog for tasks without issueId', (done) => {
      const task = createTaskWithSubTasks({ issueId: undefined });

      const subscription = effects.handleEventTaskDeletion$.subscribe();

      actions$.next(TaskSharedActions.deleteTask({ task }));

      setTimeout(() => {
        expect(issueProviderServiceSpy.getCfgOnce$).not.toHaveBeenCalled();
        expect(matDialogSpy.open).not.toHaveBeenCalled();
        subscription.unsubscribe();
        done();
      }, 100);
    });
  });
});
