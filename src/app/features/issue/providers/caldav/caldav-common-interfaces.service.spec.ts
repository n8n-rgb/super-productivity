import { TestBed } from '@angular/core/testing';
import { CaldavCommonInterfacesService } from './caldav-common-interfaces.service';
import { CaldavClientService } from './caldav-client.service';
import { IssueProviderService } from '../../issue-provider.service';
import { CaldavIssue, CaldavEvent } from './caldav-issue.model';
import { getDbDateStr } from '../../../../util/get-db-date-str';
import { of } from 'rxjs';
import { Task } from '../../../tasks/task.model';
import { IssueProviderCaldav } from '../../issue.model';

describe('CaldavCommonInterfacesService', () => {
  let service: CaldavCommonInterfacesService;
  let caldavClientServiceSpy: jasmine.SpyObj<CaldavClientService>;
  let issueProviderServiceSpy: jasmine.SpyObj<IssueProviderService>;

  const createMockVTODOConfig = (): IssueProviderCaldav =>
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

  const createMockVEVENTConfig = (): IssueProviderCaldav =>
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

  beforeEach(() => {
    caldavClientServiceSpy = jasmine.createSpyObj('CaldavClientService', [
      'getOpenTasks$',
      'getOpenEvents$',
      'searchOpenTasks$',
      'searchOpenEvents$',
      'getById$',
      'getEventById$',
      'getByIds$',
    ]);
    issueProviderServiceSpy = jasmine.createSpyObj('IssueProviderService', [
      'getCfgOnce$',
    ]);

    TestBed.configureTestingModule({
      providers: [
        CaldavCommonInterfacesService,
        { provide: CaldavClientService, useValue: caldavClientServiceSpy },
        { provide: IssueProviderService, useValue: issueProviderServiceSpy },
      ],
    });
    service = TestBed.inject(CaldavCommonInterfacesService);
  });

  describe('getAddTaskData', () => {
    describe('VTODO handling', () => {
      it('should map VTODO issue to task data', () => {
        const vtodo: CaldavIssue = {
          id: 'todo-123',
          completed: false,
          item_url: 'https://caldav.example.com/todo-123.ics',
          summary: 'Complete documentation',
          labels: ['work'],
          etag_hash: 12345,
          note: 'Remember to add examples',
          start: new Date('2025-01-15T10:00:00Z').getTime(),
        };

        const result = service.getAddTaskData(vtodo);

        expect(result.title).toBe('Complete documentation');
        expect(result.issueLastUpdated).toBe(12345);
        expect(result.notes).toBe('Remember to add examples');
        expect(result.dueWithTime).toBe(vtodo.start);
      });

      it('should handle VTODO with related_to field', () => {
        const vtodo: CaldavIssue = {
          id: 'todo-456',
          completed: false,
          item_url: 'https://caldav.example.com/todo-456.ics',
          summary: 'Sub-task',
          labels: [],
          etag_hash: 67890,
          related_to: 'parent-todo-123',
        };

        const result = service.getAddTaskData(vtodo);

        expect(result.related_to).toBe('parent-todo-123');
      });
    });

    describe('VEVENT handling', () => {
      it('should use dueDay for all-day events', () => {
        const allDayEvent: CaldavEvent = {
          id: 'event-123',
          item_url: 'https://caldav.example.com/event-123.ics',
          summary: 'All Day Conference',
          start: new Date('2025-01-15T00:00:00Z').getTime(),
          etag_hash: 11111,
          isAllDay: true,
          completed: false,
          labels: ['conference'],
          duration: 86400000,
          categories: ['conference'],
          description: 'Annual team conference',
        };

        const result = service.getAddTaskData(allDayEvent);

        expect(result.title).toBe('All Day Conference');
        expect(result.dueDay).toBe(getDbDateStr(allDayEvent.start));
        expect(result.dueWithTime).toBeUndefined();
        expect(result.notes).toBe('Annual team conference');
        expect(result.timeEstimate).toBe(86400000);
      });

      it('should use dueWithTime for timed events', () => {
        const timedEvent: CaldavEvent = {
          id: 'event-456',
          item_url: 'https://caldav.example.com/event-456.ics',
          summary: 'Team Meeting',
          start: new Date('2025-01-15T14:30:00Z').getTime(),
          etag_hash: 22222,
          isAllDay: false,
          completed: false,
          labels: ['meeting'],
          duration: 3600000, // 1 hour
          categories: ['meeting'],
        };

        const result = service.getAddTaskData(timedEvent);

        expect(result.title).toBe('Team Meeting');
        expect(result.dueWithTime).toBe(timedEvent.start);
        expect(result.dueDay).toBeUndefined();
        expect(result.timeEstimate).toBe(3600000);
      });

      it('should handle event without description', () => {
        const eventNoDescription: CaldavEvent = {
          id: 'event-789',
          item_url: 'https://caldav.example.com/event-789.ics',
          summary: 'Quick sync',
          start: Date.now(),
          etag_hash: 33333,
          isAllDay: false,
          completed: false,
          labels: [],
          duration: 1800000,
          categories: [],
        };

        const result = service.getAddTaskData(eventNoDescription);

        expect(result.notes).toBeUndefined();
      });

      it('should map etag_hash to issueLastUpdated', () => {
        const event: CaldavEvent = {
          id: 'event-101',
          item_url: 'https://caldav.example.com/event-101.ics',
          summary: 'Test event',
          start: Date.now(),
          etag_hash: 99999,
          isAllDay: false,
          completed: false,
          labels: [],
          duration: 3600000,
          categories: [],
        };

        const result = service.getAddTaskData(event);

        expect(result.issueLastUpdated).toBe(99999);
      });
    });
  });

  describe('isEnabled', () => {
    it('should return true for valid VTODO config', () => {
      const cfg = createMockVTODOConfig();
      expect(service.isEnabled(cfg)).toBe(true);
    });

    it('should return true for valid VEVENT config with bearer token', () => {
      const cfg = createMockVEVENTConfig();
      expect(service.isEnabled(cfg)).toBe(true);
    });

    it('should return false for config with missing caldavUrl', () => {
      const cfg = createMockVTODOConfig();
      cfg.caldavUrl = '';
      expect(service.isEnabled(cfg)).toBe(false);
    });

    it('should return false for disabled config', () => {
      const cfg = createMockVTODOConfig();
      cfg.isEnabled = false;
      expect(service.isEnabled(cfg)).toBe(false);
    });
  });

  describe('searchIssues', () => {
    it('should search VTODO tasks for VTODO config', async () => {
      const vtodoConfig = createMockVTODOConfig();
      const searchResults = [
        { title: 'Task 1', issueType: 'CALDAV' as const, issueData: {} },
      ];

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(vtodoConfig));
      caldavClientServiceSpy.searchOpenTasks$.and.returnValue(of(searchResults as any));

      const result = await service.searchIssues('task', 'provider-vtodo');

      expect(caldavClientServiceSpy.searchOpenTasks$).toHaveBeenCalledWith(
        'task',
        vtodoConfig,
      );
      expect(caldavClientServiceSpy.searchOpenEvents$).not.toHaveBeenCalled();
      expect(result).toEqual(searchResults as any);
    });

    it('should search VEVENT events for VEVENT config', async () => {
      const veventConfig = createMockVEVENTConfig();
      const searchResults = [
        { title: 'Meeting 1', issueType: 'CALDAV' as const, issueData: {} },
      ];

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.searchOpenEvents$.and.returnValue(of(searchResults as any));

      const result = await service.searchIssues('meeting', 'provider-vevent');

      expect(caldavClientServiceSpy.searchOpenEvents$).toHaveBeenCalledWith(
        'meeting',
        veventConfig,
      );
      expect(caldavClientServiceSpy.searchOpenTasks$).not.toHaveBeenCalled();
      expect(result).toEqual(searchResults as any);
    });

    it('should return empty array for disabled config', async () => {
      const disabledConfig = createMockVTODOConfig();
      disabledConfig.isEnabled = false;

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(disabledConfig));

      const result = await service.searchIssues('search', 'provider-vtodo');

      expect(result).toEqual([]);
    });
  });

  describe('getNewIssuesToAddToBacklog', () => {
    it('should fetch VTODO tasks for VTODO config', async () => {
      const vtodoConfig = createMockVTODOConfig();
      const tasks: CaldavIssue[] = [
        {
          id: 'todo-1',
          completed: false,
          item_url: 'url1',
          summary: 'Task 1',
          labels: [],
          etag_hash: 1,
        },
      ];

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(vtodoConfig));
      caldavClientServiceSpy.getOpenTasks$.and.returnValue(of(tasks));

      const result = await service.getNewIssuesToAddToBacklog('provider-vtodo', []);

      expect(caldavClientServiceSpy.getOpenTasks$).toHaveBeenCalledWith(vtodoConfig);
      expect(caldavClientServiceSpy.getOpenEvents$).not.toHaveBeenCalled();
      expect(result).toEqual(tasks);
    });

    it('should fetch VEVENT events for VEVENT config', async () => {
      const veventConfig = createMockVEVENTConfig();
      const events: CaldavEvent[] = [
        {
          id: 'event-1',
          item_url: 'url1',
          summary: 'Event 1',
          start: Date.now(),
          etag_hash: 1,
          isAllDay: false,
          completed: false,
          labels: [],
          duration: 3600000,
          categories: [],
        },
      ];

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.getOpenEvents$.and.returnValue(of(events));

      const result = await service.getNewIssuesToAddToBacklog('provider-vevent', []);

      expect(caldavClientServiceSpy.getOpenEvents$).toHaveBeenCalledWith(veventConfig);
      expect(caldavClientServiceSpy.getOpenTasks$).not.toHaveBeenCalled();
      expect(result).toEqual(events);
    });
  });

  describe('getById', () => {
    it('should fetch VTODO by ID for VTODO config', async () => {
      const vtodoConfig = createMockVTODOConfig();
      const task: CaldavIssue = {
        id: 'todo-123',
        completed: false,
        item_url: 'url1',
        summary: 'Task',
        labels: [],
        etag_hash: 1,
      };

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(vtodoConfig));
      caldavClientServiceSpy.getById$.and.returnValue(of(task));

      const result = await service.getById('todo-123', 'provider-vtodo');

      expect(caldavClientServiceSpy.getById$).toHaveBeenCalledWith(
        'todo-123',
        vtodoConfig,
      );
      expect(result).toEqual(task);
    });

    it('should fetch VEVENT by ID for VEVENT config', async () => {
      const veventConfig = createMockVEVENTConfig();
      const event: CaldavEvent = {
        id: 'event-123',
        item_url: 'url1',
        summary: 'Event',
        start: Date.now(),
        etag_hash: 1,
        isAllDay: false,
        completed: false,
        labels: [],
        duration: 3600000,
        categories: [],
      };

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.getEventById$.and.returnValue(of(event));

      const result = await service.getById('event-123', 'provider-vevent');

      expect(caldavClientServiceSpy.getEventById$).toHaveBeenCalledWith(
        'event-123',
        veventConfig,
      );
      expect(result).toEqual(event);
    });
  });

  describe('getFreshDataForIssueTask', () => {
    it('should throw error when task has no issueProviderId', async () => {
      const task = { issueId: 'event-1' } as Task;

      await expectAsync(service.getFreshDataForIssueTask(task)).toBeRejectedWithError(
        'No issueProviderId',
      );
    });

    it('should throw error when task has no issueId', async () => {
      const task = { issueProviderId: 'provider-1' } as Task;

      await expectAsync(service.getFreshDataForIssueTask(task)).toBeRejectedWithError(
        'No issueId',
      );
    });

    it('should return null when issue has not been updated', async () => {
      const veventConfig = createMockVEVENTConfig();
      const task = {
        id: 'task-1',
        issueId: 'event-123',
        issueProviderId: 'provider-vevent',
        issueLastUpdated: 12345,
      } as Task;

      const event: CaldavEvent = {
        id: 'event-123',
        item_url: 'url1',
        summary: 'Event',
        start: Date.now(),
        etag_hash: 12345, // Same as task.issueLastUpdated
        isAllDay: false,
        completed: false,
        labels: [],
        duration: 3600000,
        categories: [],
      };

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.getEventById$.and.returnValue(of(event));

      const result = await service.getFreshDataForIssueTask(task);

      expect(result).toBeNull();
    });

    it('should return taskChanges when issue has been updated', async () => {
      const veventConfig = createMockVEVENTConfig();
      const task = {
        id: 'task-1',
        issueId: 'event-123',
        issueProviderId: 'provider-vevent',
        issueLastUpdated: 12345,
      } as Task;

      const event: CaldavEvent = {
        id: 'event-123',
        item_url: 'url1',
        summary: 'Updated Event Title',
        start: Date.now(),
        etag_hash: 67890, // Different from task.issueLastUpdated
        isAllDay: false,
        completed: false,
        labels: [],
        duration: 3600000,
        categories: [],
      };

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.getEventById$.and.returnValue(of(event));

      const result = await service.getFreshDataForIssueTask(task);

      expect(result).not.toBeNull();
      expect(result!.taskChanges.title).toBe('Updated Event Title');
      expect(result!.taskChanges.issueWasUpdated).toBe(true);
      expect(result!.issue).toEqual(event);
    });
  });

  describe('getFreshDataForIssueTasks', () => {
    it('should throw error when no issueProviderId', async () => {
      const tasks = [{ id: 'task-1', issueId: 'event-1' } as Task];

      await expectAsync(service.getFreshDataForIssueTasks(tasks)).toBeRejectedWithError(
        'No issueProviderId',
      );
    });

    it('should return tasks with updated etag_hash for VEVENT', async () => {
      const veventConfig = createMockVEVENTConfig();
      const tasks = [
        {
          id: 'task-1',
          issueId: 'event-1',
          issueProviderId: 'provider-vevent',
          issueLastUpdated: 11111,
        } as Task,
        {
          id: 'task-2',
          issueId: 'event-2',
          issueProviderId: 'provider-vevent',
          issueLastUpdated: 22222,
        } as Task,
      ];

      const events: CaldavEvent[] = [
        {
          id: 'event-1',
          item_url: 'url1',
          summary: 'Event 1 Updated',
          start: Date.now(),
          etag_hash: 99999, // Changed
          isAllDay: false,
          completed: false,
          labels: [],
          duration: 3600000,
          categories: [],
        },
        {
          id: 'event-2',
          item_url: 'url2',
          summary: 'Event 2',
          start: Date.now(),
          etag_hash: 22222, // Same - no change
          isAllDay: false,
          completed: false,
          labels: [],
          duration: 3600000,
          categories: [],
        },
      ];

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(veventConfig));
      caldavClientServiceSpy.getOpenEvents$.and.returnValue(of(events));

      const result = await service.getFreshDataForIssueTasks(tasks);

      // Only task-1 should be in results (event-1 changed)
      expect(result.length).toBe(1);
      expect(result[0].task.id).toBe('task-1');
      expect(result[0].taskChanges.title).toBe('Event 1 Updated');
      expect(result[0].taskChanges.issueWasUpdated).toBe(true);
    });

    it('should use getByIds$ for VTODO config', async () => {
      const vtodoConfig = createMockVTODOConfig();
      const tasks = [
        {
          id: 'task-1',
          issueId: 'todo-1',
          issueProviderId: 'provider-vtodo',
          issueLastUpdated: 11111,
        } as Task,
      ];

      const todos: CaldavIssue[] = [
        {
          id: 'todo-1',
          completed: true, // Changed
          item_url: 'url1',
          summary: 'Task 1',
          labels: [],
          etag_hash: 99999, // Changed
        },
      ];

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(vtodoConfig));
      caldavClientServiceSpy.getByIds$.and.returnValue(of(todos));

      const result = await service.getFreshDataForIssueTasks(tasks);

      expect(caldavClientServiceSpy.getByIds$).toHaveBeenCalled();
      expect(caldavClientServiceSpy.getOpenEvents$).not.toHaveBeenCalled();
      expect(result.length).toBe(1);
    });

    it('should filter out tasks without issueId', async () => {
      const vtodoConfig = createMockVTODOConfig();
      const tasks = [
        {
          id: 'task-1',
          issueId: 'todo-1',
          issueProviderId: 'provider-vtodo',
          issueLastUpdated: 11111,
        } as Task,
        {
          id: 'task-2',
          issueId: undefined, // No issueId
          issueProviderId: 'provider-vtodo',
          issueLastUpdated: 22222,
        } as Task,
      ];

      const todos: CaldavIssue[] = [
        {
          id: 'todo-1',
          completed: false,
          item_url: 'url1',
          summary: 'Task 1',
          labels: [],
          etag_hash: 99999,
        },
      ];

      issueProviderServiceSpy.getCfgOnce$.and.returnValue(of(vtodoConfig));
      caldavClientServiceSpy.getByIds$.and.returnValue(of(todos));

      await service.getFreshDataForIssueTasks(tasks);

      // getByIds$ should only receive task with issueId
      const callArgs = caldavClientServiceSpy.getByIds$.calls.mostRecent().args;
      expect(callArgs[0]).toEqual(['todo-1']);
    });
  });

  describe('pollInterval', () => {
    it('should have correct poll interval', () => {
      // CALDAV_POLL_INTERVAL is 10 minutes (600000ms)
      expect(service.pollInterval).toBe(10 * 60 * 1000);
    });
  });

  describe('testConnection', () => {
    it('should test VTODO connection for VTODO config', async () => {
      const vtodoConfig = createMockVTODOConfig();
      caldavClientServiceSpy.searchOpenTasks$.and.returnValue(of([]));

      const result = await service.testConnection(vtodoConfig);

      expect(caldavClientServiceSpy.searchOpenTasks$).toHaveBeenCalledWith(
        '',
        vtodoConfig,
      );
      expect(result).toBe(true);
    });

    it('should test VEVENT connection for VEVENT config', async () => {
      const veventConfig = createMockVEVENTConfig();
      caldavClientServiceSpy.searchOpenEvents$.and.returnValue(of([]));

      const result = await service.testConnection(veventConfig);

      expect(caldavClientServiceSpy.searchOpenEvents$).toHaveBeenCalledWith(
        '',
        veventConfig,
      );
      expect(result).toBe(true);
    });
  });
});
