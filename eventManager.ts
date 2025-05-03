interface ArchonEvent {
  eventType: string;
  data: { [key: string]: any };
}

class EventManager {
  private listeners: ((ev: ArchonEvent) => void)[] = [];

  subscribe(fn: (ev: ArchonEvent) => void): void {
    this.listeners.push(fn);
  }

  emit(ev: ArchonEvent): void {
    for (const listener of this.listeners) {
      listener(ev);
    }
  }
}

const archonEventManager = new EventManager();
let tabCount = 0;

// Default logging subscriber
archonEventManager.subscribe(ev => {
  const log = (...args: string[]) => {
    console.log("  ".repeat(tabCount), ...args);
  };
  switch (ev.eventType) {
    case "info":
      log(ev.data.message);
      break;
    case "ruleTriggered":
      tabCount++;
      break;
    case "action":
      log(`Processing action: ${ev.data.actionType}`);
      break;
    case "agentRule":
      log(`  (Agent) Rule triggered: ${ev.data.ruleName}`);
      break;
    case "actionComplete":
      tabCount--;
      break;
    default:
      console.log(`[${ev.eventType}]`, ev.data);
      break;
  }
});

export { EventManager, archonEventManager };
export type { ArchonEvent };
 