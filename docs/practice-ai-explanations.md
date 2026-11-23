# AI explanations in practice

After a learner checks an answer, the practice page automatically requests a
Vietnamese explanation from `POST /api/practice/explanation`. The original
solution and the selected/correct answers remain visible while AI is loading or
unavailable. Errors offer an explicit retry. Checking without a valid selection
does not call AI. Mock exams do not use this endpoint.

The server calls the [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text)
with the question/solution snapshot, displayed option labels, selected answers,
passage and any transcript present in the original solution. Only text is sent:
images/audio are not uploaded or fetched. Questions needing visual evidence or
missing transcripts may therefore have incomplete explanations. The prompt asks
for evidence, rules, an analysis of each choice and a short learning tip. It must
identify missing evidence and answer-key inconsistencies. Generated explanations
are supplementary; they never modify the answer key, verification status,
question bank or historical results.

## Local configuration

Create `.env.local` in the workspace (already ignored by Git), containing:

```dotenv
OPENAI_API_KEY=<your server-side API key>
OPENAI_EXPLANATION_MODEL=<Responses-compatible model available in your API project>
```

`pnpm start` loads this file in the API process. Restart that process after
configuration changes. Existing process environment variables take precedence.
Never put the key in Angular source, a public asset, a shell command argument,
Git or chat. Model selection is explicit so the API project's owner controls
which model is billed; the app supplies no default. Missing configuration returns
503 with a visible configuration message instead of a fabricated explanation.

For Sites, configure the same two values as runtime secrets/variables through
the Sites settings, then deploy a saved version only when deployment is requested.
The existing Worker bundles the endpoint; static-only hosting cannot provide it.

## Request lifecycle and limits

The API requires same-origin POST JSON, validates option/answer membership and
limits input to 80 KiB. It allows up to ten requests per client per minute and
thirty per Worker instance per minute. These are instance-local limits, not a
global billing quota; configure provider spending limits for a public deployment.
Calls time out after 60 seconds, output is capped at 2,500 tokens, and truncated,
refused or malformed responses are treated as failures. Responses are not stored
by the Responses API (`store: false`). Provider errors and credentials are never
returned to the browser.

The page reuses successful explanations in memory when revisiting a checked
question in the same session page. Navigation cancels pending requests and late
responses cannot replace the explanation for the next question. Destroying the
page aborts its current request. Reloading a checked practice session requests a
new explanation; AI text is not persisted in progress or exported results.
