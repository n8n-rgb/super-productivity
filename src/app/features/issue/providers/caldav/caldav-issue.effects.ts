import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { TaskService } from '../../../tasks/task.service';
import { concatMap, filter, map, switchMap, tap } from 'rxjs/operators';
import { IssueService } from '../../issue.service';
import { EMPTY, Observable, from } from 'rxjs';
import { Task, TaskWithSubTasks } from 'src/app/features/tasks/task.model';
import { CALDAV_TYPE } from '../../issue.const';
import { isCaldavEnabled } from './is-caldav-enabled.util';
import { CaldavClientService } from './caldav-client.service';
import { CaldavCfg } from './caldav.model';
import { TaskSharedActions } from '../../../../root-store/meta/task-shared.actions';
import { IssueProviderService } from '../../issue-provider.service';
import { assertTruthy } from '../../../../util/assert-truthy';
import { MatDialog } from '@angular/material/dialog';
import {
  DialogCaldavDeleteEventComponent,
  CaldavDeleteEventDialogResult,
} from './dialog-caldav-delete-event/dialog-caldav-delete-event.component';
import { SnackService } from '../../../../core/snack/snack.service';
import { T } from '../../../../t.const';

@Injectable()
export class CaldavIssueEffects {
  private readonly _actions$ = inject(Actions);
  private readonly _caldavClientService = inject(CaldavClientService);
  private readonly _issueService = inject(IssueService);
  private readonly _issueProviderService = inject(IssueProviderService);
  private readonly _taskService = inject(TaskService);
  private readonly _matDialog = inject(MatDialog);
  private readonly _snackService = inject(SnackService);

  // VTODO: Handle completion and title updates
  checkForDoneTransition$: Observable<any> = createEffect(
    () =>
      this._actions$.pipe(
        ofType(TaskSharedActions.updateTask),
        filter(
          ({ task }): boolean => 'isDone' in task.changes || 'title' in task.changes,
        ),
        concatMap(({ task }) => this._taskService.getByIdOnce$(task.id.toString())),
        filter((task: Task) => task && task.issueType === CALDAV_TYPE),
        concatMap((task: Task) => {
          if (!task.issueProviderId) {
            throw new Error('No issueProviderId for task');
          }
          return this._issueProviderService
            .getCfgOnce$(task.issueProviderId, 'CALDAV')
            .pipe(map((caldavCfg) => ({ caldavCfg, task })));
        }),
        // Only for VTODO with isTransitionIssuesEnabled
        filter(
          ({ caldavCfg, task }) =>
            isCaldavEnabled(caldavCfg) &&
            caldavCfg.componentType !== 'VEVENT' &&
            caldavCfg.isTransitionIssuesEnabled,
        ),
        concatMap(({ caldavCfg, task }) => {
          return this._handleVTodoTransition$(caldavCfg, task);
        }),
      ),
    { dispatch: false },
  );

  // VEVENT: Handle title, time, and description updates (NOT completion)
  checkForEventUpdates$: Observable<any> = createEffect(
    () =>
      this._actions$.pipe(
        ofType(TaskSharedActions.updateTask),
        filter(
          ({ task }): boolean =>
            'title' in task.changes ||
            'dueWithTime' in task.changes ||
            'notes' in task.changes,
        ),
        concatMap(({ task }) =>
          this._taskService
            .getByIdOnce$(task.id.toString())
            .pipe(map((fullTask) => ({ fullTask, changes: task.changes }))),
        ),
        filter(({ fullTask }) => fullTask && fullTask.issueType === CALDAV_TYPE),
        concatMap(({ fullTask, changes }) => {
          if (!fullTask.issueProviderId) {
            throw new Error('No issueProviderId for task');
          }
          return this._issueProviderService
            .getCfgOnce$(fullTask.issueProviderId, 'CALDAV')
            .pipe(map((caldavCfg) => ({ caldavCfg, task: fullTask, changes })));
        }),
        // Only for VEVENT with enableWriteBack
        filter(
          ({ caldavCfg }) =>
            isCaldavEnabled(caldavCfg) &&
            caldavCfg.componentType === 'VEVENT' &&
            caldavCfg.enableWriteBack,
        ),
        concatMap(({ caldavCfg, task, changes }) => {
          return this._handleVEventUpdate$(caldavCfg, task, changes);
        }),
      ),
    { dispatch: false },
  );

  // VEVENT: Handle task deletion - ask user if they want to delete from calendar too
  handleEventTaskDeletion$: Observable<any> = createEffect(
    () =>
      this._actions$.pipe(
        ofType(TaskSharedActions.deleteTask),
        filter(({ task }) => task.issueType === CALDAV_TYPE && !!task.issueId),
        concatMap(({ task }) => {
          if (!task.issueProviderId) {
            return EMPTY;
          }
          return this._issueProviderService
            .getCfgOnce$(task.issueProviderId, 'CALDAV')
            .pipe(map((caldavCfg) => ({ caldavCfg, task })));
        }),
        // Only for VEVENT with enableWriteBack
        filter(
          ({ caldavCfg }) =>
            isCaldavEnabled(caldavCfg) &&
            caldavCfg.componentType === 'VEVENT' &&
            caldavCfg.enableWriteBack,
        ),
        switchMap(({ caldavCfg, task }) => {
          return this._openDeleteEventDialog(task).pipe(
            switchMap((result: CaldavDeleteEventDialogResult | undefined) => {
              if (result === 'delete-both') {
                return this._caldavClientService
                  .deleteEvent$(caldavCfg, assertTruthy(task.issueId))
                  .pipe(
                    tap(() => {
                      this._snackService.open({
                        type: 'SUCCESS',
                        msg: T.F.CALDAV.S.EVENT_DELETED,
                      });
                    }),
                  );
              }
              // 'keep-event' or dialog dismissed - do nothing
              return EMPTY;
            }),
          );
        }),
      ),
    { dispatch: false },
  );

  private _openDeleteEventDialog(
    task: TaskWithSubTasks,
  ): Observable<CaldavDeleteEventDialogResult | undefined> {
    return this._matDialog
      .open(DialogCaldavDeleteEventComponent, {
        restoreFocus: true,
        data: {
          taskTitle: task.title,
        },
      })
      .afterClosed();
  }

  private _handleVTodoTransition$(caldavCfg: CaldavCfg, task: Task): Observable<any> {
    return this._caldavClientService
      .updateState$(caldavCfg, assertTruthy(task.issueId), task.isDone, task.title)
      .pipe(concatMap(() => this._issueService.refreshIssueTask(task, true)));
  }

  private _handleVEventUpdate$(
    caldavCfg: CaldavCfg,
    task: Task,
    changes: Partial<Task>,
  ): Observable<any> {
    const updates: {
      summary?: string;
      description?: string;
      dtstart?: number;
      dtend?: number;
    } = {};

    if ('title' in changes && changes.title) {
      updates.summary = changes.title;
    }
    if ('notes' in changes) {
      updates.description = changes.notes || '';
    }
    if ('dueWithTime' in changes && changes.dueWithTime) {
      updates.dtstart = changes.dueWithTime;
      // If we have a time estimate, calculate the end time
      if (task.timeEstimate) {
        updates.dtend = changes.dueWithTime + task.timeEstimate;
      }
    }

    // Only update if there are actual changes
    if (Object.keys(updates).length === 0) {
      return from(this._issueService.refreshIssueTask(task, false));
    }

    return this._caldavClientService
      .updateEvent$(caldavCfg, assertTruthy(task.issueId), updates)
      .pipe(concatMap(() => from(this._issueService.refreshIssueTask(task, true))));
  }
}
