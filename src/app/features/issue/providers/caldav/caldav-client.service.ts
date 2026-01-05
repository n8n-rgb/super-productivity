import { Injectable, inject } from '@angular/core';
import { CaldavCfg } from './caldav.model';
// @ts-ignore
import DavClient, { namespaces as NS } from '@nextcloud/cdav-library';
// @ts-ignore
import Calendar from 'cdav-library/models/calendar';
// @ts-ignore
import ICAL from 'ical.js';

import { from, Observable, throwError } from 'rxjs';
import { CaldavIssue, CaldavIssueStatus, CaldavEvent } from './caldav-issue.model';
import { CALDAV_TYPE, ISSUE_PROVIDER_HUMANIZED } from '../../issue.const';
import { SearchResultItem } from '../../issue.model';
import { SnackService } from '../../../../core/snack/snack.service';
import { T } from '../../../../t.const';
import { catchError } from 'rxjs/operators';
import { HANDLED_ERROR_PROP_STR } from '../../../../app.constants';
import { throwHandledError } from '../../../../util/throw-handled-error';
import { IssueLog } from '../../../../core/log';

interface ClientCache {
  client: DavClient;
  calendars: Map<string, Calendar>;
}

interface CalDavTaskData {
  data: string;
  url: string;
  etag: string;
  update?: () => Promise<void>;
}

@Injectable({
  providedIn: 'root',
})
export class CaldavClientService {
  private readonly _snackService = inject(SnackService);

  private _clientCache = new Map<string, ClientCache>();

  private static _isValidSettings(cfg: CaldavCfg): boolean {
    const hasBaseSettings =
      !!cfg &&
      !!cfg.caldavUrl &&
      cfg.caldavUrl.length > 0 &&
      !!cfg.resourceName &&
      cfg.resourceName.length > 0;

    if (!hasBaseSettings) {
      return false;
    }

    // Check auth based on authType
    if (cfg.authType === 'bearer') {
      return !!cfg.bearerToken && cfg.bearerToken.length > 0;
    } else {
      // Default to basic auth
      return (
        !!cfg.username &&
        cfg.username.length > 0 &&
        !!cfg.password &&
        cfg.password.length > 0
      );
    }
  }

  private static _getCalendarUriFromUrl(url: string): string {
    if (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }

    return url.substring(url.lastIndexOf('/') + 1);
  }

  private static async _getAllTodos(
    calendar: Calendar,
    filterOpen: boolean,
  ): Promise<CalDavTaskData[]> {
    const query = {
      name: [NS.IETF_CALDAV, 'comp-filter'],
      attributes: [['name', 'VCALENDAR']],
      children: [
        {
          name: [NS.IETF_CALDAV, 'comp-filter'],
          attributes: [['name', 'VTODO']],
        },
      ],
    };

    if (filterOpen) {
      // @ts-ignore
      query.children[0].children = [
        {
          name: [NS.IETF_CALDAV, 'prop-filter'],
          attributes: [['name', 'completed']],
          children: [
            {
              name: [NS.IETF_CALDAV, 'is-not-defined'],
            },
          ],
        },
      ];
    }

    return await calendar.calendarQuery([query]);
  }

  private static async _findTaskByUid(
    calendar: Calendar,
    taskUid: string,
  ): Promise<CalDavTaskData[]> {
    const query = {
      name: [NS.IETF_CALDAV, 'comp-filter'],
      attributes: [['name', 'VCALENDAR']],
      children: [
        {
          name: [NS.IETF_CALDAV, 'comp-filter'],
          attributes: [['name', 'VTODO']],
          children: [
            {
              name: [NS.IETF_CALDAV, 'prop-filter'],
              attributes: [['name', 'uid']],
              children: [
                {
                  name: [NS.IETF_CALDAV, 'text-match'],
                  value: taskUid,
                },
              ],
            },
          ],
        },
      ],
    };
    return await calendar.calendarQuery([query]);
  }

  private static _mapTask(task: CalDavTaskData): CaldavIssue {
    const jCal = ICAL.parse(task.data);
    const comp = new ICAL.Component(jCal);
    const todo = comp.getFirstSubcomponent('vtodo');

    if (!todo) {
      IssueLog.log(task);
      throw new Error('No todo found for task');
    }

    const categoriesProperty = todo.getAllProperties('categories')[0];
    const categories: string[] = categoriesProperty?.getValues() || [];

    return {
      id: todo.getFirstPropertyValue('uid') as string,
      completed: !!todo.getFirstPropertyValue('completed'),
      item_url: task.url,
      summary: (todo.getFirstPropertyValue('summary') as string) || '',
      start: (todo.getFirstPropertyValue('dtstart') as ICAL.Time)?.toJSDate().getTime(),
      due: (todo.getFirstPropertyValue('due') as ICAL.Time)?.toJSDate().getTime(),
      note: (todo.getFirstPropertyValue('description') as string) || undefined,
      status: (todo.getFirstPropertyValue('status') as CaldavIssueStatus) || undefined,
      priority: +(todo.getFirstPropertyValue('priority') as string) || undefined,
      percent_complete:
        +(todo.getFirstPropertyValue('percent-complete') as string) || undefined,
      location: todo.getFirstPropertyValue('location') as string,
      labels: categories,
      etag_hash: this._hashEtag(task.etag),
      related_to: (todo.getFirstPropertyValue('related-to') as string) || undefined,
    };
  }

  private static _hashEtag(etag: string): number {
    let hash = 0;
    let i;
    let chr;
    if (etag.length === 0) {
      return hash;
    }
    for (i = 0; i < etag.length; i++) {
      chr = etag.charCodeAt(i);
      hash = (hash << 5) - hash + chr; //eslint-disable-line no-bitwise
      // Convert to 32bit integer
      hash |= 0; //eslint-disable-line no-bitwise
    }
    return hash;
  }

  // VEVENT support methods
  private static async _getAllEvents(
    calendar: Calendar,
    startDate: Date,
    endDate: Date,
  ): Promise<CalDavTaskData[]> {
    const formatDate = (d: Date): string =>
      d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const query = {
      name: [NS.IETF_CALDAV, 'comp-filter'],
      attributes: [['name', 'VCALENDAR']],
      children: [
        {
          name: [NS.IETF_CALDAV, 'comp-filter'],
          attributes: [['name', 'VEVENT']],
          children: [
            {
              name: [NS.IETF_CALDAV, 'time-range'],
              attributes: [
                ['start', formatDate(startDate)],
                ['end', formatDate(endDate)],
              ],
            },
          ],
        },
      ],
    };

    return await calendar.calendarQuery([query]);
  }

  private static async _findEventByUid(
    calendar: Calendar,
    eventUid: string,
  ): Promise<CalDavTaskData[]> {
    const query = {
      name: [NS.IETF_CALDAV, 'comp-filter'],
      attributes: [['name', 'VCALENDAR']],
      children: [
        {
          name: [NS.IETF_CALDAV, 'comp-filter'],
          attributes: [['name', 'VEVENT']],
          children: [
            {
              name: [NS.IETF_CALDAV, 'prop-filter'],
              attributes: [['name', 'uid']],
              children: [
                {
                  name: [NS.IETF_CALDAV, 'text-match'],
                  value: eventUid,
                },
              ],
            },
          ],
        },
      ],
    };
    return await calendar.calendarQuery([query]);
  }

  private static _mapEvent(event: CalDavTaskData): CaldavEvent {
    const jCal = ICAL.parse(event.data);
    const comp = new ICAL.Component(jCal);
    const vevent = comp.getFirstSubcomponent('vevent');

    if (!vevent) {
      IssueLog.log(event);
      throw new Error('No vevent found for event');
    }

    const categoriesProperty = vevent.getAllProperties('categories')[0];
    const categories: string[] = categoriesProperty?.getValues() || [];

    const dtstart = vevent.getFirstPropertyValue('dtstart') as ICAL.Time;
    const dtend = vevent.getFirstPropertyValue('dtend') as ICAL.Time;
    const durationProp = vevent.getFirstPropertyValue(
      'duration',
    ) as unknown as ICAL.Duration;

    // Detect all-day events: VALUE=DATE means no time component
    const isAllDay = dtstart?.isDate || false;

    const startTime = dtstart?.toJSDate().getTime() || Date.now();
    let endTime: number | undefined;
    let duration: number;

    if (dtend) {
      endTime = dtend.toJSDate().getTime();
      duration = endTime - startTime;
    } else if (durationProp) {
      duration = durationProp.toSeconds() * 1000;
      endTime = startTime + duration;
    } else if (isAllDay) {
      // All-day events without end default to 1 day
      duration = 24 * 60 * 60 * 1000;
      endTime = startTime + duration;
    } else {
      // Default to 1 hour for timed events without duration
      duration = 60 * 60 * 1000;
      endTime = startTime + duration;
    }

    return {
      id: vevent.getFirstPropertyValue('uid') as string,
      item_url: event.url,
      summary: (vevent.getFirstPropertyValue('summary') as string) || '',
      start: startTime,
      end: endTime,
      duration,
      description: (vevent.getFirstPropertyValue('description') as string) || undefined,
      location: (vevent.getFirstPropertyValue('location') as string) || undefined,
      categories,
      etag_hash: this._hashEtag(event.etag),
      isAllDay,
      // For type compatibility with CaldavIssue
      completed: false, // Events don't have completion status
      labels: categories, // Alias for categories
    };
  }

  async _get_client(cfg: CaldavCfg): Promise<ClientCache> {
    this._checkSettings(cfg);

    // Cache key depends on auth type
    const authPart =
      cfg.authType === 'bearer'
        ? `bearer|${cfg.bearerToken}`
        : `basic|${cfg.username}|${cfg.password}`;
    const client_key = `${cfg.caldavUrl}|${authPart}`;

    if (this._clientCache.has(client_key)) {
      return this._clientCache.get(client_key) as ClientCache;
    } else {
      const client = new DavClient(
        {
          rootUrl: cfg.caldavUrl,
        },
        this._getXhrProvider(cfg),
      );

      await client
        .connect({ enableCalDAV: true })
        .catch((err) => this._handleNetErr(err));

      const cache = {
        client,
        calendars: new Map(),
      };
      this._clientCache.set(client_key, cache);

      return cache;
    }
  }

  async _getCalendar(cfg: CaldavCfg): Promise<Calendar> {
    const clientCache = await this._get_client(cfg);
    const resource = cfg.resourceName as string;

    if (clientCache.calendars.has(resource)) {
      return clientCache.calendars.get(resource);
    }

    const calendars = await clientCache.client.calendarHomes[0]
      .findAllCalendars()
      .catch((err) => this._handleNetErr(err));

    const calendar = calendars.find(
      (item: Calendar) =>
        (item.displayname || CaldavClientService._getCalendarUriFromUrl(item.url)) ===
        resource,
    );

    if (calendar !== undefined) {
      clientCache.calendars.set(resource, calendar);
      return calendar;
    }

    this._snackService.open({
      type: 'ERROR',
      translateParams: {
        calendarName: cfg.resourceName as string,
      },
      msg: T.F.CALDAV.S.CALENDAR_NOT_FOUND,
    });
    throw new Error('CALENDAR NOT FOUND: ' + cfg.resourceName);
  }

  getOpenTasks$(cfg: CaldavCfg): Observable<CaldavIssue[]> {
    return from(this._getTasks(cfg, true, true)).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  searchOpenTasks$(text: string, cfg: CaldavCfg): Observable<SearchResultItem[]> {
    return from(
      this._getTasks(cfg, true, true).then((tasks) =>
        tasks
          .filter((todo) => todo.summary.includes(text))
          .map((todo) => {
            return {
              title: todo.summary,
              issueType: CALDAV_TYPE,
              issueData: todo,
            };
          }),
      ),
    ).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  getById$(id: string | number, caldavCfg: CaldavCfg): Observable<CaldavIssue> {
    if (typeof id === 'number') {
      id = id.toString(10);
    }
    return from(this._getTask(caldavCfg, id)).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  getByIds$(ids: string[], cfg: CaldavCfg): Observable<CaldavIssue[]> {
    const idSet = new Set(ids);
    return from(
      this._getTasks(cfg, false, false).then((tasks) =>
        tasks.filter((task) => idSet.has(task.id)),
      ),
    ).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  updateState$(
    caldavCfg: CaldavCfg,
    issueId: string,
    completed: boolean,
    summary: string,
  ): Observable<void> {
    return from(
      this._updateTask(caldavCfg, issueId, { completed: completed, summary: summary }),
    ).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  // VEVENT public methods
  getOpenEvents$(cfg: CaldavCfg): Observable<CaldavEvent[]> {
    return from(this._getEvents(cfg, true)).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  searchOpenEvents$(text: string, cfg: CaldavCfg): Observable<SearchResultItem[]> {
    return from(
      this._getEvents(cfg, true).then((events) =>
        events
          .filter((ev) => ev.summary.toLowerCase().includes(text.toLowerCase()))
          .map((ev) => ({
            title: ev.summary,
            issueType: CALDAV_TYPE,
            issueData: ev,
          })),
      ),
    ).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  getEventById$(id: string | number, cfg: CaldavCfg): Observable<CaldavEvent> {
    if (typeof id === 'number') {
      id = id.toString(10);
    }
    return from(this._getEvent(cfg, id)).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  updateEvent$(
    cfg: CaldavCfg,
    eventId: string,
    updates: {
      summary?: string;
      description?: string;
      dtstart?: number;
      dtend?: number;
    },
  ): Observable<void> {
    return from(this._updateEvent(cfg, eventId, updates)).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  deleteEvent$(cfg: CaldavCfg, eventId: string): Observable<void> {
    return from(this._deleteEvent(cfg, eventId)).pipe(
      catchError((err) => throwError({ [HANDLED_ERROR_PROP_STR]: 'Caldav: ' + err })),
    );
  }

  private _getXhrProvider(cfg: CaldavCfg): () => XMLHttpRequest {
    // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
    function xhrProvider(): XMLHttpRequest {
      const xhr = new XMLHttpRequest();
      const oldOpen = xhr.open;

      // override open() method to add headers
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      xhr.open = function (): void {
        // @ts-ignore
        // eslint-disable-next-line prefer-rest-params
        const result = oldOpen.apply(this, arguments);
        // @ts-ignore
        xhr.setRequestHeader('X-Requested-With', 'SuperProductivity');

        // Support both Basic and Bearer auth
        if (cfg.authType === 'bearer' && cfg.bearerToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${cfg.bearerToken}`);
        } else {
          xhr.setRequestHeader(
            'Authorization',
            'Basic ' + btoa(cfg.username + ':' + cfg.password),
          );
        }
        return result;
      };
      return xhr;
    }

    return xhrProvider;
  }

  private _handleNetErr(err: unknown): never {
    this._snackService.open({
      type: 'ERROR',
      msg: T.F.ISSUE.S.ERR_NETWORK,
      translateParams: {
        issueProviderName: ISSUE_PROVIDER_HUMANIZED[CALDAV_TYPE],
      },
    });
    throw new Error('CALDAV NETWORK ERROR: ' + err);
  }

  private _checkSettings(cfg: CaldavCfg): void {
    if (!CaldavClientService._isValidSettings(cfg)) {
      this._snackService.open({
        type: 'ERROR',
        msg: T.F.ISSUE.S.ERR_NOT_CONFIGURED,
        translateParams: {
          issueProviderName: ISSUE_PROVIDER_HUMANIZED[CALDAV_TYPE],
        },
      });
      throwHandledError('CalDav: Not enough settings');
    }
  }

  private async _getTasks(
    cfg: CaldavCfg,
    filterOpen: boolean,
    filterCategory: boolean,
  ): Promise<CaldavIssue[]> {
    const cal = await this._getCalendar(cfg);
    const tasks = await CaldavClientService._getAllTodos(cal, filterOpen).catch((err) =>
      this._handleNetErr(err),
    );
    return tasks
      .map((t) => CaldavClientService._mapTask(t))
      .filter(
        (t: CaldavIssue) =>
          !filterCategory || !cfg.categoryFilter || t.labels.includes(cfg.categoryFilter),
      );
  }

  private async _getTask(cfg: CaldavCfg, uid: string): Promise<CaldavIssue> {
    const cal = await this._getCalendar(cfg);
    const task = await CaldavClientService._findTaskByUid(cal, uid).catch((err) =>
      this._handleNetErr(err),
    );

    if (task.length < 1) {
      this._snackService.open({
        type: 'ERROR',
        msg: T.F.CALDAV.S.ISSUE_NOT_FOUND,
      });
      throw new Error('ISSUE NOT FOUND: ' + uid);
    }

    return CaldavClientService._mapTask(task[0]);
  }

  private async _updateTask(
    cfg: CaldavCfg,
    uid: string,
    updates: { completed: boolean; summary: string },
  ): Promise<void> {
    const cal = await this._getCalendar(cfg);

    if (cal.readOnly) {
      this._snackService.open({
        type: 'ERROR',
        translateParams: {
          calendarName: cfg.resourceName as string,
        },
        msg: T.F.CALDAV.S.CALENDAR_READ_ONLY,
      });
      throw new Error('CALENDAR READ ONLY: ' + cfg.resourceName);
    }

    const tasks = await CaldavClientService._findTaskByUid(cal, uid).catch((err) =>
      this._handleNetErr(err),
    );

    if (tasks.length < 1) {
      this._snackService.open({
        type: 'ERROR',
        translateParams: {
          issueId: uid,
        },
        msg: T.F.CALDAV.S.ISSUE_NOT_FOUND,
      });
      throw new Error('ISSUE NOT FOUND: ' + uid);
    }

    const task = tasks[0];
    const jCal = ICAL.parse(task.data);
    const comp = new ICAL.Component(jCal);
    const todo = comp.getFirstSubcomponent('vtodo');

    if (!todo) {
      IssueLog.err('No todo found for task', task);
      return;
    }

    const now = ICAL.Time.now();
    let changeObserved = false;

    const oldCompleted = !!todo.getFirstPropertyValue('completed');
    if (updates.completed !== oldCompleted) {
      if (updates.completed) {
        todo.updatePropertyWithValue('completed', now);
      } else {
        todo.removeProperty('completed');
      }
      changeObserved = true;
    }

    const oldSummary = todo.getFirstPropertyValue('summary');
    if (updates.summary !== oldSummary) {
      todo.updatePropertyWithValue('summary', updates.summary);
      changeObserved = true;
    }

    if (!changeObserved) {
      return;
    }
    todo.updatePropertyWithValue('last-modified', now);
    todo.updatePropertyWithValue('dtstamp', now);

    // https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.7.4
    // Some calendar clients do not see updates (completion) submitted by SuperProductivity as the 'sequence' number is unchanged.
    // As 'sequence' starts at 0 and completing probably counts as a major change, then it should be at least 1 in the end,
    // if no other changes have been written.
    const sequence = todo.getFirstPropertyValue('sequence');
    const sequenceInt = sequence ? parseInt(sequence as string) + 1 : 1;
    todo.updatePropertyWithValue('sequence', sequenceInt);

    task.data = ICAL.stringify(jCal);
    if (task.update) {
      await task.update().catch((err) => this._handleNetErr(err));
    }
  }

  // VEVENT private helper methods
  private async _getEvents(
    cfg: CaldavCfg,
    filterCategory: boolean,
  ): Promise<CaldavEvent[]> {
    const cal = await this._getCalendar(cfg);

    // Get events from today to today + 30 days
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);

    const events = await CaldavClientService._getAllEvents(cal, startDate, endDate).catch(
      (err) => this._handleNetErr(err),
    );

    return events
      .map((e) => CaldavClientService._mapEvent(e))
      .filter(
        (e: CaldavEvent) =>
          !filterCategory ||
          !cfg.categoryFilter ||
          e.categories.includes(cfg.categoryFilter),
      );
  }

  private async _getEvent(cfg: CaldavCfg, uid: string): Promise<CaldavEvent> {
    const cal = await this._getCalendar(cfg);
    const events = await CaldavClientService._findEventByUid(cal, uid).catch((err) =>
      this._handleNetErr(err),
    );

    if (events.length < 1) {
      this._snackService.open({
        type: 'ERROR',
        msg: T.F.CALDAV.S.ISSUE_NOT_FOUND,
      });
      throw new Error('EVENT NOT FOUND: ' + uid);
    }

    return CaldavClientService._mapEvent(events[0]);
  }

  private async _updateEvent(
    cfg: CaldavCfg,
    uid: string,
    updates: {
      summary?: string;
      description?: string;
      dtstart?: number;
      dtend?: number;
    },
  ): Promise<void> {
    const cal = await this._getCalendar(cfg);

    if (cal.readOnly) {
      this._snackService.open({
        type: 'ERROR',
        translateParams: {
          calendarName: cfg.resourceName as string,
        },
        msg: T.F.CALDAV.S.CALENDAR_READ_ONLY,
      });
      throw new Error('CALENDAR READ ONLY: ' + cfg.resourceName);
    }

    const events = await CaldavClientService._findEventByUid(cal, uid).catch((err) =>
      this._handleNetErr(err),
    );

    if (events.length < 1) {
      this._snackService.open({
        type: 'ERROR',
        translateParams: {
          issueId: uid,
        },
        msg: T.F.CALDAV.S.ISSUE_NOT_FOUND,
      });
      throw new Error('EVENT NOT FOUND: ' + uid);
    }

    const event = events[0];
    const jCal = ICAL.parse(event.data);
    const comp = new ICAL.Component(jCal);
    const vevent = comp.getFirstSubcomponent('vevent');

    if (!vevent) {
      IssueLog.err('No vevent found for event', event);
      return;
    }

    const now = ICAL.Time.now();
    let changeObserved = false;

    if (updates.summary !== undefined) {
      const oldSummary = vevent.getFirstPropertyValue('summary');
      if (updates.summary !== oldSummary) {
        vevent.updatePropertyWithValue('summary', updates.summary);
        changeObserved = true;
      }
    }

    if (updates.description !== undefined) {
      const oldDescription = vevent.getFirstPropertyValue('description');
      if (updates.description !== oldDescription) {
        if (updates.description) {
          vevent.updatePropertyWithValue('description', updates.description);
        } else {
          vevent.removeProperty('description');
        }
        changeObserved = true;
      }
    }

    if (updates.dtstart !== undefined) {
      const newStart = ICAL.Time.fromJSDate(new Date(updates.dtstart), false);
      vevent.updatePropertyWithValue('dtstart', newStart);
      changeObserved = true;
    }

    if (updates.dtend !== undefined) {
      const newEnd = ICAL.Time.fromJSDate(new Date(updates.dtend), false);
      vevent.updatePropertyWithValue('dtend', newEnd);
      changeObserved = true;
    }

    if (!changeObserved) {
      return;
    }

    vevent.updatePropertyWithValue('last-modified', now);
    vevent.updatePropertyWithValue('dtstamp', now);

    // Increment SEQUENCE for client compatibility
    const sequence = vevent.getFirstPropertyValue('sequence');
    const sequenceInt = sequence ? parseInt(sequence as string) + 1 : 1;
    vevent.updatePropertyWithValue('sequence', sequenceInt);

    event.data = ICAL.stringify(jCal);
    if (event.update) {
      await event.update().catch((err) => this._handleNetErr(err));
    }
  }

  private async _deleteEvent(cfg: CaldavCfg, uid: string): Promise<void> {
    const cal = await this._getCalendar(cfg);

    if (cal.readOnly) {
      this._snackService.open({
        type: 'ERROR',
        translateParams: {
          calendarName: cfg.resourceName as string,
        },
        msg: T.F.CALDAV.S.CALENDAR_READ_ONLY,
      });
      throw new Error('CALENDAR READ ONLY: ' + cfg.resourceName);
    }

    const events = await CaldavClientService._findEventByUid(cal, uid).catch((err) =>
      this._handleNetErr(err),
    );

    if (events.length < 1) {
      // Event already deleted, nothing to do
      return;
    }

    const event = events[0];
    const deleteUrl = event.url;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('DELETE', deleteUrl, true); // true = async

      xhr.setRequestHeader('X-Requested-With', 'SuperProductivity');

      if (cfg.authType === 'bearer' && cfg.bearerToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${cfg.bearerToken}`);
      } else {
        xhr.setRequestHeader(
          'Authorization',
          'Basic ' + btoa(cfg.username + ':' + cfg.password),
        );
      }

      xhr.onload = (): void => {
        if (xhr.status >= 400) {
          reject(new Error(`Failed to delete event: ${xhr.status} ${xhr.statusText}`));
        } else {
          resolve();
        }
      };

      xhr.onerror = (): void => {
        reject(new Error('Network error during event deletion'));
      };

      xhr.send();
    });
  }
}
