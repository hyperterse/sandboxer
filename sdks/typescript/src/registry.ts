import type { ProviderName } from "./types.js";
import type { ProviderConfig } from "./config.js";
import type { Provider } from "./provider.js";
import { BadConfigError } from "./errors.js";

type ProviderFactory = (config: ProviderConfig) => Promise<Provider>;

const factories = new Map<ProviderName, ProviderFactory>();

export function registerProvider(
  name: ProviderName,
  factory: ProviderFactory,
): void {
  factories.set(name, factory);
}

export async function resolveProvider(
  name: ProviderName,
  config: ProviderConfig = {},
): Promise<Provider> {
  const factory = factories.get(name);
  if (!factory) {
    throw new BadConfigError(`unknown provider "${name}"`);
  }
  return factory(config);
}
