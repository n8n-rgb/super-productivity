import { T } from '../../../../t.const';
import {
  ConfigFormSection,
  LimitedFormlyFieldConfig,
} from '../../../config/global-config.model';
import { IssueProviderCaldav } from '../../issue.model';
import { ISSUE_PROVIDER_COMMON_FORM_FIELDS } from '../../common-issue-form-stuff.const';

export const CALDAV_CONFIG_FORM: LimitedFormlyFieldConfig<IssueProviderCaldav>[] = [
  {
    key: 'caldavUrl',
    type: 'input',
    templateOptions: {
      required: true,
      label: T.F.CALDAV.FORM.CALDAV_URL,
      type: 'url',
      pattern: /^(http(s)?:\/\/)?([\w\-]+(?:\.[\w\-]+)*)(:\d+)?(\/\S*)?$/i,
      description: T.F.CALDAV.FORM.CALDAV_URL_HELP,
    },
  },
  {
    key: 'resourceName',
    type: 'input',
    templateOptions: {
      required: true,
      label: T.F.CALDAV.FORM.CALDAV_RESOURCE,
      type: 'text',
    },
  },
  {
    key: 'componentType',
    type: 'select',
    templateOptions: {
      label: T.F.CALDAV.FORM.COMPONENT_TYPE,
      required: true,
      options: [
        { label: 'Tasks (VTODO)', value: 'VTODO' },
        { label: 'Events (VEVENT)', value: 'VEVENT' },
      ],
    },
  },
  {
    key: 'authType',
    type: 'select',
    templateOptions: {
      label: T.F.CALDAV.FORM.AUTH_TYPE,
      required: true,
      options: [
        { label: 'Basic (Username/Password)', value: 'basic' },
        { label: 'Bearer Token (OAuth)', value: 'bearer' },
      ],
    },
  },
  {
    key: 'username',
    type: 'input',
    hideExpression: (model: any) => model.authType === 'bearer',
    expressions: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'templateOptions.required': (field: any) => field.model?.authType !== 'bearer',
    },
    templateOptions: {
      label: T.F.CALDAV.FORM.CALDAV_USER,
      type: 'text',
    },
  },
  {
    key: 'password',
    type: 'input',
    hideExpression: (model: any) => model.authType === 'bearer',
    expressions: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'templateOptions.required': (field: any) => field.model?.authType !== 'bearer',
    },
    templateOptions: {
      type: 'password',
      label: T.F.CALDAV.FORM.CALDAV_PASSWORD,
    },
  },
  {
    key: 'bearerToken',
    type: 'input',
    hideExpression: (model: any) => model.authType !== 'bearer',
    expressions: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'templateOptions.required': (field: any) => field.model?.authType === 'bearer',
    },
    templateOptions: {
      type: 'password',
      label: T.F.CALDAV.FORM.BEARER_TOKEN,
      description: T.F.CALDAV.FORM.BEARER_TOKEN_HELP,
    },
  },

  {
    type: 'collapsible',
    // todo translate
    props: { label: 'Advanced Config' },
    fieldGroup: [
      ...ISSUE_PROVIDER_COMMON_FORM_FIELDS,
      {
        key: 'enableWriteBack',
        type: 'checkbox',
        templateOptions: {
          label: T.F.CALDAV.FORM.ENABLE_WRITE_BACK,
        },
      },
      {
        key: 'isTransitionIssuesEnabled',
        type: 'checkbox',
        hideExpression: (model: any) => model.componentType === 'VEVENT',
        templateOptions: {
          label: T.F.CALDAV.FORM.IS_TRANSITION_ISSUES_ENABLED,
        },
      },
      {
        key: 'categoryFilter',
        type: 'input',
        templateOptions: {
          label: T.F.CALDAV.FORM.CALDAV_CATEGORY_FILTER,
          type: 'text',
        },
      },
    ],
  },
];

export const CALDAV_CONFIG_FORM_SECTION: ConfigFormSection<IssueProviderCaldav> = {
  title: 'CalDav',
  key: 'CALDAV',
  items: CALDAV_CONFIG_FORM,
  help: T.F.CALDAV.FORM_SECTION.HELP,
};
