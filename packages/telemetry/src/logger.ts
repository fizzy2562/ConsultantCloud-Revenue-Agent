import { ToolCallEvent, ToolCallEventSchema } from "@consultantcloud/shared";

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

export class EventLogger {
  constructor(private readonly sink: EventSink) {}

  log(event: ToolCallEvent): void {
    const parsed = ToolCallEventSchema.parse(event);
    this.sink.write(parsed);
  }
}
