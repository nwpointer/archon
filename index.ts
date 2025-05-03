import { archonEventManager } from './eventManager';
import { Dice } from './dice';
import { abilityModifier } from './utils'
import type {
  Action,
  AttackAction,
  ActionResult,
  GameState,
  Rule
} from './types';

// Archon: Demonstration of a rules engine with an Agent system that is itself a "mini-engine" of rules.
// Instead of writing directly to console.log, we have an event manager that collects logs and other data.
// We define an EventManager and an ArchonEvent, and anywhere we previously did console.log, we emit an event.
// Now we separate the range check into two rules (melee vs ranged), and require an AttackAction with attackMode.

//////////////////////////////
// Utility & Data Structures
//////////////////////////////


class AgentEngine {
  private rules: Rule[];

  constructor(rules: Rule[]) {
    this.rules = rules;
  }

  processAction(
    state: GameState,
    action: Action,
    mainEngine: GameEngine
  ): ActionResult {
    let finalResult: ActionResult = {
      success: false,
      message: "(Agent) No rule matched."
    };
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

// Extended Weapon: canMelee, canThrow, meleeReach, thrownRange, ammo.
interface Weapon {
  name: string;
  magicBonus: number;
  damageDice: Dice;
  canMelee: boolean;
  canThrow: boolean;
  meleeReach: number;
  thrownRange: number;
  ammo: number;
}

interface Entity {
  id: string;
  name: string;
  hp: number;
  ac: number;
  dexterity: number;
  strength: number;
  equipment: Weapon[];
  agent?: Agent;

  x?: number;
  y?: number;
}

class GameEngine {
  state: GameState;
  rules: Rule[];

  constructor(state: GameState, rules: Rule[]) {
    this.state = state;
    this.rules = rules;
  }

  processAction(action: Action): ActionResult {
    archonEventManager.emit({ eventType: "action", data: { actionType: action.type } });

    let finalResult: ActionResult = {
      success: false,
      message: "No rule matched."
    };
    for (const rule of this.rules) {
      if (rule.condition(this.state, action)) {
        archonEventManager.emit({
          eventType: "ruleTriggered",
          data: { ruleName: rule.name }
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

//////////////////////////////
// Movement Rule
//////////////////////////////

const moveRule: Rule = {
  name: "moveRule",
  condition: (state, action) =>
    action.type === "move" && (typeof action.dx === "number" || typeof action.dy === "number"),
  effect: (state, action) => {
    const actor = state.entities[action.actorId];
    if (!actor) {
      return { success: false, message: "Invalid actor." };
    }

    if (typeof actor.x !== "number") actor.x = 0;
    if (typeof actor.y !== "number") actor.y = 0;

    const dx = action.dx || 0;
    const dy = action.dy || 0;

    actor.x += dx;
    actor.y += dy;

    return {
      success: true,
      message: `${actor.name} moves to (${actor.x}, ${actor.y}).`
    };
  }
};

//////////////////////////////
// Subaction Rules
//////////////////////////////

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
    let abilityMod = strMod; // default to strength
    const attAct = action as AttackAction;
    if (attAct.attackMode === 'ranged') {
      const dexMod = abilityModifier(actor.dexterity);
      abilityMod = dexMod;
    } const total = d20 + strMod + magicMod;

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
  condition: (state, action) =>
    action.type === "checkAC" && (action as CheckACAction).attackTotal !== undefined,
  effect: (state, action, engine) => {
    const cAction = action as CheckACAction;
    const target = state.entities[cAction.targetId!];

    if (cAction.attackTotal >= target.ac) {
      archonEventManager.emit({
        eventType: "info",
        data: { message: `Attack total ${cAction.attackTotal} >= AC ${target.ac}. Potential hit! Passing to agent...` }
      });

      const wasHitResult = engine.processAction({
        type: "wasHit",
        actorId: target.id,
        targetId: cAction.actorId,
        attackTotal: cAction.attackTotal
      });

      if (!wasHitResult.success) {
        return { success: false, message: wasHitResult.message };
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

    const weapon = actor.equipment.find(
      w => w.name === ddAction.weaponName
    );
    if (!weapon) {
      return { success: false, message: `No weapon named ${ddAction.weaponName} found.` };
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
    return { success: true, message: `${actor.name} ends their turn.` };
  }
};

// ----------------------
// checkMeleeRangeRule
// ----------------------
const checkMeleeRangeRule: Rule = {
  name: "checkMeleeRangeRule",
  condition: (state, action) => action.type === "checkMeleeRange",
  effect: (state, action) => {
    const actor = state.entities[action.actorId];
    const target = state.entities[action.targetId!];
    if (!actor || !target) {
      return { success: false, message: "Invalid actor or target." };
    }

    const ax = actor.x ?? 0;
    const ay = actor.y ?? 0;
    const tx = target.x ?? 0;
    const ty = target.y ?? 0;
    const weapon = actor.equipment.find(w => w.name === action.weaponName);
    if (!weapon) {
      return { success: false, message: "No such weapon found." };
    }

    const dist = Math.hypot(ax - tx, ay - ty);
    if (!weapon.canMelee) {
      return { success: false, message: `Weapon ${weapon.name} cannot be used in melee.` };
    }
    if (dist <= weapon.meleeReach) {
      return {
        success: true,
        message: `Melee range OK (dist=${dist.toFixed(1)} <= ${weapon.meleeReach}).`
      };
    }
    return { success: false, message: `Target out of melee range (dist=${dist.toFixed(1)}).` };
  }
};

// ----------------------
// checkRangedRangeRule
// ----------------------
const checkRangedRangeRule: Rule = {
  name: "checkRangedRangeRule",
  condition: (state, action) => action.type === "checkRangedRange",
  effect: (state, action) => {
    const actor = state.entities[action.actorId];
    const target = state.entities[action.targetId!];
    if (!actor || !target) {
      return { success: false, message: "Invalid actor or target." };
    }

    const ax = actor.x ?? 0;
    const ay = actor.y ?? 0;
    const tx = target.x ?? 0;
    const ty = target.y ?? 0;
    const weapon = actor.equipment.find(w => w.name === action.weaponName);
    if (!weapon) {
      return { success: false, message: "No such weapon found." };
    }

    const dist = Math.hypot(ax - tx, ay - ty);

    if (!weapon.canThrow) {
      return { success: false, message: `Weapon ${weapon.name} cannot be used as thrown.` };
    }
    if (weapon.ammo <= 0) {
      return { success: false, message: `${weapon.name} has no ammo left (ammo=${weapon.ammo}).` };
    }
    if (dist <= weapon.thrownRange) {
      weapon.ammo--;
      return {
        success: true,
        message: `Ranged attack in range (dist=${dist.toFixed(1)} <= ${weapon.thrownRange}). Ammo now ${weapon.ammo}.`
      };
    }
    return { success: false, message: `Target out of thrown range (dist=${dist.toFixed(1)}).` };
  }
};

//////////////////////////////
// Main Attack Rule
//////////////////////////////

const mainAttackRule: Rule = {
  name: "mainAttackRule",
  condition: (state, action) => action.type === "attack",
  effect: (state, action, engine) => {
    // We expect AttackAction with attackMode
    const mainAction = action as AttackAction;
    const actor = state.entities[mainAction.actorId];
    const target = state.entities[mainAction.targetId!];

    archonEventManager.emit({
      eventType: "info",
      data: {
        message: `${actor.name} initiates a ${mainAction.attackMode} attack on ${target.name} with weapon: ${mainAction.weaponName}`
      }
    });

    // 1) Pick weapon
    const pickResult = engine.processAction({
      type: "pickWeapon",
      actorId: mainAction.actorId,
      weaponName: mainAction.weaponName
    });
    if (!pickResult.success) {
      archonEventManager.emit({ eventType: "info", data: { message: pickResult.message } });
      return { success: false, message: `Attack aborted: ${pickResult.message}` };
    }

    // 2) Range check => separate rules for melee or ranged
    const rangeActionType = mainAction.attackMode === "melee" ? "checkMeleeRange" : "checkRangedRange";
    const rangeResult = engine.processAction({
      type: rangeActionType,
      actorId: mainAction.actorId,
      targetId: mainAction.targetId,
      weaponName: mainAction.weaponName
    });
    archonEventManager.emit({ eventType: "info", data: { message: rangeResult.message } });
    if (!rangeResult.success) {
      return { success: false, message: `Attack aborted: ${rangeResult.message}` };
    }

    // 3) Roll attack
    const rollResult = engine.processAction({
      type: "rollAttack",
      actorId: mainAction.actorId,
      weaponName: mainAction.weaponName
    });
    archonEventManager.emit({ eventType: "info", data: { message: rollResult.message } });
    if (!rollResult.success || rollResult.numericValue === undefined) {
      return { success: false, message: `Attack roll failed.` };
    }
    const attackTotal = rollResult.numericValue;

    // 4) Check AC
    const checkResult = engine.processAction({
      type: "checkAC",
      actorId: mainAction.actorId,
      targetId: mainAction.targetId,
      attackTotal
    });
    archonEventManager.emit({ eventType: "info", data: { message: checkResult.message } });
    if (!checkResult.success) {
      return { success: false, message: `Attack missed or was blocked.` };
    }

    // 5) Deal damage
    const dmgResult = engine.processAction({
      type: "dealDamage",
      actorId: mainAction.actorId,
      targetId: mainAction.targetId,
      weaponName: mainAction.weaponName
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
      dexterity: 14,
      equipment: [
        {
          name: "Magic Sword",
          magicBonus: 1,
          damageDice: new Dice(1, 8, 0),
          canMelee: true,
          canThrow: false,
          meleeReach: 5,
          thrownRange: 0,
          ammo: 0
        },
        {
          name: "Knife",
          magicBonus: 0,
          damageDice: new Dice(1, 4, 0),
          canMelee: true,
          canThrow: true,
          meleeReach: 5,
          thrownRange: 20,
          ammo: 3
        }
      ],
      x: 0,
      y: 0
    },
    goblin: {
      id: "goblin",
      name: "Goblin",
      hp: 10,
      ac: 12,
      strength: 10,
      dexterity: 12,
      equipment: [],
      agent: createGoblinAgent(),
      x: 0,
      y: 5
    }
  }
};

export const engine = new GameEngine(gameState, [
  moveRule,
  pickWeaponRule,
  checkMeleeRangeRule,
  checkRangedRangeRule,
  rollAttackRule,
  checkACRule,
  agentSystemRule,
  dealDamageRule,
  endTurnRule,
  mainAttackRule
]);

// demo ---------------

archonEventManager.emit({ eventType: "info", data: { message: "==== Player attacks Goblin with Magic Sword (melee) ====" } });
engine.processAction({
  type: "attack",
  actorId: "player",
  targetId: "goblin",
  weaponName: "Magic Sword",
  attackMode: "melee"
});

engine.processAction({
  type: "endTurn",
  actorId: "player"
});

// reset heath
gameState.entities["goblin"].hp = 10;

// Move the goblin far away, so we must do a ranged throw
archonEventManager.emit({ eventType: "info", data: { message: "\n==== Player attacks Goblin with Knife (thrown) ====" } });
gameState.entities["goblin"].x = 25;
gameState.entities["goblin"].y = 0;

engine.processAction({
  type: "attack",
  actorId: "player",
  targetId: "goblin",
  weaponName: "Knife",
  attackMode: "ranged"
});

engine.processAction({
  type: "endTurn",
  actorId: "player"
});

archonEventManager.emit({ eventType: "info", data: { message: "\n==== Player moves 3, -2 ====" } });
engine.processAction({
  type: "move",
  actorId: "player",
  dx: 3,
  dy: -2
});
