# Flexible Input API Design - Implementation Plan

**Status:** Draft
**Created:** 2026-02-11
**Author:** Architecture Review

## Executive Summary

Refactor Bartleby's REST API endpoints to accept both structured data and natural language input, eliminating duplicate parsing logic across CLI and dashboard while maintaining type safety.

## Problem Statement

### Current Issues

1. **Duplicate Parsing Logic** - Metadata parsing (`+project #tags @context`) exists in 3+ places:
   - CLI (src/tools/gtd.ts) - TypeScript
   - Dashboard (web/app.js) - JavaScript regex
   - Chat API (src/server/index.ts) - Server-side

2. **Inconsistent API Usage**:
   - Some operations use REST endpoints (`/api/note`, `/api/action`)
   - Others use chat API (`/api/chat` with natural language commands)
   - Dashboard mixes both approaches, leading to bugs

3. **Client-Side Complexity**:
   - Dashboard must parse tags before API calls
   - Parsing logic can drift from server implementation
   - Larger client bundle size

## Research Summary

### Best Practices for Polymorphic APIs

According to API design research, while polymorphism is generally discouraged, when implemented it should use **discriminated unions** with a type discriminant property. Key findings:

- **Avoid polymorphism when possible** - but when needed, use explicit type indicators ([Bump.sh polymorphism guide](https://bump.sh/blog/use-document-polymorphism-api/))
- **Use discriminated unions** for type safety in TypeScript ([Microsoft REST API guidelines](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design))
- **Separate properties for different types** rather than overloading a single property ([Vinay Sahni REST best practices](https://www.vinaysahni.com/best-practices-for-a-pragmatic-restful-api))

### Natural Language vs Structured Input

Research on natural language APIs reveals critical patterns:

- **Natural language should be translated to structure, not executed directly** ([Microsoft: Safe Natural Language APIs](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/how-to-build-safe-natural-language-driven-apis/4488509))
- **Server-side validation is mandatory** - client-side validation can be bypassed ([OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html))
- **Structured workflow: classify → extract → validate → complete or clarify** ([Nordic APIs: Natural Language Design](https://nordicapis.com/should-you-design-natural-language-first-apis/))

### TypeScript Discriminated Unions

Discriminated unions provide compile-time safety for handling multiple input formats:

- **Single discriminant property** identifies which type variant is in use ([TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html))
- **Exhaustiveness checking** ensures all cases are handled ([Fullstory: Discriminated Unions](https://www.fullstory.com/blog/discriminated-unions-and-exhaustiveness-checking-in-typescript/))
- **Real-world example**: OpenAI threads API uses discriminated unions for different message content types ([CodeSpud: Union Examples](https://www.codespud.com/2025/discriminated-unions-examples-typescript/))

## Proposed Solution

### Pattern: Discriminated Union Request Bodies

Use TypeScript discriminated unions to accept either structured or natural language input:

```typescript
// Discriminated union for flexible input
type NoteCreateRequest =
  | { format: 'structured'; title: string; content?: string; project?: string; tags?: string[] }
  | { format: 'natural'; input: string; content?: string };

// POST /api/note accepts either format
app.post('/api/note', (req, res) => {
  const request = req.body as NoteCreateRequest;

  let parsed: { title: string; content?: string; project?: string; tags?: string[] };

  if (request.format === 'structured') {
    // Use as-is
    parsed = request;
  } else if (request.format === 'natural') {
    // Parse the input server-side
    parsed = parseNaturalLanguageNote(request.input);
    parsed.content = request.content;
  }

  // Single validation and creation path
  const note = garden.create({ type: 'note', ...parsed });
  res.json({ success: true, note });
});
```

### Benefits

1. **DRY Principle** - Parsing logic exists only on server
2. **Type Safety** - TypeScript validates both input formats
3. **Backward Compatibility** - Existing structured calls work unchanged
4. **Flexibility** - Clients choose appropriate format
5. **Single Source of Truth** - Server owns parsing rules

## Implementation Plan

### Phase 1: Core Infrastructure

**Goal:** Create parsing utilities and type definitions

- [ ] Create `src/server/parsers.ts` with centralized parsing functions
  - `parseNaturalLanguageNote(input: string)`
  - `parseNaturalLanguageAction(input: string)`
  - `parseNaturalLanguageProject(input: string)`
- [ ] Define discriminated union types in `src/types/api.ts`
- [ ] Write comprehensive tests for all parsing functions
- [ ] Document parsing syntax and edge cases

### Phase 2: Refactor Endpoints

**Goal:** Update REST endpoints to accept flexible input

Priority order (by usage frequency):

1. [ ] **POST /api/note** - Notes are high-volume and just caused a bug
2. [ ] **POST /api/action** - Actions are core to GTD workflow
3. [ ] **PATCH /api/action/:id** - Inline editing is frequently used
4. [ ] **POST /api/project** - Less common but should be consistent
5. [ ] **POST /api/event** - Calendar entries
6. [ ] **PATCH /api/note/:id** - Note updates

For each endpoint:
- Add discriminated union request type
- Implement format branching logic
- Maintain existing tests (structured format)
- Add new tests (natural language format)
- Update API documentation

### Phase 3: Client Refactoring

**Goal:** Simplify client code by removing parsing

1. [ ] **Dashboard** (web/app.js):
   - Remove `handleNoteTagsKey()` parsing logic
   - Send natural language format: `{ format: 'natural', input: tags }`
   - Remove regex patterns for +project, #tags, @context
   - ~200 lines removed, simpler code

2. [ ] **CLI** (src/tools/gtd.ts):
   - Keep natural language interface for users
   - Send `{ format: 'natural', input: userInput }`
   - Remove local parsing in `parseArgs`
   - Server response includes parsed structure for confirmation

### Phase 4: Chat API Alignment

**Goal:** Make chat API use the same endpoints internally

- [ ] Refactor chat handlers to call REST endpoint functions
- [ ] Chat API becomes a thin routing layer
- [ ] Eliminate duplicate creation logic
- [ ] Unified error handling and validation

### Phase 5: Documentation & Migration

- [ ] Update README.md with new input format examples
- [ ] API documentation with both formats side-by-side
- [ ] Migration guide for external API users
- [ ] Deprecation timeline for old chat-based creation paths

## Example API Usage

### Creating a Note - Both Formats

```javascript
// Dashboard: Natural language (simplest)
POST /api/note
{
  "format": "natural",
  "input": "Meeting notes +project-alpha #important @work",
  "content": "Discussed Q1 roadmap..."
}

// Programmatic: Structured (explicit)
POST /api/note
{
  "format": "structured",
  "title": "Meeting notes",
  "project": "project-alpha",
  "tags": ["important"],
  "content": "Discussed Q1 roadmap..."
}

// Response (same for both)
{
  "success": true,
  "note": {
    "id": "abc123",
    "title": "Meeting notes",
    "project": "project-alpha",
    "tags": ["important"],
    "content": "Discussed Q1 roadmap...",
    ...
  }
}
```

## Technical Considerations

### Validation Strategy

Server-side validation must handle both formats:

```typescript
function validateNoteRequest(req: NoteCreateRequest): ValidationResult {
  if (req.format === 'structured') {
    // Validate structured fields
    if (!req.title?.trim()) return { valid: false, error: 'Title required' };
    if (req.tags && !Array.isArray(req.tags)) return { valid: false, error: 'Tags must be array' };
  } else {
    // Validate natural language
    if (!req.input?.trim()) return { valid: false, error: 'Input required' };
  }
  return { valid: true };
}
```

### Error Handling

Natural language parsing can fail - provide helpful errors:

```typescript
try {
  parsed = parseNaturalLanguageNote(request.input);
} catch (e) {
  return res.status(400).json({
    error: 'Could not parse input',
    details: e.message,
    input: request.input,
    hint: 'Use format like: "Note title +project #tag @context"'
  });
}
```

### Performance Impact

- Parsing overhead: ~1ms per request (negligible)
- Network savings: Clients send less code
- Maintenance savings: One implementation to debug

### Backward Compatibility

Existing API consumers continue to work:

```javascript
// Old style (still works)
POST /api/note
{ "title": "Note", "project": "foo" }

// Treated as structured format with implicit discriminant
// Server adds: format = 'structured' if missing
```

## Migration Path

### Week 1-2: Infrastructure
- Implement parsers and types
- Test coverage for parsing logic
- No breaking changes

### Week 3-4: Endpoints
- Update 2-3 endpoints per week
- Deploy behind feature flag initially
- Monitor error rates

### Week 5-6: Clients
- Update dashboard to use natural format
- Remove client-side parsing
- Deploy incrementally

### Week 7-8: Chat API
- Refactor chat handlers
- Integration testing
- Performance benchmarking

## Success Metrics

- **Code Reduction**: ~300 lines removed from client code
- **Bug Prevention**: Single parsing implementation = fewer bugs
- **Developer Experience**: Simpler API for external developers
- **Type Safety**: 100% of inputs validated at compile time
- **Performance**: No measurable impact (<5ms added latency)

## Open Questions

1. Should we support partial natural language? E.g., `{ title: "Note", tags: "+project #tag" }`
2. Do we want a `/api/parse` endpoint for clients to preview parsing?
3. Should the API return the parsed structure in responses for transparency?
4. Timeline for deprecating chat API for creation operations?

## References

- [Bump.sh: Polymorphism in APIs](https://bump.sh/blog/use-document-polymorphism-api/)
- [Microsoft: Safe Natural Language APIs](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/how-to-build-safe-natural-language-driven-apis/4488509)
- [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [TypeScript: Discriminated Unions](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html)
- [Fullstory: Exhaustiveness Checking](https://www.fullstory.com/blog/discriminated-unions-and-exhaustiveness-checking-in-typescript/)
- [Nordic APIs: Natural Language Design](https://nordicapis.com/should-you-design-natural-language-first-apis/)
- [Vinay Sahni: REST Best Practices](https://www.vinaysahni.com/best-practices-for-a-pragmatic-restful-api)

---

**Next Steps:** Review and discuss open questions, then proceed with Phase 1 implementation.
