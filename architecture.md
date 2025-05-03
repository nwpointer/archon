# Archon Architecture

Archon is a modular simulation engine designed to model complex rules systems, such as those found in tabletop RPGs like Dungeons & Dragons. The architecture is built around a set of core abstractions that allow for flexible definition, evaluation, and automation of game mechanics.

---

## Overview

At its core, Archon models a game as a set of **entities** (such as players, monsters, or objects) whose **state** is manipulated by **actions** and **rules**. The system is designed to be extensible, allowing new rules, actions, and agents to be added with minimal friction.

---

## Major Concepts & Classes

### 1. State

**Description:**  
The `State` class (or module) represents the current facts about all entities in the game. It is the single source of truth for the simulation.

**Inputs:**  
- Actions performed by agents
- Effects applied by rules

**Outputs:**  
- Provides data to rules, conditions, and agents for decision-making
- Emits updated state after actions/effects

**Responsibilities:**  
- Track all entities and their properties (e.g., HP, position, status effects)
- Provide query methods for rules and agents
- Support serialization/deserialization for saving/loading

---

### 2. Entity

**Description:**  
An `Entity` is any object in the game world (player, monster, item, etc.).

**Inputs:**  
- State updates (e.g., HP changes, position changes)
- Actions performed by or on the entity

**Outputs:**  
- Exposes its properties to the state and rules engine

**Responsibilities:**  
- Maintain its own properties
- Respond to actions and effects

---

### 3. Action

**Description:**  
An `Action` represents an attempt by an agent to interact with the game state (e.g., "attack", "move", "cast spell").

**Inputs:**  
- Initiated by an agent (human or AI)
- Parameters (e.g., target, action type, modifiers)

**Outputs:**  
- Triggers rule evaluation
- May result in state changes

**Responsibilities:**  
- Encapsulate all data needed to perform the action
- Validate preconditions (e.g., is the action legal?)
- Pass control to the rules engine for resolution

---

### 4. Rule

**Description:**  
A `Rule` defines a conditional effect that may alter the game state when certain conditions are met (e.g., "If attack roll >= AC, deal damage").

**Inputs:**  
- Current state
- Action being performed

**Outputs:**  
- Effects to apply to the state

**Responsibilities:**  
- Evaluate conditions based on state and action
- Apply effects if conditions are met
- Support stacking, overriding, or chaining with other rules

---

### 5. Condition

**Description:**  
A `Condition` is a predicate that determines whether a rule should be applied.

**Inputs:**  
- Current state
- Action context

**Outputs:**  
- Boolean (true/false)

**Responsibilities:**  
- Encapsulate logic for checking if a rule is relevant
- Support composition (e.g., AND, OR, NOT conditions)

---

### 6. Effect

**Description:**  
An `Effect` describes a change to the game state (e.g., "deal 10 damage", "move entity", "apply status effect").

**Inputs:**  
- Triggered by a rule

**Outputs:**  
- Modifies the state

**Responsibilities:**  
- Encapsulate logic for updating the state
- Support complex effects (e.g., random rolls, conditional modifications)

---

### 7. Agent

**Description:**  
An `Agent` is a decision-making entity that selects actions to perform. Agents can be human players (via UI/input) or automated (AI).

**Inputs:**  
- Current state
- Available actions

**Outputs:**  
- Selected action(s) to perform

**Responsibilities:**  
- Decide which action to take based on state and goals
- For AI agents, implement decision logic (e.g., heuristics, search, LLM-based reasoning)
- For human agents, provide interface for input

---

## GameEngine: State + Rules

**Description:**  
The core of Archon is the **GameEngine**, which is conceptually the combination of the `State` and the set of `Rules`. The GameEngine is responsible for:

- Maintaining the current `State` of the game world (all entities, their properties, and relationships).
- Managing and applying all `Rules` that define how the game operates and how the state changes in response to actions.

**Inputs:**  
- Actions submitted by agents
- The current state and all defined rules

**Outputs:**  
- Updated state after processing actions and applying rules
- Events or notifications to agents about state changes

**Responsibilities:**  
- Orchestrate the flow of the game: receive actions, evaluate rules, apply effects, and update state
- Ensure all rules are checked and applied in the correct order
- Provide a consistent interface for agents to interact with the game

---

## Agents as Sub-Engines

**Description:**  
Each **Agent** in Archon acts as its own "sub-engine". While the main GameEngine manages the global state and rules, agents are responsible for:

- Observing the current state and available actions
- Internally simulating, planning, or reasoning about possible moves (for AI agents, this may include running their own simulations or using heuristics/LLMs)
- Deciding which action(s) to submit to the GameEngine

This separation allows for highly flexible and intelligent agents. For example, an AI agent could run its own instance of a simulation engine to plan several moves ahead, or a human agent could use a UI to explore options before making a decision.

**Key Points:**
- Agents are decoupled from the main game loop; they only interact with the GameEngine via actions and state queries.
- Agents can be as simple or as complex as needed, from basic rule-followers to advanced planners.
- This architecture supports both human and AI agents seamlessly.

---

## Data Flow

1. **Agent** (as a sub-engine) observes the current **State** and selects an **Action**.
2. The **Action** is submitted to the **GameEngine** (State + Rules).
3. The **GameEngine** evaluates all relevant **Rules** for the action.
4. Each **Rule** checks its **Condition**; if true, its **Effect** is applied.
5. **Effects** update the **State**.
6. The updated **State** is broadcast to all **Agents** for the next turn/decision.

---

## Extensibility

- **New Rules:** Add new rule classes or data to extend the system (e.g., new spells, abilities).
- **New Actions:** Define new action types for richer interactions.
- **New Agents:** Implement new AI strategies or interfaces for human players.
- **Custom Effects/Conditions:** Compose or subclass to create complex behaviors.

---

## Example: Attack Action

1. **Agent** decides to perform an "attack" action targeting a goblin.
2. **Action** is created: `{ type: "attack", source: player, target: goblin }`
3. **Rules** relevant to "attack" are evaluated (e.g., "If attack roll >= AC, deal damage").
4. **Condition** checks if the attack roll is sufficient.
5. **Effect** applies damage to the goblin if the condition is met.
6. **State** is updated; goblin's HP is reduced.

---

## Summary

Archon's architecture is designed for flexibility, clarity, and extensibility. By separating concerns into state, entities, actions, rules, conditions, effects, and agents, it allows for easy expansion and adaptation to new rulesets or game systems.

---

*For more details, see the codebase and inline documentation.* 