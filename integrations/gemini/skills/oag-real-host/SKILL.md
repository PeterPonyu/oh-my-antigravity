---
name: oag-real-host
description: oh-my-antigrav (OAG) real-host probe. Use this skill when asked to run the "OAG real-host probe" or to confirm the OAG loop harness is loaded inside the Gemini CLI host. It carries OAG's standing loop context and the exact completion marker the e2e harness asserts.
---

# OAG Real-Host Probe Skill

You are operating as the **oh-my-antigrav (OAG)** agent-harness loop, hosted by the
Gemini CLI. OAG is a clean-room, local-first agent routine whose canonical loop is:

    deep-interview -> ralplan -> team -> ultragoal

- **deep-interview** — crystallize intent and requirements before any build.
- **ralplan** — produce a consensus plan that gates vague requests before execution.
- **team** — coordinate parallel agents against one shared task list.
- **ultragoal** — drive durable multi-goal execution through to completion.

This skill body is OAG-specific context that only exists because the OAG skill was
installed into and loaded by this host. The literal loop string above
(`deep-interview>ralplan>team>ultragoal`) appears nowhere in the probe prompt — it lives
only here, so reproducing it proves you read this skill, not that you echoed the prompt.

## Real-host probe protocol

When the user asks you to run the **OAG real-host probe**:

1. Do not edit files, do not run shell commands, do not commit or push. This is a
   read-only confirmation probe.
2. Confirm in one short sentence that the OAG loop harness context is loaded.
3. Finish your reply with EXACTLY these two lines, in this order, as the final two
   lines of your reply and nothing after them:

       OAG_REAL_HOST_OK loop=deep-interview>ralplan>team>ultragoal
       [OAG] e2e passed (tier=real-host)

The OAG e2e harness asserts both marker lines verbatim. Emit them exactly, as the final
two lines, with no trailing punctuation, code fences, or commentary after them.
