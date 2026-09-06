# Docker deployment

Build the production image from the repository root so Docker can access every pnpm workspace package:

```sh
docker build -t consultantcloud-revenue-agent .
```

Run the web app on port 3000, supplying the tools bridge key and an Ollama endpoint reachable from the container:

```sh
docker run -p 3000:3000 \
  -e TOOLS_API_KEY=replace-with-a-secret \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  consultantcloud-revenue-agent
```

## Environment variables

- `TOOLS_API_KEY` is required for the `/api/tools` bridge to accept requests. The bridge fails closed when it is absent. See [Agentforce setup](./agentforce-setup.md) for configuration details.
- `OLLAMA_URL` selects the Ollama endpoint used by live agent chat. It defaults to `http://127.0.0.1:11434`, which cannot reach an Ollama process on the Docker host. Use `http://host.docker.internal:11434` for a typical host-machine Ollama installation, or provide a reachable remote endpoint.
- `SF_INSTANCE_URL` and `SF_ACCESS_TOKEN` are optional. Setting both switches the app from the seeded mock gateway to real Salesforce.

`host.docker.internal` works out of the box with Docker Desktop on macOS and Windows. On Linux, add `--add-host=host.docker.internal:host-gateway` to `docker run`.

Without a reachable Ollama instance, the chat UI's agent reasoning fails. The REST tools bridge under `/api/tools` and the trace-download endpoint do not use Ollama and continue to work independently.
