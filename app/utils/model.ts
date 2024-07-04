import { DEFAULT_MODELS } from "../constant";
import { LLMModel } from "../client/api";

const customProvider = (modelName: string) => ({
  id: modelName,
  providerName: "Custom",
  providerType: "custom",
});

export function collectModelTable(
  models: readonly LLMModel[],
  customModels: string,
) {
  const modelTable: Record<
    string,
    {
      available: boolean;
      name: string;
      displayName: string;
      provider?: LLMModel["provider"]; // Marked as optional
      isDefault?: boolean;
    }
  > = {};

  // default models
  models.forEach((m) => {
    // supoort name=displayName eg：completions_pro=ernie-4.0-8k
    const [name, displayName] = m.name?.split("=");
    // using <modelName>@<providerId> as fullName
    modelTable[`${name}@${m?.provider?.id}`] = {
      ...m,
      name,
      displayName: displayName || name, // 'provider' is copied over if it exists
    };
  });

  // server custom models
  customModels
    .split(",")
    .filter((v) => !!v && v.length > 0)
    .forEach((m) => {
      const available = !m.startsWith("-");
      const nameConfig =
        m.startsWith("+") || m.startsWith("-") ? m.slice(1) : m;
      const [name, displayName] = nameConfig.split("=");

      // enable or disable all models
      if (name === "all") {
        Object.values(modelTable).forEach(
          (model) => (model.available = available),
        );
      } else {
        // 1. find model by name(), and set available value
        let count = 0;
        for (const fullName in modelTable) {
          if (fullName.split("@").shift() == name) {
            count += 1;
            modelTable[fullName]["available"] = available;
            if (displayName) {
              modelTable[fullName]["displayName"] = displayName;
            }
          }
        }
        // 2. if model not exists, create new model with available value
        if (count === 0) {
          const provider = customProvider(name);
          modelTable[`${name}@${provider?.id}`] = {
            name,
            displayName: displayName || name,
            available,
            provider, // Use optional chaining
          };
        }
      }
    });

  return modelTable;
}

export function collectModelTableWithDefaultModel(
  models: readonly LLMModel[],
  customModels: string,
  defaultModel: string,
) {
  let modelTable = collectModelTable(models, customModels);
  if (defaultModel && defaultModel !== "") {
    modelTable[defaultModel] = {
      ...modelTable[defaultModel],
      name: defaultModel,
      available: true,
      isDefault: true,
    };
  }
  return modelTable;
}

/**
 * Generate full model table.
 */
export function collectModels(
  models: readonly LLMModel[],
  customModels: string,
) {
  const modelTable = collectModelTable(models, customModels);
  const allModels = Object.values(modelTable);

  return allModels;
}

export function collectModelsWithDefaultModel(
  models: readonly LLMModel[],
  customModels: string,
  defaultModel: string,
) {
  const modelTable = collectModelTableWithDefaultModel(
    models,
    customModels,
    defaultModel,
  );

  const allModels = Object.values(modelTable);
  return allModels;
}

export function isModelAvailableInServer(
  customModels: string,
  modelName: string,
  providerName: string,
) {
  const fullName = `${modelName}@${providerName}`;
  const modelTable = collectModelTable(DEFAULT_MODELS, customModels);
  return modelTable[fullName]?.available === false;
}
