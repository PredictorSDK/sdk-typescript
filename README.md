# @predictorsdk/client

The official TypeScript/JavaScript client for the [PredictorSDK](https://predictorsdk.com) prediction-market data API.

## Installation

```bash
npm install @predictorsdk/client
```

## Usage

```typescript
import { PredictorSDKClient } from "@predictorsdk/client";

const client = new PredictorSDKClient({ token: "your-api-key" });

const plans = await client.getPlans();
const categories = await client.getCategories();
const markets = await client.getMarkets({ limit: 10, category: "sports" });

console.log(plans.data, categories.data, markets.data);
```

## Documentation

- [Docs](https://docs.predictorsdk.com)
- [API Reference](https://docs.predictorsdk.com/api-reference)

## License

[MIT](https://github.com/PredictorSDK/sdk-typescript/blob/main/LICENSE)
