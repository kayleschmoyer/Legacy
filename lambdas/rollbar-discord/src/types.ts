/** Rollbar webhook event payload (subset of fields we use for Discord embeds). */
export interface RollbarEvent {
  event_name: string;
  data: {
    deploy?: {
      environment?: string;
      revision?: string;
      local_username?: string;
      status?: string;
      comment?: string;
      start_time?: number;
      finish_time?: number;
    };
    item?: {
      id?: number;
      counter?: number;
      title?: string;
      level?: string | number;
      environment?: string;
      framework?: string;
      language?: string;
      last_occurrence_timestamp?: number;
      total_occurrences?: number;
      unique_occurrences?: number;
      public_item_url?: string;
    };
    occurrence?: {
      environment?: string;
      level?: string | number;
      body?: {
        message?: { body?: string };
        trace?: {
          exception?: { class?: string; message?: string };
          frames?: Array<{
            filename?: string;
            lineno?: number;
            method?: string;
          }>;
        };
      };
      request?: {
        url?: string;
        method?: string;
      };
      server?: {
        host?: string;
      };
      timestamp?: number;
    };
  };
}

/** CloudWatch Alarm message nested inside an SNS notification. */
export interface CloudWatchAlarm {
  AlarmName: string;
  AlarmDescription?: string;
  NewStateValue: 'ALARM' | 'OK' | 'INSUFFICIENT_DATA';
  NewStateReason: string;
  OldStateValue?: string;
  StateChangeTime: string;
  Region: string;
  AWSAccountId?: string;
  Trigger: {
    MetricName: string;
    Namespace: string;
    Dimensions?: Array<{ name: string; value: string }>;
    Period: number;
    Statistic: string;
    Threshold: number;
    ComparisonOperator: string;
  };
}

/** AWS Budget notification nested inside an SNS message. */
export interface BudgetNotification {
  accountId: string;
  budgetName: string;
  budgetType: string;
  budgetLimit: string;
  actualSpend: string;
  forecastedSpend?: string;
  thresholdPercentage: string;
  startDate?: string;
  endDate?: string;
}

/** Discord embed object sent via webhook. */
export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  url?: string;
  timestamp?: string;
  footer?: { text: string };
}
