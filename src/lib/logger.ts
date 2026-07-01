type LogValue = unknown;

function write(level: "info" | "warn" | "error", message: string, ...values: LogValue[]) {
  const prefix = `[tpa] ${message}`;
  if (level === "info") {
    console.info(prefix, ...values);
    return;
  }
  if (level === "warn") {
    console.warn(prefix, ...values);
    return;
  }
  console.error(prefix, ...values);
}

export const logger = {
  info: (message: string, ...values: LogValue[]) => write("info", message, ...values),
  warn: (message: string, ...values: LogValue[]) => write("warn", message, ...values),
  error: (message: string, ...values: LogValue[]) => write("error", message, ...values),
};
