import { ToolCallEvent, ToolCallEventSchema } from "@consultantcloud/shared";
import { appendFileSync } from "node:fs";

export interface EventSink {
  write(event: ToolCallEvent): void;
}

export class InMemoryEventSink implements EventSink {
  private events: ToolCallEvent[] = [];

  write(event: ToolCallEvent): void {
    this.events.push(event);
  }

  getEvents(): ToolCallEvent[] {
    return this.events.slice();
  }
}

export class FileEventSink implements EventSink {
  constructor(private readonly filePath: string) {}

  write(event: ToolCallEvent): void {
    appendFileSync(this.filePath, `${JSON.stringify(event)}\n`);
  }
}

export class EventLogger {
  constructor(private readonly sink: EventSink) {}

  log(event: ToolCallEvent): void {
    const parsed = ToolCallEventSchema.parse(event);
    this.sink.write(parsed);
  }
}

export function logToolCallEvent(logger: { log(event: ToolCallEvent): void }, event: ToolCallEvent): void {
  try {
    logger.log(event);
  } catch {
    // Telemetry is best-effort and must never break a tool response.
  }
}
