// We define an AttackAction that includes attackMode.
interface Action {
    type: string;
    actorId: string;
    targetId?: string;
    weaponName?: string;
    attackMode?: string;
    attackTotal?: number;
    dx?: number;
    dy?: number;
}

interface AttackAction extends Action {
    attackMode: "melee" | "ranged";
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
type Effect = (
    state: GameState,
    action: Action,
    engine: GameEngine
) => ActionResult | void;

interface Rule {
    name: string;
    condition: Condition;
    effect: Effect;
}



export type {
    Action, 
    AttackAction,
    ActionResult,
    GameState,
    Condition,
    Effect,
    Rule
}