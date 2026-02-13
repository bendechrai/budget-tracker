import { describe, it, expect } from "vitest";
import {
  parseNaturalLanguage,
  extractAmount,
  extractFrequency,
} from "../nlParser";
import type {
  CreateIntent,
  EditIntent,
  DeleteIntent,
  QueryIntent,
  WhatIfIntent,
  ClarificationResult,
  UnrecognizedResult,
} from "../types";

describe("parseNaturalLanguage", () => {
  describe("create intents", () => {
    it('parses "Add Netflix $22.99 monthly" as create expense', () => {
      const result = parseNaturalLanguage("Add Netflix $22.99 monthly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("expense");
      expect(create.obligationFields?.name).toBe("Netflix");
      expect(create.obligationFields?.amount).toBe(22.99);
      expect(create.obligationFields?.frequency).toBe("monthly");
      expect(create.confidence).toBe("high");
    });

    it('parses "add rent $1,500 monthly" as create expense', () => {
      const result = parseNaturalLanguage("add rent $1,500 monthly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("expense");
      expect(create.obligationFields?.name).toBe("Rent");
      expect(create.obligationFields?.amount).toBe(1500);
      expect(create.obligationFields?.frequency).toBe("monthly");
    });

    it('parses "track gym $60 monthly" as create expense', () => {
      const result = parseNaturalLanguage("track gym $60 monthly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("expense");
      expect(create.obligationFields?.name).toBe("Gym");
      expect(create.obligationFields?.amount).toBe(60);
    });

    it('parses "I get paid $3,200 every second Friday" as create income', () => {
      const result = parseNaturalLanguage(
        "I get paid $3,200 every second Friday"
      );
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("income");
      expect(create.incomeFields?.expectedAmount).toBe(3200);
      expect(create.incomeFields?.frequency).toBe("fortnightly");
    });

    it('parses "add salary $5000 monthly" with income keyword as income', () => {
      const result = parseNaturalLanguage("add salary $5000 monthly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("income");
      expect(create.incomeFields?.expectedAmount).toBe(5000);
      expect(create.incomeFields?.frequency).toBe("monthly");
    });

    it("parses implicit create: Netflix $22.99 monthly", () => {
      const result = parseNaturalLanguage("Netflix $22.99 monthly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("expense");
      expect(create.obligationFields?.amount).toBe(22.99);
      expect(create.obligationFields?.frequency).toBe("monthly");
    });

    it("parses amount with slash-frequency: $1800/year", () => {
      const result = parseNaturalLanguage("add insurance $1800/year");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.obligationFields?.amount).toBe(1800);
      expect(create.obligationFields?.frequency).toBe("annual");
    });

    it("parses weekly frequency", () => {
      const result = parseNaturalLanguage("add groceries $150 weekly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.obligationFields?.frequency).toBe("weekly");
    });

    it("parses quarterly frequency", () => {
      const result = parseNaturalLanguage("add water bill $200 quarterly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.obligationFields?.frequency).toBe("quarterly");
    });

    it("defaults to recurring obligation type for expenses", () => {
      const result = parseNaturalLanguage("add Netflix $22.99 monthly");
      const create = result as CreateIntent;
      expect(create.obligationFields?.type).toBe("recurring");
    });
  });

  describe("edit intents", () => {
    it('parses "change gym to $60" as edit', () => {
      const result = parseNaturalLanguage("change gym to $60");
      expect(result.type).toBe("edit");
      const edit = result as EditIntent;
      expect(edit.targetName).toBe("gym");
      expect(edit.changes.amount).toBe(60);
      expect(edit.confidence).toBe("high");
    });

    it('parses "update Netflix to $25 monthly" as edit', () => {
      const result = parseNaturalLanguage("update Netflix to $25 monthly");
      expect(result.type).toBe("edit");
      const edit = result as EditIntent;
      expect(edit.targetName).toMatch(/netflix/i);
      expect(edit.changes.amount).toBe(25);
      expect(edit.changes.frequency).toBe("monthly");
    });

    it('parses "change gym membership to $60" stripping "membership"', () => {
      const result = parseNaturalLanguage("change gym membership to $60");
      expect(result.type).toBe("edit");
      const edit = result as EditIntent;
      expect(edit.targetName).toBe("gym");
      expect(edit.changes.amount).toBe(60);
    });

    it('parses "set rent to $2000" as edit', () => {
      const result = parseNaturalLanguage("set rent to $2000");
      expect(result.type).toBe("edit");
      const edit = result as EditIntent;
      expect(edit.targetName).toBe("rent");
      expect(edit.changes.amount).toBe(2000);
    });

    it('parses "change my gym to weekly" as frequency edit', () => {
      const result = parseNaturalLanguage("change my gym to weekly");
      expect(result.type).toBe("edit");
      const edit = result as EditIntent;
      expect(edit.targetName).toBe("gym");
      expect(edit.changes.frequency).toBe("weekly");
    });

    it("defaults targetType to expense for edits", () => {
      const result = parseNaturalLanguage("change gym to $60");
      const edit = result as EditIntent;
      expect(edit.targetType).toBe("expense");
    });

    it('parses "change salary to $6000" as income edit', () => {
      const result = parseNaturalLanguage("change salary to $6000");
      expect(result.type).toBe("edit");
      const edit = result as EditIntent;
      expect(edit.targetType).toBe("income");
      expect(edit.changes.amount).toBe(6000);
    });
  });

  describe("delete intents", () => {
    it('parses "delete Spotify" as delete', () => {
      const result = parseNaturalLanguage("delete Spotify");
      expect(result.type).toBe("delete");
      const del = result as DeleteIntent;
      expect(del.targetName).toMatch(/spotify/i);
      expect(del.confidence).toBe("high");
    });

    it('parses "remove the gym membership" as delete', () => {
      const result = parseNaturalLanguage("remove the gym membership");
      expect(result.type).toBe("delete");
      const del = result as DeleteIntent;
      expect(del.targetName).toBe("gym");
    });

    it('parses "cancel Netflix" as delete', () => {
      const result = parseNaturalLanguage("cancel Netflix");
      expect(result.type).toBe("delete");
      const del = result as DeleteIntent;
      expect(del.targetName).toMatch(/netflix/i);
    });

    it('parses "stop tracking insurance" as delete', () => {
      const result = parseNaturalLanguage("stop tracking insurance");
      expect(result.type).toBe("delete");
      const del = result as DeleteIntent;
      expect(del.targetName).toMatch(/insurance/i);
    });
  });

  describe("query intents", () => {
    it('parses "what\'s my biggest expense" as query', () => {
      const result = parseNaturalLanguage("what's my biggest expense");
      expect(result.type).toBe("query");
      const query = result as QueryIntent;
      expect(query.question).toBe("what's my biggest expense");
      expect(query.confidence).toBe("high");
    });

    it('parses "how much do I need to save this week" as query', () => {
      const result = parseNaturalLanguage(
        "how much do I need to save this week?"
      );
      expect(result.type).toBe("query");
      const query = result as QueryIntent;
      expect(query.question).toBe("how much do I need to save this week?");
    });

    it('parses "when is my next payment due?" as query', () => {
      const result = parseNaturalLanguage("when is my next payment due?");
      expect(result.type).toBe("query");
    });

    it("parses questions ending with ? as query", () => {
      const result = parseNaturalLanguage(
        "am I on track for my savings goal?"
      );
      expect(result.type).toBe("query");
    });

    it('parses "show me my expenses" as query', () => {
      const result = parseNaturalLanguage("show me my expenses");
      expect(result.type).toBe("query");
    });

    it('parses "list all my subscriptions" as query', () => {
      const result = parseNaturalLanguage("list all my subscriptions");
      expect(result.type).toBe("query");
    });
  });

  describe("clarification and unrecognized", () => {
    it("returns clarification for ambiguous single-word input", () => {
      const result = parseNaturalLanguage("Netflix");
      expect(result.type).toBe("clarification");
      const clarification = result as ClarificationResult;
      expect(clarification.message).toContain("Netflix");
    });

    it("returns unrecognized for empty input", () => {
      const result = parseNaturalLanguage("");
      expect(result.type).toBe("unrecognized");
    });

    it("returns unrecognized for whitespace-only input", () => {
      const result = parseNaturalLanguage("   ");
      expect(result.type).toBe("unrecognized");
    });

    it("returns unrecognized result with helpful message", () => {
      const result = parseNaturalLanguage("");
      const unrecognized = result as UnrecognizedResult;
      expect(unrecognized.message).toContain("budgeting");
    });
  });

  describe("income detection", () => {
    it('detects income from "I get paid" pattern', () => {
      const result = parseNaturalLanguage("I get paid $3200 fortnightly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("income");
    });

    it('detects income from "earn" keyword', () => {
      const result = parseNaturalLanguage("add earn $5000 monthly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("income");
    });

    it('detects income from "salary" keyword', () => {
      const result = parseNaturalLanguage("add salary $5000 monthly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("income");
    });

    it('detects income from "wage" keyword', () => {
      const result = parseNaturalLanguage("add wage $2500 fortnightly");
      expect(result.type).toBe("create");
      const create = result as CreateIntent;
      expect(create.targetType).toBe("income");
    });
  });
});

describe("what-if intents", () => {
  it('parses "What if I cancel gym?" as toggle_off', () => {
    const result = parseNaturalLanguage("What if I cancel gym?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(1);
    expect(whatif.changes[0].action).toBe("toggle_off");
    expect(whatif.changes[0].targetName).toBe("gym");
  });

  it('parses "What if I cancel Netflix?" as toggle_off', () => {
    const result = parseNaturalLanguage("What if I cancel Netflix?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(1);
    expect(whatif.changes[0].action).toBe("toggle_off");
    expect(whatif.changes[0].targetName).toMatch(/netflix/i);
  });

  it('parses "What if Netflix goes up to $30?" as override_amount', () => {
    const result = parseNaturalLanguage("What if Netflix goes up to $30?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(1);
    expect(whatif.changes[0].action).toBe("override_amount");
    expect(whatif.changes[0].targetName).toMatch(/netflix/i);
    expect(whatif.changes[0].amount).toBe(30);
  });

  it('parses "What if rent increases to $2,200?" as override_amount', () => {
    const result = parseNaturalLanguage("What if rent increases to $2,200?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(1);
    expect(whatif.changes[0].action).toBe("override_amount");
    expect(whatif.changes[0].targetName).toBe("rent");
    expect(whatif.changes[0].amount).toBe(2200);
  });

  it('parses "What if I add a $2,000 holiday in December?" as add_hypothetical', () => {
    const result = parseNaturalLanguage("What if I add a $2,000 holiday in December?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(1);
    expect(whatif.changes[0].action).toBe("add_hypothetical");
    expect(whatif.changes[0].targetName).toBe("Holiday");
    expect(whatif.changes[0].amount).toBe(2000);
    expect(whatif.changes[0].dueDate).toBeDefined();
    expect(whatif.changes[0].dueDate).toMatch(/^\d{4}-12-01$/);
  });

  it('parses "What if I cancel gym and Netflix?" as multiple toggle_offs', () => {
    const result = parseNaturalLanguage("What if I cancel gym and Netflix?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(2);
    expect(whatif.changes[0].action).toBe("toggle_off");
    expect(whatif.changes[0].targetName).toBe("gym");
    expect(whatif.changes[1].action).toBe("toggle_off");
    expect(whatif.changes[1].targetName).toMatch(/netflix/i);
  });

  it('parses "What if I drop the gym membership?" as toggle_off', () => {
    const result = parseNaturalLanguage("What if I drop the gym membership?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(1);
    expect(whatif.changes[0].action).toBe("toggle_off");
    expect(whatif.changes[0].targetName).toBe("gym");
  });

  it('parses "What if I remove Spotify?" as toggle_off', () => {
    const result = parseNaturalLanguage("What if I remove Spotify?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(1);
    expect(whatif.changes[0].action).toBe("toggle_off");
    expect(whatif.changes[0].targetName).toMatch(/spotify/i);
  });

  it("returns high confidence for what-if intents with clear targets", () => {
    const result = parseNaturalLanguage("What if I cancel gym?");
    const whatif = result as WhatIfIntent;
    expect(whatif.confidence).toBe("high");
  });

  it('parses "What if I add a $500 car repair next month?" as add_hypothetical', () => {
    const result = parseNaturalLanguage("What if I add a $500 car repair next month?");
    expect(result.type).toBe("whatif");
    const whatif = result as WhatIfIntent;
    expect(whatif.changes).toHaveLength(1);
    expect(whatif.changes[0].action).toBe("add_hypothetical");
    expect(whatif.changes[0].amount).toBe(500);
    expect(whatif.changes[0].dueDate).toBeDefined();
  });

  it("does not parse non-what-if input starting with 'what' as what-if", () => {
    const result = parseNaturalLanguage("what's my biggest expense?");
    expect(result.type).toBe("query");
  });
});

describe("extractAmount", () => {
  it("extracts $22.99", () => {
    expect(extractAmount("Netflix $22.99 monthly")).toBe(22.99);
  });

  it("extracts $1,500", () => {
    expect(extractAmount("rent $1,500")).toBe(1500);
  });

  it("extracts $3200 (no comma)", () => {
    expect(extractAmount("salary $3200")).toBe(3200);
  });

  it("extracts amount from slash-frequency: 1800/year", () => {
    expect(extractAmount("insurance 1800/year")).toBe(1800);
  });

  it("returns null when no amount found", () => {
    expect(extractAmount("just some text")).toBeNull();
  });

  it("extracts amount with space after $", () => {
    expect(extractAmount("$ 50")).toBe(50);
  });
});

describe("extractFrequency", () => {
  it('extracts "monthly"', () => {
    expect(extractFrequency("Netflix $22.99 monthly")).toBe("monthly");
  });

  it('extracts "weekly"', () => {
    expect(extractFrequency("groceries $150 weekly")).toBe("weekly");
  });

  it('extracts "fortnightly"', () => {
    expect(extractFrequency("salary fortnightly")).toBe("fortnightly");
  });

  it('extracts "every two weeks" as fortnightly', () => {
    expect(extractFrequency("paid every two weeks")).toBe("fortnightly");
  });

  it('extracts "every second Friday" as fortnightly', () => {
    expect(extractFrequency("paid every second Friday")).toBe("fortnightly");
  });

  it('extracts "quarterly"', () => {
    expect(extractFrequency("water bill quarterly")).toBe("quarterly");
  });

  it('extracts "annually"', () => {
    expect(extractFrequency("insurance annually")).toBe("annual");
  });

  it('extracts "/month" slash format', () => {
    expect(extractFrequency("$100/month")).toBe("monthly");
  });

  it('extracts "/year" slash format', () => {
    expect(extractFrequency("$1800/year")).toBe("annual");
  });

  it("returns null when no frequency found", () => {
    expect(extractFrequency("just some text")).toBeNull();
  });
});
