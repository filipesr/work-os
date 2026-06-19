type LogArg = unknown;

const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  debug: (...args: LogArg[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: LogArg[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: LogArg[]) => {
    console.warn(...args);
  },
  error: (...args: LogArg[]) => {
    console.error(...args);
  },
  /**
   * Report an error to monitoring (Sentry when configured) and stderr.
   * Use this in catch blocks where the failure is operationally interesting.
   * Swap the body for Sentry.captureException once @sentry/nextjs is installed.
   */
  captureError: (error: unknown, context?: Record<string, unknown>) => {
    console.error(error, context);
  },
};
