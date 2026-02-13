# Rework: Replace Regex NL Parser with Claude API

**Rework of:** `specs/09-ai-interaction.md`
**Reason:** Spec 09 was updated to explicitly require Claude API (Sonnet) for intent parsing. The current implementation uses a 1,067-line regex/keyword parser (`web/lib/ai/nlParser.ts`) that fails on real input — e.g. "Add an income of $1000 a month" produces name "Add", query intents echo the question back without answering, and complex inputs like the council tax example cannot be parsed.

## What Changed in Spec 09

1. **NL parsing must use Claude API** — not regex or keyword matching. Model: `claude-sonnet-4-5-20250929`
2. **Query answering** — the LLM receives the user's financial data and answers questions directly, instead of echoing the question back
3. **Financial context** — the LLM receives the user's existing income sources and obligations so it can resolve references like "the gym" or "my Netflix"
4. **Structured JSON output** — enforced via tool use, returning the existing `ParseResult` type schema
5. **Error handling** — missing API key shows a message, API failures show user-friendly errors
6. **Infrastructure** — `ANTHROPIC_API_KEY` must be available to the web container

## What to Replace

### `web/lib/ai/nlParser.ts` → rewrite

Replace the entire regex-based parser with a Claude API call. The new implementation should:

- Export the same function signature but async: `parseNaturalLanguage(input: string, context: FinancialContext): Promise<ParseResult>`
- Use the `@anthropic-ai/sdk` package (already installed for PDF parsing)
- Use model `claude-sonnet-4-5-20250929`
- Send a system prompt that defines all intent types and their JSON schemas
- Include the user's financial context (income sources, obligations with amounts/frequencies) in the user message so the LLM can resolve references and answer queries
- Parse the LLM's structured response into the existing `ParseResult` type
- Follow the pattern established in `web/lib/import/pdfParser.ts` for Anthropic SDK usage

The system prompt should instruct Claude to:
- Identify intent type: create, edit, delete, query, what_if, escalation, clarification
- For create: extract name, amount, frequency, target type (income/obligation), obligation type, and custom schedule details
- For edit/delete: match against the provided list of existing items
- For query: answer the question using the provided financial data
- For what_if: return structured toggle/override changes
- For escalation: return change type, value, effective date, interval
- For ambiguous input: return a clarification intent with options
- Return valid JSON matching the `ParseResult` schema

### `web/app/api/ai/parse/route.ts` → modify

- Load the user's financial context (income sources, obligations, fund balances) from the database before calling the parser
- Pass context to the new async `parseNaturalLanguage()` call
- Add error handling: catch Anthropic API errors, missing API key → return structured error response
- Keep the existing what-if obligation lookup logic

### `docker-compose.yml.devports` → add env var

Add `ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}` to the web service's `environment:` block. The key is already in `.env.devports`.

## What to Wire Up

### AIBar → AIPreview integration

`AIPreview.tsx` (388 lines) exists with full execution logic (create, edit, delete via API calls + engine recalculation) but is **not connected** to `AIBar.tsx`. Currently the AI bar parses and displays a text response but never triggers the preview/confirm/execute flow.

Wire this up:
- When AIBar receives a create, edit, or delete intent from the parse API, open AIPreview with that intent
- AIPreview handles confirmation and execution (it already does this)
- After execution, AIPreview triggers engine recalculation (it already does this)
- Query and what-if intents continue to be handled inline by AIBar (no preview needed)

## What to Keep (No Changes)

| File | Reason |
|------|--------|
| `web/lib/ai/types.ts` | `ParseResult` type and all intent types stay identical — this is the contract |
| `web/app/components/AIBar.tsx` | UI is correct, only needs AIPreview import/state |
| `web/app/components/AIPreview.tsx` | Execution logic is complete, just needs to be called |
| `web/app/components/SparkleButton.tsx` | Calls same `/api/ai/parse` endpoint, gets same types back |

## What to Add

### Graceful degradation

- If `ANTHROPIC_API_KEY` is not set, the parse API route should return a specific error type
- AIBar should detect this and display: "AI features require an API key — you can still use the app normally"
- The rest of the app must work normally without the key

### Loading state

- AIBar should show a loading indicator while waiting for the Claude API response (1-2 seconds typical)

## Tests

### Delete

- All unit tests for the regex parser in `web/lib/ai/__tests__/nlParser.test.ts` — these test regex behavior that no longer exists

### Replace with

- Unit tests for the new Claude-based parser with **mocked Anthropic SDK responses** (do not make real API calls in tests)
- Test each intent type: create income, create obligation, edit, delete, query, what-if, escalation, clarification
- Test the specific failure case: "Add an income of $1000 a month" → produces a sensible name (not "Add")
- Test missing API key → returns structured error
- Test API failure → returns user-friendly error

### Keep

- Existing component tests for AIBar, AIPreview, SparkleButton — they test UI behavior, not parser internals

## Acceptance Criteria

- [ ] `nlParser.ts` calls Claude API (Sonnet) instead of using regex
- [ ] Parse API route loads user's financial context from the database
- [ ] "Add an income of $1000 a month" produces a create intent with a sensible name and $1000/monthly
- [ ] "What's my biggest expense in March?" returns an actual computed answer (not the question echoed back)
- [ ] "Change the gym membership to $60" resolves "gym membership" against the user's existing obligations
- [ ] Council tax complex example produces a custom schedule with correct amounts
- [ ] AIBar opens AIPreview for create/edit/delete intents
- [ ] AIPreview executes the action on confirm (creates/edits/deletes via API)
- [ ] Missing API key shows a user-friendly message in the AI bar
- [ ] API errors show "Something went wrong — try again"
- [ ] Loading indicator shown while waiting for response
- [ ] `ANTHROPIC_API_KEY` is in the web service environment in `docker-compose.yml.devports`
- [ ] All existing component tests still pass
- [ ] New parser tests pass with mocked API responses
