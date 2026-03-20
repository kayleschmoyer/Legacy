/** Rollbar webhook event payload (subset of fields we use for Discord embeds). */
export interface RollbarEvent {
  event_name: string;
  data: {
    item?: {
      id?: number;
      counter?: number;
      title?: string;
      level?: string;
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
      level?: string;
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
