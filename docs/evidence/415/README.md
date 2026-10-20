# #415: Local bounded inference

The shared source-validated AI adapter previously sent Token Factory's `chat_template_kwargs.enable_thinking=false` to Ollama. Ollama's OpenAI-compatible endpoint instead uses `reasoning_effort`. Local bounded summaries, answers, cleanup and todo extraction now explicitly request `none`; the cloud control is unchanged.

Reference inspected: https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx . Onboarding project grouping deliberately retains its explicit `low` setting and larger bounded budget, based on its live grouping verification in #393.

Real GN100 verification called the production request adapter and answer validator with a 256-token budget against the installed Nemotron model. It returned a correct 14:00 answer, cited supplied segment s1 and used 40 completion tokens. See local-inference.json. No provider double was used, and grounding/output-limit validation remains intact.
