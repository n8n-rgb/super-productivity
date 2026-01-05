import {
  CaldavIssue,
  CaldavEvent,
  CaldavIssueOrEvent,
  isCaldavEvent,
} from './caldav-issue.model';

describe('caldav-issue.model', () => {
  describe('isCaldavEvent', () => {
    it('should return true for CaldavEvent objects', () => {
      const event: CaldavEvent = {
        id: 'event-123',
        item_url: 'https://calendar.example.com/event-123.ics',
        summary: 'Team Meeting',
        start: Date.now(),
        etag_hash: 12345,
        isAllDay: false,
        completed: false,
        labels: ['work'],
        duration: 3600000,
        categories: ['work'],
      };

      expect(isCaldavEvent(event)).toBe(true);
    });

    it('should return true for all-day CaldavEvent objects', () => {
      const allDayEvent: CaldavEvent = {
        id: 'event-456',
        item_url: 'https://calendar.example.com/event-456.ics',
        summary: 'Conference',
        start: Date.now(),
        etag_hash: 67890,
        isAllDay: true,
        completed: false,
        labels: [],
        duration: 86400000,
        categories: [],
      };

      expect(isCaldavEvent(allDayEvent)).toBe(true);
    });

    it('should return false for CaldavIssue objects (VTODO)', () => {
      const issue: CaldavIssue = {
        id: 'todo-123',
        completed: false,
        item_url: 'https://calendar.example.com/todo-123.ics',
        summary: 'Complete report',
        labels: ['urgent'],
        etag_hash: 11111,
      };

      expect(isCaldavEvent(issue)).toBe(false);
    });

    it('should return false for CaldavIssue with optional fields', () => {
      const issue: CaldavIssue = {
        id: 'todo-456',
        completed: true,
        item_url: 'https://calendar.example.com/todo-456.ics',
        summary: 'Review PR',
        labels: [],
        etag_hash: 22222,
        due: Date.now() + 86400000,
        note: 'Important review',
        status: 'COMPLETED',
        priority: 1,
      };

      expect(isCaldavEvent(issue)).toBe(false);
    });

    it('should correctly distinguish between VEVENT and VTODO with similar fields', () => {
      // CaldavEvent has isAllDay, CaldavIssue does not
      const eventLike: CaldavIssueOrEvent = {
        id: 'item-1',
        item_url: 'https://calendar.example.com/item-1.ics',
        summary: 'Some item',
        start: Date.now(),
        labels: [],
        etag_hash: 33333,
        isAllDay: false,
        completed: false,
        duration: 3600000,
        categories: [],
      } as CaldavEvent;

      const issueLike: CaldavIssueOrEvent = {
        id: 'item-2',
        item_url: 'https://calendar.example.com/item-2.ics',
        summary: 'Some task',
        start: Date.now(),
        labels: [],
        etag_hash: 44444,
        completed: false,
      } as CaldavIssue;

      expect(isCaldavEvent(eventLike)).toBe(true);
      expect(isCaldavEvent(issueLike)).toBe(false);
    });
  });

  describe('CaldavEvent type compatibility', () => {
    it('should have completed field for type compatibility', () => {
      const event: CaldavEvent = {
        id: 'event-789',
        item_url: 'https://calendar.example.com/event-789.ics',
        summary: 'Meeting',
        start: Date.now(),
        etag_hash: 55555,
        isAllDay: false,
        completed: false, // Always false for events
        labels: [],
        duration: 1800000,
        categories: [],
      };

      // completed should always be false for events
      expect(event.completed).toBe(false);
    });

    it('should have labels field aliased from categories', () => {
      const categories = ['work', 'important'];
      const event: CaldavEvent = {
        id: 'event-101',
        item_url: 'https://calendar.example.com/event-101.ics',
        summary: 'Planning',
        start: Date.now(),
        etag_hash: 66666,
        isAllDay: false,
        completed: false,
        labels: categories, // Same as categories
        duration: 3600000,
        categories: categories,
      };

      expect(event.labels).toEqual(categories);
      expect(event.categories).toEqual(categories);
    });
  });

  describe('CaldavEvent optional fields', () => {
    it('should allow optional end time', () => {
      const eventWithEnd: CaldavEvent = {
        id: 'event-201',
        item_url: 'https://calendar.example.com/event-201.ics',
        summary: 'With end time',
        start: Date.now(),
        end: Date.now() + 3600000,
        etag_hash: 77777,
        isAllDay: false,
        completed: false,
        labels: [],
        duration: 3600000,
        categories: [],
      };

      const eventWithoutEnd: CaldavEvent = {
        id: 'event-202',
        item_url: 'https://calendar.example.com/event-202.ics',
        summary: 'Without end time',
        start: Date.now(),
        etag_hash: 88888,
        isAllDay: false,
        completed: false,
        labels: [],
        duration: 3600000,
        categories: [],
      };

      expect(eventWithEnd.end).toBeDefined();
      expect(eventWithoutEnd.end).toBeUndefined();
    });

    it('should allow optional description', () => {
      const eventWithDescription: CaldavEvent = {
        id: 'event-301',
        item_url: 'https://calendar.example.com/event-301.ics',
        summary: 'With description',
        description: 'This is a detailed description',
        start: Date.now(),
        etag_hash: 99999,
        isAllDay: false,
        completed: false,
        labels: [],
        duration: 3600000,
        categories: [],
      };

      expect(eventWithDescription.description).toBe('This is a detailed description');
    });

    it('should allow optional location', () => {
      const eventWithLocation: CaldavEvent = {
        id: 'event-401',
        item_url: 'https://calendar.example.com/event-401.ics',
        summary: 'With location',
        location: 'Conference Room A',
        start: Date.now(),
        etag_hash: 10101,
        isAllDay: false,
        completed: false,
        labels: [],
        duration: 3600000,
        categories: [],
      };

      expect(eventWithLocation.location).toBe('Conference Room A');
    });
  });
});
