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
// Paginated calls resolve to a page: `markets.data` is the first page, and
// `for await (const market of markets)` walks every page.
const markets = await client.getMarkets({ limit: 10, category: "sports" });

console.log(plans.data, categories.data, markets.data);
```

## Documentation

- [Docs](https://docs.predictorsdk.com)
- [API Reference](https://docs.predictorsdk.com/api-reference)

## License

[MIT](https://github.com/PredictorSDK/sdk-typescript/blob/main/LICENSE)
