# swap-provider-cli

Selects a provider name from the first command-line argument (or defaults to
``local``), constructs a client, and calls ``list_sandboxes``. Use this to
smoke-test credentials and provider wiring without creating a sandbox.

## Prerequisites

- Python 3.10 or newer.
- Same environment expectations as the Go sample for the provider you pass on
  the command line.

## How to run

```bash
PYTHONPATH=sdks/python/src python examples/python/swap-provider-cli/main.py
# optional: same script with provider name as argv
```
