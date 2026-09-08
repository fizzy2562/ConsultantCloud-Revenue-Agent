# Docker deployment

Build the production image from the repository root so Docker can access every pnpm workspace package:

```sh
docker build -t consultantcloud-revenue-agent .
```

Run the web app on port 3000, supplying the tools bridge key and LLM API key:

```sh
docker run -p 3000:3000 \
  -e TOOLS_API_KEY=replace-with-a-secret \
  -e LLM_API_KEY=<LLM_API_KEY> \
  consultantcloud-revenue-agent
```

## Environment variables

- `TOOLS_API_KEY` is required for the `/api/tools` bridge to accept requests. The bridge fails closed when it is absent. See [Agentforce setup](./agentforce-setup.md) for configuration details.
- `LLM_API_KEY` is required for live agent chat and is sent only as the bearer token to the configured chat completions API.
- `LLM_API_URL` optionally overrides the default OpenRouter endpoint, `https://openrouter.ai/api/v1/chat/completions`.
- `LLM_MODEL` optionally overrides the default model, `liquid/lfm-2.5-2.6b:free`.
- `SF_INSTANCE_URL` and `SF_ACCESS_TOKEN` are optional. Setting both switches the app from the seeded mock gateway to real Salesforce.

`host.docker.internal` works out of the box with Docker Desktop on macOS and Windows. On Linux, add `--add-host=host.docker.internal:host-gateway` to `docker run`.

Without `LLM_API_KEY`, the chat UI's agent reasoning fails with a runtime configuration error. The REST tools bridge under `/api/tools` and the trace-download endpoint do not use the hosted LLM and continue to work independently.
