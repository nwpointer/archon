//////////////////////////////
// Event Manager
//////////////////////////////

interface ArchonEvent {
    eventType: string;           // e.g. "info", "ruleTriggered", "action", etc.
    data: { [key: string]: any };// any relevant details about the event
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

// We'll instantiate a single, global event manager.
const archonEventManager = new EventManager();
let tabCount = 0;

// For demonstration, let's subscribe a simple logger that mimics the old console output.
archonEventManager.subscribe(ev => {
    let log = (...args: string[]) =>{
        console.log("  ".repeat(tabCount), ...args);
    }
    if (ev.eventType === "info") {
        // Generic info messages
        log(ev.data.message);
    } else if (ev.eventType === "ruleTriggered") {
        // We add indentation for sub-rules if desired
        // log(`Rule triggered: ${ev.data.ruleName}`);
        tabCount++;
    } else if (ev.eventType === "action") {
        log(`Processing action: ${ev.data.actionType}`);
    } else if (ev.eventType === "agentRule") {
        // Indented agent rule triggers
        log(`  (Agent) Rule triggered: ${ev.data.ruleName}`);
    } else if (ev.eventType === "actionComplete") {
        // log(`Action complete: ${ev.data.actionType}`);
        tabCount--;
    }
    else {
        // fallback
        console.log(`[${ev.eventType}]`, ev.data);
    }
});

//////////////////////////////
// Utility & Data Structures
//////////////////////////////

function abilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
}

class Dice {
    num: number;
    sides: number;
    modifier: number;

    constructor(num: number, sides: number, modifier: number) {
        this.num = num;
        this.sides = sides;
        this.modifier = modifier;
    }

    roll(): number {
        let total = 0;
        for (let i = 0; i < this.num; i++) {
            total += Math.floor(Math.random() * this.sides) + 1;
        }
        return total + this.modifier;
    }
}

interface Action {
    type: string;
    actorId: string;
    targetId?: string;
    weaponName?: string;
    attackTotal?: number;
}

interface ActionResult {
    success: boolean;
    message?: string;
    numericValue?: number;
}

interface GameState {
    entities: { [id: string]: Entity };
}

type Condition = (state: GameState, action: Action) => boolean;
type Effect = (state: GameState, action: Action, engine: GameEngine) => ActionResult | void;

interface Rule {
    name: string;
    condition: Condition;
    effect: Effect;
}

//////////////////////////////
// AgentEngine
//////////////////////////////
class AgentEngine {
    private rules: Rule[];

    constructor(rules: Rule[]) {
        this.rules = rules;
    }

    processAction(state: GameState, action: Action, mainEngine: GameEngine): ActionResult {
        let finalResult: ActionResult = { success: false, message: "(Agent) No rule matched." };
        for (const rule of this.rules) {
            if (rule.condition(state, action)) {
                archonEventManager.emit({
                    eventType: "agentRule",
                    data: { ruleName: rule.name }
                });
                const ruleResult = rule.effect(state, action, mainEngine);
                if (ruleResult) {
                    finalResult = ruleResult;
                }
            }
        }
        return finalResult;
    }
}

interface Agent {
    name: string;
    engine: AgentEngine;
}

interface Weapon {
    name: string;
    magicBonus: number;
    damageDice: Dice;
}

interface Entity {
    id: string;
    name: string;
    hp: number;
    ac: number;
    strength: number;
    equipment: Weapon[];
    agent?: Agent;
}

//////////////////////////////
// Main GameEngine
//////////////////////////////
class GameEngine {
    state: GameState;
    rules: Rule[];

    constructor(state: GameState, rules: Rule[]) {
        this.state = state;
        this.rules = rules;
    }

    processAction(action: Action): ActionResult {
        archonEventManager.emit({ eventType: "action", data: { actionType: action.type } });

        let finalResult: ActionResult = { success: false, message: "No rule matched." };
        for (const rule of this.rules) {
            if (rule.condition(this.state, action)) {
                archonEventManager.emit({
                    eventType: "ruleTriggered",
                    data: {
                        ruleName: rule.name
                    }
                });
                const ruleResult = rule.effect(this.state, action, this);
                if (ruleResult) {
                    finalResult = ruleResult;
                }
            }
        }

        archonEventManager.emit({ eventType: "actionComplete", data: { actionType: action.type } });

        return finalResult;
    }
}

////////////////////////////////////
// Subaction Rules
////////////////////////////////////

const pickWeaponRule: Rule = {
    name: "pickWeaponRule",
    condition: (state, action) => action.type === "pickWeapon" && !!action.weaponName,
    effect: (state, action) => {
        const actor = state.entities[action.actorId];
        const weapon = actor.equipment.find(w => w.name === action.weaponName);
        if (!weapon) {
            return {
                success: false,
                message: `${actor.name} does not have a weapon named ${action.weaponName}`
            };
        }
        return {
            success: true,
            message: `${actor.name} selected weapon ${weapon.name}`
        };
    }
};

interface RollAttackAction extends Action {
    weaponName: string;
}

const rollAttackRule: Rule = {
    name: "rollAttackRule",
    condition: (state, action) => action.type === "rollAttack" && !!action.weaponName,
    effect: (state, action) => {
        const raAction = action as RollAttackAction;
        const actor = state.entities[raAction.actorId];
        const weapon = actor.equipment.find(w => w.name === raAction.weaponName);
        if (!weapon) {
            return {
                success: false,
                message: `No weapon named ${raAction.weaponName} found.`
            };
        }

        const d20 = Math.floor(Math.random() * 20) + 1;
        const strMod = abilityModifier(actor.strength);
        const magicMod = weapon.magicBonus;
        const total = d20 + strMod + magicMod;

        return {
            success: true,
            message: `${actor.name} rolled ${d20} + STR mod ${strMod} + magic mod ${magicMod} = ${total}`,
            numericValue: total
        };
    }
};

interface CheckACAction extends Action {
    attackTotal: number;
}

const checkACRule: Rule = {
    name: "checkACRule",
    condition: (state, action) => action.type === "checkAC" && (action as CheckACAction).attackTotal !== undefined,
    effect: (state, action, engine) => {
        const cAction = action as CheckACAction;
        const target = state.entities[cAction.targetId!];

        if (cAction.attackTotal >= target.ac) {
            archonEventManager.emit({
                eventType: "info",
                data: {
                    message: `Attack total ${cAction.attackTotal} >= AC ${target.ac}. Potential hit! Passing to agent...`
                }
            });

            const wasHitResult = engine.processAction({
                type: "wasHit",
                actorId: target.id,
                targetId: cAction.actorId,
                attackTotal: cAction.attackTotal
            });

            if (!wasHitResult.success) {
                return {
                    success: false,
                    message: wasHitResult.message
                };
            }

            return {
                success: true,
                message: `Hit confirmed. ${wasHitResult.message || "No agent blocked it."}`
            };
        }
        return {
            success: false,
            message: `Attack total ${cAction.attackTotal} < AC ${target.ac}. Miss!`
        };
    }
};

const agentSystemRule: Rule = {
    name: "agentSystemRule",
    condition: (state, action) => action.type === "wasHit",
    effect: (state, action, mainEngine) => {
        const target = state.entities[action.actorId];
        if (!target.agent) {
            return { success: true, message: "No agent attached." };
        }

        const result = target.agent.engine.processAction(state, action, mainEngine);
        return result;
    }
};

interface DealDamageAction extends Action {
    weaponName: string;
}

const dealDamageRule: Rule = {
    name: "dealDamageRule",
    condition: (state, action) => action.type === "dealDamage" && !!action.weaponName,
    effect: (state, action) => {
        const ddAction = action as DealDamageAction;
        const actor = state.entities[ddAction.actorId];
        const target = state.entities[ddAction.targetId!];

        const weapon = actor.equipment.find(w => w.name === ddAction.weaponName);
        if (!weapon) {
            return {
                success: false,
                message: `No weapon named ${ddAction.weaponName} found.`
            };
        }

        const base = weapon.damageDice.roll();
        const total = base + weapon.magicBonus;
        target.hp -= total;

        let msg = `${actor.name} deals ${base} (weapon) + ${weapon.magicBonus} (magic) = ${total} damage. `;
        if (target.hp <= 0) {
            msg += `${target.name} is defeated!`;
        } else {
            msg += `${target.name} HP is now ${target.hp}.`;
        }

        return {
            success: true,
            message: msg,
            numericValue: total
        };
    }
};

const endTurnRule: Rule = {
    name: "endTurnRule",
    condition: (state, action) => action.type === "endTurn",
    effect: (state, action) => {
        const actor = state.entities[action.actorId];
        return {
            success: true,
            message: `${actor.name} ends their turn.`
        };
    }
};

//////////////////////////////
// Main Attack Rule
//////////////////////////////

const mainAttackRule: Rule = {
    name: "mainAttackRule",
    condition: (state, action) => action.type === "attack",
    effect: (state, action, engine) => {
        const actor = state.entities[action.actorId];
        const target = state.entities[action.targetId!];

        archonEventManager.emit({
            eventType: "info",
            data: {
                message: `${actor.name} initiates an attack on ${target.name} with weapon: ${action.weaponName}`
            }
        });

        const pickResult = engine.processAction({
            type: "pickWeapon",
            actorId: action.actorId,
            weaponName: action.weaponName
        });

        if (!pickResult.success) {
            archonEventManager.emit({ eventType: "info", data: { message: pickResult.message } });
            return {
                success: false,
                message: `Attack aborted: ${pickResult.message}`
            };
        }

        const rollResult = engine.processAction({
            type: "rollAttack",
            actorId: action.actorId,
            weaponName: action.weaponName
        });

        archonEventManager.emit({ eventType: "info", data: { message: rollResult.message } });
        if (!rollResult.success || rollResult.numericValue === undefined) {
            return {
                success: false,
                message: `Attack roll failed.`
            };
        }
        const attackTotal = rollResult.numericValue;

        const checkResult = engine.processAction({
            type: "checkAC",
            actorId: action.actorId,
            targetId: action.targetId,
            attackTotal
        });

        archonEventManager.emit({ eventType: "info", data: { message: checkResult.message } });
        if (!checkResult.success) {
            return {
                success: false,
                message: `Attack missed or was blocked.`
            };
        }

        const dmgResult = engine.processAction({
            type: "dealDamage",
            actorId: action.actorId,
            targetId: action.targetId,
            weaponName: action.weaponName
        });

        archonEventManager.emit({ eventType: "info", data: { message: dmgResult.message } });

        return {
            success: true,
            message: `Attack completed. ${dmgResult.message}`
        };
    }
};

//////////////////////////////
// Creating a GoblinAgent
//////////////////////////////

function createGoblinAgent(): Agent {
    let shieldUses = 3;

    const shieldRule: Rule = {
        name: "shieldRule",
        condition: (state, action) => {
            if (action.type !== "wasHit") return false;
            if (Math.random() > 0.5) {
                archonEventManager.emit({
                    eventType: "info",
                    data: {
                        message: "GoblinAgent decides not to use Shield"
                    }
                });
                return false;
            }
            if (shieldUses <= 0) {
                archonEventManager.emit({
                    eventType: "info",
                    data: {
                        message: "GoblinAgent is out of spell slots for Shield"
                    }
                });
                return false;
            }
            return true;
        },
        effect: (state, action) => {
            const victim = state.entities[action.actorId];
            const attackTotal = action.attackTotal || 0;
            const newAC = victim.ac + 5;
            shieldUses--;
            if (attackTotal < newAC) {
                return {
                    success: false,
                    message: `${victim.name}'s Shield (agent rule) blocked the hit! (AC temporarily ${newAC})`
                };
            } else {
                return {
                    success: true,
                    message: `${victim.name} cast Shield, but the attack overcame it! (AC temporarily ${newAC})`
                };
            }
        }
    };

    const goblinEngine = new AgentEngine([shieldRule]);
    return {
        name: "GoblinAgent",
        engine: goblinEngine
    };
}

//////////////////////////////
// Putting it all together
//////////////////////////////

const gameState: GameState = {
    entities: {
        player: {
            id: "player",
            name: "Player",
            hp: 20,
            ac: 16,
            strength: 16,
            equipment: [
                {
                    name: "Magic Sword",
                    magicBonus: 1,
                    damageDice: new Dice(1, 8, 0)
                },
                {
                    name: "Knife",
                    magicBonus: 0,
                    damageDice: new Dice(1, 4, 0)
                }
            ]
        },
        goblin: {
            id: "goblin",
            name: "Goblin",
            hp: 10,
            ac: 12,
            strength: 10,
            equipment: [],
            agent: createGoblinAgent()
        }
    }
};

const engine = new GameEngine(gameState, [
    pickWeaponRule,
    rollAttackRule,
    checkACRule,
    agentSystemRule,
    dealDamageRule,
    endTurnRule,
    mainAttackRule
]);

archonEventManager.emit({ eventType: "info", data: { message: "==== Player attacks Goblin with Magic Sword ====" } });
engine.processAction({
    type: "attack",
    actorId: "player",
    targetId: "goblin",
    weaponName: "Magic Sword"
});

engine.processAction({
    type: "endTurn",
    actorId: "player"
});

// gameState.entities["goblin"].hp = 10;
// tabCount = 0;

// archonEventManager.emit({ eventType: "info", data: { message: "\n==== Player attacks Goblin with Knife ====" } });
// engine.processAction({
//     type: "attack",
//     actorId: "player",
//     targetId: "goblin",
//     weaponName: "Knife"
// });

// engine.processAction({
//     type: "endTurn",
//     actorId: "player"
// });
